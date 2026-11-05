"""
MIDI DAW - Mobile to PC Network MIDI Bridge (Python)
-----------------------------------------------------
Requirements:
    pip install websockets mido python-rtmidi

Usage:
    python midi_bridge.py
    (Or specify host/port: python midi_bridge.py --port 8080)

This script creates a virtual MIDI port or connects to loopMIDI/IAC driver,
listens for WebSocket MIDI packets from the mobile app, and sends them
directly into your DAW (Ableton Live, FL Studio, Reaper, Cubase, etc.)!
"""

import asyncio
import json
import socket
import sys

try:
    import websockets
    import mido
except ImportError:
    print("\n[!] Missing dependencies. Please install them:")
    print("    pip install websockets mido python-rtmidi\n")
    sys.exit(1)

# Find local IP address
def get_local_ip():
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(('8.8.8.8', 80))
        ip = s.getsockname()[0]
    except Exception:
        ip = '127.0.0.1'
    finally:
        s.close()
    return ip

PORT_NAME = "MobileMidiDaw"

# Open MIDI output
try:
    # Try creating virtual port (works on macOS and Linux)
    outport = mido.open_output(PORT_NAME, virtual=True)
    print(f"[*] Created virtual MIDI port: '{PORT_NAME}'")
except Exception:
    # On Windows, virtual=True is not supported by default, so pick an available port or loopMIDI
    outputs = mido.get_output_names()
    print(f"[*] Available PC MIDI Output Ports: {outputs}")
    if outputs:
        # Prefer loopMIDI if present, else first available
        chosen = next((p for p in outputs if "loopmidi" in p.lower()), outputs[0])
        outport = mido.open_output(chosen)
        print(f"[*] Connected to MIDI Port: '{chosen}'")
    else:
        print("[!] No MIDI ports found on PC! On Windows, please install loopMIDI (free) and create a port.")
        sys.exit(1)

async def handle_client(websocket):
    client_ip = websocket.remote_address[0]
    print(f"\n[+] Mobile device connected from {client_ip}!")
    try:
        async for message in websocket:
            try:
                # FAST PATH: Direct raw binary MIDI message
                if isinstance(message, (bytes, bytearray)):
                    msg = mido.Message.from_bytes(message)
                    outport.send(msg)
                    continue

                data = json.loads(message)
                msg_type = data.get("type")

                if msg_type == "noteOn":
                    note = data["note"]
                    velocity = data.get("velocity", 100)
                    channel = data.get("channel", 1) - 1
                    msg = mido.Message('note_on', note=note, velocity=velocity, channel=channel)
                    outport.send(msg)
                    print(f"  -> Note ON  | Ch:{channel+1} Note:{note:3d} Vel:{velocity:3d}")

                elif msg_type == "noteOff":
                    note = data["note"]
                    channel = data.get("channel", 1) - 1
                    msg = mido.Message('note_off', note=note, velocity=0, channel=channel)
                    outport.send(msg)
                    print(f"  -> Note OFF | Ch:{channel+1} Note:{note:3d}")

                elif msg_type == "pitchBend":
                    value = data.get("value", 8192) - 8192  # Mido uses -8192 to 8191
                    channel = data.get("channel", 1) - 1
                    msg = mido.Message('pitchwheel', pitch=value, channel=channel)
                    outport.send(msg)

                elif msg_type == "controlChange":
                    control = data["controller"]
                    value = data["value"]
                    channel = data.get("channel", 1) - 1
                    msg = mido.Message('control_change', control=control, value=value, channel=channel)
                    outport.send(msg)
                    print(f"  -> CC       | Ch:{channel+1} CC:{control:3d} Val:{value:3d}")

            except Exception as e:
                print(f"[!] Error processing MIDI message: {e}")
    except websockets.exceptions.ConnectionClosed:
        print(f"[-] Mobile device disconnected ({client_ip})")

async def main():
    local_ip = get_local_ip()
    port = 8080
    print("=" * 60)
    print("  MIDI DAW - Mobile to PC Network MIDI Bridge Server")
    print("=" * 60)
    print(f"[*] Server listening on: ws://{local_ip}:{port}")
    print(f"[*] Enter this IP into your mobile app: {local_ip}")
    print(f"[*] Port: {port}")
    print("=" * 60)
    print("[*] Waiting for mobile device connection...")

    async with websockets.serve(handle_client, "0.0.0.0", port):
        await asyncio.Future()

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\n[*] Bridge stopped.")
