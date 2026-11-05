import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { midiService, ConnectionStatus, MidiEventLog } from '../services/midiService';
import { ConnectionModal } from './ConnectionModal';

interface TopBarProps {
  currentTabName?: string;
}

export const TopBar: React.FC<TopBarProps> = ({ currentTabName }) => {
  const [status, setStatus] = useState<ConnectionStatus>(() => midiService.getStatus());
  const [lastLog, setLastLog] = useState<string>(() => currentTabName ? `${currentTabName} Ready` : 'Ready');
  const [modalVisible, setModalVisible] = useState(false);
  const [channel, setChannel] = useState(() => midiService.getChannel());
  const [modeDesc, setModeDesc] = useState(() => midiService.getConnectionModeDescription());

  useEffect(() => {
    const unsubStatus = midiService.addStatusListener((s, _host, _port, desc) => {
      setStatus(s);
      setModeDesc(desc);
      setChannel(midiService.getChannel());
    });
    const unsubLog = midiService.addLogListener((log: MidiEventLog) => {
      setLastLog(log.description);
    });

    return () => {
      unsubStatus();
      unsubLog();
    };
  }, []);

  const handlePanic = () => {
    midiService.allNotesOff();
  };

  const handleConnectionPress = () => {
    if (status === 'connected') {
      setModalVisible(true);
    } else if (status === 'connecting') {
      midiService.disconnect();
    } else {
      // Auto connect: checks USB first, automatically moves to Wi-Fi if not USB
      midiService.autoConnect();
    }
  };

  const isConnected = status === 'connected';
  const isConnecting = status === 'connecting';

  return (
    <>
      <View style={styles.container}>
        {/* Left: High-Res Logo Brand & USB/Bridge Button */}
        <View style={styles.leftSection}>
          <View style={styles.brandBadge}>
            <Image
              source={require('../../assets/images/logo.png')}
              style={styles.logoImage}
              resizeMode="contain"
            />
            <Text style={styles.brandText}>MIDIDAW</Text>
          </View>

          {/* Dedicated Connection Button (Direct USB / Bridge) */}
          <TouchableOpacity
            style={[
              styles.bridgeBtn,
              isConnected && styles.bridgeBtnConnected,
              isConnecting && styles.bridgeBtnConnecting,
            ]}
            onPress={handleConnectionPress}
            activeOpacity={0.7}
          >
            <View
              style={[
                styles.dot,
                isConnected && { backgroundColor: '#10b981' },
                isConnecting && { backgroundColor: '#f59e0b' },
                !isConnected && !isConnecting && { backgroundColor: '#38bdf8' },
              ]}
            />
            <Ionicons
              name={isConnected ? 'link' : 'hardware-chip-outline'}
              size={12}
              color={isConnected ? '#10b981' : '#38bdf8'}
            />
            <Text
              style={[
                styles.bridgeBtnText,
                isConnected && styles.bridgeBtnTextConnected,
              ]}
              numberOfLines={1}
            >
              {isConnected
                ? (modeDesc.includes('USB') ? 'USB MIDI' : modeDesc.includes('Wi-Fi') ? 'Wi-Fi MIDI' : 'Connected')
                : isConnecting
                ? 'Connecting...'
                : 'Auto Connect'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.channelBadge}
            onPress={() => setModalVisible(true)}
            activeOpacity={0.7}
          >
            <Text style={styles.channelText}>CH {channel}</Text>
          </TouchableOpacity>
        </View>

        {/* Center: Live MIDI Monitor */}
        <View style={styles.centerSection}>
          <Ionicons name="radio-outline" size={12} color="#64748b" />
          <Text style={styles.monitorText} numberOfLines={1}>
            {lastLog}
          </Text>
        </View>

        {/* Right: Panic Button, Settings */}
        <View style={styles.rightSection}>
          <TouchableOpacity
            style={styles.panicButton}
            onPress={handlePanic}
            activeOpacity={0.7}
          >
            <Ionicons name="warning-outline" size={12} color="#ffffff" />
            <Text style={styles.panicText}>PANIC</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.iconButton}
            onPress={() => setModalVisible(true)}
            hitSlop={8}
          >
            <Ionicons name="settings-sharp" size={14} color="#94a3b8" />
          </TouchableOpacity>
        </View>
      </View>

      <ConnectionModal visible={modalVisible} onClose={() => setModalVisible(false)} />
    </>
  );
};

const styles = StyleSheet.create({
  container: {
    height: 38,
    backgroundColor: '#090d16',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b',
  },
  leftSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  brandBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  logoImage: {
    width: 20,
    height: 20,
  },
  brandText: {
    color: '#f8fafc',
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 1,
  },
  bridgeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#1e293b',
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#38bdf8',
  },
  bridgeBtnConnected: {
    borderColor: '#10b981',
    backgroundColor: 'rgba(16, 185, 129, 0.14)',
  },
  bridgeBtnConnecting: {
    borderColor: '#f59e0b',
    backgroundColor: 'rgba(245, 158, 11, 0.14)',
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  bridgeBtnText: {
    color: '#38bdf8',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  bridgeBtnTextConnected: {
    color: '#10b981',
  },
  channelBadge: {
    backgroundColor: '#1e293b',
    paddingHorizontal: 6,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#334155',
  },
  channelText: {
    color: '#94a3b8',
    fontSize: 9,
    fontWeight: '700',
  },
  centerSection: {
    flex: 1,
    maxWidth: 280,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    backgroundColor: '#020617',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#1e293b',
    marginHorizontal: 8,
  },
  monitorText: {
    color: '#38bdf8',
    fontSize: 10,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontWeight: '600',
  },
  rightSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  iconButton: {
    width: 26,
    height: 26,
    borderRadius: 6,
    backgroundColor: '#1e293b',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#334155',
  },
  panicButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#dc2626',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  panicText: {
    color: '#ffffff',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
});
