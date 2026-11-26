import type { SpeechAssessmentTarget } from './speech-assessment';

export type SyllableExercise = {
  word: string;
  meaning: string;
  syllables: readonly string[];
  stressed: number;
  vowelWindows: readonly (readonly [number, number])[];
  cue: string;
  catchWindow?: readonly [number, number];
};

// Vowel windows are measured in seconds in the corresponding recorded word.
export const syllableExercises: readonly SyllableExercise[] = [
  {
    word: 'kumusta',
    meaning: 'how are you?',
    syllables: ['ku', 'mus', 'ta'],
    stressed: 2,
    vowelWindows: [
      [0.22, 0.27],
      [0.31, 0.45],
      [0.71, 0.97],
    ],
    cue: 'Make ta clear. Keep the final a open and audible.',
  },
  {
    word: 'salamat',
    meaning: 'thank you',
    syllables: ['sa', 'la', 'mat'],
    stressed: 1,
    vowelWindows: [
      [0.255, 0.345],
      [0.42, 0.565],
      [0.67, 0.79],
    ],
    cue: 'Give the a in la a little more time.',
  },
  {
    word: 'umaga',
    meaning: 'morning',
    syllables: ['u', 'ma', 'ga'],
    stressed: 1,
    vowelWindows: [
      [0.11, 0.153],
      [0.17, 0.337],
      [0.48, 0.6],
    ],
    cue: 'Hold the a in ma a little longer than the one in ga.',
  },
  {
    word: 'saan',
    meaning: 'where?',
    syllables: ['sa', 'an'],
    stressed: 1,
    vowelWindows: [
      [0.152, 0.212],
      [0.31, 0.43],
    ],
    cue: 'Say both a vowels. Use a tiny catch between them, like the break in “uh-oh.”',
    catchWindow: [0.217, 0.306],
  },
];

export function getSyllableExercise(id: string) {
  return syllableExercises.find(({ word }) => id === `syllable-${word}`);
}

export function syllableTarget(
  exercise: SyllableExercise,
): SpeechAssessmentTarget {
  return {
    id: `syllable-${exercise.word}`,
    language: 'fil-PH',
    reference: exercise.word,
    accepted: [exercise.word],
    keyTokens: [exercise.word],
    optionalTokens: [],
    kind: 'speech-match',
  };
}

export function syllableModelUrl(exercise: SyllableExercise) {
  return `/speech/syllables/${exercise.word}.wav`;
}
