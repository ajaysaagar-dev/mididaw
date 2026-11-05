export interface ScaleDefinition {
  id: string;
  name: string;
  intervals: number[];
}

export const SCALES: ScaleDefinition[] = [
  { id: 'chromatic', name: 'Chromatic', intervals: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] },
  { id: 'major', name: 'Major', intervals: [0, 2, 4, 5, 7, 9, 11] },
  { id: 'minor', name: 'Natural Minor', intervals: [0, 2, 3, 5, 7, 8, 10] },
  { id: 'pentatonic_minor', name: 'Pentatonic Minor', intervals: [0, 3, 5, 7, 10] },
  { id: 'pentatonic_major', name: 'Pentatonic Major', intervals: [0, 2, 4, 7, 9] },
  { id: 'blues', name: 'Blues', intervals: [0, 3, 5, 6, 7, 10] },
  { id: 'dorian', name: 'Dorian', intervals: [0, 2, 3, 5, 7, 9, 10] },
  { id: 'mixolydian', name: 'Mixolydian', intervals: [0, 2, 4, 5, 7, 9, 10] },
  { id: 'harmonic_minor', name: 'Harmonic Minor', intervals: [0, 2, 3, 5, 7, 8, 11] },
];

export interface TuningPreset {
  id: string;
  name: string;
  // Strings from high pitch (top string 0) to low pitch (bottom string)
  openNotes: number[];
}

export const TUNING_PRESETS: TuningPreset[] = [
  {
    id: 'all_fourths',
    name: 'All 4ths (GeoShred Standard)',
    openNotes: [65, 60, 55, 50, 45, 40], // F4, C4, G3, D3, A2, E2
  },
  {
    id: 'guitar_standard',
    name: 'Standard Guitar',
    openNotes: [64, 59, 55, 50, 45, 40], // E4, B3, G3, D3, A2, E2
  },
  {
    id: 'bass_five_string',
    name: '5-String Bass',
    openNotes: [55, 50, 45, 40, 35], // G3, D3, A2, E2, B1
  },
  {
    id: 'fifths_cello',
    name: '5ths (Cello / Violin)',
    openNotes: [57, 50, 43, 36], // A3, D3, G2, C2
  },
  {
    id: 'octaves',
    name: 'Octaves Stack',
    openNotes: [72, 60, 48, 36], // C5, C4, C3, C2
  },
];
