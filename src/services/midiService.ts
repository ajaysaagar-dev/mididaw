import AsyncStorage from '@react-native-async-storage/async-storage';
import { getNoteInfo } from '../constants/midiNotes';
import { MidiBridge, MidiDeviceInfo } from '../../modules/midi-bridge';

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected';
export type ConnectionMode = 'usb_direct' | 'bridge_usb' | 'bridge_wifi' | 'auto';

export interface MidiEventLog {
  id: string;
  type: 'NoteOn' | 'NoteOff' | 'PitchBend' | 'CC' | 'System';
  description: string;
  timestamp: number;
}

type StatusListener = (status: ConnectionStatus, host: string, port: number, modeInfo: string) => void;
type LogListener = (log: MidiEventLog) => void;

const STORAGE_IP_KEY = '@mididaw_bridge_ip';
const STORAGE_PORT_KEY = '@mididaw_bridge_port';
const STORAGE_WIFI_IP_KEY = '@mididaw_bridge_wifi_ip';
export const DEFAULT_WIFI_IP = '10.134.131.183';

// Web MIDI API types
interface WebMIDIOutput {
  id: string;
  name?: string;
  send(data: number[] | Uint8Array): void;
}

interface WebMIDIAccess {
  outputs: Map<string, WebMIDIOutput>;
}

class MidiService {
  private socket: WebSocket | null = null;
  private status: ConnectionStatus = 'disconnected';
  private connectionModeDescription: string = 'Disconnected';
  private serverIp: string = '127.0.0.1';
  private wifiIp: string = DEFAULT_WIFI_IP;
  private serverPort: number = 8080;
  private channel: number = 1; // 1-indexed (1-16)
  private activeNotes: Set<number> = new Set();

  private statusListeners: Set<StatusListener> = new Set();
  private logListeners: Set<LogListener> = new Set();
  private autoRetryTimer: ReturnType<typeof setTimeout> | null = null;
  private manualDisconnected: boolean = false;
  private isAutoConnecting: boolean = false;

  // Direct USB / Web MIDI handles
  private isNativeUsbConnected: boolean = false;
  private webMidiAccess: WebMIDIAccess | null = null;
  private webMidiOutput: WebMIDIOutput | null = null;

  constructor() {
    this.detectEnvironmentHost();
    this.loadSavedConfig();
  }

  private detectEnvironmentHost() {
    // If running in browser or Expo Web, check window.location.hostname
    if (typeof window !== 'undefined' && window.location && window.location.hostname) {
      const host = window.location.hostname;
      if (host && host !== 'localhost' && host !== '127.0.0.1' && !host.startsWith('127.')) {
        this.wifiIp = host;
      }
    }
  }

  private async loadSavedConfig() {
    try {
      const storedIp = await AsyncStorage.getItem(STORAGE_IP_KEY);
      const storedWifiIp = await AsyncStorage.getItem(STORAGE_WIFI_IP_KEY);
      const storedPort = await AsyncStorage.getItem(STORAGE_PORT_KEY);

      if (storedWifiIp) {
        this.wifiIp = storedWifiIp;
      } else if (storedIp && storedIp !== '127.0.0.1' && storedIp !== 'localhost') {
        this.wifiIp = storedIp;
      }

      if (storedIp) {
        this.serverIp = storedIp;
      }
      if (storedPort) {
        this.serverPort = parseInt(storedPort, 10) || 8080;
      }
    } catch {}

    // Auto-connect with USB -> Wi-Fi failover on startup
    setTimeout(() => {
      this.autoConnect();
    }, 350);
  }

  public getStatus(): ConnectionStatus {
    return this.status;
  }

  public getConnectionModeDescription(): string {
    return this.connectionModeDescription;
  }

  public getServerConfig() {
    return { ip: this.serverIp, wifiIp: this.wifiIp, port: this.serverPort };
  }

  public setWifiIp(ip: string) {
    const trimmed = ip.trim();
    if (trimmed) {
      this.wifiIp = trimmed;
      AsyncStorage.setItem(STORAGE_WIFI_IP_KEY, this.wifiIp).catch(() => {});
    }
  }

  public setServerConfig(ip: string, port: number) {
    const trimmed = ip.trim() || '127.0.0.1';
    this.serverIp = trimmed;
    this.serverPort = port || 8080;
    this.manualDisconnected = false;

    if (trimmed !== '127.0.0.1' && trimmed !== 'localhost') {
      this.wifiIp = trimmed;
      AsyncStorage.setItem(STORAGE_WIFI_IP_KEY, this.wifiIp).catch(() => {});
    }

    AsyncStorage.setItem(STORAGE_IP_KEY, this.serverIp).catch(() => {});
    AsyncStorage.setItem(STORAGE_PORT_KEY, String(this.serverPort)).catch(() => {});

    if (this.status === 'connected') {
      this.disconnect();
    }
    this.connect(this.serverIp, this.serverPort);
  }

  public getChannel(): number {
    return this.channel;
  }

  public setChannel(ch: number) {
    this.channel = Math.max(1, Math.min(16, Math.floor(ch)));
  }

  public addStatusListener(listener: StatusListener) {
    this.statusListeners.add(listener);
    listener(this.status, this.serverIp, this.serverPort, this.connectionModeDescription);
    return () => this.statusListeners.delete(listener);
  }

  public addLogListener(listener: LogListener) {
    this.logListeners.add(listener);
    return () => this.logListeners.delete(listener);
  }

  private notifyStatus(status: ConnectionStatus) {
    this.status = status;
    this.statusListeners.forEach((cb) => cb(status, this.serverIp, this.serverPort, this.connectionModeDescription));
  }

  private logEvent(type: MidiEventLog['type'], description: string) {
    if (this.logListeners.size === 0) return;
    setTimeout(() => {
      const logItem: MidiEventLog = {
        id: `${Date.now()}-${Math.random()}`,
        type,
        description,
        timestamp: Date.now(),
      };
      this.logListeners.forEach((cb) => cb(logItem));
    }, 0);
  }

  private scheduleRetry() {
    if (this.manualDisconnected) return;
    if (this.isNativeUsbConnected || this.webMidiOutput || (this.socket && this.socket.readyState === WebSocket.OPEN)) return;

    if (this.autoRetryTimer) {
      clearTimeout(this.autoRetryTimer);
    }
    this.autoRetryTimer = setTimeout(() => {
      if (this.status !== 'connected' && !this.manualDisconnected) {
        this.autoConnect();
      }
    }, 3500);
  }

  /**
   * Helper to attempt a WebSocket connection with a strict timeout.
   */
  private trySocketConnect(host: string, port: number, timeoutMs: number): Promise<boolean> {
    return new Promise((resolve) => {
      let settled = false;
      let timer: ReturnType<typeof setTimeout> | null = null;
      let ws: WebSocket | null = null;

      const finish = (result: boolean) => {
        if (!settled) {
          settled = true;
          if (timer) {
            clearTimeout(timer);
            timer = null;
          }
          if (!result && ws) {
            try {
              ws.close();
            } catch {}
          }
          resolve(result);
        }
      };

      try {
        ws = new WebSocket(`ws://${host}:${port}`);
      } catch {
        finish(false);
        return;
      }

      timer = setTimeout(() => {
        finish(false);
      }, timeoutMs);

      ws.onopen = () => {
        if (!settled) {
          this.socket = ws;
          this.bindSocketListeners(ws, host, port);
          finish(true);
        }
      };

      ws.onerror = () => {
        finish(false);
      };

      ws.onclose = () => {
        finish(false);
      };
    });
  }

  private bindSocketListeners(ws: WebSocket, host: string, port: number) {
    const isUsb = host === '127.0.0.1' || host === 'localhost';

    ws.onclose = () => {
      if (this.socket === ws) {
        this.socket = null;
        if (!this.isNativeUsbConnected && !this.webMidiOutput) {
          this.notifyStatus('disconnected');
          this.connectionModeDescription = 'Disconnected';
          this.logEvent('System', `${isUsb ? 'USB Cable' : 'Wi-Fi'} connection closed. Auto-reconnecting...`);
          this.scheduleRetry();
        }
      }
    };

    ws.onerror = () => {
      if (this.socket === ws) {
        this.socket = null;
        if (!this.isNativeUsbConnected && !this.webMidiOutput) {
          this.notifyStatus('disconnected');
          this.connectionModeDescription = 'Disconnected';
          this.scheduleRetry();
        }
      }
    };
  }

  /**
   * Main Smart Connection Method:
   * 1. Checks Direct Hardware USB MIDI (Melodi App method)
   * 2. Checks Web MIDI (Chrome)
   * 3. Probes USB ADB Bridge (127.0.0.1:8080)
   * 4. IF USB NOT CONNECTED -> AUTOMATICALLY MOVES TO WI-FI (10.134.131.183:8080)
   */
  public async autoConnect(): Promise<boolean> {
    if (this.status === 'connected') return true;
    if (this.isAutoConnecting) return false;

    this.isAutoConnecting = true;
    this.manualDisconnected = false;

    if (this.autoRetryTimer) {
      clearTimeout(this.autoRetryTimer);
      this.autoRetryTimer = null;
    }

    try {
      // 1. Android Native USB MIDI (Melodi Mode)
      if (MidiBridge.isAvailable()) {
        try {
          const success = await MidiBridge.autoConnectUsb();
          if (success) {
            this.isNativeUsbConnected = true;
            this.connectionModeDescription = 'Direct USB MIDI (Class-Compliant)';
            this.notifyStatus('connected');
            this.logEvent('System', 'Connected: Direct USB MIDI (Melodi Mode - Hardware)');
            this.isAutoConnecting = false;
            return true;
          }
        } catch {}
      }

      // 2. Web MIDI in browser (Chrome on Android / PC)
      if (typeof navigator !== 'undefined' && 'requestMIDIAccess' in navigator) {
        try {
          const nav = navigator as unknown as { requestMIDIAccess: () => Promise<WebMIDIAccess> };
          const access = await nav.requestMIDIAccess();
          this.webMidiAccess = access;
          const outputs = Array.from(access.outputs.values());
          if (outputs.length > 0) {
            this.webMidiOutput = outputs[0];
            this.connectionModeDescription = `Web MIDI (${this.webMidiOutput.name || 'Device'})`;
            this.notifyStatus('connected');
            this.logEvent('System', `Connected: Web MIDI (${this.webMidiOutput.name || 'MIDI Port'})`);
            this.isAutoConnecting = false;
            return true;
          }
        } catch {}
      }

      // 3. Probe USB ADB Bridge (127.0.0.1:8080) with fast 1200ms timeout
      this.notifyStatus('connecting');
      this.connectionModeDescription = 'Checking USB...';
      this.logEvent('System', 'Checking USB connection...');

      const usbBridgeConnected = await this.trySocketConnect('127.0.0.1', this.serverPort, 1200);
      if (usbBridgeConnected) {
        this.serverIp = '127.0.0.1';
        this.connectionModeDescription = `USB Bridge (127.0.0.1:${this.serverPort})`;
        this.notifyStatus('connected');
        this.logEvent('System', `Connected: USB Bridge (127.0.0.1:${this.serverPort})`);
        this.isAutoConnecting = false;
        return true;
      }

      // 4. USB NOT CONNECTED -> AUTOMATICALLY MOVE TO WI-FI!
      const targetWifiIp = this.wifiIp || DEFAULT_WIFI_IP;
      this.connectionModeDescription = `USB not detected. Connecting to Wi-Fi (${targetWifiIp}:${this.serverPort})...`;
      this.notifyStatus('connecting');
      this.logEvent('System', `USB not connected. Moving to Wi-Fi (${targetWifiIp}:${this.serverPort})...`);

      const wifiBridgeConnected = await this.trySocketConnect(targetWifiIp, this.serverPort, 3500);
      if (wifiBridgeConnected) {
        this.serverIp = targetWifiIp;
        this.connectionModeDescription = `Wi-Fi Bridge (${targetWifiIp}:${this.serverPort})`;
        this.notifyStatus('connected');
        this.logEvent('System', `Connected: Wi-Fi Bridge (${targetWifiIp}:${this.serverPort})`);
        this.isAutoConnecting = false;
        return true;
      }

      // Both failed - set disconnected and schedule auto-retry
      this.connectionModeDescription = 'Disconnected';
      this.notifyStatus('disconnected');
      this.logEvent('System', `Could not reach USB or Wi-Fi (${targetWifiIp}:${this.serverPort}). Retrying...`);
      this.scheduleRetry();
      this.isAutoConnecting = false;
      return false;
    } catch {
      this.connectionModeDescription = 'Disconnected';
      this.notifyStatus('disconnected');
      this.scheduleRetry();
      this.isAutoConnecting = false;
      return false;
    }
  }

  public async connectUsbDirect(): Promise<boolean> {
    return this.autoConnect();
  }

  public connectUsb() {
    this.setServerConfig('127.0.0.1', 8080);
  }

  public connectWifi(customIp?: string) {
    const ip = (customIp || this.wifiIp || DEFAULT_WIFI_IP).trim();
    this.setWifiIp(ip);
    this.setServerConfig(ip, 8080);
  }

  public connect(host?: string, port?: number) {
    this.manualDisconnected = false;
    if (host) this.serverIp = host.trim();
    if (port) this.serverPort = port;

    AsyncStorage.setItem(STORAGE_IP_KEY, this.serverIp).catch(() => {});
    AsyncStorage.setItem(STORAGE_PORT_KEY, String(this.serverPort)).catch(() => {});

    if (this.socket) {
      try {
        this.socket.close();
      } catch {}
      this.socket = null;
    }

    if (this.autoRetryTimer) {
      clearTimeout(this.autoRetryTimer);
      this.autoRetryTimer = null;
    }

    const url = `ws://${this.serverIp}:${this.serverPort}`;
    const isUsb = this.serverIp === '127.0.0.1' || this.serverIp === 'localhost';
    this.connectionModeDescription = isUsb ? `Bridge (USB Cable ${this.serverIp}:${this.serverPort})` : `Wi-Fi Bridge (${this.serverIp}:${this.serverPort})`;
    this.notifyStatus('connecting');
    this.logEvent('System', `Connecting to ${url}...`);

    try {
      this.socket = new WebSocket(url);

      this.socket.onopen = () => {
        this.notifyStatus('connected');
        this.logEvent(
          'System',
          isUsb
            ? `Connected via USB Cable Bridge (${this.serverIp}:${this.serverPort})`
            : `Connected via Wi-Fi Bridge (${this.serverIp}:${this.serverPort})`
        );
      };

      this.bindSocketListeners(this.socket, this.serverIp, this.serverPort);
    } catch {
      if (!this.isNativeUsbConnected && !this.webMidiOutput) {
        this.notifyStatus('disconnected');
        this.scheduleRetry();
      }
    }
  }

  public disconnect() {
    this.manualDisconnected = true;
    if (this.autoRetryTimer) {
      clearTimeout(this.autoRetryTimer);
      this.autoRetryTimer = null;
    }
    if (this.socket) {
      try {
        this.socket.close();
      } catch {}
      this.socket = null;
    }
    if (this.isNativeUsbConnected) {
      try {
        MidiBridge.disconnect();
      } catch {}
      this.isNativeUsbConnected = false;
    }
    if (this.webMidiOutput) {
      this.webMidiOutput = null;
    }
    this.connectionModeDescription = 'Disconnected';
    this.notifyStatus('disconnected');
    this.logEvent('System', 'Disconnected');
  }

  public getAvailableHardwareDevices(): MidiDeviceInfo[] {
    return MidiBridge.getDevices();
  }

  private sendPayload(rawMidiBytes: number[]) {
    if (!rawMidiBytes || rawMidiBytes.length === 0) return;

    // 1. Direct Native Android USB MIDI
    if (this.isNativeUsbConnected) {
      try {
        MidiBridge.sendMidiBytes(rawMidiBytes);
      } catch {}
    }

    // 2. Web MIDI Output (Chrome)
    if (this.webMidiOutput) {
      try {
        this.webMidiOutput.send(rawMidiBytes);
      } catch {}
    }

    // 3. Fast binary WebSocket transmission over Bridge (USB or Wi-Fi)
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      try {
        this.socket.send(new Uint8Array(rawMidiBytes));
      } catch {}
    }
  }

  public noteOn(note: number, velocity: number = 100, channelOverride?: number) {
    const ch = channelOverride ?? this.channel;
    const clampedNote = Math.max(0, Math.min(127, Math.floor(note)));
    const clampedVel = Math.max(1, Math.min(127, Math.floor(velocity)));
    const chZeroIndexed = (ch - 1) & 0x0f;

    this.activeNotes.add(clampedNote);

    const statusByte = 0x90 | chZeroIndexed;
    const rawBytes = [statusByte, clampedNote, clampedVel];

    this.sendPayload(rawBytes);

    const noteInfo = getNoteInfo(clampedNote);
    this.logEvent('NoteOn', `ON: ${noteInfo.name} (${clampedNote}) Vel:${clampedVel} Ch:${ch}`);
  }

  public noteOff(note: number, channelOverride?: number) {
    const ch = channelOverride ?? this.channel;
    const clampedNote = Math.max(0, Math.min(127, Math.floor(note)));
    const chZeroIndexed = (ch - 1) & 0x0f;

    this.activeNotes.delete(clampedNote);

    const statusByte = 0x80 | chZeroIndexed;
    const rawBytes = [statusByte, clampedNote, 0];

    this.sendPayload(rawBytes);

    const noteInfo = getNoteInfo(clampedNote);
    this.logEvent('NoteOff', `OFF: ${noteInfo.name} (${clampedNote}) Ch:${ch}`);
  }

  public drumPadOn(note: number, name: string, velocity: number = 110) {
    const ch = 10;
    const clampedNote = Math.max(0, Math.min(127, Math.floor(note)));
    const clampedVel = Math.max(1, Math.min(127, Math.floor(velocity)));
    const chZeroIndexed = (ch - 1) & 0x0f;

    const statusByte = 0x90 | chZeroIndexed;
    const rawBytes = [statusByte, clampedNote, clampedVel];

    this.sendPayload(rawBytes);

    this.logEvent('NoteOn', `DRUM: ${name} (${clampedNote}) Vel:${clampedVel} Ch:${ch}`);
  }

  public drumPadOff(note: number, name: string) {
    const ch = 10;
    const clampedNote = Math.max(0, Math.min(127, Math.floor(note)));
    const chZeroIndexed = (ch - 1) & 0x0f;

    const statusByte = 0x80 | chZeroIndexed;
    const rawBytes = [statusByte, clampedNote, 0];

    this.sendPayload(rawBytes);

    this.logEvent('NoteOff', `DRUM OFF: ${name} (${clampedNote}) Ch:${ch}`);
  }

  public pitchBend(value: number, channelOverride?: number) {
    const ch = channelOverride ?? this.channel;
    const clamped = Math.max(-1.0, Math.min(1.0, value));
    const midiVal = Math.floor(((clamped + 1) / 2) * 16383);
    const lsb = midiVal & 0x7f;
    const msb = (midiVal >> 7) & 0x7f;
    const chZeroIndexed = (ch - 1) & 0x0f;

    const statusByte = 0xe0 | chZeroIndexed;
    const rawBytes = [statusByte, lsb, msb];

    this.sendPayload(rawBytes);
  }

  public controlChange(controller: number, value: number, channelOverride?: number) {
    const ch = channelOverride ?? this.channel;
    const clampedCtrl = Math.max(0, Math.min(127, Math.floor(controller)));
    const clampedVal = Math.max(0, Math.min(127, Math.floor(value)));
    const chZeroIndexed = (ch - 1) & 0x0f;

    const statusByte = 0xb0 | chZeroIndexed;
    const rawBytes = [statusByte, clampedCtrl, clampedVal];

    this.sendPayload(rawBytes);

    this.logEvent('CC', `CC${clampedCtrl}: ${clampedVal} Ch:${ch}`);
  }

  public programChange(program: number, channelOverride?: number) {
    const ch = channelOverride ?? this.channel;
    const clampedProg = Math.max(0, Math.min(127, Math.floor(program)));
    const chZeroIndexed = (ch - 1) & 0x0f;

    const statusByte = 0xc0 | chZeroIndexed;
    const rawBytes = [statusByte, clampedProg];

    this.sendPayload(rawBytes);

    this.logEvent('System', `Voice / Patch: ${clampedProg} Ch:${ch}`);
  }

  public setSustainPedal(active: boolean, channelOverride?: number) {
    this.controlChange(64, active ? 127 : 0, channelOverride);
  }

  public allNotesOff() {
    this.activeNotes.forEach((note) => {
      this.noteOff(note);
    });
    this.activeNotes.clear();

    this.controlChange(123, 0);
    this.controlChange(120, 0);

    this.logEvent('System', 'PANIC: All notes silenced');
  }
}

export const midiService = new MidiService();
