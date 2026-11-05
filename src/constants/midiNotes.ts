export interface NoteInfo {
  noteNumber: number;
  name: string;
  octave: number;
  isBlack: boolean;
}

export const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

export function getNoteInfo(noteNumber: number): NoteInfo {
  const octave = Math.floor(noteNumber / 12) - 1;
  const noteIndex = noteNumber % 12;
  const name = `${NOTE_NAMES[noteIndex]}${octave}`;
  const isBlack = [1, 3, 6, 8, 10].includes(noteIndex);
  return { noteNumber, name, octave, isBlack };
}

export function noteToFrequency(noteNumber: number): number {
  return 440 * Math.pow(2, (noteNumber - 69) / 12);
}

export interface DrumPadDefinition {
  id: number;
  name: string;
  shortName: string;
  noteNumber: number;
  color: string;
  category: 'kick' | 'snare' | 'hihat' | 'tom' | 'cymbal' | 'perc';
}

export const DEFAULT_DRUM_PADS: DrumPadDefinition[] = [
  // Row 1 (Top)
  { id: 12, name: 'Crash Cymbal', shortName: 'CRASH', noteNumber: 49, color: '#f59e0b', category: 'cymbal' },
  { id: 13, name: 'High Tom', shortName: 'HI TOM', noteNumber: 50, color: '#8b5cf6', category: 'tom' },
  { id: 14, name: 'Ride Cymbal', shortName: 'RIDE', noteNumber: 51, color: '#f59e0b', category: 'cymbal' },
  { id: 15, name: 'Cowbell', shortName: 'BELL', noteNumber: 56, color: '#10b981', category: 'perc' },

  // Row 2
  { id: 8, name: 'Mid Tom', shortName: 'MID TOM', noteNumber: 47, color: '#8b5cf6', category: 'tom' },
  { id: 9, name: 'Open Hi-Hat', shortName: 'OPEN HH', noteNumber: 46, color: '#eab308', category: 'hihat' },
  { id: 10, name: 'Low Tom', shortName: 'LOW TOM', noteNumber: 45, color: '#8b5cf6', category: 'tom' },
  { id: 11, name: 'Tambourine', shortName: 'TAMB', noteNumber: 54, color: '#10b981', category: 'perc' },

  // Row 3
  { id: 4, name: 'Hand Clap', shortName: 'CLAP', noteNumber: 39, color: '#ec4899', category: 'snare' },
  { id: 5, name: 'Pedal Hi-Hat', shortName: 'PEDAL HH', noteNumber: 44, color: '#eab308', category: 'hihat' },
  { id: 6, name: 'Closed Hi-Hat', shortName: 'CH HH', noteNumber: 42, color: '#eab308', category: 'hihat' },
  { id: 7, name: 'Side Stick', shortName: 'STICK', noteNumber: 37, color: '#06b6d4', category: 'perc' },

  // Row 4 (Bottom)
  { id: 0, name: 'Bass Drum 1', shortName: 'KICK 1', noteNumber: 36, color: '#ef4444', category: 'kick' },
  { id: 1, name: 'Bass Drum 2', shortName: 'KICK 2', noteNumber: 35, color: '#dc2626', category: 'kick' },
  { id: 2, name: 'Acoustic Snare', shortName: 'SNARE 1', noteNumber: 38, color: '#3b82f6', category: 'snare' },
  { id: 3, name: 'Electric Snare', shortName: 'SNARE 2', noteNumber: 40, color: '#2563eb', category: 'snare' },
];
