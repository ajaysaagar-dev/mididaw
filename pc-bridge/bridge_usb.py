"""
MIDI DAW - Automated Windows USB Debugging Bridge
-------------------------------------------------
Automatically detects Android phone over USB cable, sets up ADB reverse port
forwarding (tcp:8080), writes temp host file, and starts low-latency MIDI bridge!

Requirements:
    pip install websockets mido python-rtmidi
"""

import asyncio
import os
import shutil
import subprocess
import sys
import time

try:
    import websockets
    import mido
except ImportError:
    print("\n[!] Installing required dependencies: websockets mido python-rtmidi...")
    subprocess.run([sys.executable, "-m", "pip", "install", "websockets", "mido", "python-rtmidi"])
    try:
        import websockets
        import mido
    except ImportError:
        print("[!] Please run: pip install websockets mido python-rtmidi")
        sys.exit(1)

PORT_NAME = "MobileMidiDaw"
PORT = 8080

def find_adb():
    """Finds adb executable in PATH or standard Android SDK directories."""
    adb_cmd = shutil.which("adb")
    if adb_cmd:
        return adb_cmd

    # Check local app data Android SDK
    local_app_data = os.environ.get("LOCALAPPDATA", "")
    candidates = [
        os.path.join(local_app_data, "Android", "Sdk", "platform-tools", "adb.exe"),
        os.path.join(os.environ.get("PROGRAMFILES", "C:\\Program Files"), "Android", "platform-tools", "adb.exe"),
        os.path.join(os.path.dirname(__file__), "platform-tools", "adb.exe"),
    ]
    for c in candidates:
        if os.path.isfile(c):
            return c

    return None

def setup_adb_reverse(adb_path):
    """Checks device authorization and executes adb reverse tcp:8080 tcp:8080."""
    print("[*] Checking for USB connected Android device...")
    while True:
        try:
            res = subprocess.run([adb_path, "devices"], capture_output=True, text=True, check=False)
            lines = [l.strip() for l in res.stdout.strip().split("\n")[1:] if l.strip()]

            if not lines:
                print("[*] Waiting for phone to be plugged in via USB (Ensure USB Debugging is ON in Developer Options)...", end="\r")
                time.sleep(2)
                continue

            # Check if any device is unauthorized
            has_authorized = False
            for line in lines:
                parts = line.split()
                if len(parts) >= 2:
                    dev_id, status = parts[0], parts[1]
                    if status == "unauthorized":
                        print(f"\n{'=' * 64}")
                        print(f" [!] DEVICE {dev_id} FOUND (UNAUTHORIZED)")
                        print(" ==> PLEASE CHECK YOUR PHONE SCREEN NOW:")
                        print(" ==> Tap 'Allow USB debugging' (Check 'Always allow from this computer')")
                        print(f"{'=' * 64}")
                        time.sleep(2)
                        break
                    elif status == "device":
                        has_authorized = True
                        print(f"\n[+] Authorized Android device found: {dev_id}")
                        break

            if has_authorized:
                # Set up reverse port forward: phone tcp:8080 -> PC tcp:8080
                rev_res = subprocess.run([adb_path, "reverse", f"tcp:{PORT}", f"tcp:{PORT}"], capture_output=True, text=True, check=False)
                if rev_res.returncode == 0:
                    print(f"[✓] Successfully forwarded port {PORT} over USB cable!")
                else:
                    print(f"[*] adb reverse output: {rev_res.stdout.strip() or rev_res.stderr.strip()}")

                # Send temporary host config to phone
                subprocess.run([adb_path, "shell", f"echo 127.0.0.1:{PORT} > /data/local/tmp/mididaw_bridge.txt"], capture_output=True, check=False)
                print("[✓] Server host file sent to device (/data/local/tmp/mididaw_bridge.txt)")
                print(f"[✓] USB Debugging Bridge Ready! Now tap 'Bridge' button in the mobile app!")
                return True

        except Exception as e:
            print(f"[!] ADB error: {e}")
            time.sleep(2)

def init_midi_output():
    """Opens virtual or system MIDI output port."""
    try:
        outport = mido.open_output(PORT_NAME, virtual=True)
        print(f"[*] Created virtual MIDI port: '{PORT_NAME}'")
        return outport
    except Exception:
        outputs = mido.get_output_names()
        print(f"[*] Available PC MIDI Output Ports: {outputs}")
        if outputs:
            chosen = next((p for p in outputs if "loopmidi" in p.lower()), outputs[0])
            outport = mido.open_output(chosen)
            print(f"[*] Connected to MIDI Port: '{chosen}'")
            return outport
        else:
            print("[!] No MIDI ports found on PC! On Windows, please install loopMIDI (free) and create a port.")
            sys.exit(1)

outport = init_midi_output()

async def handle_client(websocket):
    client_ip = websocket.remote_address[0]
    print(f"\n[+] Mobile App Connected via Bridge ({client_ip})!")
    try:
        async for message in websocket:
            try:
                # Raw binary MIDI bytes (fastest path)
                if isinstance(message, (bytes, bytearray)):
                    msg = mido.Message.from_bytes(message)
                    outport.send(msg)
                    continue

                import json
                data = json.loads(message)
                msg_type = data.get("type")

                if msg_type == "noteOn":
                    note = data["note"]
                    vel = data.get("velocity", 100)
                    ch = data.get("channel", 1) - 1
                    outport.send(mido.Message('note_on', note=note, velocity=vel, channel=ch))
                elif msg_type == "noteOff":
                    note = data["note"]
                    ch = data.get("channel", 1) - 1
                    outport.send(mido.Message('note_off', note=note, velocity=0, channel=ch))
                elif msg_type == "pitchBend":
                    val = data.get("value", 8192) - 8192
                    ch = data.get("channel", 1) - 1
                    outport.send(mido.Message('pitchwheel', pitch=val, channel=ch))
                elif msg_type == "controlChange":
                    ctrl = data["controller"]
                    val = data["value"]
                    ch = data.get("channel", 1) - 1
                    outport.send(mido.Message('control_change', control=ctrl, value=val, channel=ch))
            except Exception as e:
                print(f"[!] Error forwarding MIDI: {e}")
    except websockets.exceptions.ConnectionClosed:
        print(f"[-] Mobile App Disconnected ({client_ip})")

async def main():
    print("=" * 64)
    print("  MIDIDAW - Windows USB Debugging Bridge Server")
    print("=" * 64)

    adb = find_adb()
    if adb:
        print(f"[*] Found ADB: {adb}")
        setup_adb_reverse(adb)
    else:
        print("[!] ADB not found in PATH or standard Android SDK directories.")
        print("[*] To use USB Debugging: ensure ADB is installed, or connect via Wi-Fi IP.")

    print(f"[*] WebSocket Server listening on 0.0.0.0:{PORT}...")
    print("=" * 64)

    async with websockets.serve(handle_client, "0.0.0.0", PORT):
        await asyncio.Future()

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\n[*] Bridge stopped.")
