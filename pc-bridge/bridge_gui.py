"""
MIDIDAW - Windows PC Bridge GUI & Real-time MIDI Forwarder
----------------------------------------------------------
Standalone Windows GUI application that:
1. Bundles/detects ADB for automatic USB cable port forwarding (tcp:8080)
2. Prompts user to allow USB debugging on phone if needed
3. Displays both USB Cable URL (127.0.0.1:8080) and Wi-Fi Network URL (e.g. 10.134.131.183:8080)
4. Receives raw binary MIDI packets via WebSocket with sub-millisecond latency
5. Forwards MIDI notes, chords, pitch, mod, and CC directly to PC DAWs (FL Studio, Ableton, Reaper, etc.)
"""

import asyncio
import os
import shutil
import socket
import subprocess
import sys
import threading
import time
import tkinter as tk
from tkinter import ttk, scrolledtext

import mido
import rtmidi
import mido.backends.rtmidi
import websockets

try:
    mido.set_backend('mido.backends.rtmidi')
except Exception:
    pass

PORT = 8080

def get_local_ip():
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(('8.8.8.8', 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return '127.0.0.1'

def find_adb():
    candidates = []

    # 1. PyInstaller bundled temp extraction dir
    if getattr(sys, 'frozen', False) and hasattr(sys, '_MEIPASS'):
        candidates.append(os.path.join(sys._MEIPASS, "adb.exe"))

    # 2. Directory of running .exe or script
    exe_dir = os.path.dirname(sys.executable) if getattr(sys, 'frozen', False) else os.path.dirname(os.path.abspath(__file__))
    candidates.append(os.path.join(exe_dir, "adb.exe"))
    candidates.append(os.path.join(exe_dir, "..", "adb.exe"))
    candidates.append(os.path.join(exe_dir, "platform-tools", "adb.exe"))

    # 3. Known repository directories
    candidates.append(r"C:\Projects\mididaw\pc-bridge\adb.exe")
    candidates.append(r"C:\Projects\mididaw\pc-bridge\platform-tools\adb.exe")
    candidates.append(os.path.join(os.getcwd(), "pc-bridge", "adb.exe"))
    candidates.append(os.path.join(os.getcwd(), "adb.exe"))

    # 4. Standard system locations
    local_app_data = os.environ.get("LOCALAPPDATA", "")
    candidates.append(os.path.join(local_app_data, "Android", "Sdk", "platform-tools", "adb.exe"))
    candidates.append(os.path.join(os.environ.get("PROGRAMFILES", "C:\\Program Files"), "Android", "platform-tools", "adb.exe"))

    for c in candidates:
        if c and os.path.isfile(c):
            return os.path.abspath(c)

    adb_path = shutil.which("adb")
    if adb_path:
        return adb_path

    return None

class MidiDawBridgeApp:
    def __init__(self, root):
        self.root = root
        self.root.title("MIDIDAW - PC MIDI Bridge v1.0")
        self.root.geometry("680x520")
        self.root.minsize(600, 440)
        self.root.configure(bg="#090d16")

        self.midi_output = None
        self.connected_clients = 0
        self.adb_path = find_adb()
        self.local_ip = get_local_ip()

        self.setup_ui()
        self.init_midi()

        # Start ADB Auto-Reverse background thread
        self.adb_thread = threading.Thread(target=self.adb_monitor_loop, daemon=True)
        self.adb_thread.start()

        # Start WebSocket Server background thread
        self.server_thread = threading.Thread(target=self.run_server_thread, daemon=True)
        self.server_thread.start()

    def setup_ui(self):
        style = ttk.Style()
        style.theme_use('clam')

        # Top Header Bar
        header = tk.Frame(self.root, bg="#0f172a", height=50)
        header.pack(fill="x", padx=0, pady=0)

        title_lbl = tk.Label(
            header,
            text="MIDIDAW PC BRIDGE",
            font=("Segoe UI", 13, "bold"),
            fg="#38bdf8",
            bg="#0f172a",
        )
        title_lbl.pack(side="left", padx=14, pady=10)

        self.status_badge = tk.Label(
            header,
            text="WAITING FOR MOBILE APP",
            font=("Segoe UI", 9, "bold"),
            fg="#f59e0b",
            bg="#1e293b",
            padx=10,
            pady=3,
        )
        self.status_badge.pack(side="right", padx=14, pady=10)

        # Connection Info Card
        card = tk.Frame(self.root, bg="#0f172a", bd=1, relief="solid")
        card.pack(fill="x", padx=12, pady=10)

        # USB Cable Status Row
        usb_row = tk.Frame(card, bg="#0f172a")
        usb_row.pack(fill="x", padx=10, pady=(8, 4))

        tk.Label(
            usb_row,
            text="USB Cable:",
            font=("Segoe UI", 9, "bold"),
            fg="#38bdf8",
            bg="#0f172a",
            width=12,
            anchor="w",
        ).pack(side="left")

        self.usb_status_lbl = tk.Label(
            usb_row,
            text="Scanning for phone via USB...",
            font=("Segoe UI", 9),
            fg="#94a3b8",
            bg="#0f172a",
            anchor="w",
        )
        self.usb_status_lbl.pack(side="left", fill="x", expand=True)

        tk.Button(
            usb_row,
            text="Restart ADB",
            font=("Segoe UI", 8),
            fg="#38bdf8",
            bg="#1e293b",
            activebackground="#334155",
            activeforeground="#ffffff",
            bd=0,
            padx=6,
            pady=2,
            command=self.restart_adb,
        ).pack(side="right", padx=(4, 0))

        tk.Button(
            usb_row,
            text="USB Fix Guide",
            font=("Segoe UI", 8),
            fg="#f59e0b",
            bg="#1e293b",
            activebackground="#334155",
            activeforeground="#ffffff",
            bd=0,
            padx=6,
            pady=2,
            command=self.show_usb_help,
        ).pack(side="right", padx=(4, 0))

        # Wi-Fi IP Row
        wifi_row = tk.Frame(card, bg="#0f172a")
        wifi_row.pack(fill="x", padx=10, pady=4)

        tk.Label(
            wifi_row,
            text="Wi-Fi IP:",
            font=("Segoe UI", 9, "bold"),
            fg="#10b981",
            bg="#0f172a",
            width=12,
            anchor="w",
        ).pack(side="left")

        self.wifi_ip_lbl = tk.Label(
            wifi_row,
            text=f"{self.local_ip}:{PORT} (Port {PORT})",
            font=("Segoe UI", 9, "bold"),
            fg="#f8fafc",
            bg="#0f172a",
            anchor="w",
        )
        self.wifi_ip_lbl.pack(side="left")

        tk.Label(
            wifi_row,
            text="[Type this into mobile app if not using USB]",
            font=("Segoe UI", 8),
            fg="#64748b",
            bg="#0f172a",
        ).pack(side="left", padx=8)

        # MIDI Port Selector Row
        port_row = tk.Frame(card, bg="#0f172a")
        port_row.pack(fill="x", padx=10, pady=(4, 8))

        tk.Label(
            port_row,
            text="DAW MIDI Port:",
            font=("Segoe UI", 9, "bold"),
            fg="#cbd5e1",
            bg="#0f172a",
            width=12,
            anchor="w",
        ).pack(side="left")

        self.port_var = tk.StringVar()
        self.port_combo = ttk.Combobox(
            port_row,
            textvariable=self.port_var,
            state="readonly",
            width=32,
        )
        self.port_combo.pack(side="left", padx=2)
        self.port_combo.bind("<<ComboboxSelected>>", self.on_port_changed)

        refresh_btn = tk.Button(
            port_row,
            text="Refresh Ports",
            font=("Segoe UI", 8),
            fg="#ffffff",
            bg="#1e293b",
            activebackground="#334155",
            activeforeground="#ffffff",
            bd=0,
            padx=8,
            pady=2,
            command=self.refresh_midi_ports,
        )
        refresh_btn.pack(side="left", padx=6)

        # Live Real-time Monitor Log Frame
        log_frame = tk.Frame(self.root, bg="#090d16")
        log_frame.pack(fill="both", expand=True, padx=12, pady=(0, 10))

        log_hdr = tk.Frame(log_frame, bg="#090d16")
        log_hdr.pack(fill="x", pady=(0, 4))

        tk.Label(
            log_hdr,
            text="REAL-TIME MIDI EVENT MONITOR",
            font=("Segoe UI", 9, "bold"),
            fg="#64748b",
            bg="#090d16",
        ).pack(side="left")

        clear_btn = tk.Button(
            log_hdr,
            text="Clear Log",
            font=("Segoe UI", 8),
            fg="#94a3b8",
            bg="#0f172a",
            activebackground="#1e293b",
            activeforeground="#ffffff",
            bd=0,
            padx=6,
            pady=1,
            command=self.clear_log,
        )
        clear_btn.pack(side="right")

        self.log_text = scrolledtext.ScrolledText(
            log_frame,
            bg="#020617",
            fg="#38bdf8",
            insertbackground="#ffffff",
            font=("Consolas", 9),
            bd=1,
            relief="solid",
        )
        self.log_text.pack(fill="both", expand=True)

        self.log_msg("MIDIDAW PC Bridge Initialized.")
        self.log_msg(f"Listening on port {PORT}. Ready for USB Cable or Wi-Fi ({self.local_ip}:{PORT}).")

    def log_msg(self, text):
        def _append():
            ts = time.strftime("%H:%M:%S")
            self.log_text.insert(tk.END, f"[{ts}] {text}\n")
            self.log_text.see(tk.END)
        self.root.after(0, _append)

    def clear_log(self):
        self.log_text.delete("1.0", tk.END)

    def init_midi(self):
        try:
            ports = mido.get_output_names()
            self.port_combo['values'] = ports
            if ports:
                # Select first available standard/virtual MIDI port
                chosen = ports[0]
                self.port_var.set(chosen)
                self.open_midi_port(chosen)
            else:
                self.port_var.set("No MIDI Ports Found!")
                self.log_msg("NOTE: No virtual or hardware MIDI outputs found on Windows. Start your DAW or connect a MIDI device.")
        except Exception as e:
            self.log_msg(f"Error listing MIDI ports: {e}")

    def refresh_midi_ports(self):
        self.init_midi()

    def on_port_changed(self, event=None):
        chosen = self.port_var.get()
        if chosen and chosen != "No MIDI Ports Found!":
            self.open_midi_port(chosen)

    def open_midi_port(self, name):
        try:
            if self.midi_output:
                self.midi_output.close()
            self.midi_output = mido.open_output(name)
            self.log_msg(f"MIDI Output Connected: '{name}'")
        except Exception as e:
            self.log_msg(f"Failed to open MIDI port '{name}': {e}")

    def update_badge(self, connected):
        def _update():
            if connected:
                self.status_badge.config(
                    text="MOBILE APP CONNECTED",
                    fg="#ffffff",
                    bg="#10b981",
                )
            else:
                self.status_badge.config(
                    text="WAITING FOR MOBILE APP",
                    fg="#f59e0b",
                    bg="#1e293b",
                )
        self.root.after(0, _update)

    def update_usb_status(self, text, color="#94a3b8"):
        def _update():
            self.usb_status_lbl.config(text=text, fg=color)
        self.root.after(0, _update)

    def adb_monitor_loop(self):
        if not self.adb_path:
            self.update_usb_status("ADB tool not found. USB Cable requires adb.exe. Wi-Fi is active!", "#94a3b8")
            self.log_msg("Note: adb.exe not found. Wi-Fi connections are fully active.")
            return

        self.log_msg(f"ADB tool detected: {self.adb_path}")

        while True:
            try:
                # Use CREATE_NO_WINDOW on Windows to prevent flashing console popups
                creation_flags = 0x08000000 if sys.platform == "win32" else 0
                res = subprocess.run(
                    [self.adb_path, "devices"],
                    capture_output=True,
                    text=True,
                    check=False,
                    creationflags=creation_flags,
                )
                lines = [l.strip() for l in res.stdout.strip().split("\n")[1:] if l.strip()]

                if not lines:
                    # Check if Windows USB Port had Code 43 (Device Descriptor Failure)
                    has_usb_err = False
                    try:
                        err_check = subprocess.run(
                            ["powershell", "-NoProfile", "-Command", "Get-PnpDevice -PresentOnly | Where-Object { $_.Status -eq 'Error' -and $_.InstanceId -like '*USB*' } | Select-Object -ExpandProperty FriendlyName"],
                            capture_output=True,
                            text=True,
                            creationflags=creation_flags,
                            timeout=2,
                        )
                        if "Descriptor" in err_check.stdout or "Error" in err_check.stdout:
                            has_usb_err = True
                    except Exception:
                        pass

                    if has_usb_err:
                        self.update_usb_status("⚠️ Windows Port Glitch (Code 43): Unplug & plug into a different PC USB port!", "#ef4444")
                    else:
                        self.update_usb_status("No USB phone detected. (Enable USB Debugging or use Wi-Fi)", "#94a3b8")
                    time.sleep(3)
                    continue

                dev_line = lines[0].split()
                if len(dev_line) >= 2:
                    dev_id, dev_status = dev_line[0], dev_line[1]
                    if dev_status == "unauthorized":
                        self.update_usb_status(
                            "ACTION NEEDED: Tap 'Allow USB debugging' on your phone screen!",
                            "#f59e0b",
                        )
                        self.log_msg("[USB] Phone found but unauthorized. Tap 'Allow' on your phone.")
                        time.sleep(2)
                        continue
                    elif dev_status == "offline":
                        self.update_usb_status(
                            f"Phone {dev_id} is offline. Reconnecting...",
                            "#f59e0b",
                        )
                        subprocess.run([self.adb_path, "reconnect", "offline"], creationflags=creation_flags)
                        time.sleep(2)
                        continue
                    elif dev_status == "device":
                        # Forward port 8080 over USB cable
                        rev = subprocess.run(
                            [self.adb_path, "reverse", f"tcp:{PORT}", f"tcp:{PORT}"],
                            capture_output=True,
                            text=True,
                            check=False,
                            creationflags=creation_flags,
                        )
                        if rev.returncode == 0:
                            self.update_usb_status(
                                f"READY (Device {dev_id} connected - Port {PORT} forwarded over USB cable)",
                                "#10b981",
                            )
                        else:
                            self.update_usb_status(f"Device {dev_id} connected", "#38bdf8")
                        time.sleep(5)
                        continue
            except Exception as e:
                time.sleep(3)

    def restart_adb(self):
        if not self.adb_path:
            self.log_msg("ADB tool not found.")
            return

        def _worker():
            self.log_msg("--- Restarting ADB Server ---")
            creation_flags = 0x08000000 if sys.platform == "win32" else 0
            subprocess.run([self.adb_path, "kill-server"], creationflags=creation_flags)
            time.sleep(0.5)
            subprocess.run([self.adb_path, "start-server"], creationflags=creation_flags)
            subprocess.run([self.adb_path, "reconnect"], creationflags=creation_flags)
            res = subprocess.run([self.adb_path, "devices", "-l"], capture_output=True, text=True, creationflags=creation_flags)
            out = res.stdout.strip()
            self.log_msg(f"ADB Devices output:\n{out}")
            if "device" in out and out != "List of devices attached":
                self.log_msg("✓ Phone connected and verified via ADB!")
            else:
                self.log_msg("Note: No phone detected by ADB yet. Click 'USB Fix Guide' for steps.")

        threading.Thread(target=_worker, daemon=True).start()

    def show_usb_help(self):
        help_win = tk.Toplevel(self.root)
        help_win.title("USB Connection & Debugging Troubleshooting")
        help_win.geometry("560x420")
        help_win.configure(bg="#0f172a")
        help_win.attributes("-topmost", True)

        txt = (
            "HOW TO FIX USB CONNECTION ON ANDROID / WINDOWS:\n\n"
            "1. CLEAR WINDOWS USB PORT ERROR (CODE 43):\n"
            "   • Unplug the USB cable from your computer.\n"
            "   • Wait 5 seconds, then plug into a DIFFERENT USB port directly on your PC (avoid USB hubs).\n"
            "   • Use a high-quality data USB cable (not a charge-only cable).\n\n"
            "2. SWITCH USB MODE ON PHONE (Vivo / Android):\n"
            "   • Pull down the top notification shade on your phone.\n"
            "   • Tap 'Charging this device via USB' (or USB Preferences).\n"
            "   • Switch from 'Charging only' to 'File Transfer' (or 'MIDI').\n"
            "   * Note: Charging-only mode turns off the data pins!*\n\n"
            "3. DEVELOPER OPTIONS & USB DEBUGGING:\n"
            "   • Settings > System > Developer Options > Turn ON 'USB Debugging'.\n"
            "   • (Vivo phones: Also turn on 'USB debugging (Security settings)').\n"
            "   • Tap 'Revoke USB debugging authorizations' if prompt didn't appear.\n\n"
            "4. ALLOW THE PROMPT ON PHONE:\n"
            "   • When plugged in, a popup appears: 'Allow USB debugging?'\n"
            "   • Check [✓] 'Always allow from this computer' and tap 'ALLOW'.\n\n"
            "💡 NOTE: Wi-Fi mode works automatically without needing any USB cable!"
        )

        lbl = tk.Label(
            help_win,
            text=txt,
            font=("Segoe UI", 9),
            fg="#cbd5e1",
            bg="#0f172a",
            justify="left",
            padx=16,
            pady=16,
        )
        lbl.pack(fill="both", expand=True)

        close_btn = tk.Button(
            help_win,
            text="Got it",
            font=("Segoe UI", 9, "bold"),
            fg="#ffffff",
            bg="#2563eb",
            bd=0,
            padx=16,
            pady=6,
            command=help_win.destroy,
        )
        close_btn.pack(pady=(0, 14))

    def run_server_thread(self):
        try:
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
            loop.run_until_complete(self.start_websocket_server())
        except Exception as e:
            self.log_msg(f"Server error: {e}")

    async def start_websocket_server(self):
        async def handler(websocket):
            self.connected_clients += 1
            self.update_badge(True)
            client_ip = websocket.remote_address[0]
            self.log_msg(f"Mobile Connected ({client_ip}). Streaming real-time MIDI!")

            try:
                async for message in websocket:
                    try:
                        # 1. Binary raw bytes (Highest Performance / Lowest Latency)
                        if isinstance(message, (bytes, bytearray)):
                            if self.midi_output:
                                msg = mido.Message.from_bytes(message)
                                self.midi_output.send(msg)
                                self.log_msg(f"RAW: {msg}")
                            continue

                        # 2. JSON fallback
                        import json
                        data = json.loads(message)
                        msg_type = data.get("type")

                        if not self.midi_output:
                            continue

                        if msg_type == "noteOn":
                            n, v, ch = data["note"], data.get("velocity", 100), data.get("channel", 1) - 1
                            self.midi_output.send(mido.Message('note_on', note=n, velocity=v, channel=ch))
                            self.log_msg(f"NOTE ON  | Ch {ch+1} | Note {n} | Vel {v}")
                        elif msg_type == "noteOff":
                            n, ch = data["note"], data.get("channel", 1) - 1
                            self.midi_output.send(mido.Message('note_off', note=n, velocity=0, channel=ch))
                            self.log_msg(f"NOTE OFF | Ch {ch+1} | Note {n}")
                        elif msg_type == "pitchBend":
                            val = data.get("value", 8192) - 8192
                            ch = data.get("channel", 1) - 1
                            self.midi_output.send(mido.Message('pitchwheel', pitch=val, channel=ch))
                        elif msg_type == "controlChange":
                            ctrl, val, ch = data["controller"], data["value"], data.get("channel", 1) - 1
                            self.midi_output.send(mido.Message('control_change', control=ctrl, value=val, channel=ch))
                            self.log_msg(f"CC #{ctrl} | Val {val} | Ch {ch+1}")
                        elif msg_type == "programChange":
                            prog, ch = data["program"], data.get("channel", 1) - 1
                            self.midi_output.send(mido.Message('program_change', program=prog, channel=ch))
                            self.log_msg(f"PATCH #{prog} | Ch {ch+1}")

                    except Exception as e:
                        self.log_msg(f"Error processing MIDI: {e}")

            except websockets.exceptions.ConnectionClosed:
                pass
            finally:
                self.connected_clients = max(0, self.connected_clients - 1)
                if self.connected_clients == 0:
                    self.update_badge(False)
                    self.log_msg("Mobile App Disconnected.")

        async with websockets.serve(handler, "0.0.0.0", PORT):
            await asyncio.Future()

def main():
    root = tk.Tk()
    app = MidiDawBridgeApp(root)
    root.mainloop()

if __name__ == "__main__":
    main()
