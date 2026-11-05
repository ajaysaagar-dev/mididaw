import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  GestureResponderEvent,
  LayoutChangeEvent,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { DEFAULT_DRUM_PADS, DrumPadDefinition } from '../../constants/midiNotes';
import { midiService } from '../../services/midiService';
import { TopBar } from '../../components/TopBar';
import { EditPadModal } from '../../components/EditPadModal';

type Bank = 'A' | 'B' | 'C' | 'D';
const STORAGE_KEY = '@mididaw_drum_pads_custom';

export default function DrumPadScreen() {
  const [activeBank, setActiveBank] = useState<Bank>('A');
  const [fullVelocity, setFullVelocity] = useState(false);
  const [activePads, setActivePads] = useState<{ [id: number]: boolean }>({});
  const [editMode, setEditMode] = useState(false);
  const [editingPad, setEditingPad] = useState<DrumPadDefinition | null>(null);
  const [drumPads, setDrumPads] = useState<DrumPadDefinition[]>(DEFAULT_DRUM_PADS);

  // Dimensions of pads grid for multi-touch hit testing
  const [gridSize, setGridSize] = useState({ width: 0, height: 0 });

  // Map touch.identifier -> { padId, noteNumber }
  const activeTouchMapRef = useRef<{ [touchId: string]: { padId: number; note: number; padName: string } }>({});

  const bankOffsets: Record<Bank, number> = {
    A: 0,
    B: 16,
    C: 32,
    D: 48,
  };

  // Load custom drum pads
  useEffect(() => {
    async function loadCustomPads() {
      try {
        const stored = await AsyncStorage.getItem(STORAGE_KEY);
        if (stored) {
          const parsed = JSON.parse(stored);
          if (Array.isArray(parsed) && parsed.length > 0) {
            setDrumPads(parsed);
          }
        }
      } catch {}
    }
    loadCustomPads();
  }, []);

  // Helper to find pad at coordinate (x, y)
  const getPadAtCoordinates = (x: number, y: number): DrumPadDefinition | null => {
    if (gridSize.width <= 0 || gridSize.height <= 0) return null;
    const col = Math.max(0, Math.min(3, Math.floor((x / gridSize.width) * 4)));
    const row = Math.max(0, Math.min(3, Math.floor((y / gridSize.height) * 4)));
    const index = row * 4 + col;
    return drumPads[index] || null;
  };

  // Multi-Touch Handlers for entire grid
  const handleGridTouch = (e: GestureResponderEvent) => {
    if (editMode) {
      if (e.nativeEvent.touches.length > 0) {
        const t = e.nativeEvent.touches[0];
        const pad = getPadAtCoordinates(t.locationX, t.locationY);
        if (pad) {
          setEditingPad(pad);
        }
      }
      return;
    }

    const currentTouches = e.nativeEvent.touches;
    const currentTouchIds = new Set(currentTouches.map((t) => String(t.identifier)));
    const offset = bankOffsets[activeBank];
    const vel = fullVelocity ? 127 : 110;

    // 1. Process new or moving touches
    const nextActivePads: { [id: number]: boolean } = {};
    let hasChanged = false;

    currentTouches.forEach((t) => {
      const touchId = String(t.identifier);
      const pad = getPadAtCoordinates(t.locationX, t.locationY);
      if (!pad) return;

      const existing = activeTouchMapRef.current[touchId];
      if (!existing || existing.padId !== pad.id) {
        hasChanged = true;
        // If moved to a different pad, release old pad
        if (existing) {
          midiService.drumPadOff(existing.note, existing.padName);
        }

        const note = pad.noteNumber + offset;
        // FASTEST PATH: Immediate synchronous MIDI dispatch
        midiService.drumPadOn(note, pad.name, vel);
        activeTouchMapRef.current[touchId] = { padId: pad.id, note, padName: pad.name };
      }

      nextActivePads[pad.id] = true;
    });

    // 2. Release touches that ended
    Object.keys(activeTouchMapRef.current).forEach((touchId) => {
      if (!currentTouchIds.has(touchId)) {
        hasChanged = true;
        const removed = activeTouchMapRef.current[touchId];
        midiService.drumPadOff(removed.note, removed.padName);
        delete activeTouchMapRef.current[touchId];
      }
    });

    if (hasChanged) {
      setActivePads(nextActivePads);
    }
  };

  const handleGridTouchEnd = (e: GestureResponderEvent) => {
    if (editMode) return;

    const currentTouches = e.nativeEvent.touches;
    const currentTouchIds = new Set(currentTouches.map((t) => String(t.identifier)));

    const nextActivePads: { [id: number]: boolean } = {};
    let hasChanged = false;

    Object.keys(activeTouchMapRef.current).forEach((touchId) => {
      if (!currentTouchIds.has(touchId)) {
        hasChanged = true;
        const removed = activeTouchMapRef.current[touchId];
        midiService.drumPadOff(removed.note, removed.padName);
        delete activeTouchMapRef.current[touchId];
      } else {
        nextActivePads[activeTouchMapRef.current[touchId].padId] = true;
      }
    });

    if (hasChanged) {
      setActivePads(nextActivePads);
    }
  };

  const handleSavePad = async (updatedPad: DrumPadDefinition) => {
    const nextPads = drumPads.map((p) => (p.id === updatedPad.id ? updatedPad : p));
    setDrumPads(nextPads);
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(nextPads));
    } catch {}
  };

  const handleResetPad = async (padId: number) => {
    const defaultPad = DEFAULT_DRUM_PADS.find((p) => p.id === padId);
    if (!defaultPad) return;

    const nextPads = drumPads.map((p) => (p.id === padId ? defaultPad : p));
    setDrumPads(nextPads);
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(nextPads));
    } catch {}
  };

  const toggleEditMode = () => {
    setEditMode(!editMode);
  };

  return (
    <View style={styles.container}>
      <TopBar currentTabName="Drum Pad" />

      {/* Edit Mode Alert Bar */}
      {editMode && (
        <View style={styles.editModeBanner}>
          <Ionicons name="pencil" size={13} color="#f59e0b" />
          <Text style={styles.editModeText}>
            EDIT MODE ACTIVE: Tap any drum pad to customize its name, MIDI note & color
          </Text>
          <TouchableOpacity style={styles.doneEditBtn} onPress={() => setEditMode(false)}>
            <Text style={styles.doneEditText}>DONE</Text>
          </TouchableOpacity>
        </View>
      )}

      <View style={styles.mainContent}>
        {/* Left Side: Bank Switcher & Performance controls */}
        <View style={styles.sideControls}>
          <Text style={styles.sideTitle}>PAD BANK</Text>
          <View style={styles.bankGrid}>
            {(['A', 'B', 'C', 'D'] as Bank[]).map((bank) => {
              const isSelected = activeBank === bank;
              return (
                <TouchableOpacity
                  key={bank}
                  style={[styles.bankBtn, isSelected && styles.bankBtnActive]}
                  onPress={() => setActiveBank(bank)}
                >
                  <Text style={[styles.bankBtnText, isSelected && styles.bankBtnTextActive]}>
                    {bank}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <View style={styles.divider} />

          <Text style={styles.sideTitle}>VELOCITY</Text>
          <TouchableOpacity
            style={[styles.ctrlBtn, fullVelocity && styles.ctrlBtnActive]}
            onPress={() => setFullVelocity(!fullVelocity)}
          >
            <Ionicons
              name={fullVelocity ? 'flash' : 'flash-outline'}
              size={13}
              color={fullVelocity ? '#38bdf8' : '#94a3b8'}
            />
            <Text style={[styles.ctrlBtnText, fullVelocity && styles.ctrlBtnTextActive]}>
              {fullVelocity ? 'FULL 127' : 'NORMAL'}
            </Text>
          </TouchableOpacity>

          <View style={styles.bankInfoBox}>
            <Text style={styles.bankInfoTitle}>BANK {activeBank}</Text>
            <Text style={styles.bankInfoNotes}>
              Notes {35 + bankOffsets[activeBank]} - {50 + bankOffsets[activeBank]}
            </Text>
            <Text style={styles.bankInfoSub}>CH: 10 (Poly Chords)</Text>
          </View>
        </View>

        {/* 4x4 Multi-Touch MPC Drum Pad Matrix */}
        <View style={styles.padsContainer}>
          {/* Top Right Header */}
          <View style={styles.padsTopHeader}>
            <View style={styles.kitInfoRow}>
              <Text style={styles.kitTitle}>16-PAD MPC MATRIX</Text>
              <Text style={styles.kitSubtitle}>Multi-Touch Polyphonic</Text>
            </View>

            <TouchableOpacity
              style={[styles.editPencilBtn, editMode && styles.editPencilBtnActive]}
              onPress={toggleEditMode}
              activeOpacity={0.7}
            >
              <Ionicons
                name={editMode ? 'checkmark-circle' : 'pencil-sharp'}
                size={14}
                color={editMode ? '#10b981' : '#f59e0b'}
              />
              <Text style={[styles.editPencilText, editMode && styles.editPencilTextActive]}>
                {editMode ? 'EXIT EDIT' : 'EDIT PADS'}
              </Text>
            </TouchableOpacity>
          </View>

          {/* Unified Multi-Touch Responsive Grid */}
          <View
            style={styles.padsGrid}
            onLayout={(e: LayoutChangeEvent) =>
              setGridSize({ width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height })
            }
            onStartShouldSetResponder={() => true}
            onStartShouldSetResponderCapture={() => true}
            onMoveShouldSetResponder={() => true}
            onMoveShouldSetResponderCapture={() => true}
            onResponderTerminationRequest={() => false}
            onResponderGrant={handleGridTouch}
            onResponderMove={handleGridTouch}
            onResponderRelease={handleGridTouchEnd}
            onResponderTerminate={handleGridTouchEnd}
          >
            {drumPads.map((pad) => {
              const isPressed = !!activePads[pad.id];
              const noteNumber = pad.noteNumber + bankOffsets[activeBank];

              return (
                <View
                  key={pad.id}
                  style={[
                    styles.pad,
                    {
                      borderColor: editMode ? '#f59e0b' : isPressed ? '#ffffff' : '#1e293b',
                      borderStyle: editMode ? 'dashed' : 'solid',
                      backgroundColor: isPressed ? pad.color : '#0f172a',
                    },
                  ]}
                  pointerEvents="none"
                >
                  {/* Color Accent Indicator Bar */}
                  <View
                    style={[
                      styles.padLedBar,
                      {
                        backgroundColor: isPressed ? '#ffffff' : pad.color,
                      },
                    ]}
                  />

                  {/* Edit mode badge */}
                  {editMode && (
                    <View style={styles.padEditBadge}>
                      <Ionicons name="pencil" size={10} color="#f59e0b" />
                    </View>
                  )}

                  <View style={styles.padContent}>
                    <Text
                      style={[
                        styles.padShortName,
                        isPressed && styles.padTextPressed,
                      ]}
                      numberOfLines={1}
                    >
                      {pad.shortName}
                    </Text>
                    <Text
                      style={[
                        styles.padNoteNum,
                        isPressed && styles.padNotePressed,
                      ]}
                    >
                      {noteNumber}
                    </Text>
                  </View>
                </View>
              );
            })}
          </View>
        </View>
      </View>

      {editingPad && (
        <EditPadModal
          key={editingPad.id}
          visible={true}
          pad={editingPad}
          bankOffset={bankOffsets[activeBank]}
          onSave={handleSavePad}
          onReset={handleResetPad}
          onClose={() => setEditingPad(null)}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#030712',
  },
  editModeBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#78350f',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderBottomWidth: 1,
    borderBottomColor: '#b45309',
  },
  editModeText: {
    color: '#fef3c7',
    fontSize: 10,
    fontWeight: '700',
    flex: 1,
    marginHorizontal: 6,
  },
  doneEditBtn: {
    backgroundColor: '#f59e0b',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  doneEditText: {
    color: '#000000',
    fontSize: 9,
    fontWeight: '900',
  },
  mainContent: {
    flex: 1,
    flexDirection: 'row',
  },
  sideControls: {
    width: 96,
    backgroundColor: '#0b1120',
    borderRightWidth: 1,
    borderRightColor: '#1e293b',
    padding: 6,
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sideTitle: {
    color: '#64748b',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  bankGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    width: '100%',
    justifyContent: 'center',
  },
  bankBtn: {
    width: '46%',
    aspectRatio: 1.2,
    backgroundColor: '#1e293b',
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#334155',
  },
  bankBtnActive: {
    backgroundColor: '#2563eb',
    borderColor: '#60a5fa',
  },
  bankBtnText: {
    color: '#94a3b8',
    fontSize: 12,
    fontWeight: '800',
  },
  bankBtnTextActive: {
    color: '#ffffff',
  },
  divider: {
    width: '80%',
    height: 1,
    backgroundColor: '#1e293b',
    marginVertical: 4,
  },
  ctrlBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    width: '100%',
    backgroundColor: '#1e293b',
    borderRadius: 6,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: '#334155',
  },
  ctrlBtnActive: {
    borderColor: '#38bdf8',
    backgroundColor: 'rgba(56, 189, 248, 0.15)',
  },
  ctrlBtnText: {
    color: '#94a3b8',
    fontSize: 9,
    fontWeight: '800',
  },
  ctrlBtnTextActive: {
    color: '#38bdf8',
  },
  bankInfoBox: {
    backgroundColor: '#020617',
    width: '100%',
    padding: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#1e293b',
    alignItems: 'center',
  },
  bankInfoTitle: {
    color: '#38bdf8',
    fontSize: 9,
    fontWeight: '800',
  },
  bankInfoNotes: {
    color: '#64748b',
    fontSize: 8,
    fontWeight: '600',
  },
  bankInfoSub: {
    color: '#475569',
    fontSize: 7,
  },
  padsContainer: {
    flex: 1,
    padding: 6,
    backgroundColor: '#000000',
  },
  padsTopHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
    paddingHorizontal: 4,
  },
  kitInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  kitTitle: {
    color: '#94a3b8',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  kitSubtitle: {
    color: '#38bdf8',
    fontSize: 10,
    fontWeight: '700',
  },
  editPencilBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#1e293b',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#f59e0b',
  },
  editPencilBtnActive: {
    backgroundColor: 'rgba(16, 185, 129, 0.2)',
    borderColor: '#10b981',
  },
  editPencilText: {
    color: '#f59e0b',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  editPencilTextActive: {
    color: '#10b981',
  },
  padsGrid: {
    flex: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    alignContent: 'space-between',
  },
  pad: {
    width: '24.2%',
    height: '23.8%',
    backgroundColor: '#0f172a',
    borderRadius: 8,
    borderWidth: 1.5,
    overflow: 'hidden',
    justifyContent: 'space-between',
    padding: 6,
    position: 'relative',
  },
  padLedBar: {
    height: 3,
    width: '100%',
    borderRadius: 2,
  },
  padEditBadge: {
    position: 'absolute',
    top: 6,
    right: 6,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: 10,
    padding: 2,
  },
  padContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  padShortName: {
    color: '#f8fafc',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.5,
    textAlign: 'center',
  },
  padTextPressed: {
    color: '#ffffff',
  },
  padNoteNum: {
    color: '#64748b',
    fontSize: 9,
    fontWeight: '600',
    marginTop: 2,
  },
  padNotePressed: {
    color: 'rgba(255, 255, 255, 0.85)',
  },
});
