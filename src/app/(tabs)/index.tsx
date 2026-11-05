import React, { useState, useRef, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  PanResponder,
  ScrollView,
  NativeSyntheticEvent,
  NativeScrollEvent,
  LayoutChangeEvent,
  GestureResponderEvent,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { midiService } from '../../services/midiService';
import { getNoteInfo } from '../../constants/midiNotes';
import { TopBar } from '../../components/TopBar';

// Full 7-octave piano range: C1 (note 24) to C8 (note 108) = 50 white keys + top C = 51 white keys
const START_NOTE = 24; // C1
const TOTAL_OCTAVES = 7;
const WHITE_KEY_OFFSETS = [0, 2, 4, 5, 7, 9, 11];

const MIN_KEY_WIDTH = 28;
const MAX_KEY_WIDTH = 80;
const WHEEL_HEIGHT = 135;
const PITCH_MAX_TRAVEL = 50;
const MOD_MAX_TRAVEL = 108;

export default function KeyboardScreen() {
  const [keyWidth, setKeyWidth] = useState(48); // Dynamic key width (28px to 80px)
  const [sustain, setSustain] = useState(false);
  const [activeKeys, setActiveKeys] = useState<{ [note: number]: boolean }>({});
  const [pitchBendVal, setPitchBendVal] = useState(0); // -1.0 to 1.0
  const [modVal, setModVal] = useState(0); // 0 to 127

  // Viewport tracking for top sliders
  const [scrollX, setScrollX] = useState(0);
  const [viewportWidth, setViewportWidth] = useState(600);
  const [topSliderWidth, setTopSliderWidth] = useState(380);
  const [zoomTrackWidth, setZoomTrackWidth] = useState(100);
  const [boardHeight, setBoardHeight] = useState(200);

  const scrollViewRef = useRef<ScrollView>(null);
  const sustainedNotesRef = useRef<Set<number>>(new Set());

  // Map touchId -> noteNumber for multi-touch polyphonic chord tracking
  const activeTouchKeyMapRef = useRef<{ [touchId: string]: number }>({});

  // Generate full piano keys
  const { whiteKeys, blackKeys, totalWhiteKeys, blackKeyRightOfWhite } = useMemo(() => {
    const whites: { noteNumber: number; name: string; octave: number; whiteIndex: number }[] = [];
    const blacks: { noteNumber: number; name: string; leftWhiteIndex: number }[] = [];

    let whiteIdx = 0;
    for (let oct = 0; oct < TOTAL_OCTAVES; oct++) {
      const octBase = START_NOTE + oct * 12;
      for (const offset of WHITE_KEY_OFFSETS) {
        const note = octBase + offset;
        const info = getNoteInfo(note);
        whites.push({
          noteNumber: note,
          name: info.name,
          octave: info.octave,
          whiteIndex: whiteIdx,
        });
        whiteIdx++;
      }
      // Black keys in this octave
      const octWhiteStart = oct * 7;
      blacks.push({ noteNumber: octBase + 1, name: getNoteInfo(octBase + 1).name, leftWhiteIndex: octWhiteStart }); // C#
      blacks.push({ noteNumber: octBase + 3, name: getNoteInfo(octBase + 3).name, leftWhiteIndex: octWhiteStart + 1 }); // D#
      blacks.push({ noteNumber: octBase + 6, name: getNoteInfo(octBase + 6).name, leftWhiteIndex: octWhiteStart + 3 }); // F#
      blacks.push({ noteNumber: octBase + 8, name: getNoteInfo(octBase + 8).name, leftWhiteIndex: octWhiteStart + 4 }); // G#
      blacks.push({ noteNumber: octBase + 10, name: getNoteInfo(octBase + 10).name, leftWhiteIndex: octWhiteStart + 5 }); // A#
    }
    // High C8
    const topC = START_NOTE + TOTAL_OCTAVES * 12;
    whites.push({
      noteNumber: topC,
      name: getNoteInfo(topC).name,
      octave: getNoteInfo(topC).octave,
      whiteIndex: whiteIdx,
    });

    const blackKeyRightMap: { [whiteIdx: number]: number } = {};
    blacks.forEach((b) => {
      blackKeyRightMap[b.leftWhiteIndex] = b.noteNumber;
    });

    return {
      whiteKeys: whites,
      blackKeys: blacks,
      totalWhiteKeys: whites.length,
      blackKeyRightOfWhite: blackKeyRightMap,
    };
  }, []);

  const totalKeyboardWidth = totalWhiteKeys * keyWidth;
  const maxScrollX = Math.max(1, totalKeyboardWidth - viewportWidth);

  // Current note aligned to left viewport
  const currentNoteIndex = Math.max(0, Math.min(totalWhiteKeys - 1, Math.round(scrollX / keyWidth)));
  const currentLeftmostNote = whiteKeys[currentNoteIndex]?.name || 'C1';

  // Calculate top position slider window width and left position
  const visibleRatio = Math.min(1, viewportWidth / Math.max(1, totalKeyboardWidth));
  const sliderWindowWidth = Math.max(34, visibleRatio * topSliderWidth);
  const scrollRatio = maxScrollX > 0 ? Math.max(0, Math.min(1, scrollX / maxScrollX)) : 0;
  const sliderWindowLeft = scrollRatio * Math.max(0, topSliderWidth - sliderWindowWidth);

  // Zoom slider metrics
  const zoomRatio = Math.max(0, Math.min(1, (keyWidth - MIN_KEY_WIDTH) / (MAX_KEY_WIDTH - MIN_KEY_WIDTH)));
  const zoomThumbWidth = 24;
  const zoomThumbLeft = zoomRatio * Math.max(0, zoomTrackWidth - zoomThumbWidth);

  // Handle note triggering - prioritized for absolute lowest latency with raw MIDI
  const handleNoteOn = useCallback((noteNumber: number, velocity: number = 105) => {
    midiService.noteOn(noteNumber, velocity);
  }, []);

  const handleNoteOff = useCallback(
    (noteNumber: number) => {
      if (sustain) {
        sustainedNotesRef.current.add(noteNumber);
      } else {
        midiService.noteOff(noteNumber);
      }
    },
    [sustain]
  );

  const toggleSustain = () => {
    if (sustain) {
      sustainedNotesRef.current.forEach((note) => {
        midiService.noteOff(note);
      });
      sustainedNotesRef.current.clear();
      setActiveKeys({});
      setSustain(false);
    } else {
      setSustain(true);
    }
  };

  // Zoom changes
  const handleZoomDelta = (delta: number) => {
    setKeyWidth((prev) => Math.max(MIN_KEY_WIDTH, Math.min(MAX_KEY_WIDTH, prev + delta)));
  };

  const handleZoomSliderTouch = (touchX: number) => {
    if (zoomTrackWidth <= 0) return;
    const ratio = Math.max(0, Math.min(1, touchX / zoomTrackWidth));
    const nextKw = Math.round(MIN_KEY_WIDTH + ratio * (MAX_KEY_WIDTH - MIN_KEY_WIDTH));
    setKeyWidth(nextKw);
  };

  // Completely smooth continuous position slider (no snapping, no gridding)
  const handleTopPositionTouch = (touchX: number) => {
    if (topSliderWidth <= 0 || maxScrollX <= 0) return;
    const usableWidth = Math.max(1, topSliderWidth - sliderWindowWidth);
    const ratio = Math.max(0, Math.min(1, (touchX - sliderWindowWidth / 2) / usableWidth));
    const targetX = ratio * maxScrollX;
    setScrollX(targetX);
    scrollViewRef.current?.scrollTo({ x: targetX, animated: false });
  };

  const nudgeNote = (delta: number) => {
    const targetX = Math.max(0, Math.min(maxScrollX, scrollX + delta * keyWidth));
    setScrollX(targetX);
    scrollViewRef.current?.scrollTo({ x: targetX, animated: false });
  };

  // Direct O(1) Constant-Time Mathematical Note Lookup (Zero-latency, 100% pixel-accurate)
  const getNoteAtCoordinates = (x: number, y: number): number | null => {
    const kw = keyWidth;
    if (kw <= 0 || x < 0 || x >= totalKeyboardWidth) return null;

    const whiteIdx = Math.floor(x / kw);
    if (whiteIdx < 0 || whiteIdx >= totalWhiteKeys) return null;

    // Check Black Keys if touch is in top 62% of key height
    if (y <= boardHeight * 0.62) {
      // 1. Black key on the RIGHT of this white key (starts at whiteIdx + 0.65)
      const rightBlackNote = blackKeyRightOfWhite[whiteIdx];
      if (rightBlackNote !== undefined) {
        const bkLeft = (whiteIdx + 0.65) * kw;
        const bkRight = (whiteIdx + 1.33) * kw;
        if (x >= bkLeft && x <= bkRight) {
          return rightBlackNote;
        }
      }

      // 2. Black key on the LEFT of this white key (ends at whiteIdx + 0.33)
      if (whiteIdx > 0) {
        const leftBlackNote = blackKeyRightOfWhite[whiteIdx - 1];
        if (leftBlackNote !== undefined) {
          const bkLeft = (whiteIdx - 1 + 0.65) * kw;
          const bkRight = (whiteIdx - 1 + 1.33) * kw;
          if (x >= bkLeft && x <= bkRight) {
            return leftBlackNote;
          }
        }
      }
    }

    // White Key: Guaranteed exact match without any octave or margin drift
    return whiteKeys[whiteIdx]?.noteNumber ?? null;
  };

  // Polyphonic Multi-Touch Handlers for Piano Keys: Zero pinch interruption, pure chords!
  const handleKeyboardTouch = (e: GestureResponderEvent) => {
    const currentTouches = e.nativeEvent.touches;
    const currentTouchIds = new Set(currentTouches.map((t) => String(t.identifier)));
    const nextActiveKeys: { [note: number]: boolean } = {};
    let hasChanged = false;

    // 1. Process all simultaneous touches
    for (let i = 0; i < currentTouches.length; i++) {
      const t = currentTouches[i];
      const touchId = String(t.identifier);
      const note = getNoteAtCoordinates(t.locationX, t.locationY);
      if (note === null) continue;

      const existingNote = activeTouchKeyMapRef.current[touchId];
      if (existingNote !== note) {
        hasChanged = true;
        // Smooth Legato transition: NoteOn new note BEFORE NoteOff previous note to prevent staccato clicks
        handleNoteOn(note, 105);
        if (existingNote !== undefined) {
          handleNoteOff(existingNote);
        }
        activeTouchKeyMapRef.current[touchId] = note;
      }

      nextActiveKeys[note] = true;
    }

    // 2. Release any touches that lifted
    Object.keys(activeTouchKeyMapRef.current).forEach((touchId) => {
      if (!currentTouchIds.has(touchId)) {
        hasChanged = true;
        const removedNote = activeTouchKeyMapRef.current[touchId];
        handleNoteOff(removedNote);
        delete activeTouchKeyMapRef.current[touchId];
      }
    });

    if (hasChanged) {
      setActiveKeys(nextActiveKeys);
    }
  };

  const handleKeyboardTouchEnd = (e: GestureResponderEvent) => {
    const currentTouches = e.nativeEvent.touches;
    const currentTouchIds = new Set(currentTouches.map((t) => String(t.identifier)));

    const nextActiveKeys: { [note: number]: boolean } = {};
    let hasChanged = false;

    Object.keys(activeTouchKeyMapRef.current).forEach((touchId) => {
      if (!currentTouchIds.has(touchId)) {
        hasChanged = true;
        const removedNote = activeTouchKeyMapRef.current[touchId];
        handleNoteOff(removedNote);
        delete activeTouchKeyMapRef.current[touchId];
      } else {
        nextActiveKeys[activeTouchKeyMapRef.current[touchId]] = true;
      }
    });

    if (hasChanged) {
      setActiveKeys(nextActiveKeys);
    }
  };

  // Tall Pitch Bend PanResponder: Returns to center on release
  const pitchPanResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onPanResponderMove: (_, gestureState) => {
          const normalized = Math.max(-1.0, Math.min(1.0, -gestureState.dy / (WHEEL_HEIGHT / 2)));
          setPitchBendVal(normalized);
          midiService.pitchBend(normalized);
        },
        onPanResponderRelease: () => {
          setPitchBendVal(0);
          midiService.pitchBend(0);
        },
        onPanResponderTerminate: () => {
          setPitchBendVal(0);
          midiService.pitchBend(0);
        },
      }),
    []
  );

  // Tall Mod Wheel PanResponder: Holds value on release
  const modPanResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onPanResponderMove: (_, gestureState) => {
          setModVal((prev) => {
            const val = Math.max(0, Math.min(127, Math.floor(prev - (gestureState.dy / WHEEL_HEIGHT) * 127)));
            midiService.controlChange(1, val);
            return val;
          });
        },
      }),
    []
  );

  const handleScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    setScrollX(e.nativeEvent.contentOffset.x);
  };

  return (
    <View style={styles.container}>
      <TopBar currentTabName="Piano Roll" />

      <View style={styles.mainContent}>
        {/* Left Side Controls: Pitch Bend & Mod Wheel Side-by-Side (Horizontal) with Extra Height */}
        <View style={styles.sideControls}>
          <Text style={styles.sideHeaderTitle}>EXPRESSION</Text>

          {/* Horizontal side-by-side pitch and mod wheels */}
          <View style={styles.wheelsRow}>
            {/* Pitch Bend Wheel */}
            <View style={styles.wheelColumn}>
              <View style={styles.wheelTrack} {...pitchPanResponder.panHandlers}>
                {/* Center Zero Line */}
                <View style={styles.wheelCenterLine} />
                {/* Center spring thumb */}
                <View
                  style={[
                    styles.wheelThumb,
                    {
                      transform: [{ translateY: -pitchBendVal * PITCH_MAX_TRAVEL }],
                    },
                  ]}
                >
                  <View style={styles.wheelThumbGripLine} />
                  <View style={styles.wheelThumbGripLine} />
                </View>
              </View>
              <Text style={styles.wheelLabel}>PITCH</Text>
              <Text style={styles.wheelValText}>
                {pitchBendVal === 0 ? '0' : (pitchBendVal > 0 ? `+${pitchBendVal.toFixed(2)}` : pitchBendVal.toFixed(2))}
              </Text>
            </View>

            {/* Modulation Wheel */}
            <View style={styles.wheelColumn}>
              <View style={styles.wheelTrack} {...modPanResponder.panHandlers}>
                {/* Mod Fill Level Bar */}
                <View
                  style={[
                    styles.modFillBar,
                    {
                      height: `${(modVal / 127) * 100}%`,
                    },
                  ]}
                />
                {/* Mod Thumb */}
                <View
                  style={[
                    styles.wheelThumbMod,
                    {
                      bottom: (modVal / 127) * MOD_MAX_TRAVEL,
                    },
                  ]}
                >
                  <View style={styles.wheelThumbGripLine} />
                  <View style={styles.wheelThumbGripLine} />
                </View>
              </View>
              <Text style={styles.wheelLabel}>MOD</Text>
              <Text style={styles.wheelValText}>{modVal}</Text>
            </View>
          </View>

          {/* Sustain Button */}
          <TouchableOpacity
            style={[styles.sustainBtn, sustain && styles.sustainBtnActive]}
            onPress={toggleSustain}
            activeOpacity={0.7}
          >
            <Ionicons
              name={sustain ? 'infinite' : 'infinite-outline'}
              size={14}
              color={sustain ? '#38bdf8' : '#94a3b8'}
            />
            <Text style={[styles.sustainText, sustain && styles.sustainTextActive]}>SUSTAIN</Text>
          </TouchableOpacity>
        </View>

        {/* Right Area: Top Control Bar (Smooth Position Slider + Dedicated Zoom Slider) + Keys */}
        <View style={styles.keyboardArea}>
          {/* Top Bar with Smooth Position Slider + Dedicated Zoom Slider */}
          <View style={styles.topControlsBar}>
            {/* 1. Octave Position Scrubber */}
            <View style={styles.positionSliderSection}>
              <TouchableOpacity
                style={styles.nudgeBtn}
                onPress={() => nudgeNote(-1)}
                hitSlop={8}
              >
                <Ionicons name="chevron-back" size={13} color="#38bdf8" />
              </TouchableOpacity>

              {/* Completely smooth continuous position track */}
              <View
                style={styles.topSliderTrack}
                onLayout={(e: LayoutChangeEvent) => setTopSliderWidth(e.nativeEvent.layout.width)}
                onStartShouldSetResponder={() => true}
                onResponderGrant={(evt) => handleTopPositionTouch(evt.nativeEvent.locationX)}
                onResponderMove={(evt) => handleTopPositionTouch(evt.nativeEvent.locationX)}
              >
                {/* Octave Segments (C1-C7) */}
                <View style={styles.sliderOctavesRow}>
                  {Array.from({ length: TOTAL_OCTAVES }).map((_, idx) => (
                    <View key={idx} style={styles.sliderOctaveSegment}>
                      <Text style={styles.sliderOctaveLabel}>C{idx + 1}</Text>
                    </View>
                  ))}
                </View>

                {/* Glowing Smooth Draggable Viewport Window */}
                <View
                  style={[
                    styles.sliderViewportWindow,
                    {
                      left: sliderWindowLeft,
                      width: sliderWindowWidth,
                    },
                  ]}
                  pointerEvents="none"
                >
                  <Text style={styles.sliderWindowNoteText}>{currentLeftmostNote}</Text>
                </View>
              </View>

              <TouchableOpacity
                style={styles.nudgeBtn}
                onPress={() => nudgeNote(1)}
                hitSlop={8}
              >
                <Ionicons name="chevron-forward" size={13} color="#38bdf8" />
              </TouchableOpacity>
            </View>

            {/* Separator */}
            <View style={styles.topBarDivider} />

            {/* 2. Dedicated Zoom Slider */}
            <View style={styles.zoomSection}>
              <View style={styles.zoomLabelContainer}>
                <Ionicons name="resize-outline" size={11} color="#38bdf8" />
                <Text style={styles.zoomLabelText}>{keyWidth}px</Text>
              </View>

              <TouchableOpacity
                style={styles.zoomStepBtn}
                onPress={() => handleZoomDelta(-4)}
                disabled={keyWidth <= MIN_KEY_WIDTH}
                hitSlop={6}
              >
                <Ionicons
                  name="remove"
                  size={12}
                  color={keyWidth <= MIN_KEY_WIDTH ? '#475569' : '#ffffff'}
                />
              </TouchableOpacity>

              {/* Interactive Zoom Slider Track */}
              <View
                style={styles.zoomTrack}
                onLayout={(e: LayoutChangeEvent) => setZoomTrackWidth(e.nativeEvent.layout.width)}
                onStartShouldSetResponder={() => true}
                onResponderGrant={(evt) => handleZoomSliderTouch(evt.nativeEvent.locationX)}
                onResponderMove={(evt) => handleZoomSliderTouch(evt.nativeEvent.locationX)}
              >
                <View
                  style={[
                    styles.zoomThumb,
                    {
                      left: zoomThumbLeft,
                      width: zoomThumbWidth,
                    },
                  ]}
                  pointerEvents="none"
                >
                  <View style={styles.zoomThumbDot} />
                </View>
              </View>

              <TouchableOpacity
                style={styles.zoomStepBtn}
                onPress={() => handleZoomDelta(4)}
                disabled={keyWidth >= MAX_KEY_WIDTH}
                hitSlop={6}
              >
                <Ionicons
                  name="add"
                  size={12}
                  color={keyWidth >= MAX_KEY_WIDTH ? '#475569' : '#ffffff'}
                />
              </TouchableOpacity>
            </View>
          </View>

          {/* Scrollable Piano Roll Container with Pure Multi-Touch Polyphony */}
          <View
            style={styles.pianoScrollViewContainer}
            onLayout={(e: LayoutChangeEvent) => {
              setViewportWidth(e.nativeEvent.layout.width);
              setBoardHeight(e.nativeEvent.layout.height);
            }}
          >
            <ScrollView
              ref={scrollViewRef}
              horizontal
              showsHorizontalScrollIndicator={false}
              onScroll={handleScroll}
              scrollEventThrottle={16}
              contentContainerStyle={{ width: totalKeyboardWidth }}
              bounces={false}
              scrollEnabled={false} // Use top slider to navigate; keys remain 100% dedicated to multi-finger chord playing!
            >
              {/* Unified Polyphonic Chord Responder Board (Zero gesture interference) */}
              <View
                style={[styles.pianoRollBoard, { width: totalKeyboardWidth }]}
                onStartShouldSetResponder={() => true}
                onStartShouldSetResponderCapture={() => true}
                onMoveShouldSetResponder={() => true}
                onMoveShouldSetResponderCapture={() => true}
                onResponderTerminationRequest={() => false}
                onResponderGrant={handleKeyboardTouch}
                onResponderMove={handleKeyboardTouch}
                onResponderRelease={handleKeyboardTouchEnd}
                onResponderTerminate={handleKeyboardTouchEnd}
              >
                {/* White Keys */}
                <View style={styles.whiteKeysRow} pointerEvents="none">
                  {whiteKeys.map((k) => {
                    const isPressed = !!activeKeys[k.noteNumber];
                    const isC = k.name.startsWith('C') && !k.name.includes('#');

                    return (
                      <View
                        key={k.noteNumber}
                        style={[
                          styles.whiteKey,
                          { width: keyWidth },
                          isPressed && styles.whiteKeyPressed,
                        ]}
                      >
                        <Text
                          style={[
                            styles.whiteKeyLabel,
                            isC && styles.whiteKeyLabelC,
                            isPressed && styles.whiteKeyLabelActive,
                          ]}
                        >
                          {k.name}
                        </Text>
                      </View>
                    );
                  })}
                </View>

                {/* Black Keys */}
                <View style={styles.blackKeysOverlay} pointerEvents="none">
                  {blackKeys.map((k) => {
                    const isPressed = !!activeKeys[k.noteNumber];
                    const leftPos = (k.leftWhiteIndex + 0.65) * keyWidth;
                    const bWidth = keyWidth * 0.68;

                    return (
                      <View
                        key={k.noteNumber}
                        style={[
                          styles.blackKey,
                          {
                            left: leftPos,
                            width: bWidth,
                          },
                          isPressed && styles.blackKeyPressed,
                        ]}
                      >
                        <Text style={styles.blackKeyLabel} numberOfLines={1}>
                          {k.name}
                        </Text>
                      </View>
                    );
                  })}
                </View>
              </View>
            </ScrollView>
          </View>
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
  mainContent: {
    flex: 1,
    flexDirection: 'row',
  },
  // Left Sidebar: Pitch and Mod horizontal side-by-side with extra height
  sideControls: {
    width: 122,
    backgroundColor: '#0b1120',
    borderRightWidth: 1,
    borderRightColor: '#1e293b',
    padding: 6,
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sideHeaderTitle: {
    color: '#64748b',
    fontSize: 8,
    fontWeight: '800',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  wheelsRow: {
    flexDirection: 'row',
    width: '100%',
    justifyContent: 'space-between',
    gap: 6,
  },
  wheelColumn: {
    flex: 1,
    alignItems: 'center',
  },
  wheelTrack: {
    width: '100%',
    height: WHEEL_HEIGHT,
    backgroundColor: '#020617',
    borderRadius: 7,
    borderWidth: 1,
    borderColor: '#334155',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    overflow: 'hidden',
  },
  wheelCenterLine: {
    position: 'absolute',
    width: '100%',
    height: 1.5,
    backgroundColor: '#475569',
  },
  wheelThumb: {
    width: '88%',
    height: 28,
    backgroundColor: '#2563eb',
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: '#60a5fa',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
  },
  wheelThumbGripLine: {
    width: '60%',
    height: 1.5,
    backgroundColor: 'rgba(255, 255, 255, 0.6)',
    borderRadius: 1,
  },
  modFillBar: {
    position: 'absolute',
    bottom: 0,
    width: '100%',
    backgroundColor: 'rgba(16, 185, 129, 0.22)',
    borderTopWidth: 1,
    borderTopColor: '#10b981',
  },
  wheelThumbMod: {
    position: 'absolute',
    width: '88%',
    height: 24,
    backgroundColor: '#059669',
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: '#34d399',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
  },
  wheelLabel: {
    color: '#94a3b8',
    fontSize: 8,
    fontWeight: '800',
    marginTop: 4,
    letterSpacing: 0.5,
  },
  wheelValText: {
    color: '#38bdf8',
    fontSize: 8,
    fontWeight: '700',
    fontFamily: 'monospace',
  },
  sustainBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    width: '100%',
    backgroundColor: '#1e293b',
    borderRadius: 6,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: '#334155',
    marginTop: 4,
  },
  sustainBtnActive: {
    borderColor: '#38bdf8',
    backgroundColor: 'rgba(56, 189, 248, 0.15)',
  },
  sustainText: {
    color: '#64748b',
    fontSize: 8,
    fontWeight: '800',
  },
  sustainTextActive: {
    color: '#38bdf8',
  },
  keyboardArea: {
    flex: 1,
    backgroundColor: '#000000',
  },
  // Top Controls Bar with Position Slider + Zoom Slider
  topControlsBar: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 28,
    backgroundColor: '#090d16',
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b',
    paddingHorizontal: 4,
  },
  positionSliderSection: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    height: '100%',
  },
  nudgeBtn: {
    width: 22,
    height: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#131b2e',
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#1e293b',
  },
  topSliderTrack: {
    flex: 1,
    height: 22,
    marginHorizontal: 3,
    position: 'relative',
    overflow: 'hidden',
    backgroundColor: '#020617',
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#1e293b',
  },
  sliderOctavesRow: {
    flex: 1,
    flexDirection: 'row',
  },
  sliderOctaveSegment: {
    flex: 1,
    borderRightWidth: 1,
    borderRightColor: '#1e293b',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sliderOctaveLabel: {
    color: '#64748b',
    fontSize: 8,
    fontWeight: '800',
  },
  sliderViewportWindow: {
    position: 'absolute',
    top: 1,
    bottom: 1,
    backgroundColor: 'rgba(56, 189, 248, 0.28)',
    borderRadius: 3,
    borderWidth: 1.5,
    borderColor: '#38bdf8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sliderWindowNoteText: {
    color: '#38bdf8',
    fontSize: 8,
    fontWeight: '900',
  },
  topBarDivider: {
    width: 1,
    height: 18,
    backgroundColor: '#1e293b',
    marginHorizontal: 6,
  },
  // Dedicated Zoom Slider Section
  zoomSection: {
    flexDirection: 'row',
    alignItems: 'center',
    height: '100%',
    gap: 4,
  },
  zoomLabelContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 2,
  },
  zoomLabelText: {
    color: '#38bdf8',
    fontSize: 9,
    fontWeight: '800',
    fontFamily: 'monospace',
  },
  zoomStepBtn: {
    width: 20,
    height: 20,
    borderRadius: 4,
    backgroundColor: '#131b2e',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#1e293b',
  },
  zoomTrack: {
    width: 80,
    height: 14,
    backgroundColor: '#020617',
    borderRadius: 7,
    borderWidth: 1,
    borderColor: '#334155',
    position: 'relative',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  zoomThumb: {
    position: 'absolute',
    height: 10,
    backgroundColor: '#38bdf8',
    borderRadius: 5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  zoomThumbDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#ffffff',
  },
  pianoScrollViewContainer: {
    flex: 1,
    backgroundColor: '#000000',
  },
  pianoRollBoard: {
    flex: 1,
    position: 'relative',
  },
  whiteKeysRow: {
    flex: 1,
    flexDirection: 'row',
  },
  whiteKey: {
    backgroundColor: '#f8fafc',
    borderBottomLeftRadius: 4,
    borderBottomRightRadius: 4,
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingBottom: 8,
    borderWidth: 1,
    borderColor: '#cbd5e1',
  },
  whiteKeyPressed: {
    backgroundColor: '#7dd3fc',
    borderColor: '#38bdf8',
  },
  whiteKeyLabel: {
    fontSize: 9,
    fontWeight: '700',
    color: '#94a3b8',
  },
  whiteKeyLabelC: {
    color: '#0284c7',
    fontWeight: '900',
  },
  whiteKeyLabelActive: {
    color: '#0369a1',
  },
  blackKeysOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: '62%',
  },
  blackKey: {
    position: 'absolute',
    top: 0,
    height: '100%',
    backgroundColor: '#0f172a',
    borderBottomLeftRadius: 3,
    borderBottomRightRadius: 3,
    zIndex: 10,
    borderWidth: 1,
    borderColor: '#020617',
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingBottom: 6,
  },
  blackKeyPressed: {
    backgroundColor: '#0284c7',
    borderColor: '#38bdf8',
  },
  blackKeyLabel: {
    color: '#64748b',
    fontSize: 8,
    fontWeight: '700',
  },
});
