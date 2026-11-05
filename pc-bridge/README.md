# MIDIDAW - Windows PC Connection Guide

MIDIDAW offers two connection methods:

---

## 🌟 Method 1: Melodi Direct USB MIDI (Recommended — No Bridge Server Needed!)

Like the popular **Melodi App**, you can connect your phone directly as a **standard USB MIDI hardware controller** without needing any bridge software or virtual cables:

1. **Connect your phone to your Windows PC** using a USB cable.
2. On your phone:
   - Swipe down the notification panel and tap **"Charging this device via USB"** (or open **Settings > Developer Options > Default USB configuration**).
   - Change the USB mode from *File Transfer / Charging* to **MIDI**.
3. **Open your DAW** (FL Studio, Ableton Live, Reaper, Cubase, Studio One, etc.):
   - Go to **Options / Preferences > MIDI Settings**.
   - Under **Input Devices**, you will see your phone listed directly as **Android** (or your phone's device model).
   - Click **Enable** (and set port/sync as desired).
4. In the MIDIDAW mobile app, tap the **USB** button at the top.
5. Play any note, chord, or drum pad—MIDI signals stream directly through the physical USB cable with zero latency!

---

## 🚀 Method 2: MIDIDAW PC Bridge EXE (Wi-Fi or USB ADB Forwarding)

For Wi-Fi network play or if you prefer using the desktop bridge application:

The standalone Windows executable bridge is located at:
**`pc-bridge/MidiDawBridge.exe`**

### 1. Launch `MidiDawBridge.exe` on Windows
- Double-click `MidiDawBridge.exe`.
- It displays your PC's Wi-Fi IP address (e.g. `10.134.131.183:8080`) and automatically manages USB connections.
- Select your target DAW MIDI Port from the dropdown.

### 2. Connect from Mobile App
- In MIDIDAW, tap **Bridge** in the top bar.
- Choose **Wi-Fi Network** (or enter the IP displayed in the PC window).
- Tap **Connect**—the status turns green (**Bridge Connected**).
- Real-time MIDI events will flow immediately to your DAW.
