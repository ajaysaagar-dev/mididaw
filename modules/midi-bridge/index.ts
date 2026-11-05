import { requireNativeModule } from 'expo-modules-core';
import { Platform } from 'react-native';

export interface MidiDeviceInfo {
  id: number;
  type: number;
  isUsb: boolean;
  name: string;
  product: string;
  manufacturer: string;
  inputPorts: number;
  outputPorts: number;
}

interface NativeMidiBridge {
  getDevices(): MidiDeviceInfo[];
  connectDevice(deviceId: number, portIndex: number): Promise<boolean>;
  autoConnectUsb(): Promise<boolean>;
  sendMidiBytes(bytes: number[]): boolean;
  disconnect(): boolean;
  isConnected(): boolean;
}

let nativeModule: NativeMidiBridge | null = null;

if (Platform.OS === 'android') {
  try {
    nativeModule = requireNativeModule<NativeMidiBridge>('MidiBridge');
  } catch {
    nativeModule = null;
  }
}

export const MidiBridge = {
  isAvailable(): boolean {
    return nativeModule !== null;
  },

  getDevices(): MidiDeviceInfo[] {
    if (!nativeModule) return [];
    try {
      return nativeModule.getDevices();
    } catch {
      return [];
    }
  },

  async autoConnectUsb(): Promise<boolean> {
    if (!nativeModule) return false;
    try {
      return await nativeModule.autoConnectUsb();
    } catch {
      return false;
    }
  },

  async connectDevice(deviceId: number, portIndex: number = 0): Promise<boolean> {
    if (!nativeModule) return false;
    try {
      return await nativeModule.connectDevice(deviceId, portIndex);
    } catch {
      return false;
    }
  },

  sendMidiBytes(bytes: number[]): boolean {
    if (!nativeModule) return false;
    try {
      return nativeModule.sendMidiBytes(bytes);
    } catch {
      return false;
    }
  },

  disconnect(): boolean {
    if (!nativeModule) return false;
    try {
      return nativeModule.disconnect();
    } catch {
      return false;
    }
  },

  isConnected(): boolean {
    if (!nativeModule) return false;
    try {
      return nativeModule.isConnected();
    } catch {
      return false;
    }
  },
};
