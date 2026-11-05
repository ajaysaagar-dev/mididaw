import React, { useState, useRef, useMemo, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  LayoutChangeEvent,
  GestureResponderEvent,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { midiService } from '../../services/midiService';
import { getNoteInfo } from '../../constants/midiNotes';
import { SCALES, TUNING_PRESETS } from '../../constants/scales';
import { TopBar } from '../../components/TopBar';

interface ActiveSlideTouch {
  touchId: string;
  stringIndex: number;
  currentColIndex: number; // Index in stringNotes array currently active
  baseNote: number;
  currentNote: number;
  channel: number;
  startX: number;
  currentX: number;
  currentY: number;
}

const ROOT_NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

export const INSTRUMENT_VOICES = [
  { id: 40, name: 'Violin', icon: 'musical-notes' },
  { id: 42, name: 'Cello', icon: 'musical-notes-outline' },
  { id: 48, name: 'Strings', icon: 'albums-outline' },
  { id: 80, name: 'Synth Lead', icon: 'pulse' },
  { id: 29, name: 'Overdriven Guitar', icon: 'flash-outline' },
  { id: -1, name: 'DAW / Synth (Custom)', icon: 'hardware-chip-outline' },
];

export default function SlideRollScreen() {
  const [tuningPresetIndex, setTuningPresetIndex] = useState(0);
  const [scaleIndex, setScaleIndex] = useState(3); // Default to Pentatonic Minor
  const [rootNoteIndex, setRootNoteIndex] = useState(0); // C by default
  const [octaveShift, setOctaveShift] = useState(0); // -2 to +2
  const [mpeEnabled, setMpeEnabled] = useState<boolean>(false);
  const [voiceIndex, setVoiceIndex] = useState<number>(0); // 0 = Violin (Patch 40)
  const [scaleOffset, setScaleOffset] = useState<number>(0); // Scroll offset in scale steps
  const [cellCount] = useState<number>(14); // 14 scale steps across screen
  const [cellWidth, setCellWidth] = useState<number>(56);
  const [boardWidth, setBoardWidth] = useState<number>(800);
  const [boardHeight, setBoardHeight] = useState<number>(240);

  // Active touches state for rendering glowing realtime indicators
  const [touchRipples, setTouchRipples] = useState<{ [id: string]: ActiveSlideTouch }>({});
  const activeSlideTouchesRef = useRef<{ [touchId: string]: ActiveSlideTouch }>({});

  const currentTuning = TUNING_PRESETS[tuningPresetIndex];
  const currentScale = SCALES[scaleIndex];
  const currentVoice = INSTRUMENT_VOICES[voiceIndex];

  // Set default instrument voice to Violin (Patch 40) on screen mount
  useEffect(() => {
    if (currentVoice.id >= 0) {
      midiService.programChange(currentVoice.id);
    }
  }, [currentVoice]);

  // Clean up any active notes on unmount
  useEffect(() => {
    return () => {
      Object.keys(activeSlideTouchesRef.current).forEach((touchId) => {
        const removed = activeSlideTouchesRef.current[touchId];
        if (removed) {
          midiService.noteOff(removed.currentNote, removed.channel);
          midiService.pitchBend(0, removed.channel);
        }
      });
      activeSlideTouchesRef.current = {};
    };
  }, []);

  // Set of scale note pitch classes (0-11)
  const scaleNotesSet = useMemo(() => {
    const s = new Set<number>();
    currentScale.intervals.forEach((interval) => {
      s.add((rootNoteIndex + interval) % 12);
    });
    return s;
  }, [currentScale, rootNoteIndex]);

  // Precompute all scale notes across the entire MIDI range (0 to 127)
  // ONLY in-scale notes are allowed; eliminated notes are never included.
  const allScaleNotes = useMemo(() => {
    const notes: number[] = [];
    for (let midi = 12; midi <= 120; midi++) {
      const noteClass = ((midi % 12) + 12) % 12;
      if (scaleNotesSet.has(noteClass)) {
        notes.push(midi);
      }
    }
    return notes;
  }, [scaleNotesSet]);

  // Compute string rows containing ONLY scale notes
  const stringRows = useMemo(() => {
    if (allScaleNotes.length === 0) return [];

    return currentTuning.openNotes.map((baseOpenNote, stringIdx) => {
      const transposedOpen = baseOpenNote + octaveShift * 12;

      // Find the index in allScaleNotes closest to transposedOpen
      let openIdx = allScaleNotes.findIndex((n) => n >= transposedOpen);
      if (openIdx === -1) openIdx = 0;

      // Apply scale offset (for shifting visible octave/range)
      const startIdx = Math.max(0, Math.min(allScaleNotes.length - cellCount, openIdx + scaleOffset));

      const rowNotes: {
        noteNumber: number;
        stepIndex: number;
        name: string;
        isRoot: boolean;
      }[] = [];

      for (let c = 0; c < cellCount; c++) {
        const noteIdx = Math.min(allScaleNotes.length - 1, startIdx + c);
        const note = allScaleNotes[noteIdx];
        const noteClass = ((note % 12) + 12) % 12;
        const isRoot = noteClass === rootNoteIndex;
        const info = getNoteInfo(note);

        rowNotes.push({
          noteNumber: note,
          stepIndex: c,
          name: info.name,
          isRoot,
        });
      }

      return {
        stringIdx,
        openNote: transposedOpen,
        notes: rowNotes,
      };
    });
  }, [currentTuning, octaveShift, allScaleNotes, cellCount, scaleOffset, rootNoteIndex]);

  const numStrings = stringRows.length;
  const stringRowHeight = boardHeight > 0 && numStrings > 0 ? boardHeight / numStrings : 44;

  // Real-Time Touch & Slide Responder:
  // - Strictly scale notes only (eliminated notes are completely excluded and never touched)
  // - Real-time finger move speed & position (no smoothing or lag at trigger points)
  // - Sustained continuous play until finger lifts off screen
  // - Instant legato handoff upon crossing into the next scale note cell
  const handleTouchStartOrMove = useCallback(
    (e: GestureResponderEvent) => {
      const currentTouches = e.nativeEvent.touches;
      const currentTouchIds = new Set(currentTouches.map((t) => String(t.identifier)));
      const updatedTouches: { [id: string]: ActiveSlideTouch } = { ...activeSlideTouchesRef.current };
      let hasChanged = false;

      // 1. Process all active touches
      for (let i = 0; i < currentTouches.length; i++) {
        const t = currentTouches[i];
        const touchId = String(t.identifier);
        const x = t.locationX;
        const y = t.locationY;

        // Calculate string row and cell column index (only scale notes!)
        const stringIdx = Math.max(0, Math.min(numStrings - 1, Math.floor(y / stringRowHeight)));
        const colIdx = Math.max(0, Math.min(cellCount - 1, Math.floor(x / cellWidth)));

        const targetString = stringRows[stringIdx];
        if (!targetString) continue;

        const targetCellItem = targetString.notes[colIdx];
        if (!targetCellItem) continue;

        const existingTouch = activeSlideTouchesRef.current[touchId];
        const channel = mpeEnabled ? (stringIdx % 15) + 2 : midiService.getChannel();

        if (!existingTouch) {
          // TOUCH DOWN ON IN-SCALE NOTE:
          // Immediately triggers only this scale note
          const baseNote = targetCellItem.noteNumber;
          midiService.noteOn(baseNote, 110, channel);
          midiService.pitchBend(0, channel); // Pitch bend is strictly 0 (no eliminated notes touched)

          const newTouchData: ActiveSlideTouch = {
            touchId,
            stringIndex: stringIdx,
            currentColIndex: colIdx,
            baseNote,
            currentNote: baseNote,
            channel,
            startX: x,
            currentX: x,
            currentY: y,
          };

          activeSlideTouchesRef.current[touchId] = newTouchData;
          updatedTouches[touchId] = newTouchData;
          hasChanged = true;
        } else {
          // FINGER IS MOVING / SLIDING:
          const activeCol = existingTouch.currentColIndex;
          const activeString = existingTouch.stringIndex;
          const activeNote = existingTouch.currentNote;

          if (colIdx !== activeCol || stringIdx !== activeString) {
            // REACHED NEXT SCALE NOTE (EXACT REALTIME TRIGGER POINT AT FINGER SPEED):
            // Stop previous scale note, immediately trigger new scale note
            const newCellItem = targetString.notes[colIdx];
            if (newCellItem) {
              const nextNote = newCellItem.noteNumber;

              // Legato handoff at realtime speed with zero smoothing/delay
              midiService.noteOn(nextNote, 110, existingTouch.channel);
              midiService.noteOff(activeNote, existingTouch.channel);

              existingTouch.stringIndex = stringIdx;
              existingTouch.currentColIndex = colIdx;
              existingTouch.currentNote = nextNote;
              existingTouch.currentX = x;
              existingTouch.currentY = y;
              hasChanged = true;
            }
          } else {
            // UNTIL REACHING THE NEXT SCALE NOTE:
            // First scale note plays continuously without stopping!
            // No smoothing filter, no pitch bend through eliminated notes.
            if (Math.abs(existingTouch.currentX - x) > 3 || Math.abs(existingTouch.currentY - y) > 3) {
              existingTouch.currentX = x;
              existingTouch.currentY = y;
              hasChanged = true;
            }
          }
        }
      }

      // 2. Release any touches that left the screen ("until get out of the hand")
      Object.keys(activeSlideTouchesRef.current).forEach((touchId) => {
        if (!currentTouchIds.has(touchId)) {
          const removed = activeSlideTouchesRef.current[touchId];
          if (removed) {
            midiService.noteOff(removed.currentNote, removed.channel);
            midiService.pitchBend(0, removed.channel);
            delete activeSlideTouchesRef.current[touchId];
            delete updatedTouches[touchId];
            hasChanged = true;
          }
        }
      });

      if (hasChanged) {
        setTouchRipples({ ...updatedTouches });
      }
    },
    [numStrings, cellCount, stringRowHeight, cellWidth, stringRows, mpeEnabled]
  );

  const handleTouchEnd = useCallback(
    (e: GestureResponderEvent) => {
      const currentTouches = e.nativeEvent.touches;
      const currentTouchIds = new Set(currentTouches.map((t) => String(t.identifier)));
      const updatedTouches: { [id: string]: ActiveSlideTouch } = {};
      let hasChanged = false;

      // Only silence notes when the finger has physically left the screen ("until get out of the hand")
      Object.keys(activeSlideTouchesRef.current).forEach((touchId) => {
        if (!currentTouchIds.has(touchId)) {
          const removed = activeSlideTouchesRef.current[touchId];
          if (removed) {
            midiService.noteOff(removed.currentNote, removed.channel);
            midiService.pitchBend(0, removed.channel);
            delete activeSlideTouchesRef.current[touchId];
            hasChanged = true;
          }
        } else {
          updatedTouches[touchId] = activeSlideTouchesRef.current[touchId];
        }
      });

      if (hasChanged) {
        setTouchRipples(updatedTouches);
      }
    },
    []
  );

  const handleTouchTerminate = useCallback(() => {
    Object.keys(activeSlideTouchesRef.current).forEach((touchId) => {
      const removed = activeSlideTouchesRef.current[touchId];
      if (removed) {
        midiService.noteOff(removed.currentNote, removed.channel);
        midiService.pitchBend(0, removed.channel);
      }
    });
    activeSlideTouchesRef.current = {};
    setTouchRipples({});
  }, []);

  // Cycle Settings
  const cycleTuning = () => {
    setTuningPresetIndex((prev) => (prev + 1) % TUNING_PRESETS.length);
  };

  const cycleScale = () => {
    setScaleIndex((prev) => (prev + 1) % SCALES.length);
    setScaleOffset(0);
  };

  const cycleVoice = () => {
    setVoiceIndex((prev) => (prev + 1) % INSTRUMENT_VOICES.length);
  };

  const cycleRoot = (delta: number) => {
    setRootNoteIndex((prev) => (prev + delta + 12) % 12);
  };

  const handleOctave = (delta: number) => {
    setOctaveShift((prev) => Math.max(-2, Math.min(2, prev + delta)));
  };

  const shiftScaleRange = (delta: number) => {
    setScaleOffset((prev) => Math.max(-10, Math.min(20, prev + delta)));
  };

  return (
    <View style={styles.container}>
      <TopBar currentTabName="Slide Roll" />

      {/* Top Controls Strip */}
      <View style={styles.controlsBar}>
        {/* Instrument Voice Selector (Violin, Cello, Strings, Synth) */}
        <TouchableOpacity style={[styles.controlPill, styles.voicePill]} onPress={cycleVoice} activeOpacity={0.7}>
          <Ionicons name={currentVoice.icon as any} size={11} color="#f59e0b" />
          <Text style={styles.controlPillLabel}>{currentVoice.name}</Text>
        </TouchableOpacity>

        {/* Root Note Selector (C, C#, D, etc.) */}
        <View style={styles.rootNoteContainer}>
          <TouchableOpacity onPress={() => cycleRoot(-1)} style={styles.miniBtn} hitSlop={6}>
            <Text style={styles.octBtnText}>-</Text>
          </TouchableOpacity>
          <Text style={styles.rootNoteText}>{ROOT_NOTE_NAMES[rootNoteIndex]}</Text>
          <TouchableOpacity onPress={() => cycleRoot(1)} style={styles.miniBtn} hitSlop={6}>
            <Text style={styles.octBtnText}>+</Text>
          </TouchableOpacity>
        </View>

        {/* Scale Preset Selector */}
        <TouchableOpacity style={[styles.controlPill, styles.scalePill]} onPress={cycleScale} activeOpacity={0.7}>
          <Ionicons name="sparkles" size={11} color="#10b981" />
          <Text style={styles.controlPillLabel}>{currentScale.name}</Text>
        </TouchableOpacity>

        {/* Tuning Preset Button */}
        <TouchableOpacity style={styles.controlPill} onPress={cycleTuning} activeOpacity={0.7}>
          <Ionicons name="git-branch-outline" size={11} color="#38bdf8" />
          <Text style={styles.controlPillLabel}>{currentTuning.name}</Text>
        </TouchableOpacity>

        {/* Realtime Scale Badge */}
        <View style={styles.realtimeBadge}>
          <Ionicons name="flash" size={10} color="#10b981" />
          <Text style={styles.realtimeBadgeText}>REALTIME SCALE</Text>
        </View>

        {/* MPE Mode Toggle */}
        <TouchableOpacity
          style={[styles.mpeBadge, mpeEnabled && styles.mpeBadgeActive]}
          onPress={() => setMpeEnabled(!mpeEnabled)}
          activeOpacity={0.7}
        >
          <Text style={[styles.mpeText, mpeEnabled && styles.mpeTextActive]}>
            {mpeEnabled ? 'MPE' : 'CH 1'}
          </Text>
        </TouchableOpacity>

        {/* Scale Step Shift (< / >) */}
        <View style={styles.fretShiftContainer}>
          <TouchableOpacity onPress={() => shiftScaleRange(-3)} style={styles.octBtn} hitSlop={6}>
            <Text style={styles.octBtnText}>◀</Text>
          </TouchableOpacity>
          <Text style={styles.octLabel}>SHIFT</Text>
          <TouchableOpacity onPress={() => shiftScaleRange(3)} style={styles.octBtn} hitSlop={6}>
            <Text style={styles.octBtnText}>▶</Text>
          </TouchableOpacity>
        </View>

        {/* Octave Shifter */}
        <View style={styles.octaveContainer}>
          <TouchableOpacity onPress={() => handleOctave(-1)} style={styles.octBtn} hitSlop={6}>
            <Text style={styles.octBtnText}>-</Text>
          </TouchableOpacity>
          <Text style={styles.octLabel}>
            OCT {octaveShift > 0 ? `+${octaveShift}` : octaveShift}
          </Text>
          <TouchableOpacity onPress={() => handleOctave(1)} style={styles.octBtn} hitSlop={6}>
            <Text style={styles.octBtnText}>+</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Main Dedicated Fretboard Surface: ONLY SCALE NOTES DISPLAYED & PLAYED */}
      <View
        style={styles.fretboardContainer}
        onLayout={(e: LayoutChangeEvent) => {
          const w = e.nativeEvent.layout.width;
          const h = e.nativeEvent.layout.height;
          setBoardWidth(w);
          setBoardHeight(h);
          const computedCellWidth = Math.max(48, Math.floor(w / cellCount));
          setCellWidth(computedCellWidth);
        }}
      >
        {/* Direct, Dedicated Multi-Touch Surface */}
        <View
          style={[styles.fretboardTouchSurface, { width: boardWidth }]}
          onStartShouldSetResponder={() => true}
          onStartShouldSetResponderCapture={() => true}
          onMoveShouldSetResponder={() => true}
          onMoveShouldSetResponderCapture={() => true}
          onResponderTerminationRequest={() => false}
          onResponderGrant={handleTouchStartOrMove}
          onResponderMove={handleTouchStartOrMove}
          onResponderRelease={handleTouchEnd}
          onResponderTerminate={handleTouchTerminate}
        >
          {/* 1. String Rows & Scale Cells */}
          {stringRows.map((stringItem, sIdx) => {
            const isStringActive = Object.values(touchRipples).some((t) => t.stringIndex === sIdx);
            const stringGauge = Math.max(1.5, (sIdx + 1) * 0.7);

            return (
              <View
                key={sIdx}
                style={[
                  styles.stringRow,
                  { height: stringRowHeight },
                  isStringActive && styles.stringRowActive,
                ]}
                pointerEvents="none"
              >
                {/* Physical String Line */}
                <View
                  style={[
                    styles.physicalStringLine,
                    {
                      height: stringGauge,
                      backgroundColor: isStringActive ? '#38bdf8' : '#475569',
                    },
                  ]}
                />

                {/* Scale Note Cells along this String (Strictly in-scale notes only!) */}
                {stringItem.notes.map((cellItem, col) => {
                  const isCellTouched = Object.values(touchRipples).some(
                    (t) => t.stringIndex === sIdx && t.currentColIndex === col
                  );

                  return (
                    <View
                      key={col}
                      style={[
                        styles.fretCell,
                        { width: cellWidth },
                        cellItem.isRoot && styles.rootFretCell,
                        isCellTouched && styles.fretCellTouched,
                      ]}
                    >
                      {/* Scale Step Divider Wire */}
                      <View style={styles.fretWire} />

                      {/* Scale Note Badge */}
                      <View
                        style={[
                          styles.noteBadge,
                          cellItem.isRoot && styles.noteBadgeRoot,
                          !cellItem.isRoot && styles.noteBadgeInScale,
                          isCellTouched && styles.noteBadgeTouched,
                        ]}
                      >
                        <Text
                          style={[
                            styles.noteBadgeText,
                            cellItem.isRoot && styles.noteBadgeTextRoot,
                            isCellTouched && styles.noteBadgeTextTouched,
                          ]}
                        >
                          {cellItem.name}
                        </Text>
                      </View>
                    </View>
                  );
                })}
              </View>
            );
          })}

          {/* 2. Scale Degrees / Step Indicators */}
          <View style={styles.fretMarkersRow} pointerEvents="none">
            {Array.from({ length: cellCount }).map((_, col) => {
              const rootMatches = stringRows[0]?.notes[col]?.isRoot;

              return (
                <View key={col} style={[styles.fretMarkerColumn, { width: cellWidth }]}>
                  {rootMatches && <View style={styles.rootMarkerDot} />}
                  <Text style={[styles.fretNumberText, rootMatches && styles.rootNumberText]}>
                    {rootMatches ? 'ROOT' : `${col + 1}`}
                  </Text>
                </View>
              );
            })}
          </View>

          {/* 3. Glowing Real-Time Touch Indicator */}
          {Object.values(touchRipples).map((touch) => {
            const strY = touch.stringIndex * stringRowHeight;
            const activeNoteInfo = getNoteInfo(touch.currentNote);

            return (
              <View
                key={touch.touchId}
                style={[
                  styles.laserIndicatorContainer,
                  {
                    left: touch.currentX - 28,
                    top: strY + stringRowHeight / 2 - 28,
                  },
                ]}
                pointerEvents="none"
              >
                {/* Glowing Laser Ring */}
                <View style={styles.laserOuterGlow} />
                <View style={styles.laserInnerCore}>
                  <Text style={styles.laserReadoutText}>{activeNoteInfo.name}</Text>
                </View>
              </View>
            );
          })}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#030712',
  },
  // Controls Bar
  controlsBar: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 34,
    backgroundColor: '#090d16',
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b',
    paddingHorizontal: 8,
    gap: 5,
  },
  controlPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#0f172a',
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: '#1e293b',
  },
  voicePill: {
    borderColor: '#f59e0b',
    backgroundColor: 'rgba(245, 158, 11, 0.08)',
  },
  scalePill: {
    borderColor: '#10b981',
    backgroundColor: 'rgba(16, 185, 129, 0.08)',
  },
  controlPillLabel: {
    color: '#cbd5e1',
    fontSize: 9,
    fontWeight: '800',
  },
  realtimeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: '#10b981',
  },
  realtimeBadgeText: {
    color: '#10b981',
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  rootNoteContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    backgroundColor: '#0f172a',
    borderRadius: 6,
    paddingHorizontal: 4,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: '#1e293b',
  },
  miniBtn: {
    padding: 2,
  },
  rootNoteText: {
    color: '#38bdf8',
    fontSize: 9,
    fontWeight: '800',
    paddingHorizontal: 2,
  },
  mpeBadge: {
    backgroundColor: '#1e293b',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: '#334155',
  },
  mpeBadgeActive: {
    backgroundColor: '#059669',
    borderColor: '#10b981',
  },
  mpeText: {
    color: '#64748b',
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  mpeTextActive: {
    color: '#ffffff',
  },
  fretShiftContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#0f172a',
    borderRadius: 6,
    paddingHorizontal: 4,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: '#1e293b',
  },
  octaveContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#0f172a',
    borderRadius: 6,
    paddingHorizontal: 4,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: '#1e293b',
    marginLeft: 'auto',
  },
  octBtn: {
    paddingHorizontal: 5,
    paddingVertical: 1,
    backgroundColor: '#1e293b',
    borderRadius: 4,
  },
  octBtnText: {
    color: '#f8fafc',
    fontSize: 10,
    fontWeight: '800',
  },
  octLabel: {
    color: '#94a3b8',
    fontSize: 8,
    fontWeight: '800',
  },
  // Main Fretboard Surface
  fretboardContainer: {
    flex: 1,
    backgroundColor: '#020617',
    position: 'relative',
    overflow: 'hidden',
  },
  fretboardTouchSurface: {
    flex: 1,
    position: 'relative',
    backgroundColor: '#020617',
  },
  stringRow: {
    flexDirection: 'row',
    position: 'relative',
    borderBottomWidth: 1,
    borderBottomColor: '#0f172a',
    alignItems: 'center',
  },
  stringRowActive: {
    backgroundColor: 'rgba(56, 189, 248, 0.06)',
  },
  physicalStringLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    zIndex: 1,
  },
  fretCell: {
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    zIndex: 2,
  },
  rootFretCell: {
    backgroundColor: 'rgba(16, 185, 129, 0.08)',
  },
  fretCellTouched: {
    backgroundColor: 'rgba(56, 189, 248, 0.22)',
  },
  fretWire: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    width: 1.5,
    backgroundColor: '#1e293b',
    zIndex: 3,
  },
  noteBadge: {
    paddingHorizontal: 7,
    paddingVertical: 4,
    borderRadius: 5,
    backgroundColor: '#0b1120',
    borderWidth: 1,
    borderColor: '#1e293b',
    zIndex: 4,
  },
  noteBadgeRoot: {
    backgroundColor: '#059669',
    borderColor: '#10b981',
  },
  noteBadgeInScale: {
    backgroundColor: '#0e1e38',
    borderColor: '#38bdf8',
  },
  noteBadgeTouched: {
    backgroundColor: '#38bdf8',
    borderColor: '#ffffff',
    transform: [{ scale: 1.15 }],
  },
  noteBadgeText: {
    color: '#cbd5e1',
    fontSize: 9,
    fontWeight: '800',
  },
  noteBadgeTextRoot: {
    color: '#ffffff',
    fontWeight: '900',
  },
  noteBadgeTextTouched: {
    color: '#020617',
    fontWeight: '900',
  },
  // Scale Step Markers
  fretMarkersRow: {
    position: 'absolute',
    bottom: 2,
    left: 0,
    right: 0,
    height: 18,
    flexDirection: 'row',
    zIndex: 5,
  },
  fretMarkerColumn: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  rootMarkerDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: '#10b981',
    marginBottom: 2,
  },
  fretNumberText: {
    color: '#64748b',
    fontSize: 8,
    fontWeight: '700',
    fontFamily: 'monospace',
  },
  rootNumberText: {
    color: '#10b981',
    fontWeight: '900',
  },
  // Glowing Real-Time Touch Indicator
  laserIndicatorContainer: {
    position: 'absolute',
    width: 56,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 20,
  },
  laserOuterGlow: {
    position: 'absolute',
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(56, 189, 248, 0.35)',
    borderWidth: 1.5,
    borderColor: '#38bdf8',
  },
  laserInnerCore: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#38bdf8',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#ffffff',
  },
  laserReadoutText: {
    color: '#020617',
    fontSize: 9,
    fontWeight: '900',
    fontFamily: 'monospace',
  },
});
