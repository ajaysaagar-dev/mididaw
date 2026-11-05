import React, { useState } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Pressable,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { DrumPadDefinition, getNoteInfo } from '../constants/midiNotes';

interface EditPadModalProps {
  visible: boolean;
  pad: DrumPadDefinition | null;
  bankOffset: number;
  onSave: (updatedPad: DrumPadDefinition) => void;
  onReset: (padId: number) => void;
  onClose: () => void;
}

const COLOR_PRESETS = [
  '#ef4444', // Red (Kick)
  '#f97316', // Orange
  '#f59e0b', // Amber/Gold
  '#10b981', // Emerald
  '#06b6d4', // Cyan
  '#3b82f6', // Blue (Snare)
  '#8b5cf6', // Purple (Tom)
  '#ec4899', // Pink (Clap)
  '#eab308', // Yellow (Hi-Hat)
  '#64748b', // Slate
];

export const EditPadModal: React.FC<EditPadModalProps> = ({
  visible,
  pad,
  bankOffset,
  onSave,
  onReset,
  onClose,
}) => {
  const [name, setName] = useState(pad?.name ?? '');
  const [shortName, setShortName] = useState(pad?.shortName ?? '');
  const [noteNumber, setNoteNumber] = useState(pad?.noteNumber ?? 36);
  const [color, setColor] = useState(pad?.color ?? '#3b82f6');

  if (!pad) return null;

  const currentEffectiveNote = noteNumber + bankOffset;
  const noteInfo = getNoteInfo(currentEffectiveNote);

  const handleSave = () => {
    onSave({
      ...pad,
      name: name.trim() || pad.name,
      shortName: shortName.trim().toUpperCase() || pad.shortName,
      noteNumber: Math.max(0, Math.min(127, noteNumber)),
      color,
    });
    onClose();
  };

  const handleReset = () => {
    onReset(pad.id);
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable style={styles.container} onPress={(e) => e.stopPropagation()}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerTitleRow}>
              <View style={[styles.padPreviewDot, { backgroundColor: color }]} />
              <Text style={styles.title}>Edit Drum Pad #{pad.id + 1}</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn} hitSlop={10}>
              <Ionicons name="close" size={20} color="#94a3b8" />
            </TouchableOpacity>
          </View>

          {/* Body */}
          <View style={styles.body}>
            {/* Pad Full Name & Short Label */}
            <View style={styles.row}>
              <View style={[styles.inputGroup, { flex: 2 }]}>
                <Text style={styles.label}>Pad Name</Text>
                <TextInput
                  style={styles.input}
                  value={name}
                  onChangeText={setName}
                  placeholder="e.g. 808 Bass Kick"
                  placeholderTextColor="#64748b"
                />
              </View>

              <View style={[styles.inputGroup, { flex: 1 }]}>
                <Text style={styles.label}>Label (Max 8 chars)</Text>
                <TextInput
                  style={[styles.input, styles.shortInput]}
                  value={shortName}
                  onChangeText={(t) => setShortName(t.slice(0, 8))}
                  placeholder="KICK 1"
                  placeholderTextColor="#64748b"
                  autoCapitalize="characters"
                />
              </View>
            </View>

            {/* MIDI Note selector */}
            <View style={styles.noteRow}>
              <View style={styles.noteInfo}>
                <Text style={styles.label}>MIDI Note</Text>
                <Text style={styles.noteDisplay}>
                  Note {currentEffectiveNote} ({noteInfo.name})
                </Text>
              </View>

              <View style={styles.stepperContainer}>
                <TouchableOpacity
                  style={styles.stepperBtn}
                  onPress={() => setNoteNumber((prev) => Math.max(0, prev - 1))}
                >
                  <Ionicons name="remove" size={16} color="#ffffff" />
                </TouchableOpacity>
                <Text style={styles.stepperValue}>{noteNumber}</Text>
                <TouchableOpacity
                  style={styles.stepperBtn}
                  onPress={() => setNoteNumber((prev) => Math.min(127, prev + 1))}
                >
                  <Ionicons name="add" size={16} color="#ffffff" />
                </TouchableOpacity>
              </View>
            </View>

            {/* Color Palette */}
            <View style={styles.colorSection}>
              <Text style={styles.label}>Pad Glow Color</Text>
              <View style={styles.colorPalette}>
                {COLOR_PRESETS.map((c) => {
                  const isSelected = color.toLowerCase() === c.toLowerCase();
                  return (
                    <TouchableOpacity
                      key={c}
                      style={[
                        styles.colorSwatch,
                        { backgroundColor: c },
                        isSelected && styles.colorSwatchSelected,
                      ]}
                      onPress={() => setColor(c)}
                    >
                      {isSelected && <Ionicons name="checkmark" size={14} color="#ffffff" />}
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            {/* Action buttons */}
            <View style={styles.actionsRow}>
              <TouchableOpacity style={styles.resetBtn} onPress={handleReset}>
                <Ionicons name="refresh-outline" size={14} color="#94a3b8" />
                <Text style={styles.resetBtnText}>Reset Default</Text>
              </TouchableOpacity>

              <View style={styles.mainActions}>
                <TouchableOpacity style={styles.cancelBtn} onPress={onClose}>
                  <Text style={styles.cancelBtnText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.saveBtn} onPress={handleSave}>
                  <Ionicons name="checkmark" size={14} color="#ffffff" />
                  <Text style={styles.saveBtnText}>Save Pad</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
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
    padding: 16,
  },
  container: {
    width: '84%',
    maxWidth: 540,
    backgroundColor: '#0f172a',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#334155',
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#1e293b',
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  padPreviewDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  title: {
    color: '#f8fafc',
    fontSize: 15,
    fontWeight: '700',
  },
  closeBtn: {
    padding: 4,
  },
  body: {
    padding: 16,
    gap: 12,
  },
  row: {
    flexDirection: 'row',
    gap: 10,
  },
  inputGroup: {
    gap: 4,
  },
  label: {
    color: '#94a3b8',
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  input: {
    backgroundColor: '#1e293b',
    color: '#f8fafc',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 7,
    fontSize: 13,
    borderWidth: 1,
    borderColor: '#334155',
  },
  shortInput: {
    fontWeight: '700',
    textAlign: 'center',
  },
  noteRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#1e293b',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#334155',
  },
  noteInfo: {
    gap: 2,
  },
  noteDisplay: {
    color: '#38bdf8',
    fontSize: 13,
    fontWeight: '700',
  },
  stepperContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0f172a',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#334155',
    overflow: 'hidden',
  },
  stepperBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#334155',
  },
  stepperValue: {
    color: '#f8fafc',
    fontSize: 13,
    fontWeight: '700',
    paddingHorizontal: 12,
  },
  colorSection: {
    gap: 6,
  },
  colorPalette: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  colorSwatch: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  colorSwatchSelected: {
    borderWidth: 2,
    borderColor: '#ffffff',
  },
  actionsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 6,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#1e293b',
  },
  resetBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 6,
    paddingHorizontal: 8,
  },
  resetBtnText: {
    color: '#94a3b8',
    fontSize: 11,
    fontWeight: '600',
  },
  mainActions: {
    flexDirection: 'row',
    gap: 8,
  },
  cancelBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 6,
    backgroundColor: '#1e293b',
    borderWidth: 1,
    borderColor: '#334155',
  },
  cancelBtnText: {
    color: '#cbd5e1',
    fontSize: 12,
    fontWeight: '600',
  },
  saveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 6,
    backgroundColor: '#2563eb',
  },
  saveBtnText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
  },
});
