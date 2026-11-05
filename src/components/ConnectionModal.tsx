import React, { useState, useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Pressable,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { midiService, ConnectionStatus, DEFAULT_WIFI_IP } from '../services/midiService';

interface ConnectionModalProps {
  visible: boolean;
  onClose: () => void;
}

export const ConnectionModal: React.FC<ConnectionModalProps> = ({ visible, onClose }) => {
  const [wifiIp, setWifiIp] = useState(() => midiService.getServerConfig().wifiIp || DEFAULT_WIFI_IP);
  const [port, setPort] = useState(() => String(midiService.getServerConfig().port));
  const [status, setStatus] = useState<ConnectionStatus>(() => midiService.getStatus());
  const [modeDesc, setModeDesc] = useState(() => midiService.getConnectionModeDescription());
  const [channel, setChannel] = useState(() => midiService.getChannel());
  const [activeTab, setActiveTab] = useState<'melodi_usb' | 'pc_bridge'>('melodi_usb');

  useEffect(() => {
    const unsubscribe = midiService.addStatusListener((newStatus, host, p, desc) => {
      setStatus(newStatus);
      if (host !== '127.0.0.1' && host !== 'localhost') {
        setWifiIp(host);
      }
      setPort(String(p));
      setModeDesc(desc);
    });
    return () => {
      unsubscribe();
    };
  }, []);

  const handleAutoConnect = async () => {
    await midiService.autoConnect();
  };

  const handleConnectDirectUsb = async () => {
    await midiService.autoConnect();
  };

  const handleConnectBridgeUsb = () => {
    midiService.setServerConfig('127.0.0.1', 8080);
  };

  const handleConnectBridgeWifi = (targetIp?: string) => {
    const chosenIp = (targetIp || wifiIp || DEFAULT_WIFI_IP).trim();
    setWifiIp(chosenIp);
    midiService.connectWifi(chosenIp);
  };

  const handleDisconnect = () => {
    midiService.disconnect();
  };

  const handleChannelChange = (delta: number) => {
    const newCh = Math.max(1, Math.min(16, channel + delta));
    setChannel(newCh);
    midiService.setChannel(newCh);
  };

  const isConnected = status === 'connected';

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable style={styles.container} onPress={(e) => e.stopPropagation()}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.titleRow}>
              <Ionicons name="hardware-chip-outline" size={18} color="#38bdf8" />
              <Text style={styles.title}>MIDI Connection Manager</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn} hitSlop={12}>
              <Ionicons name="close" size={20} color="#94a3b8" />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent}>
            {/* Live Connection Status Banner */}
            <View
              style={[
                styles.statusBanner,
                isConnected && styles.statusBannerConnected,
                status === 'connecting' && styles.statusBannerConnecting,
              ]}
            >
              <View
                style={[
                  styles.statusDot,
                  isConnected && { backgroundColor: '#10b981' },
                  status === 'connecting' && { backgroundColor: '#f59e0b' },
                ]}
              />
              <Text style={styles.statusText} numberOfLines={2}>
                {isConnected
                  ? `Active: ${modeDesc}`
                  : status === 'connecting'
                  ? `Connecting: ${modeDesc}`
                  : 'Status: Disconnected'}
              </Text>
              {isConnected && (
                <TouchableOpacity
                  style={styles.disconnectInlineBtn}
                  onPress={handleDisconnect}
                >
                  <Text style={styles.disconnectInlineText}>Disconnect</Text>
                </TouchableOpacity>
              )}
            </View>

            {/* Auto Failover Info Callout */}
            <View style={styles.autoFailoverCallout}>
              <View style={styles.calloutHeader}>
                <Ionicons name="flash" size={14} color="#10b981" />
                <Text style={styles.calloutTitle}>Smart Auto-Failover Enabled</Text>
              </View>
              <Text style={styles.calloutDesc}>
                If USB cable is not connected, the app automatically switches to Wi-Fi mode (<Text style={styles.boldText}>{wifiIp}:{port}</Text>) and connects to PC Bridge without any manual setup.
              </Text>
              <TouchableOpacity
                style={[styles.autoConnectBtn, isConnected && styles.autoConnectBtnActive]}
                onPress={handleAutoConnect}
                activeOpacity={0.7}
              >
                <Ionicons
                  name={isConnected ? 'checkmark-circle' : 'refresh'}
                  size={14}
                  color="#ffffff"
                />
                <Text style={styles.autoConnectBtnText}>
                  {isConnected ? 'Connected & Working' : 'Auto Connect (USB ➔ Wi-Fi)'}
                </Text>
              </TouchableOpacity>
            </View>

            {/* Navigation Switcher: Direct USB (Melodi style) vs PC Bridge */}
            <View style={styles.tabSwitcher}>
              <TouchableOpacity
                style={[
                  styles.tabBtn,
                  activeTab === 'melodi_usb' && styles.tabBtnActive,
                ]}
                onPress={() => setActiveTab('melodi_usb')}
              >
                <Ionicons
                  name="phone-portrait-outline"
                  size={14}
                  color={activeTab === 'melodi_usb' ? '#38bdf8' : '#64748b'}
                />
                <Text
                  style={[
                    styles.tabBtnText,
                    activeTab === 'melodi_usb' && styles.tabBtnTextActive,
                  ]}
                >
                  Direct USB (Melodi Method)
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.tabBtn,
                  activeTab === 'pc_bridge' && styles.tabBtnActive,
                ]}
                onPress={() => setActiveTab('pc_bridge')}
              >
                <Ionicons
                  name="desktop-outline"
                  size={14}
                  color={activeTab === 'pc_bridge' ? '#38bdf8' : '#64748b'}
                />
                <Text
                  style={[
                    styles.tabBtnText,
                    activeTab === 'pc_bridge' && styles.tabBtnTextActive,
                  ]}
                >
                  Wi-Fi & PC Bridge
                </Text>
              </TouchableOpacity>
            </View>

            {/* Content for Melodi Direct USB Mode */}
            {activeTab === 'melodi_usb' && (
              <View style={styles.tabContent}>
                <View style={styles.methodCard}>
                  <View style={styles.methodCardHeader}>
                    <Ionicons name="link" size={16} color="#10b981" />
                    <Text style={styles.methodCardTitle}>
                      Melodi App USB Mode (Direct to DAW)
                    </Text>
                  </View>
                  <Text style={styles.methodCardDesc}>
                    Turns your phone directly into a class-compliant USB MIDI hardware controller recognized by Windows and your DAW.
                  </Text>

                  {/* 3 Step Instruction Guide */}
                  <View style={styles.stepsContainer}>
                    <View style={styles.stepItem}>
                      <View style={styles.stepBadge}>
                        <Text style={styles.stepBadgeText}>1</Text>
                      </View>
                      <Text style={styles.stepText}>
                        Plug phone to PC with standard USB cable.
                      </Text>
                    </View>

                    <View style={styles.stepItem}>
                      <View style={styles.stepBadge}>
                        <Text style={styles.stepBadgeText}>2</Text>
                      </View>
                      <Text style={styles.stepText}>
                        On phone: set USB notification to <Text style={styles.boldText}>MIDI</Text>.
                      </Text>
                    </View>

                    <View style={styles.stepItem}>
                      <View style={styles.stepBadge}>
                        <Text style={styles.stepBadgeText}>3</Text>
                      </View>
                      <Text style={styles.stepText}>
                        In your DAW (FL Studio, Ableton, etc.) MIDI Settings: Enable <Text style={styles.boldText}>Android</Text>.
                      </Text>
                    </View>
                  </View>

                  <TouchableOpacity
                    style={[
                      styles.actionBtn,
                      isConnected && styles.actionBtnActive,
                    ]}
                    onPress={handleConnectDirectUsb}
                  >
                    <Ionicons
                      name={isConnected ? 'checkmark-circle' : 'hardware-chip'}
                      size={16}
                      color="#ffffff"
                    />
                    <Text style={styles.actionBtnText}>
                      {isConnected ? 'USB MIDI Active' : 'Connect Direct USB MIDI'}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {/* Content for PC Bridge Mode */}
            {activeTab === 'pc_bridge' && (
              <View style={styles.tabContent}>
                <View style={styles.connectionOptionsRow}>
                  {/* Option 1: Wi-Fi LAN (Primary for Bridge) */}
                  <TouchableOpacity
                    style={[
                      styles.optionCard,
                      isConnected && modeDesc.includes('Wi-Fi') && styles.optionCardActive,
                    ]}
                    onPress={() => handleConnectBridgeWifi(wifiIp)}
                    activeOpacity={0.7}
                  >
                    <View style={styles.optionHeader}>
                      <Ionicons name="wifi" size={16} color="#10b981" />
                      <Text style={styles.optionTitle}>Wi-Fi Network</Text>
                    </View>
                    <Text style={styles.optionDesc}>
                      Wireless connect to MidiDawBridge.exe at {wifiIp}:{port}
                    </Text>
                    <Text style={styles.optionActionText}>
                      {isConnected && modeDesc.includes('Wi-Fi') ? '✓ Active' : 'Connect via Wi-Fi'}
                    </Text>
                  </TouchableOpacity>

                  {/* Option 2: USB Cable ADB */}
                  <TouchableOpacity
                    style={[
                      styles.optionCard,
                      isConnected && modeDesc.includes('127.0.0.1') && styles.optionCardActive,
                    ]}
                    onPress={handleConnectBridgeUsb}
                    activeOpacity={0.7}
                  >
                    <View style={styles.optionHeader}>
                      <Ionicons name="git-commit-outline" size={16} color="#38bdf8" />
                      <Text style={styles.optionTitle}>USB Cable ADB</Text>
                    </View>
                    <Text style={styles.optionDesc}>
                      USB ADB reverse forward (127.0.0.1:8080)
                    </Text>
                    <Text style={styles.optionActionText}>
                      {isConnected && modeDesc.includes('127.0.0.1') ? '✓ Active' : 'Connect via USB'}
                    </Text>
                  </TouchableOpacity>
                </View>

                {/* Manual IP / Port Input */}
                <View style={styles.formRow}>
                  <View style={[styles.inputGroup, { flex: 3 }]}>
                    <Text style={styles.label}>PC WI-FI IP ADDRESS</Text>
                    <TextInput
                      style={styles.input}
                      value={wifiIp}
                      onChangeText={setWifiIp}
                      placeholder="10.134.131.183"
                      placeholderTextColor="#64748b"
                      autoCapitalize="none"
                      autoCorrect={false}
                    />
                  </View>

                  <View style={[styles.inputGroup, { flex: 1 }]}>
                    <Text style={styles.label}>PORT</Text>
                    <TextInput
                      style={styles.input}
                      value={port}
                      onChangeText={setPort}
                      placeholder="8080"
                      placeholderTextColor="#64748b"
                      keyboardType="number-pad"
                    />
                  </View>

                  <View style={styles.actionBtnContainer}>
                    <TouchableOpacity
                      style={[styles.btn, styles.connectBtn]}
                      onPress={() => handleConnectBridgeWifi(wifiIp)}
                    >
                      <Ionicons name="link" size={14} color="#ffffff" />
                      <Text style={styles.btnText}>Connect</Text>
                    </TouchableOpacity>
                  </View>
                </View>

                <View style={styles.helpBox}>
                  <Text style={styles.helpText}>
                    💡 Running <Text style={styles.boldText}>MidiDawBridge.exe</Text> on PC. If USB is not plugged in, the app automatically connects to <Text style={styles.boldText}>{wifiIp}:{port}</Text>.
                  </Text>
                </View>
              </View>
            )}

            {/* Bottom: MIDI Channel Selector */}
            <View style={styles.bottomRow}>
              <View style={styles.channelRow}>
                <Text style={styles.label}>MIDI CHANNEL</Text>
                <View style={styles.counterRow}>
                  <TouchableOpacity
                    style={styles.counterBtn}
                    onPress={() => handleChannelChange(-1)}
                  >
                    <Text style={styles.counterBtnText}>-</Text>
                  </TouchableOpacity>
                  <Text style={styles.counterValue}>CH {channel}</Text>
                  <TouchableOpacity
                    style={styles.counterBtn}
                    onPress={() => handleChannelChange(1)}
                  >
                    <Text style={styles.counterBtnText}>+</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 12,
  },
  container: {
    width: '94%',
    maxWidth: 580,
    maxHeight: '92%',
    backgroundColor: '#0f172a',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#334155',
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b',
    backgroundColor: '#1e293b',
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  title: {
    color: '#f8fafc',
    fontSize: 14,
    fontWeight: '700',
  },
  closeBtn: {
    padding: 4,
  },
  body: {
    maxHeight: 500,
  },
  bodyContent: {
    padding: 12,
    gap: 10,
  },
  statusBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#020617',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ef4444',
  },
  statusBannerConnected: {
    borderColor: '#10b981',
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
  },
  statusBannerConnecting: {
    borderColor: '#f59e0b',
    backgroundColor: 'rgba(245, 158, 11, 0.1)',
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#ef4444',
    marginRight: 6,
  },
  statusText: {
    color: '#cbd5e1',
    fontSize: 11,
    fontWeight: '700',
    flex: 1,
  },
  disconnectInlineBtn: {
    backgroundColor: '#dc2626',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
    marginLeft: 6,
  },
  disconnectInlineText: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: '700',
  },
  autoFailoverCallout: {
    backgroundColor: '#020617',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#10b981',
    padding: 9,
    gap: 6,
  },
  calloutHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  calloutTitle: {
    color: '#10b981',
    fontSize: 11,
    fontWeight: '800',
  },
  calloutDesc: {
    color: '#94a3b8',
    fontSize: 10,
    lineHeight: 14,
  },
  autoConnectBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#059669',
    paddingVertical: 7,
    borderRadius: 6,
  },
  autoConnectBtnActive: {
    backgroundColor: '#10b981',
  },
  autoConnectBtnText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '800',
  },
  tabSwitcher: {
    flexDirection: 'row',
    backgroundColor: '#020617',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#1e293b',
    padding: 3,
    gap: 4,
  },
  tabBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 6,
    borderRadius: 6,
  },
  tabBtnActive: {
    backgroundColor: '#1e293b',
  },
  tabBtnText: {
    color: '#64748b',
    fontSize: 11,
    fontWeight: '700',
  },
  tabBtnTextActive: {
    color: '#f8fafc',
  },
  tabContent: {
    gap: 10,
  },
  methodCard: {
    backgroundColor: '#020617',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#1e293b',
    padding: 10,
    gap: 8,
  },
  methodCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  methodCardTitle: {
    color: '#f8fafc',
    fontSize: 12,
    fontWeight: '800',
  },
  methodCardDesc: {
    color: '#94a3b8',
    fontSize: 10,
    lineHeight: 14,
  },
  stepsContainer: {
    backgroundColor: '#0f172a',
    borderRadius: 6,
    padding: 8,
    gap: 6,
  },
  stepItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  stepBadge: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#1e293b',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#38bdf8',
  },
  stepBadgeText: {
    color: '#38bdf8',
    fontSize: 9,
    fontWeight: '900',
  },
  stepText: {
    color: '#cbd5e1',
    fontSize: 10,
    flex: 1,
    lineHeight: 14,
  },
  boldText: {
    color: '#38bdf8',
    fontWeight: '700',
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#2563eb',
    paddingVertical: 8,
    borderRadius: 6,
    marginTop: 4,
  },
  actionBtnActive: {
    backgroundColor: '#059669',
  },
  actionBtnText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '800',
  },
  connectionOptionsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  optionCard: {
    flex: 1,
    backgroundColor: '#020617',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#1e293b',
    padding: 9,
    gap: 4,
  },
  optionCardActive: {
    borderColor: '#10b981',
    backgroundColor: 'rgba(16, 185, 129, 0.08)',
  },
  optionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  optionTitle: {
    color: '#f8fafc',
    fontSize: 11,
    fontWeight: '800',
  },
  optionDesc: {
    color: '#94a3b8',
    fontSize: 9,
    lineHeight: 12,
  },
  optionActionText: {
    color: '#38bdf8',
    fontSize: 10,
    fontWeight: '700',
    marginTop: 2,
  },
  formRow: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'flex-end',
    backgroundColor: '#020617',
    padding: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#1e293b',
  },
  inputGroup: {
    gap: 3,
  },
  label: {
    color: '#64748b',
    fontSize: 8,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  input: {
    backgroundColor: '#0f172a',
    color: '#f8fafc',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 5,
    fontSize: 11,
    borderWidth: 1,
    borderColor: '#334155',
  },
  actionBtnContainer: {
    justifyContent: 'flex-end',
  },
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 6,
    justifyContent: 'center',
  },
  connectBtn: {
    backgroundColor: '#2563eb',
  },
  btnText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '700',
  },
  bottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 4,
  },
  channelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#020617',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#1e293b',
  },
  counterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0f172a',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#334155',
    overflow: 'hidden',
  },
  counterBtn: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: '#1e293b',
  },
  counterBtnText: {
    color: '#f8fafc',
    fontSize: 13,
    fontWeight: '700',
  },
  counterValue: {
    width: 45,
    textAlign: 'center',
    color: '#38bdf8',
    fontSize: 11,
    fontWeight: '700',
  },
  helpBox: {
    backgroundColor: '#020617',
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#1e293b',
  },
  helpText: {
    color: '#94a3b8',
    fontSize: 9,
    lineHeight: 13,
  },
});
