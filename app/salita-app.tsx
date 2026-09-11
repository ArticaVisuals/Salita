'use client';

import {
  ArrowRight,
  BarChart3,
  BookOpen,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleHelp,
  Cloud,
  CloudOff,
  Clock3,
  Download,
  Flame,
  Headphones,
  Info,
  Languages,
  LockKeyhole,
  MessageCircle,
  Mic,
  Pause,
  Play,
  RefreshCcw,
  Sparkles,
  Square,
  Star,
  Smartphone,
  Trash2,
  TriangleAlert,
  Upload,
  UserRound,
  Volume2,
  X,
} from 'lucide-react';
import Image from 'next/image';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import {
  useSpeechAssessment,
  type SpeechSessionState,
} from '@/hooks/use-speech-assessment';
import {
  getLesson,
  getUnit,
  getUnitLessons,
  getUnitVocabulary,
  lessonIntroductionPlan,
  lessonScoredPracticePlan,
  nextLessonAfter,
  type CourseLesson,
  type Phrase,
  type Register,
  type Unit,
  type VocabularyItem,
  units,
} from './curriculum';
import { getFoundation, type FoundationExample } from './foundations';
import {
  addCalendarDays,
  deriveStreaks,
  firstTryAccuracy,
  localDateKey,
  scoreAttempt,
  skillStrength,
  type AttemptOutcome,
  type LearnerProgress,
  type SkillMode,
} from '@/lib/progress';
import { useSyncedProgress } from '@/hooks/use-synced-progress';
import type { ActivityKind } from '@/lib/progress-events';
import { segmentTagalogText } from '@/lib/tagalog-speech';
import type { SpeechAssessmentLanguage } from '@/lib/speech-assessment';

type View = 'today' | 'learn' | 'review' | 'progress';
type ExerciseKind =
  | 'vocabulary'
  | 'pronunciation'
  | 'grammar'
  | 'passage'
  | 'listening'
  | 'reading'
  | 'pattern'
  | 'arrange'
  | 'context'
  | 'speaking'
  | 'dialogue';

type Exercise = {
  instanceId: string;
  baseId: string;
  kind: ExerciseKind;
  skill: SkillMode;
  eyebrow: string;
  prompt: string;
  tagalog: string;
  english: string;
  correct: string;
  options?: string[];
  accepted: string[];
  note: string;
  register: Register;
  situation?: string;
  patternFrame?: string;
  patternTransform?: string;
  soundFocus?: string;
  lessonTitle?: string;
  lessonText?: string;
  formula?: string;
  examples?: FoundationExample[];
  syllables?: string;
  coach?: string;
  translation?: string;
  vocabularyItems?: VocabularyItem[];
  phraseItems?: Phrase[];
  isRetry?: boolean;
};

type Feedback = {
  correct: boolean;
  title: string;
  detail: string;
};

type ModelContextLike = {
  registerTool: (
    tool: {
      name: string;
      title: string;
      description: string;
      inputSchema: Record<string, unknown>;
      annotations: { readOnlyHint: boolean; untrustedContentHint: boolean };
      execute: (input: unknown) => unknown;
    },
    options?: { signal?: AbortSignal },
  ) => void | Promise<void>;
};

function elapsedMinutesSince(startedAt: number) {
  return Math.max(1, Math.round((Date.now() - startedAt) / 60_000));
}

const NAV_ITEMS: { id: View; label: string; icon: typeof Sparkles }[] = [
  { id: 'today', label: 'Today', icon: Sparkles },
  { id: 'learn', label: 'Learn', icon: BookOpen },
  { id: 'review', label: 'Review', icon: RefreshCcw },
  { id: 'progress', label: 'Progress', icon: BarChart3 },
];

const COURSE_EXPANSION_NOTICE_KEY = 'salita-course-expansion-2026-v2-seen';

const REGISTER_STYLES: Record<Register, string> = {
  neutral: 'bg-[var(--f-cyan-1)] text-[#005c83]',
  polite: 'bg-[var(--f-green-1)] text-[var(--f-green-4)]',
  casual: 'bg-[var(--f-yellow-1)] text-[#6a5000]',
  formal: 'bg-[var(--f-blue-3)] text-[#183f7b]',
  Taglish: 'bg-[var(--f-pink-3)] text-[#9c0040]',
};

const UNIT_COLORS = [
  ['bg-[var(--f-pink-3)]', 'text-[#9c0040]'],
  ['bg-[var(--f-blue-3)]', 'text-[#183f7b]'],
  ['bg-[var(--f-yellow-1)]', 'text-[#6a5000]'],
  ['bg-[var(--f-green-1)]', 'text-[var(--f-green-4)]'],
  ['bg-[var(--f-cyan-1)]', 'text-[#005c83]'],
  ['bg-[#dabef3]', 'text-[#562284]'],
  ['bg-[#ffc64e]', 'text-[#5c3500]'],
  ['bg-[#fcabb4]', 'text-[#71000f]'],
] as const;

function normalizeAnswer(value: string) {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLocaleLowerCase('fil-PH')
    .replace(/[’‘]/g, "'")
    .replace(/[^\p{L}\p{N}'\s-]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function rotateOptions(correct: string, distractors: string[], offset: number) {
  const unique = [
    correct,
    ...distractors.filter((item) => item !== correct),
  ].slice(0, 3);
  const turn = offset % unique.length;
  return [...unique.slice(turn), ...unique.slice(0, turn)];
}

function seededScore(value: string) {
  let score = 2166136261;
  for (const character of value) {
    score ^= character.codePointAt(0) ?? 0;
    score = Math.imul(score, 16777619);
  }
  return score >>> 0;
}

function seededShuffle<T extends { id: string }>(items: T[], seed: string) {
  return [...items].sort(
    (a, b) => seededScore(`${seed}:${a.id}`) - seededScore(`${seed}:${b.id}`),
  );
}

function phraseExercise(
  unit: Unit,
  phraseIndex: number,
  kind: ExerciseKind,
  skill: SkillMode,
  eyebrow: string,
  prompt: string,
): Exercise {
  const phrase = unit.phrases[phraseIndex];
  const otherPhrases = unit.phrases.filter((_, index) => index !== phraseIndex);
  const asksForTagalog =
    kind === 'pattern' ||
    kind === 'arrange' ||
    kind === 'context' ||
    kind === 'speaking';
  const correct = asksForTagalog ? phrase.fil : phrase.en;
  const distractors = asksForTagalog
    ? otherPhrases.map((item) => item.fil)
    : otherPhrases.map((item) => item.en);

  return {
    instanceId: `${unit.id}-${phrase.id}-${kind}`,
    baseId: `${unit.id}-${phrase.id}`,
    kind,
    skill,
    eyebrow,
    prompt,
    tagalog: phrase.fil,
    english: phrase.en,
    correct,
    options:
      kind === 'arrange' || kind === 'speaking'
        ? undefined
        : rotateOptions(correct, distractors.slice(0, 2), phraseIndex),
    accepted: asksForTagalog
      ? [phrase.fil, ...(phrase.accepted ?? [])]
      : [phrase.en],
    note:
      kind === 'pattern' ? `${phrase.note} ${unit.pattern.note}` : phrase.note,
    register: phrase.register,
    patternFrame: kind === 'pattern' ? unit.pattern.frame : undefined,
    patternTransform: kind === 'pattern' ? unit.pattern.transform : undefined,
    soundFocus: kind === 'speaking' ? unit.soundFocus : undefined,
  };
}

function vocabularyExercise(
  unit: Unit,
  word: VocabularyItem,
  index: number,
): Exercise {
  const others = getUnitVocabulary(unit.id).filter(
    (item) => item.id !== word.id,
  );
  const offset = index % Math.max(1, others.length);
  const distractors = [...others.slice(offset), ...others.slice(0, offset)].map(
    (item) => item.en,
  );
  return {
    instanceId: `${unit.id}-vocab-${word.id}-reading`,
    baseId: `${unit.id}-vocab-${word.id}`,
    kind: 'reading',
    skill: 'reading',
    eyebrow: 'Remember the word',
    prompt: 'Choose the meaning of this word.',
    tagalog: word.fil,
    english: word.en,
    correct: word.en,
    options: rotateOptions(word.en, distractors, index),
    accepted: [word.en],
    note: word.note,
    register: 'neutral',
  };
}

function vocabularyIntroductionExercise(
  unit: Unit,
  words: VocabularyItem[],
  group: string,
): Exercise {
  return {
    instanceId: `${unit.id}-vocab-intro-${group}`,
    baseId: `${unit.id}-vocab-intro-${group}`,
    kind: 'vocabulary',
    skill: 'reading',
    eyebrow: 'Meet the words',
    prompt: 'Hear these words before you retrieve them.',
    tagalog: words.map((word) => word.fil).join('. '),
    english: words.map((word) => word.en).join(' · '),
    correct: '',
    accepted: [],
    note: 'Listen, read the meaning, and say each word once. Later prompts will ask you to remember them.',
    register: 'neutral',
    vocabularyItems: words,
  };
}

function phraseIntroductionExercise(
  unit: Unit,
  phraseIndexes: number[],
  group: string,
): Exercise {
  const phrases = phraseIndexes
    .map((index) => unit.phrases[index])
    .filter((phrase): phrase is Phrase => Boolean(phrase));
  return {
    instanceId: `${unit.id}-phrase-intro-${group}`,
    baseId: `${unit.id}-phrase-intro-${group}`,
    kind: 'vocabulary',
    skill: 'listening',
    eyebrow: 'Meet the expressions',
    prompt: 'Hear these expressions before you retrieve them.',
    tagalog: phrases.map((phrase) => phrase.fil).join(' '),
    english: phrases.map((phrase) => phrase.en).join(' · '),
    correct: '',
    accepted: [],
    note: 'Listen, read each meaning, and repeat once. The next prompts ask you to recognize and produce them.',
    register: 'neutral',
    phraseItems: phrases,
  };
}

function dialogueIntroductionExercise(unit: Unit): Exercise {
  const reading = getFoundation(unit.id).reading;
  return {
    instanceId: `${unit.id}-dialogue-intro`,
    baseId: `${unit.id}-dialogue-intro`,
    kind: 'vocabulary',
    skill: 'reading',
    eyebrow: 'Preview the exchange',
    prompt: 'Read and hear this short exchange before answering from it.',
    tagalog: reading.passage,
    english: reading.translation,
    correct: '',
    accepted: [],
    note: 'Listen once for the whole meaning, then tap any unfamiliar word before the reading check.',
    register: 'neutral',
    phraseItems: [
      {
        id: `${unit.id}-dialogue-preview`,
        fil: reading.passage,
        en: reading.translation,
        note: reading.drill.note,
        register: 'neutral',
      },
    ],
  };
}

function dialogueExercise(unit: Unit): Exercise {
  return {
    instanceId: `${unit.id}-dialogue`,
    baseId: `${unit.id}-dialogue`,
    kind: 'dialogue',
    skill: 'reading',
    eyebrow: 'Conversation',
    prompt: 'Choose the reply that keeps the conversation going.',
    tagalog: unit.dialogue.line,
    english: unit.dialogue.situation,
    correct: unit.dialogue.reply,
    options: rotateOptions(
      unit.dialogue.reply,
      unit.dialogue.alternatives,
      unit.number,
    ),
    accepted: [unit.dialogue.reply],
    note: unit.dialogue.note,
    register: 'neutral',
    situation: unit.dialogue.situation,
  };
}

function foundationExercise(
  unit: Unit,
  kind: 'pronunciation' | 'grammar',
): Exercise {
  const foundation = getFoundation(unit.id);
  const pronunciation = foundation.pronunciation;
  const grammar = foundation.grammar;
  const lesson = kind === 'pronunciation' ? pronunciation : grammar;
  const drill = lesson.drill;
  const examples = kind === 'grammar' ? grammar.examples : undefined;
  const model =
    kind === 'pronunciation' ? pronunciation.model : (examples?.[0]?.fil ?? '');

  return {
    instanceId: `${unit.id}-foundation-${kind}`,
    baseId: `${unit.id}-foundation-${kind}`,
    kind,
    skill: kind,
    eyebrow: kind === 'pronunciation' ? 'Sound lab' : 'Grammar workshop',
    prompt: drill.question,
    tagalog: model,
    english: '',
    correct: drill.correct,
    options: rotateOptions(
      drill.correct,
      drill.options.filter((option) => option !== drill.correct),
      unit.number + (kind === 'grammar' ? 1 : 0),
    ),
    accepted: [drill.correct],
    note: drill.note,
    register: 'neutral',
    lessonTitle: lesson.title,
    lessonText: lesson.explanation,
    formula: kind === 'grammar' ? grammar.formula : undefined,
    examples,
    syllables: kind === 'pronunciation' ? pronunciation.syllables : undefined,
    coach: kind === 'pronunciation' ? pronunciation.coach : undefined,
  };
}

function passageExercise(unit: Unit): Exercise {
  const reading = getFoundation(unit.id).reading;
  return {
    instanceId: `${unit.id}-foundation-reading`,
    baseId: `${unit.id}-foundation-reading`,
    kind: 'passage',
    skill: 'reading',
    eyebrow: 'Mini reading',
    prompt: reading.drill.question,
    tagalog: reading.passage,
    english: '',
    correct: reading.drill.correct,
    options: rotateOptions(
      reading.drill.correct,
      reading.drill.options.filter(
        (option) => option !== reading.drill.correct,
      ),
      unit.number + 2,
    ),
    accepted: [reading.drill.correct],
    note: reading.drill.note,
    register: 'neutral',
    lessonTitle: reading.title,
    translation: reading.translation,
  };
}

function buildLesson(unit: Unit, lesson: CourseLesson): Exercise[] {
  const vocabulary = getUnitVocabulary(unit.id);
  const scored = lessonScoredPracticePlan;
  const word = (index: number) =>
    vocabularyExercise(unit, vocabulary[index % vocabulary.length], index);
  const listening = (phraseIndex: number, eyebrow = 'Listen') =>
    phraseExercise(
      unit,
      phraseIndex,
      'listening',
      'listening',
      eyebrow,
      'Play the phrase, then choose what it means.',
    );
  const reading = (phraseIndex: number, eyebrow = 'Read') =>
    phraseExercise(
      unit,
      phraseIndex,
      'reading',
      'reading',
      eyebrow,
      'Choose the best meaning.',
    );
  const arrange = (phraseIndex: number) =>
    phraseExercise(
      unit,
      phraseIndex,
      'arrange',
      'reading',
      'Build it',
      'Put the words in a natural order.',
    );
  const pattern = (phraseIndex: number) =>
    phraseExercise(
      unit,
      phraseIndex,
      'pattern',
      'grammar',
      'Transform it',
      'Use the frame, then choose the natural Tagalog expression.',
    );
  const context = (phraseIndex: number) =>
    phraseExercise(
      unit,
      phraseIndex,
      'context',
      'reading',
      'In context',
      'Choose what you would say in this situation.',
    );
  const speaking = (phraseIndex: number) =>
    phraseExercise(
      unit,
      phraseIndex,
      'speaking',
      'speaking',
      'Speak',
      'Listen, then say the phrase aloud.',
    );

  const paths: Record<CourseLesson['kind'], Exercise[]> = {
    sounds: [
      vocabularyIntroductionExercise(
        unit,
        lessonIntroductionPlan.sounds.vocabulary.map(
          (index) => vocabulary[index],
        ),
        'first',
      ),
      phraseIntroductionExercise(
        unit,
        [...lessonIntroductionPlan.sounds.phrases],
        'first',
      ),
      foundationExercise(unit, 'pronunciation'),
      listening(scored.sounds.phrases[0]),
      reading(scored.sounds.phrases[1]),
      speaking(scored.sounds.phrases[0]),
    ],
    words: [
      vocabularyIntroductionExercise(
        unit,
        lessonIntroductionPlan.words.vocabulary.map(
          (index) => vocabulary[index],
        ),
        'second',
      ),
      ...scored.words.vocabulary.map(word),
      listening(scored.words.phrases[0]),
    ],
    pattern: [
      phraseIntroductionExercise(
        unit,
        [...lessonIntroductionPlan.pattern.phrases],
        'pattern',
      ),
      foundationExercise(unit, 'grammar'),
      pattern(scored.pattern.phrases[0]),
      arrange(scored.pattern.phrases[1]),
      context(scored.pattern.phrases[2]),
    ],
    understand: [
      ...scored.understand.vocabulary.map(word),
      listening(scored.understand.phrases[0]),
      dialogueIntroductionExercise(unit),
      passageExercise(unit),
      arrange(scored.understand.phrases[1]),
    ],
    conversation: [
      phraseIntroductionExercise(
        unit,
        [...lessonIntroductionPlan.conversation.phrases],
        'conversation',
      ),
      ...scored.conversation.vocabulary.map(word),
      dialogueExercise(unit),
      context(scored.conversation.phrases[0]),
      speaking(scored.conversation.phrases[1]),
    ],
    checkpoint: [
      listening(scored.checkpoint.phrases[0], 'Cumulative listening'),
      foundationExercise(unit, 'grammar'),
      arrange(scored.checkpoint.phrases[1]),
      context(scored.checkpoint.phrases[2]),
      speaking(scored.checkpoint.phrases[3]),
      passageExercise(unit),
    ],
  };
  return paths[lesson.kind].map((exercise) => ({
    ...exercise,
    instanceId: `${lesson.id}-${exercise.instanceId}`,
  }));
}

function buildReviewLesson(
  _unit: Unit,
  progress: LearnerProgress,
  mistakesOnly = false,
  priorityReviewKey?: string,
): Exercise[] {
  const today = localDateKey();

  return Object.entries(progress.reviews)
    .map(([key, record]) => ({
      key,
      record,
      target: findReviewTarget(key.slice(0, key.lastIndexOf(':'))),
    }))
    .filter(({ key, record, target }) => {
      if (!target) return false;
      if (mistakesOnly) {
        const mistake = progress.mistakes[key];
        return (
          Boolean(mistake) &&
          mistake.state !== 'recovered' &&
          mistake.nextPracticeDate <= today
        );
      }
      return record.dueDate <= today;
    })
    .sort((a, b) => {
      if (mistakesOnly) {
        const first = progress.mistakes[a.key]!;
        const second = progress.mistakes[b.key]!;
        return (
          first.nextPracticeDate.localeCompare(second.nextPracticeDate) ||
          first.lastMissedAt.localeCompare(second.lastMissedAt) ||
          second.lapseCount - first.lapseCount
        );
      }
      return (
        Number(b.key === priorityReviewKey) -
          Number(a.key === priorityReviewKey) ||
        a.record.dueDate.localeCompare(b.record.dueDate) ||
        a.record.stage - b.record.stage
      );
    })
    .slice(0, 10)
    .flatMap(({ key, target }) => {
      if (!target) return [];
      const reviewUnit = target.unit;
      const separator = key.lastIndexOf(':');
      const baseId = key.slice(0, separator);
      const skill = key.slice(separator + 1) as SkillMode;

      if (baseId === `${reviewUnit.id}-foundation-pronunciation`) {
        const exercise = foundationExercise(reviewUnit, 'pronunciation');
        return [
          {
            ...exercise,
            instanceId: `${exercise.instanceId}-review`,
            eyebrow: 'Due sound review',
          },
        ];
      }

      if (baseId === `${reviewUnit.id}-foundation-grammar`) {
        const exercise = foundationExercise(reviewUnit, 'grammar');
        return [
          {
            ...exercise,
            instanceId: `${exercise.instanceId}-review`,
            eyebrow: 'Due grammar review',
          },
        ];
      }

      if (baseId === `${reviewUnit.id}-foundation-reading`) {
        const exercise = passageExercise(reviewUnit);
        return [
          {
            ...exercise,
            instanceId: `${exercise.instanceId}-review`,
            eyebrow: 'Due reading review',
          },
        ];
      }

      if (baseId === `${reviewUnit.id}-dialogue`) {
        const exercise = dialogueExercise(reviewUnit);
        return [
          {
            ...exercise,
            instanceId: `${exercise.instanceId}-review`,
            eyebrow: 'Due review',
          },
        ];
      }

      const vocabulary = getUnitVocabulary(reviewUnit.id);
      const word = vocabulary.find(
        (item) => baseId === `${reviewUnit.id}-vocab-${item.id}`,
      );
      if (word) {
        const exercise = vocabularyExercise(
          reviewUnit,
          word,
          vocabulary.indexOf(word),
        );
        return [
          {
            ...exercise,
            instanceId: `${exercise.instanceId}-review`,
            eyebrow: 'Due word review',
          },
        ];
      }

      const found = findPhrase(baseId);
      if (!found || found.unit.id !== reviewUnit.id) return [];
      const phraseIndex = reviewUnit.phrases.findIndex(
        (phrase) => phrase.id === found.phrase.id,
      );
      const exercise =
        skill === 'listening'
          ? phraseExercise(
              reviewUnit,
              phraseIndex,
              'listening',
              'listening',
              'Due listening review',
              'Listen, then choose what it means.',
            )
          : skill === 'speaking'
            ? phraseExercise(
                reviewUnit,
                phraseIndex,
                'speaking',
                'speaking',
                'Due speaking review',
                'Listen, then say the phrase aloud.',
              )
            : skill === 'grammar'
              ? phraseExercise(
                  reviewUnit,
                  phraseIndex,
                  'pattern',
                  'grammar',
                  'Due pattern review',
                  'Use the sentence frame, then choose the natural expression.',
                )
              : phraseExercise(
                  reviewUnit,
                  phraseIndex,
                  'reading',
                  'reading',
                  'Due reading review',
                  'Read, then choose the best meaning.',
                );
      return [{ ...exercise, instanceId: `${exercise.instanceId}-review` }];
    });
}

function friendlyDate(dateKey: string) {
  const [year, month, day] = dateKey.split('-').map(Number);
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
  }).format(new Date(Date.UTC(year, month - 1, day, 12)));
}

function findPhrase(
  baseId: string,
): { phrase: Phrase; unit: Unit } | undefined {
  for (const unit of units) {
    const prefix = `${unit.id}-`;
    if (!baseId.startsWith(prefix)) continue;
    const phraseId = baseId.slice(prefix.length);
    const phrase = unit.phrases.find((item) => item.id === phraseId);
    if (phrase) return { phrase, unit };
  }
  return undefined;
}

function findReviewTarget(
  baseId: string,
): { fil: string; en: string; unit: Unit } | undefined {
  const phrase = findPhrase(baseId);
  if (phrase)
    return { fil: phrase.phrase.fil, en: phrase.phrase.en, unit: phrase.unit };
  for (const unit of units) {
    const word = getUnitVocabulary(unit.id).find(
      (item) => baseId === `${unit.id}-vocab-${item.id}`,
    );
    if (word) return { fil: word.fil, en: word.en, unit };
    const foundation = getFoundation(unit.id);
    if (baseId === `${unit.id}-foundation-pronunciation`) {
      return {
        fil: foundation.pronunciation.model,
        en: foundation.pronunciation.title,
        unit,
      };
    }
    if (baseId === `${unit.id}-foundation-grammar`) {
      return {
        fil: foundation.grammar.examples[0]?.fil ?? foundation.grammar.formula,
        en: foundation.grammar.title,
        unit,
      };
    }
    if (baseId === `${unit.id}-foundation-reading`) {
      return {
        fil: foundation.reading.passage,
        en: foundation.reading.title,
        unit,
      };
    }
  }
  const unit = units.find((item) => baseId === `${item.id}-dialogue`);
  if (!unit) return undefined;
  return { fil: unit.dialogue.line, en: unit.dialogue.situation, unit };
}

function hasCompletedCurrentUnit(progress: LearnerProgress, unit: Unit) {
  return getUnitLessons(unit.id).every((lesson) =>
    progress.completedLessons.includes(lesson.id),
  );
}

function isUnitUnlocked(progress: LearnerProgress, unit: Unit) {
  return (
    unit.number === 1 ||
    progress.activeUnitId === unit.id ||
    hasCompletedCurrentUnit(progress, unit)
  );
}

function isLessonUnlocked(
  progress: LearnerProgress,
  unit: Unit,
  lesson: CourseLesson,
) {
  if (progress.completedLessons.includes(lesson.id)) return true;
  return (
    progress.activeUnitId === unit.id && progress.activeLessonId === lesson.id
  );
}

function introducedVocabularyCount(progress: LearnerProgress, unit: Unit) {
  const completed = new Set(progress.completedLessons);
  const introduced = new Set<number>();
  for (const lesson of getUnitLessons(unit.id)) {
    if (!completed.has(lesson.id)) continue;
    lessonIntroductionPlan[lesson.kind].vocabulary.forEach((index) =>
      introduced.add(index),
    );
  }
  return introduced.size;
}

export default function SalitaApp({
  initialTodayKey,
}: {
  initialTodayKey: string;
}) {
  const [view, setView] = useState<View>('today');
  const navigateToView = useCallback((nextView: View) => {
    setView(nextView);
    window.scrollTo({ top: 0, behavior: 'auto' });
  }, []);
  const {
    progress,
    hydrated,
    status: syncStatus,
    storageIssue,
    accountEmail,
    updatedAt,
    legacyConflict,
    dispatch,
    exportProgress,
    importBackup,
    resolveLegacyConflict,
    clearThisDevice,
    deleteEverywhere,
  } = useSyncedProgress();
  const [todayKey, setTodayKey] = useState(initialTodayKey);
  const [lessonSession, setLessonSession] = useState<{
    unitId: string;
    lessonId: string;
    mode: 'lesson' | 'review' | 'mistakes' | 'replay';
    sessionId: string;
    priorityReviewKey?: string;
  } | null>(null);
  const [vocabularySession, setVocabularySession] = useState<{
    unitId: string;
    sessionId: string;
  } | null>(null);
  const [showCourseExpansionNotice, setShowCourseExpansionNotice] =
    useState(false);

  useEffect(() => {
    if (!hydrated) return;
    try {
      if (window.localStorage.getItem(COURSE_EXPANSION_NOTICE_KEY)) return;
      const hasEarlierWork =
        progress.xp > 0 ||
        progress.totalSessions > 0 ||
        progress.completedUnits.length > 0 ||
        progress.completedLessons.length > 0 ||
        Object.keys(progress.reviews).length > 0;
      window.localStorage.setItem(COURSE_EXPANSION_NOTICE_KEY, '1');
      queueMicrotask(() => setShowCourseExpansionNotice(hasEarlierWork));
    } catch {
      // Storage-blocked browsers already receive the durable-storage notice.
    }
  }, [hydrated, progress]);

  useEffect(() => {
    const refreshToday = () => setTodayKey(localDateKey());
    refreshToday();
    const interval = window.setInterval(refreshToday, 60_000);
    return () => window.clearInterval(interval);
  }, []);

  const startLesson = useCallback(
    (unitId: string, requestedLessonId?: string) => {
      const unit = getUnit(unitId);
      const lessons = getUnitLessons(unit.id);
      const activeInUnit = lessons.find(
        (lesson) =>
          lesson.id === progress.activeLessonId &&
          !progress.completedLessons.includes(lesson.id),
      );
      const lesson = requestedLessonId
        ? getLesson(unit.id, requestedLessonId)
        : (activeInUnit ??
          lessons.find(
            (candidate) => !progress.completedLessons.includes(candidate.id),
          ) ??
          lessons[0]);
      if (!isLessonUnlocked(progress, unit, lesson)) return;
      const completed = progress.completedLessons.includes(lesson.id);
      const canonical =
        progress.activeUnitId === unit.id &&
        progress.activeLessonId === lesson.id;
      if (!completed && !canonical) return;
      setLessonSession({
        unitId: unit.id,
        lessonId: lesson.id,
        mode: completed ? 'replay' : 'lesson',
        sessionId: crypto.randomUUID(),
      });
      window.scrollTo({ top: 0, behavior: 'smooth' });
    },
    [progress],
  );

  const startReview = useCallback((unitId: string, reviewKey?: string) => {
    const unit = getUnit(unitId);
    const lesson = getLesson(unit.id);
    setLessonSession({
      unitId: unit.id,
      lessonId: lesson.id,
      mode: 'review',
      sessionId: crypto.randomUUID(),
      priorityReviewKey: reviewKey,
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const startMistakes = useCallback(() => {
    const today = localDateKey();
    const nextMistake = Object.entries(progress.mistakes)
      .filter(
        ([, record]) =>
          record.state !== 'recovered' && record.nextPracticeDate <= today,
      )
      .sort(([, a], [, b]) =>
        a.nextPracticeDate.localeCompare(b.nextPracticeDate),
      )
      .map(([key]) => findReviewTarget(key.slice(0, key.lastIndexOf(':'))))
      .find(Boolean);
    if (!nextMistake) return;
    const lesson = getLesson(nextMistake.unit.id);
    setLessonSession({
      unitId: nextMistake.unit.id,
      lessonId: lesson.id,
      mode: 'mistakes',
      sessionId: crypto.randomUUID(),
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [progress.mistakes]);

  const startVocabulary = useCallback(
    (unitId: string) => {
      const unit = getUnit(unitId);
      if (introducedVocabularyCount(progress, unit) < 2) return;
      setVocabularySession({
        unitId: unit.id,
        sessionId: crypto.randomUUID(),
      });
      window.scrollTo({ top: 0, behavior: 'smooth' });
    },
    [progress],
  );

  useEffect(() => {
    const modelContext = (
      document as Document & { modelContext?: ModelContextLike }
    ).modelContext;
    if (!modelContext?.registerTool) return;
    const lifecycle = new AbortController();
    const register = async () => {
      await modelContext.registerTool(
        {
          name: 'start_daily_lesson',
          title: 'Start Tagalog lesson',
          description:
            'Open a Salita lesson for a curriculum unit so the learner can begin practicing.',
          inputSchema: {
            type: 'object',
            properties: {
              unitId: {
                type: 'string',
                enum: units.map((unit) => unit.id),
                description:
                  'Curriculum unit to practice. Defaults to the learner’s active unit.',
              },
            },
            additionalProperties: false,
          },
          annotations: { readOnlyHint: false, untrustedContentHint: false },
          execute(input) {
            const unitIdValue =
              input && typeof input === 'object' && 'unitId' in input
                ? (input as { unitId?: unknown }).unitId
                : undefined;
            if (unitIdValue !== undefined && typeof unitIdValue !== 'string') {
              throw new Error('unitId must be a string.');
            }
            const requested = unitIdValue ?? '';
            if (requested && !units.some((unit) => unit.id === requested)) {
              throw new Error('Unknown curriculum unit.');
            }
            const unitId = requested || progress.activeUnitId;
            startLesson(unitId);
            return { status: 'started', unitId };
          },
        },
        { signal: lifecycle.signal },
      );
      await modelContext.registerTool(
        {
          name: 'read_learning_progress',
          title: 'Read Tagalog progress',
          description:
            'Read the learner’s current Salita streak, XP, lessons completed, and skill strengths.',
          inputSchema: {
            type: 'object',
            properties: {},
            additionalProperties: false,
          },
          annotations: { readOnlyHint: true, untrustedContentHint: false },
          execute() {
            const today = localDateKey();
            const streaks = deriveStreaks(progress.completedDays, today);
            return {
              currentStreak: streaks.current,
              bestStreak: streaks.best,
              xp: progress.xp,
              lessonsCompleted: progress.totalSessions,
              listeningStrength: skillStrength(progress, 'listening'),
              readingStrength: skillStrength(progress, 'reading'),
              speakingStrength: skillStrength(progress, 'speaking'),
              grammarStrength: skillStrength(progress, 'grammar'),
              pronunciationStrength: skillStrength(progress, 'pronunciation'),
            };
          },
        },
        { signal: lifecycle.signal },
      );
    };
    void register().catch(() => {
      // WebMCP is progressive enhancement; the visible app remains fully usable.
    });
    return () => lifecycle.abort();
  }, [progress, startLesson]);

  const finishSession = useCallback(
    (
      unit: Unit,
      lesson: CourseLesson,
      sessionId: string,
      summary: {
        xp: number;
        firstTryCorrect: number;
        prompts: number;
        minutes: number;
        modes: SkillMode[];
        kind: ActivityKind;
        sourceUnitIds?: string[];
      },
    ) => {
      const next =
        summary.kind === 'lesson'
          ? nextLessonAfter(unit.id, lesson.id)
          : {
              unit: getUnit(progress.activeUnitId),
              lesson: getLesson(progress.activeUnitId, progress.activeLessonId),
              completedUnit: false,
            };
      dispatch({
        type: 'session-completed',
        sessionId,
        unitId: unit.id,
        sourceUnitIds: summary.sourceUnitIds,
        lessonId: summary.kind === 'lesson' ? lesson.id : undefined,
        nextUnitId: next.unit.id,
        nextLessonId: next.lesson.id,
        completesUnit: summary.kind === 'lesson' && next.completedUnit,
        kind: summary.kind,
        minutes: summary.minutes,
        firstTryCorrect: summary.firstTryCorrect,
        prompts: summary.prompts,
        modes: summary.modes,
        reportedXp: summary.xp,
      });
    },
    [dispatch, progress.activeLessonId, progress.activeUnitId],
  );

  const resetThisDevice = async () => {
    if (
      !window.confirm(
        'Clear Salita’s cached progress on this device? Your synced account copy will stay safe.',
      )
    )
      return;
    if (!(await clearThisDevice())) {
      window.alert(
        'Resolve any yellow progress-choice card first. Otherwise, reconnect and wait for “saved” before clearing this device.',
      );
      return;
    }
    navigateToView('today');
  };

  const deleteSyncedProgress = async () => {
    if (
      !window.confirm(
        'Delete your synced Salita progress everywhere? Export a backup first if you may want it later.',
      )
    )
      return;
    if (
      !window.confirm(
        'Final confirmation: delete XP, streaks, lesson history, reviews, and mistakes from every synced device?',
      )
    )
      return;
    if (await deleteEverywhere()) navigateToView('today');
  };

  const recordAttempt = useCallback(
    (sessionId: string, reviewKey: string, outcome: AttemptOutcome) =>
      dispatch({ type: 'review-attempt', sessionId, reviewKey, outcome }),
    [dispatch],
  );

  if (!hydrated) {
    return (
      <main className="grid min-h-dvh place-items-center bg-background px-5 text-foreground">
        <section className="text-center" aria-live="polite">
          <span className="mx-auto grid size-14 place-items-center rounded-[16px] bg-primary text-black">
            <Sparkles className="size-6" />
          </span>
          <p className="mt-4 text-sm font-black">Opening your learning path…</p>
        </section>
      </main>
    );
  }

  if (vocabularySession) {
    const unit = getUnit(vocabularySession.unitId);
    return (
      <VocabularyMatchGame
        key={vocabularySession.sessionId}
        unit={unit}
        progress={progress}
        sessionId={vocabularySession.sessionId}
        onAttempt={recordAttempt}
        onExit={() => setVocabularySession(null)}
        onFinish={(summary) => {
          const lesson = getLesson(
            progress.activeUnitId,
            progress.activeLessonId,
          );
          finishSession(unit, lesson, vocabularySession.sessionId, summary);
        }}
      />
    );
  }

  if (lessonSession) {
    const lesson = getLesson(lessonSession.unitId, lessonSession.lessonId);
    return (
      <LessonExperience
        key={lessonSession.sessionId}
        unit={getUnit(lessonSession.unitId)}
        lesson={lesson}
        sessionId={lessonSession.sessionId}
        reviewMode={lessonSession.mode === 'review'}
        mistakesMode={lessonSession.mode === 'mistakes'}
        replayMode={lessonSession.mode === 'replay'}
        priorityReviewKey={lessonSession.priorityReviewKey}
        progress={progress}
        onReviewAttempt={recordAttempt}
        onExit={() => setLessonSession(null)}
        onFinish={finishSession}
        onNext={startLesson}
      />
    );
  }

  return (
    <main className="min-h-dvh bg-background text-foreground">
      <AppHeader
        view={view}
        onNavigate={navigateToView}
        progress={progress}
        todayKey={todayKey}
      />
      <div className="mx-auto max-w-6xl px-5 pb-28 pt-8 lg:px-8 lg:pb-12 lg:pt-10">
        {storageIssue && (
          <output className="mb-5 flex items-start gap-3 rounded-[8px] bg-[var(--f-yellow-1)] p-4 text-sm text-[#5c4a00]">
            <TriangleAlert className="mt-0.5 size-5 shrink-0" />
            Progress is available for this visit, but this browser is currently
            blocking local storage.
          </output>
        )}
        <SyncNotice
          status={syncStatus}
          accountEmail={accountEmail}
          legacyConflict={legacyConflict}
          onResolve={resolveLegacyConflict}
        />
        {showCourseExpansionNotice && (
          <section className="mb-5 flex items-start gap-3 rounded-[12px] border border-[#83b7f5] bg-[var(--f-blue-3)] p-4 text-sm text-[#183f7b]">
            <Sparkles className="mt-0.5 size-5 shrink-0" />
            <div className="flex-1">
              <p className="font-black">Your course just grew.</p>
              <p className="mt-1 leading-5">
                Your XP, streaks, reviews, mistakes, and earlier work were kept.
                Salita placed you at the earliest unfinished foundation so the
                new path builds steadily without gaps.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowCourseExpansionNotice(false)}
              className="grid size-11 shrink-0 place-items-center rounded-full hover:bg-white/50 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring"
              aria-label="Dismiss course update"
            >
              <X className="size-4" />
            </button>
          </section>
        )}
        {view === 'today' && (
          <TodayView
            progress={progress}
            todayKey={todayKey}
            onStart={startLesson}
            onNavigate={navigateToView}
          />
        )}
        {view === 'learn' && (
          <LearnView
            progress={progress}
            onStart={startLesson}
            onStartVocabulary={startVocabulary}
          />
        )}
        {view === 'review' && (
          <ReviewView
            progress={progress}
            todayKey={todayKey}
            onStartLesson={startLesson}
            onStartReview={startReview}
            onStartMistakes={startMistakes}
            onStartVocabulary={startVocabulary}
          />
        )}
        {view === 'progress' && (
          <ProgressView
            progress={progress}
            todayKey={todayKey}
            syncStatus={syncStatus}
            accountEmail={accountEmail}
            updatedAt={updatedAt}
            onExport={() => void exportProgress()}
            onImport={importBackup}
            onClearDevice={() => void resetThisDevice()}
            onDeleteEverywhere={() => void deleteSyncedProgress()}
          />
        )}
      </div>
      <MobileNav view={view} onNavigate={navigateToView} />
    </main>
  );
}

function SyncNotice({
  status,
  accountEmail,
  legacyConflict,
  onResolve,
}: {
  status: ReturnType<typeof useSyncedProgress>['status'];
  accountEmail: string | null;
  legacyConflict: ReturnType<typeof useSyncedProgress>['legacyConflict'];
  onResolve: ReturnType<typeof useSyncedProgress>['resolveLegacyConflict'];
}) {
  if (legacyConflict) {
    return (
      <section className="mb-6 rounded-[16px] border border-[#e2b600] bg-[var(--f-yellow-1)] p-5 text-[#5c4a00]">
        <div className="flex items-start gap-3">
          <TriangleAlert className="mt-0.5 size-5 shrink-0" />
          <div className="flex-1">
            <p className="font-black">Choose which progress to keep</p>
            <p className="mt-1 text-sm leading-5">
              {legacyConflict.source === 'stale-generation' ? (
                <>
                  This device has unsynced work from before your account
                  progress was reset or replaced. A local backup stays here
                  until you choose.
                </>
              ) : (
                <>
                  This browser has an older device-only history
                  {legacyConflict.belongsToAnotherAccount
                    ? ' that was linked to a different account'
                    : ''}
                  . A backup will be retained before it is changed.
                </>
              )}
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button
                variant="outline"
                disabled={status === 'saving'}
                onClick={() => void onResolve('keep-cloud')}
                className="min-h-11 rounded-[5px] bg-white font-black"
              >
                Keep account copy
              </Button>
              <Button
                variant="outline"
                disabled={status === 'saving'}
                onClick={() => void onResolve('merge')}
                className="min-h-11 rounded-[5px] bg-white font-black"
              >
                Merge both
              </Button>
              <Button
                disabled={status === 'saving'}
                onClick={() => void onResolve('replace')}
                className="min-h-11 rounded-[5px] bg-[#5c4a00] font-black text-white hover:bg-[#493b00]"
              >
                Use device copy
              </Button>
            </div>
          </div>
        </div>
      </section>
    );
  }
  if (status === 'offline' || status === 'attention') {
    return (
      <output className="mb-5 flex items-start gap-3 rounded-[8px] bg-[var(--f-yellow-1)] p-4 text-sm text-[#5c4a00]">
        <CloudOff className="mt-0.5 size-5 shrink-0" />
        <span>
          {status === 'attention'
            ? 'This device needs to reload the latest account copy before it can sync.'
            : 'You are offline. New work stays queued on this device and will sync when the connection returns.'}
        </span>
      </output>
    );
  }
  if (status === 'device-only') {
    return (
      <output className="mb-5 flex items-start gap-3 rounded-[8px] bg-[var(--f-blue-3)] p-4 text-sm text-[#183f7b]">
        <Smartphone className="mt-0.5 size-5 shrink-0" />
        Device-only mode. Sign in through the published Salita site to carry
        progress between desktop and iPhone.
      </output>
    );
  }
  return (
    <output className="sr-only" aria-live="polite">
      {status === 'saving'
        ? 'Saving progress'
        : `Progress saved${accountEmail ? ` for ${accountEmail}` : ''}`}
    </output>
  );
}

function AppHeader({
  view,
  onNavigate,
  progress,
  todayKey,
}: {
  view: View;
  onNavigate: (view: View) => void;
  progress: LearnerProgress;
  todayKey: string;
}) {
  const { current } = deriveStreaks(progress.completedDays, todayKey);

  return (
    <header className="sticky top-0 z-30 border-b border-border bg-card/95 backdrop-blur">
      <div className="mx-auto flex h-18 max-w-6xl items-center justify-between gap-8 px-5 lg:px-8">
        <button
          onClick={() => onNavigate('today')}
          className="flex min-h-11 items-center gap-2.5 no-underline"
          aria-label="Salita home"
        >
          <span className="grid size-9 place-items-center rounded-[8px] bg-primary text-black">
            <Sparkles className="size-5" strokeWidth={2.6} />
          </span>
          <span className="text-[22px] font-black tracking-[-0.045em]">
            salita.
          </span>
        </button>

        <nav
          aria-label="Main navigation"
          className="hidden h-full items-center gap-7 lg:flex"
        >
          {NAV_ITEMS.map((item) => (
            <button
              key={item.id}
              onClick={() => onNavigate(item.id)}
              aria-current={view === item.id ? 'page' : undefined}
              className={`relative flex h-full items-center gap-2 text-sm font-black transition-colors after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:bg-primary ${
                view === item.id
                  ? 'text-foreground after:opacity-100'
                  : 'text-muted-foreground after:opacity-0 hover:text-foreground'
              }`}
            >
              <item.icon className="size-4" />
              {item.label}
            </button>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <button
            onClick={() => onNavigate('progress')}
            className="flex min-h-11 items-center gap-2 rounded-full bg-[var(--f-yellow-1)] px-3 text-sm font-black focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring"
            aria-label={`${current} day streak. Open progress.`}
          >
            <Flame className="size-4 fill-[var(--f-yellow-4)] text-[var(--f-yellow-4)]" />
            <span>{current}</span>
          </button>
          <button
            onClick={() => onNavigate('progress')}
            aria-label="Open profile and progress"
            className="grid size-11 place-items-center rounded-full bg-secondary text-sm font-black text-secondary-foreground focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            <UserRound className="size-5" aria-hidden="true" />
          </button>
        </div>
      </div>
    </header>
  );
}

function MobileNav({
  view,
  onNavigate,
}: {
  view: View;
  onNavigate: (view: View) => void;
}) {
  return (
    <nav
      aria-label="Main navigation"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-card/96 pb-[max(10px,env(safe-area-inset-bottom))] pl-[max(0.5rem,env(safe-area-inset-left))] pr-[max(0.5rem,env(safe-area-inset-right))] pt-2 backdrop-blur lg:hidden"
    >
      <div className="mx-auto flex max-w-md items-center justify-around">
        {NAV_ITEMS.map((item) => (
          <button
            key={item.id}
            onClick={() => onNavigate(item.id)}
            aria-current={view === item.id ? 'page' : undefined}
            className={`flex min-h-13 min-w-18 flex-col items-center justify-center gap-1 rounded-[8px] px-2 text-[11px] font-black ${
              view === item.id
                ? 'bg-[var(--f-pink-3)] text-[#9c0040]'
                : 'text-muted-foreground'
            }`}
          >
            <item.icon className="size-5" />
            {item.label}
          </button>
        ))}
      </div>
    </nav>
  );
}

function TodayView({
  progress,
  todayKey,
  onStart,
  onNavigate,
}: {
  progress: LearnerProgress;
  todayKey: string;
  onStart: (unitId: string, lessonId?: string) => void;
  onNavigate: (view: View) => void;
}) {
  const unit = getUnit(progress.activeUnitId);
  const lesson = getLesson(unit.id, progress.activeLessonId);
  const completedInUnit = getUnitLessons(unit.id).filter((item) =>
    progress.completedLessons.includes(item.id),
  ).length;
  const minutes = progress.dailyMinutes[todayKey] ?? 0;
  const goalPercent = Math.min(100, (minutes / 10) * 100);
  const { current } = deriveStreaks(progress.completedDays, todayKey);
  const dueReviewKeys = new Set(
    Object.entries(progress.reviews)
      .filter(
        ([key, record]) =>
          record.dueDate <= todayKey &&
          Boolean(findReviewTarget(key.slice(0, key.lastIndexOf(':')))),
      )
      .map(([key]) => key),
  );
  for (const [key, mistake] of Object.entries(progress.mistakes)) {
    if (mistake.state !== 'recovered' && mistake.nextPracticeDate <= todayKey) {
      dueReviewKeys.add(key);
    }
  }
  const dueCount = dueReviewKeys.size;
  const calculatedDay =
    progress.completedDays.length +
    (progress.completedDays.includes(todayKey) ? 0 : 1);
  const journeyDay = calculatedDay < 1 ? 1 : calculatedDay;

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_316px]">
      <section>
        <div className="mb-6 flex items-end justify-between gap-4">
          <div>
            <p className="mb-1 text-xs font-black uppercase tracking-[0.14em] text-muted-foreground">
              Day {journeyDay} · Daily path
            </p>
            <h1 className="text-3xl font-black tracking-[-0.045em] sm:text-4xl">
              Magandang araw!
            </h1>
            <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground sm:text-base">
              Build useful Tagalog (Filipino) from sounds and sentence structure
              to real conversation.
            </p>
          </div>
          <span className="hidden rounded-[5px] bg-[var(--f-green-1)] px-3 py-2 text-xs font-black text-[var(--f-green-4)] sm:inline-flex">
            {progress.xp} XP total
          </span>
        </div>

        <article className="relative overflow-hidden rounded-[24px] bg-[var(--f-driver-bg)] p-6 text-[#10066c] shadow-[0_4px_20px_rgba(25,1,52,0.14)] sm:p-8">
          <div
            className="absolute -right-8 -top-12 size-56 rounded-full border-[24px] border-white/18"
            aria-hidden="true"
          />
          <div className="relative z-10 max-w-xl">
            <div className="mb-6 flex items-center gap-2 text-sm font-black text-[#10066c]">
              <span className="grid size-8 place-items-center rounded-full bg-white/40">
                <MessageCircle className="size-4" />
              </span>
              Everyday conversation
            </div>
            <p className="mb-2 text-sm font-black">
              Unit {unit.number} · Lesson {lesson.order} of 6 · {lesson.minutes}{' '}
              min
            </p>
            <h2
              lang="fil"
              className="text-3xl font-black leading-tight tracking-[-0.045em] sm:text-[40px]"
            >
              {unit.titleFil}
            </h2>
            <p className="mt-3 max-w-md text-base leading-6 text-[#10066c]">
              {unit.description}
            </p>
            <p className="mt-3 max-w-md rounded-[8px] bg-white/30 px-3 py-2 text-sm font-bold">
              {lesson.title}: {lesson.objective}
            </p>
            <p className="mt-3 text-xs font-black uppercase tracking-[0.09em]">
              Sound · Grammar · Reading · Conversation
            </p>
            <div className="mt-6 flex flex-wrap items-center gap-4">
              {dueCount ? (
                <>
                  <Button
                    size="lg"
                    onClick={() => onNavigate('review')}
                    className="h-12 rounded-[5px] bg-primary px-5 text-base font-black text-black hover:bg-[var(--f-pink-light)]"
                  >
                    Review {dueCount} due <RefreshCcw className="ml-1 size-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="lg"
                    onClick={() => onStart(unit.id, lesson.id)}
                    className="h-12 rounded-[5px] border-[#10066c]/30 bg-white/35 px-5 font-black text-[#10066c]"
                  >
                    New lesson
                  </Button>
                </>
              ) : (
                <Button
                  size="lg"
                  onClick={() => onStart(unit.id, lesson.id)}
                  className="h-12 rounded-[5px] bg-primary px-5 text-base font-black text-black hover:bg-[var(--f-pink-light)]"
                >
                  {completedInUnit ? 'Continue lesson' : 'Start lesson'}
                  <ArrowRight className="ml-1 size-4" />
                </Button>
              )}
              <div className="flex items-center gap-2 text-sm font-black">
                <Star className="size-4 fill-[var(--f-yellow-3)] text-[#5c4a00]" />
                {dueCount
                  ? 'Recall first, then add new material'
                  : 'Up to 10 XP per scored prompt'}
              </div>
            </div>
          </div>
        </article>

        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          {[
            {
              icon: Headphones,
              label: 'Makinig',
              detail: 'Hear useful phrases',
              color: 'bg-[var(--f-cyan-1)]',
              ink: 'text-[#005c83]',
            },
            {
              icon: Mic,
              label: 'Magsalita',
              detail: 'Answer out loud',
              color: 'bg-[var(--f-pink-3)]',
              ink: 'text-[#9c0040]',
            },
            {
              icon: BookOpen,
              label: 'Magbasa',
              detail: 'Read in context',
              color: 'bg-[var(--f-green-1)]',
              ink: 'text-[var(--f-green-4)]',
            },
          ].map(({ icon: Icon, label, detail, color, ink }) => (
            <article
              key={label}
              className="flex min-h-18 items-center gap-3 rounded-[8px] border border-border bg-card p-4 text-left"
            >
              <span
                className={`grid size-10 shrink-0 place-items-center rounded-[8px] ${color} ${ink}`}
              >
                <Icon className="size-5" strokeWidth={2.4} />
              </span>
              <span>
                <span lang="fil" className="block text-[15px] font-black">
                  {label}
                </span>
                <span className="mt-0.5 block text-xs text-muted-foreground">
                  {detail}
                </span>
              </span>
            </article>
          ))}
        </div>

        <section className="mt-8">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.12em] text-muted-foreground">
                Learning path
              </p>
              <h2 className="mt-1 text-xl font-black">
                Susunod na mga hakbang
              </h2>
            </div>
            <Button
              variant="ghost"
              onClick={() => onNavigate('learn')}
              className="min-h-11 font-black text-[#183f7b]"
            >
              See all <ChevronRight />
            </Button>
          </div>
          <div className="space-y-3">
            {units.slice(unit.number - 1, unit.number + 2).map((item) => (
              <UnitRow
                key={item.id}
                unit={item}
                progress={progress}
                onStart={onStart}
              />
            ))}
          </div>
        </section>
      </section>

      <aside className="space-y-4">
        <StreakCard progress={progress} todayKey={todayKey} />
        <section className="rounded-[16px] border border-border bg-card p-5">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.12em] text-muted-foreground">
                Daily goal
              </p>
              <p className="mt-1 text-lg font-black">10 minutes</p>
            </div>
            <p className="text-sm font-black text-[var(--f-green-4)]">
              {minutes} / 10
            </p>
          </div>
          <Progress
            value={goalPercent}
            aria-label={`Daily goal: ${minutes} of 10 minutes`}
            className="[&_[data-slot=progress-track]]:h-2 [&_[data-slot=progress-indicator]]:bg-[var(--f-success-strong)]"
          />
          <p className="mt-3 text-xs leading-5 text-muted-foreground">
            {current
              ? 'Keep your rhythm going with one short lesson.'
              : 'Finish one lesson today to begin your streak.'}
          </p>
        </section>
        <VoiceConnectionCard />
        <section className="rounded-[16px] border border-border bg-card p-5">
          <div className="flex items-start gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-[8px] bg-[var(--f-blue-3)] text-[#183f7b]">
              <Languages className="size-5" />
            </span>
            <div>
              <p className="font-black">Course variety</p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                Contemporary conversational Tagalog (Filipino), with Metro
                Manila usage and clearly labeled Taglish.
              </p>
            </div>
          </div>
        </section>
      </aside>
    </div>
  );
}

function VoiceConnectionCard() {
  const [voice, setVoice] = useState<{
    configured: boolean;
    voice: string | null;
  } | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    void fetch('/api/speech', {
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    })
      .then((response) => response.json())
      .then((value: unknown) => {
        if (!value || typeof value !== 'object' || !('configured' in value)) {
          return;
        }
        const result = value as { configured: unknown; voice?: unknown };
        setVoice({
          configured: result.configured === true,
          voice: typeof result.voice === 'string' ? result.voice : null,
        });
      })
      .catch(() => {
        // Audio playback provides its own actionable fallback if status is unavailable.
      });
    return () => controller.abort();
  }, []);

  const connected = voice?.configured === true;
  return (
    <section className="rounded-[16px] border border-border bg-card p-5">
      <div className="flex items-start gap-3">
        <span
          className={`grid size-10 shrink-0 place-items-center rounded-[8px] ${connected ? 'bg-[var(--f-green-1)] text-[var(--f-green-4)]' : 'bg-[var(--f-blue-3)] text-[#183f7b]'}`}
        >
          <Volume2 className="size-5" />
        </span>
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-black">Azure speech</p>
            <Tag
              className={
                voice === null
                  ? 'bg-muted text-muted-foreground'
                  : connected
                    ? 'bg-[var(--f-green-1)] text-[var(--f-green-4)]'
                    : 'bg-[var(--f-yellow-1)] text-[#6a5000]'
              }
            >
              {voice === null
                ? 'Checking'
                : connected
                  ? 'Configured'
                  : 'Setup needed'}
            </Tag>
          </div>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            {connected
              ? `Configured for the ${voice.voice?.replace('fil-PH-', '').replace('Neural', '') ?? 'Filipino'} neural voice, Filipino word recognition, and English pronunciation coaching.`
              : 'Azure support is built in for Filipino audio and recognition plus English pronunciation coaching. Add one Speech key and region to activate it.'}
          </p>
        </div>
      </div>
    </section>
  );
}

function StreakCard({
  progress,
  todayKey,
}: {
  progress: LearnerProgress;
  todayKey: string;
}) {
  const { current } = deriveStreaks(progress.completedDays, todayKey);
  const completed = new Set(progress.completedDays);
  const days = Array.from({ length: 7 }, (_, index) =>
    addCalendarDays(todayKey, index - 6),
  );

  return (
    <section className="rounded-[16px] border border-border bg-card p-5">
      <div className="mb-5 flex items-center justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.12em] text-muted-foreground">
            Sunod-sunod
          </p>
          <p className="mt-1 text-xl font-black">{current} araw na streak</p>
        </div>
        <span className="grid size-11 place-items-center rounded-full bg-[var(--f-yellow-1)] text-[#5c4a00]">
          <Flame className="size-6 fill-[var(--f-yellow-4)]" />
        </span>
      </div>
      <div className="grid grid-cols-7 gap-1.5">
        {days.map((day) => {
          const date = new Date(`${day}T12:00:00`);
          const label = date.toLocaleDateString('fil-PH', {
            weekday: 'narrow',
          });
          const isDone = completed.has(day);
          const isToday = day === todayKey;
          return (
            <div key={day} className="text-center">
              <time
                dateTime={day}
                title={`${friendlyDate(day)}${isDone ? ', complete' : ''}`}
                aria-label={`${friendlyDate(day)}: ${isDone ? 'practice complete' : isToday ? 'today, not complete' : 'not complete'}`}
                className={`mx-auto grid size-8 place-items-center rounded-full text-xs font-black ${
                  isDone
                    ? 'bg-[var(--f-success)] text-black'
                    : isToday
                      ? 'border-2 border-primary bg-[var(--f-pink-3)] text-[#9c0040]'
                      : 'bg-muted text-muted-foreground'
                }`}
              >
                {isDone ? <Check className="size-4" strokeWidth={3} /> : label}
              </time>
              <span className="mt-1.5 block text-[10px] font-bold text-muted-foreground">
                {label}
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function UnitRow({
  unit,
  progress,
  onStart,
}: {
  unit: Unit;
  progress: LearnerProgress;
  onStart: (unitId: string) => void;
}) {
  const complete = hasCompletedCurrentUnit(progress, unit);
  const legacyComplete = progress.completedUnits.includes(unit.id) && !complete;
  const current = progress.activeUnitId === unit.id;
  const unlocked = isUnitUnlocked(progress, unit);
  const duration = getUnitLessons(unit.id).reduce(
    (total, lesson) => total + lesson.minutes,
    0,
  );
  const [background, color] =
    UNIT_COLORS[(unit.number - 1) % UNIT_COLORS.length];

  return (
    <button
      onClick={() => onStart(unit.id)}
      disabled={!unlocked}
      className={`flex w-full items-center gap-4 rounded-[8px] border bg-card p-4 text-left transition hover:-translate-y-0.5 hover:shadow-[0_2px_10px_rgba(25,1,52,0.08)] focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring ${
        current ? 'border-[#3174d2]' : 'border-border'
      } disabled:cursor-not-allowed disabled:opacity-65`}
    >
      <span
        className={`grid size-12 shrink-0 place-items-center rounded-[8px] text-base font-black ${background} ${color}`}
      >
        {complete ? <Check className="size-5" strokeWidth={3} /> : unit.number}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-2">
          <span lang="fil" className="font-black">
            {unit.titleFil}
          </span>
          {current && (
            <Tag className="bg-[var(--f-pink-3)] text-[#9c0040]">Current</Tag>
          )}
          {complete && (
            <Tag className="bg-[var(--f-green-1)] text-[var(--f-green-4)]">
              Practiced
            </Tag>
          )}
          {legacyComplete && (
            <Tag className="bg-[var(--f-yellow-1)] text-[#6a5000]">
              Earlier progress
            </Tag>
          )}
          {!unlocked && (
            <Tag className="bg-muted text-muted-foreground">Locked</Tag>
          )}
        </span>
        <span className="mt-1 block truncate text-xs text-muted-foreground">
          {unit.title} · {duration} min
        </span>
      </span>
      <ChevronRight className="size-5 shrink-0 text-muted-foreground" />
    </button>
  );
}

function LearnView({
  progress,
  onStart,
  onStartVocabulary,
}: {
  progress: LearnerProgress;
  onStart: (unitId: string, lessonId?: string) => void;
  onStartVocabulary: (unitId: string) => void;
}) {
  const lessonCount = units.reduce(
    (total, unit) => total + getUnitLessons(unit.id).length,
    0,
  );
  const expressionCount = units.reduce(
    (total, unit) => total + unit.phrases.length,
    0,
  );
  return (
    <section>
      <div className="grid overflow-hidden rounded-[24px] bg-card shadow-[0_2px_10px_rgba(25,1,52,0.08)] md:grid-cols-[1.05fr_.95fr]">
        <div className="flex flex-col justify-center p-6 sm:p-8">
          <p className="text-xs font-black uppercase tracking-[0.14em] text-[#9c0040]">
            Salita path
          </p>
          <h1 className="mt-2 max-w-xl text-3xl font-black tracking-[-0.045em] sm:text-4xl">
            Speak first. Notice the pattern. Use it again.
          </h1>
          <p className="mt-4 max-w-xl text-sm leading-6 text-muted-foreground sm:text-base">
            Forty-three gradual units move from sounds and survival conversation
            through sentence structure, focus and aspect, connected speech, and
            storytelling. Each unit is split into six short lessons.
          </p>
        </div>
        <Image
          src="/og.png"
          alt="Salita speech bubbles in Flamingo pink, blue, and yellow"
          width={1200}
          height={630}
          className="h-full min-h-56 w-full object-cover object-center"
        />
      </div>

      <section
        aria-labelledby="salita-method"
        className="mt-6 rounded-[16px] border border-border bg-card p-5 sm:p-6"
      >
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.12em] text-muted-foreground">
              How Salita teaches
            </p>
            <h2 id="salita-method" className="mt-1 text-xl font-black">
              Hear it, notice it, transform it, use it.
            </h2>
          </div>
          <a
            href="https://theswissbay.ch/pdf/Books/Linguistics/Mega%20linguistics%20pack/Austronesian/Tagalog%2C%20Basic%20%28Aspillera%29.pdf"
            target="_blank"
            rel="noreferrer"
            className="inline-flex min-h-11 items-center gap-2 rounded-[5px] px-2 text-xs font-black text-[#183f7b] underline decoration-2 underline-offset-4 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            Textbook methodology <ArrowRight className="size-4" />
          </a>
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            {
              icon: Headphones,
              title: 'Hear the shape',
              body: 'Keep vowels and syllables clear. Hear a slow model, then repeat at natural speed.',
              style: 'bg-[var(--f-cyan-1)] text-[#005c83]',
            },
            {
              icon: Languages,
              title: 'Copy, then transform',
              body: 'Notice a sentence frame, swap one meaningful part, and build a new line.',
              style: 'bg-[var(--f-blue-3)] text-[#183f7b]',
            },
            {
              icon: MessageCircle,
              title: 'Answer a situation',
              body: 'Choose replies by social context—polite, neutral, casual, or common Taglish.',
              style: 'bg-[var(--f-pink-3)] text-[#9c0040]',
            },
            {
              icon: RefreshCcw,
              title: 'Return and create',
              body: 'Phrases, grammar, and sound contrasts return on separate schedules as they grow stronger.',
              style: 'bg-[var(--f-green-1)] text-[var(--f-green-4)]',
            },
          ].map(({ icon: Icon, title, body, style }) => (
            <article key={title} className="rounded-[8px] bg-muted p-4">
              <span
                className={`grid size-10 place-items-center rounded-[8px] ${style}`}
              >
                <Icon className="size-5" />
              </span>
              <h3 className="mt-4 text-sm font-black">{title}</h3>
              <p className="mt-2 text-xs leading-5 text-muted-foreground">
                {body}
              </p>
            </article>
          ))}
        </div>
        <p className="mt-4 text-xs leading-5 text-muted-foreground">
          Adapted from the textbook’s sound-first practice, controlled
          substitution, situational response, paragraph work, and cumulative
          review for shorter contemporary daily sessions.
        </p>
      </section>

      <div className="mb-4 mt-8 flex items-end justify-between gap-4">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.12em] text-muted-foreground">
            {units.length} units · {lessonCount} lessons · {expressionCount}{' '}
            core expressions
          </p>
          <h2 className="mt-1 text-2xl font-black">
            Your conversational foundation
          </h2>
        </div>
        <p className="hidden text-sm font-bold text-muted-foreground sm:block">
          Follow the unlocked path
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {units.map((unit) => {
          const current = progress.activeUnitId === unit.id;
          const lessons = getUnitLessons(unit.id);
          const completedLessonCount = lessons.filter((lesson) =>
            progress.completedLessons.includes(lesson.id),
          ).length;
          const complete = completedLessonCount === lessons.length;
          const legacyComplete =
            progress.completedUnits.includes(unit.id) && !complete;
          const unlocked = isUnitUnlocked(progress, unit);
          const vocabularyCount = introducedVocabularyCount(progress, unit);
          const duration = lessons.reduce(
            (total, lesson) => total + lesson.minutes,
            0,
          );
          const [background, color] =
            UNIT_COLORS[(unit.number - 1) % UNIT_COLORS.length];
          return (
            <article
              key={unit.id}
              className={`rounded-[16px] border bg-card p-5 ${current ? 'border-[#3174d2]' : 'border-border'} ${unlocked ? '' : 'opacity-70'}`}
            >
              <div className="flex items-start gap-4">
                <span
                  className={`grid size-12 shrink-0 place-items-center rounded-[8px] text-base font-black ${background} ${color}`}
                >
                  {complete ? (
                    <Check className="size-5" strokeWidth={3} />
                  ) : (
                    unit.number
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p lang="fil" className="text-lg font-black">
                      {unit.titleFil}
                    </p>
                    {current && (
                      <Tag className="bg-[var(--f-blue-3)] text-[#183f7b]">
                        Up next
                      </Tag>
                    )}
                    {legacyComplete && (
                      <Tag className="bg-[var(--f-yellow-1)] text-[#6a5000]">
                        Earlier progress saved
                      </Tag>
                    )}
                    {!unlocked && (
                      <Tag className="bg-muted text-muted-foreground">
                        <LockKeyhole className="size-3" /> Locked
                      </Tag>
                    )}
                  </div>
                  <p className="mt-1 text-sm font-bold text-muted-foreground">
                    {unit.title}
                  </p>
                </div>
              </div>
              <p className="mt-4 min-h-10 text-sm leading-5 text-muted-foreground">
                {unit.description}
              </p>
              <div className="mt-4">
                <div className="mb-2 flex items-center justify-between text-[11px] font-black uppercase tracking-[0.08em] text-muted-foreground">
                  <span>{completedLessonCount}/6 lessons</span>
                  <span>{getUnitVocabulary(unit.id).length} core words</span>
                </div>
                <div
                  className="grid grid-cols-6 gap-1"
                  aria-label={`${completedLessonCount} of 6 lessons completed`}
                >
                  {lessons.map((lesson) => (
                    <button
                      key={lesson.id}
                      type="button"
                      onClick={() => onStart(unit.id, lesson.id)}
                      disabled={!isLessonUnlocked(progress, unit, lesson)}
                      aria-label={`${lesson.title}${progress.completedLessons.includes(lesson.id) ? ', completed' : ''}`}
                      className="grid min-h-11 place-items-center rounded-[5px] focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-not-allowed"
                    >
                      <span
                        aria-hidden="true"
                        className={`h-2.5 w-full rounded-full ${
                          progress.completedLessons.includes(lesson.id)
                            ? 'bg-[var(--f-success-strong)]'
                            : lesson.id === progress.activeLessonId
                              ? 'bg-primary'
                              : 'bg-border'
                        }`}
                      />
                    </button>
                  ))}
                </div>
              </div>
              <div className="mt-4 flex items-center justify-between border-t border-border pt-4">
                <span className="flex items-center gap-1.5 text-xs font-bold text-muted-foreground">
                  <Clock3 className="size-4" /> {duration} min total
                </span>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onStartVocabulary(unit.id)}
                    disabled={vocabularyCount < 2}
                    className="min-h-11 rounded-[5px] font-black"
                  >
                    {vocabularyCount >= 2 ? 'Match' : 'Words locked'}
                  </Button>
                  <Button
                    onClick={() => onStart(unit.id)}
                    disabled={!unlocked}
                    className="min-h-11 rounded-[5px] bg-primary px-4 font-black text-black hover:bg-[var(--f-pink-light)]"
                  >
                    {!unlocked
                      ? 'Locked'
                      : complete
                        ? 'Review'
                        : completedLessonCount || legacyComplete
                          ? 'Continue'
                          : 'Start'}{' '}
                    <ArrowRight />
                  </Button>
                </div>
              </div>
            </article>
          );
        })}
      </div>

      <div className="mt-6 flex items-start gap-3 rounded-[8px] bg-[var(--f-blue-3)] p-4 text-[#183f7b]">
        <Info className="mt-0.5 size-5 shrink-0" />
        <p className="text-sm leading-6">
          <strong>How this course speaks:</strong> core Tagalog uses
          contemporary standard Filipino. Polite, casual, formal, and common
          Taglish forms are labeled so you know when each phrase fits. The
          register approach reflects current{' '}
          <a
            href="https://biblio.ugent.be/publication/01KNV4J2N8A7985CT1ZP2VNZWS"
            target="_blank"
            rel="noreferrer"
            className="font-black underline decoration-2 underline-offset-4"
          >
            2026 Metro Manila code-switching research
          </a>
          .
        </p>
      </div>
    </section>
  );
}

function ReviewView({
  progress,
  todayKey,
  onStartLesson,
  onStartReview,
  onStartMistakes,
  onStartVocabulary,
}: {
  progress: LearnerProgress;
  todayKey: string;
  onStartLesson: (unitId: string, lessonId?: string) => void;
  onStartReview: (unitId: string, reviewKey?: string) => void;
  onStartMistakes: () => void;
  onStartVocabulary: (unitId: string) => void;
}) {
  const reviewItems = Object.entries(progress.reviews)
    .map(([key, record]) => ({
      key,
      record,
      found: findReviewTarget(key.slice(0, key.lastIndexOf(':'))),
    }))
    .filter((item) => item.found && item.record.dueDate <= todayKey)
    .sort(
      (a, b) =>
        a.record.dueDate.localeCompare(b.record.dueDate) ||
        a.record.stage - b.record.stage,
    );
  const visibleItems = reviewItems.slice(0, 8);
  const hasPracticed = Object.keys(progress.reviews).some((key) =>
    Boolean(findReviewTarget(key.slice(0, key.lastIndexOf(':')))),
  );
  const dueMistakes = Object.values(progress.mistakes).filter(
    (record) =>
      record.state !== 'recovered' && record.nextPracticeDate <= todayKey,
  ).length;
  const laterMistakes = Object.values(progress.mistakes).filter(
    (record) =>
      record.state !== 'recovered' && record.nextPracticeDate > todayKey,
  ).length;
  const activeUnit = getUnit(progress.activeUnitId);
  const activeVocabularyCount = introducedVocabularyCount(progress, activeUnit);

  return (
    <section className="mx-auto max-w-4xl">
      <div className="mb-7">
        <p className="text-xs font-black uppercase tracking-[0.14em] text-[#9c0040]">
          Spaced review
        </p>
        <h1
          lang="fil"
          className="mt-2 text-3xl font-black tracking-[-0.045em] sm:text-4xl"
        >
          Balikan ang mahalaga.
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">
          Pronunciation, grammar, reading, listening, and speaking are scheduled
          separately. Recognizing a phrase does not automatically mark every
          language skill strong.
        </p>
      </div>

      <div className="mb-8 grid gap-4 sm:grid-cols-2">
        <article className="rounded-[16px] border border-border bg-card p-5">
          <span className="grid size-11 place-items-center rounded-[8px] bg-[#fcabb4] text-[#71000f]">
            <TriangleAlert className="size-5" />
          </span>
          <p className="mt-4 text-xs font-black uppercase tracking-[0.1em] text-muted-foreground">
            Personal repair queue
          </p>
          <h2 className="mt-1 text-xl font-black">Practice mistakes</h2>
          <p className="mt-2 text-sm leading-5 text-muted-foreground">
            {dueMistakes
              ? `${dueMistakes} item${dueMistakes === 1 ? '' : 's'} ${dueMistakes === 1 ? 'is' : 'are'} ready for clean recall now.`
              : laterMistakes
                ? `${laterMistakes} repaired item${laterMistakes === 1 ? '' : 's'} will return on a later due day.`
                : 'Missed words, forms, and listening prompts will collect here automatically.'}
          </p>
          <Button
            onClick={onStartMistakes}
            disabled={!dueMistakes}
            className="mt-5 min-h-11 rounded-[5px] bg-primary px-4 font-black text-black hover:bg-[var(--f-pink-light)]"
          >
            <RefreshCcw /> Practice mistakes
          </Button>
        </article>

        <article className="rounded-[16px] border border-border bg-card p-5">
          <span className="grid size-11 place-items-center rounded-[8px] bg-[var(--f-cyan-1)] text-[#005c83]">
            <Languages className="size-5" />
          </span>
          <p className="mt-4 text-xs font-black uppercase tracking-[0.1em] text-muted-foreground">
            Two-minute vocabulary
          </p>
          <h2 className="mt-1 text-xl font-black">Quick Match</h2>
          <p className="mt-2 text-sm leading-5 text-muted-foreground">
            {activeVocabularyCount >= 2
              ? `Match ${activeVocabularyCount} introduced Tagalog words from Unit ${activeUnit.number}. Every miss joins your repair queue.`
              : 'Finish First words & sounds in your current unit to unlock rapid matching.'}
          </p>
          <Button
            variant="outline"
            onClick={() => onStartVocabulary(activeUnit.id)}
            disabled={activeVocabularyCount < 2}
            className="mt-5 min-h-11 rounded-[5px] font-black"
          >
            <Sparkles /> Match vocabulary
          </Button>
        </article>
      </div>

      {!visibleItems.length ? (
        <div className="rounded-[24px] border border-border bg-card p-8 text-center sm:p-12">
          <span className="mx-auto grid size-16 place-items-center rounded-full bg-[var(--f-green-1)] text-[var(--f-green-4)]">
            <Sparkles className="size-7" />
          </span>
          <h2 className="mt-5 text-xl font-black">
            {dueMistakes
              ? 'Your spaced deck is caught up'
              : hasPracticed
                ? 'You’re caught up'
                : 'Your review deck is ready to grow'}
          </h2>
          <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted-foreground">
            {dueMistakes
              ? 'Your scheduled reviews are done, and mistake practice is ready above.'
              : hasPracticed
                ? 'Nothing is due right now. Your next lesson can introduce new phrases without moving future reviews ahead.'
                : 'Complete your first lesson. Salita will bring phrases back at useful intervals so they stick.'}
          </p>
          <Button
            onClick={
              dueMistakes
                ? onStartMistakes
                : () => onStartLesson(progress.activeUnitId)
            }
            className="mt-6 min-h-12 rounded-[5px] bg-primary px-5 font-black text-black hover:bg-[var(--f-pink-light)]"
          >
            {dueMistakes ? 'Practice mistakes' : 'Start today’s lesson'}{' '}
            <ArrowRight />
          </Button>
        </div>
      ) : (
        <>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-xl font-black">{reviewItems.length} due now</h2>
            <span className="text-xs font-bold text-muted-foreground">
              Weakest first
            </span>
          </div>
          <div className="space-y-3">
            {visibleItems.map((item) => {
              const found = item.found!;
              const mode = item.key.slice(
                item.key.lastIndexOf(':') + 1,
              ) as SkillMode;
              const ModeIcon =
                mode === 'listening'
                  ? Headphones
                  : mode === 'speaking'
                    ? Mic
                    : mode === 'grammar'
                      ? Languages
                      : mode === 'pronunciation'
                        ? Volume2
                        : BookOpen;
              return (
                <button
                  key={item.key}
                  onClick={() => onStartReview(found.unit.id, item.key)}
                  className="flex w-full items-center gap-4 rounded-[8px] border border-border bg-card p-4 text-left hover:shadow-[0_2px_10px_rgba(25,1,52,0.08)] focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring"
                >
                  <span className="grid size-11 shrink-0 place-items-center rounded-[8px] bg-[var(--f-blue-3)] text-[#183f7b]">
                    <ModeIcon className="size-5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span lang="fil" className="block font-black">
                      {found.fil}
                    </span>
                    <span className="mt-1 block truncate text-xs text-muted-foreground">
                      {found.en}
                    </span>
                  </span>
                  <span className="text-right text-[11px] font-bold text-muted-foreground">
                    {mode}
                    <br />
                    stage {item.record.stage}/6
                  </span>
                </button>
              );
            })}
          </div>
        </>
      )}
    </section>
  );
}

function ProgressView({
  progress,
  todayKey,
  syncStatus,
  accountEmail,
  updatedAt,
  onExport,
  onImport,
  onClearDevice,
  onDeleteEverywhere,
}: {
  progress: LearnerProgress;
  todayKey: string;
  syncStatus: ReturnType<typeof useSyncedProgress>['status'];
  accountEmail: string | null;
  updatedAt: string | null;
  onExport: () => void;
  onImport: ReturnType<typeof useSyncedProgress>['importBackup'];
  onClearDevice: () => void;
  onDeleteEverywhere: () => void;
}) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [pendingImport, setPendingImport] = useState<unknown>(null);
  const [importStatus, setImportStatus] = useState('');
  const [isInstalledApp, setIsInstalledApp] = useState(false);
  const { current, best } = deriveStreaks(progress.completedDays, todayKey);
  const calendarDays = Array.from({ length: 35 }, (_, index) =>
    addCalendarDays(todayKey, index - 34),
  );
  const completed = new Set(progress.completedDays);
  const strong = Object.values(progress.reviews).filter(
    (record) => record.stage >= 4,
  ).length;
  const introduced = Object.keys(progress.reviews).length;

  useEffect(() => {
    const displayMode = window.matchMedia('(display-mode: standalone)');
    const updateInstalledState = () => {
      const navigatorWithStandalone = navigator as Navigator & {
        standalone?: boolean;
      };
      setIsInstalledApp(
        displayMode.matches || navigatorWithStandalone.standalone === true,
      );
    };
    const handleInstalled = () => setIsInstalledApp(true);
    updateInstalledState();
    displayMode.addEventListener('change', updateInstalledState);
    window.addEventListener('appinstalled', handleInstalled);
    return () => {
      displayMode.removeEventListener('change', updateInstalledState);
      window.removeEventListener('appinstalled', handleInstalled);
    };
  }, []);

  const readBackup = async (file: File | undefined) => {
    if (!file) return;
    setImportStatus('');
    try {
      setPendingImport(JSON.parse(await file.text()) as unknown);
    } catch {
      setImportStatus(
        'That file is not valid JSON. Your progress was not changed.',
      );
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const finishImport = async (mode: 'merge' | 'replace') => {
    const result = await onImport(pendingImport, mode);
    if (result.ok) {
      setPendingImport(null);
      setImportStatus('Backup imported successfully.');
    } else {
      setImportStatus(
        result.reason === 'invalid'
          ? 'That file is not a valid Salita progress backup.'
          : 'Import is unavailable right now. Your progress was not changed.',
      );
    }
  };

  return (
    <section>
      <div className="mb-7">
        <p className="text-xs font-black uppercase tracking-[0.14em] text-[#9c0040]">
          Your progress
        </p>
        <h1 className="mt-2 text-3xl font-black tracking-[-0.045em] sm:text-4xl">
          Maliit na hakbang, araw-araw.
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">
          See the skills you are building—without pretending that XP alone
          equals fluency.
        </p>
      </div>

      <IPhoneInstallCard installed={isInstalledApp} />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          {
            label: 'Current streak',
            value: `${current}`,
            suffix: current === 1 ? 'day' : 'days',
            icon: Flame,
            style: 'bg-[var(--f-yellow-1)] text-[#5c4a00]',
          },
          {
            label: 'Best streak',
            value: `${best}`,
            suffix: best === 1 ? 'day' : 'days',
            icon: Star,
            style: 'bg-[var(--f-pink-3)] text-[#9c0040]',
          },
          {
            label: 'Sessions',
            value: `${progress.totalSessions}`,
            suffix: 'finished',
            icon: CheckCircle2,
            style: 'bg-[var(--f-green-1)] text-[var(--f-green-4)]',
          },
          {
            label: 'Total XP',
            value: `${progress.xp}`,
            suffix: 'earned',
            icon: Sparkles,
            style: 'bg-[var(--f-blue-3)] text-[#183f7b]',
          },
        ].map((item) => (
          <div
            key={item.label}
            className="rounded-[16px] border border-border bg-card p-5"
          >
            <span
              className={`grid size-10 place-items-center rounded-[8px] ${item.style}`}
            >
              <item.icon className="size-5" />
            </span>
            <p className="mt-5 text-xs font-black uppercase tracking-[0.1em] text-muted-foreground">
              {item.label}
            </p>
            <p className="mt-1 text-3xl font-black tracking-[-0.04em]">
              {item.value}{' '}
              <span className="text-sm font-bold text-muted-foreground">
                {item.suffix}
              </span>
            </p>
          </div>
        ))}
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1.05fr_.95fr]">
        <section className="rounded-[16px] border border-border bg-card p-5 sm:p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.12em] text-muted-foreground">
                Last 5 weeks
              </p>
              <h2 className="mt-1 text-xl font-black">Practice calendar</h2>
            </div>
            <CalendarDays className="size-5 text-[#183f7b]" />
          </div>
          <div
            className="mt-6 grid grid-cols-7 gap-2"
            aria-label="Practice days in the last five weeks"
          >
            {calendarDays.map((day) => {
              const done = completed.has(day);
              return (
                <time
                  key={day}
                  dateTime={day}
                  title={`${friendlyDate(day)}: ${done ? 'lesson complete' : 'no lesson'}`}
                  aria-label={`${friendlyDate(day)}: ${done ? 'lesson complete' : 'no lesson'}`}
                  className={`aspect-square rounded-[5px] border ${
                    done
                      ? 'border-[var(--f-success-strong)] bg-[var(--f-success-strong)]'
                      : day === todayKey
                        ? 'border-primary bg-[var(--f-pink-3)]'
                        : 'border-border bg-muted'
                  }`}
                />
              );
            })}
          </div>
          <div className="mt-4 flex items-center gap-4 text-xs font-bold text-muted-foreground">
            <span className="flex items-center gap-2">
              <i className="size-3 rounded-[2px] bg-[var(--f-success-strong)]" />{' '}
              Practiced
            </span>
            <span className="flex items-center gap-2">
              <i className="size-3 rounded-[2px] border border-primary bg-[var(--f-pink-3)]" />{' '}
              Today
            </span>
          </div>
        </section>

        <section className="rounded-[16px] border border-border bg-card p-5 sm:p-6">
          <p className="text-xs font-black uppercase tracking-[0.12em] text-muted-foreground">
            Skill strength
          </p>
          <h2 className="mt-1 text-xl font-black">Five distinct abilities</h2>
          <div className="mt-6 space-y-5">
            {(
              [
                ['Listening', 'listening', Headphones, 'bg-[var(--f-cyan-4)]'],
                [
                  'Reading',
                  'reading',
                  BookOpen,
                  'bg-[var(--f-success-strong)]',
                ],
                ['Speaking', 'speaking', Mic, 'bg-primary'],
                ['Grammar', 'grammar', Languages, 'bg-[var(--f-yellow-4)]'],
                [
                  'Sound & stress',
                  'pronunciation',
                  Volume2,
                  'bg-[var(--f-blue-4)]',
                ],
              ] as const
            ).map(([label, mode, Icon, fill]) => {
              const strength = skillStrength(progress, mode);
              const fillClass =
                fill === 'bg-[var(--f-cyan-4)]'
                  ? '[&_[data-slot=progress-indicator]]:bg-[var(--f-cyan-4)]'
                  : fill === 'bg-[var(--f-success-strong)]'
                    ? '[&_[data-slot=progress-indicator]]:bg-[var(--f-success-strong)]'
                    : fill === 'bg-[var(--f-yellow-4)]'
                      ? '[&_[data-slot=progress-indicator]]:bg-[var(--f-yellow-4)]'
                      : fill === 'bg-[var(--f-blue-4)]'
                        ? '[&_[data-slot=progress-indicator]]:bg-[var(--f-blue-4)]'
                        : '[&_[data-slot=progress-indicator]]:bg-primary';
              return (
                <div key={mode}>
                  <div className="mb-2 flex items-center justify-between text-sm">
                    <span className="flex items-center gap-2 font-black">
                      <Icon className="size-4" /> {label}
                    </span>
                    <span className="font-bold text-muted-foreground">
                      {strength}%
                    </span>
                  </div>
                  <Progress
                    value={strength}
                    aria-label={`${label} strength: ${strength}%`}
                    className={`[&_[data-slot=progress-track]]:h-2 ${fillClass}`}
                  />
                </div>
              );
            })}
          </div>
          <p className="mt-5 text-[11px] leading-5 text-muted-foreground">
            Sound strength reflects listening and form checks.
            Record-and-compare practice is private and is not presented as an
            automated accent score.
          </p>
          <div className="mt-6 grid grid-cols-2 gap-3 border-t border-border pt-5">
            <div>
              <p className="text-2xl font-black">{introduced}</p>
              <p className="text-xs text-muted-foreground">skills introduced</p>
            </div>
            <div>
              <p className="text-2xl font-black">{strong}</p>
              <p className="text-xs text-muted-foreground">skills strong</p>
            </div>
          </div>
        </section>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <section className="rounded-[16px] border border-border bg-card p-5 sm:p-6">
          <p className="text-xs font-black uppercase tracking-[0.12em] text-muted-foreground">
            Accuracy
          </p>
          <h2 className="mt-1 text-xl font-black">
            First tries, last 30 sessions
          </h2>
          <p className="mt-4 text-4xl font-black tracking-[-0.04em]">
            {firstTryAccuracy(progress)}%
          </p>
          <p className="mt-2 text-xs leading-5 text-muted-foreground">
            Retries help you learn, but they do not inflate this number.
          </p>
        </section>
        <section className="rounded-[16px] border border-border bg-card p-5 sm:p-6">
          <p className="text-xs font-black uppercase tracking-[0.12em] text-muted-foreground">
            Your data
          </p>
          <h2 className="mt-1 text-xl font-black">
            {accountEmail ? 'Synced to your account' : 'Stored on this device'}
          </h2>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            {accountEmail
              ? `${accountEmail} · ${syncStatus === 'saving' ? 'saving now' : syncStatus === 'saved' ? 'saved' : 'changes queued on this device'}.`
              : 'Sign in through the published app to sync. Export a portable backup anytime.'}
            {updatedAt
              ? ` Last cloud update ${new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(updatedAt))}.`
              : ''}
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <Button
              variant="outline"
              onClick={onExport}
              className="min-h-11 rounded-[5px] font-black"
            >
              <Download /> Export progress
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/json,.json"
              className="sr-only"
              onChange={(event) => void readBackup(event.target.files?.[0])}
            />
            <Button
              variant="outline"
              onClick={() => fileInputRef.current?.click()}
              className="min-h-11 rounded-[5px] font-black"
            >
              <Upload /> Import backup
            </Button>
            <Button
              variant="outline"
              onClick={onClearDevice}
              className="min-h-11 rounded-[5px] font-black"
            >
              <Smartphone /> Clear this device
            </Button>
            {accountEmail && (
              <Button
                variant="destructive"
                onClick={onDeleteEverywhere}
                className="min-h-11 rounded-[5px] font-black"
              >
                <Trash2 /> Delete everywhere
              </Button>
            )}
          </div>
          {pendingImport !== null && (
            <div className="mt-4 rounded-[8px] bg-[var(--f-yellow-1)] p-4 text-sm text-[#5c4a00]">
              <p className="font-black">
                How should Salita import this backup?
              </p>
              <p className="mt-1 leading-5">
                Merge preserves both histories where possible. Replace starts
                from the backup and archives the current generation.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  onClick={() => void finishImport('merge')}
                  className="min-h-10 rounded-[5px] bg-white font-black"
                >
                  Merge
                </Button>
                <Button
                  variant="destructive"
                  onClick={() => void finishImport('replace')}
                  className="min-h-10 rounded-[5px] font-black"
                >
                  Replace
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => setPendingImport(null)}
                  className="min-h-10 rounded-[5px] font-black"
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}
          {importStatus && (
            <p className="mt-4 text-sm font-bold" aria-live="polite">
              {importStatus}
            </p>
          )}
        </section>
      </div>
    </section>
  );
}

function IPhoneInstallCard({ installed }: { installed: boolean }) {
  return (
    <section className="mb-6 rounded-[16px] border border-border bg-card p-5 sm:p-6">
      <div className="flex items-start gap-4">
        <span className="grid size-11 shrink-0 place-items-center rounded-[8px] bg-[var(--f-blue-3)] text-[#183f7b]">
          {installed ? (
            <CheckCircle2 className="size-5" />
          ) : (
            <Smartphone className="size-5" />
          )}
        </span>
        <div>
          <p className="text-xs font-black uppercase tracking-[0.12em] text-muted-foreground">
            iPhone app
          </p>
          <h2 className="mt-1 text-xl font-black">
            {installed
              ? 'Installed on this device'
              : 'Add Salita to Home Screen'}
          </h2>
          {installed ? (
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              You are using the installed web app. Keep signing in with the same
              account on iPhone and desktop so progress stays together.
            </p>
          ) : (
            <ol className="mt-3 list-decimal space-y-1 pl-5 text-sm leading-6 text-muted-foreground">
              <li>Open this published Salita link in Safari.</li>
              <li>Tap Share, or tap More (…) and then Share.</li>
              <li>Choose “Add to Home Screen.”</li>
              <li>Turn on “Open as Web App,” then tap Add.</li>
            </ol>
          )}
          <div className="mt-4 flex items-start gap-2 text-xs font-black leading-5 text-[#183f7b]">
            <Cloud className="mt-0.5 size-4 shrink-0" />
            <span>
              Account sync carries desktop work to iPhone and back. Allow
              microphone access when your first speaking exercise asks.
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}

function VocabularyMatchGame({
  unit,
  progress,
  sessionId,
  onAttempt,
  onExit,
  onFinish,
}: {
  unit: Unit;
  progress: LearnerProgress;
  sessionId: string;
  onAttempt: (
    sessionId: string,
    reviewKey: string,
    outcome: AttemptOutcome,
  ) => number;
  onExit: () => void;
  onFinish: (summary: {
    xp: number;
    firstTryCorrect: number;
    prompts: number;
    minutes: number;
    modes: SkillMode[];
    kind: ActivityKind;
  }) => void;
}) {
  const words = useMemo(
    () =>
      getUnitVocabulary(unit.id).slice(
        0,
        introducedVocabularyCount(progress, unit),
      ),
    [progress, unit],
  );
  const filipinoOrder = useMemo(
    () => seededShuffle(words, `${sessionId}:fil`),
    [sessionId, words],
  );
  const englishOrder = useMemo(() => {
    const shuffled = seededShuffle(words, `${sessionId}:en`);
    if (shuffled.length < 2) return shuffled;
    for (let shift = 0; shift < shuffled.length; shift += 1) {
      const rotated = [...shuffled.slice(shift), ...shuffled.slice(0, shift)];
      if (rotated.every((word, index) => word.id !== filipinoOrder[index]?.id))
        return rotated;
    }
    return [...shuffled.slice(1), shuffled[0]];
  }, [filipinoOrder, sessionId, words]);
  const [selectedFil, setSelectedFil] = useState('');
  const [selectedEn, setSelectedEn] = useState('');
  const [matched, setMatched] = useState<Set<string>>(new Set());
  const [missed, setMissed] = useState<Set<string>>(new Set());
  const [firstTryCorrect, setFirstTryCorrect] = useState(0);
  const [sessionXp, setSessionXp] = useState(0);
  const [status, setStatus] = useState(
    'Choose one Tagalog word and one English meaning.',
  );
  const startedAtRef = useRef(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const matchedRef = useRef(new Set<string>());
  const matchingLockRef = useRef(new Set<string>());
  const finishedRef = useRef(false);
  const filipinoButtonRefs = useRef(new Map<string, HTMLButtonElement>());
  const completionHeadingRef = useRef<HTMLHeadingElement | null>(null);

  useEffect(() => {
    startedAtRef.current = Date.now();
  }, []);

  const evaluatePair = (filId: string, enId: string) => {
    const word = words.find((candidate) => candidate.id === filId);
    if (
      !word ||
      matchedRef.current.has(word.id) ||
      matchingLockRef.current.has(word.id)
    )
      return;
    matchingLockRef.current.add(word.id);
    const reviewKey = `${unit.id}-vocab-${word.id}:reading`;
    if (word.id === enId) {
      const wasMissed = missed.has(word.id);
      const points = onAttempt(
        sessionId,
        reviewKey,
        wasMissed ? 'retry-correct' : 'first-correct',
      );
      setSessionXp((value) => value + points);
      if (!wasMissed) setFirstTryCorrect((value) => value + 1);
      matchedRef.current.add(word.id);
      setMatched((current) => new Set(current).add(word.id));
      const remaining = words.length - matchedRef.current.size;
      setStatus(
        `Tama — “${word.fil}” means “${word.en}.” ${remaining ? `${remaining} pair${remaining === 1 ? '' : 's'} remaining.` : 'Round complete.'}`,
      );
      const nextWord = filipinoOrder.find(
        (candidate) => !matchedRef.current.has(candidate.id),
      );
      if (nextWord) {
        window.setTimeout(
          () => filipinoButtonRefs.current.get(nextWord.id)?.focus(),
          0,
        );
      }
      if (matchedRef.current.size === words.length && !finishedRef.current) {
        finishedRef.current = true;
        onFinish({
          xp: sessionXp + points,
          firstTryCorrect: firstTryCorrect + (wasMissed ? 0 : 1),
          prompts: words.length,
          minutes: elapsedMinutesSince(startedAtRef.current),
          modes: ['reading'],
          kind: 'vocab-match',
        });
      }
    } else {
      onAttempt(sessionId, reviewKey, 'wrong');
      setMissed((current) => new Set(current).add(word.id));
      setStatus('Not a match yet. Both cards are still available—try again.');
      window.setTimeout(() => {
        matchingLockRef.current.delete(word.id);
        filipinoButtonRefs.current.get(word.id)?.focus();
      }, 0);
    }
    setSelectedFil('');
    setSelectedEn('');
  };

  const selectFilipino = (wordId: string) => {
    if (selectedEn) evaluatePair(wordId, selectedEn);
    else setSelectedFil(wordId);
  };

  const selectEnglish = (wordId: string) => {
    if (selectedFil) evaluatePair(selectedFil, wordId);
    else setSelectedEn(wordId);
  };

  const complete = words.length > 0 && matched.size === words.length;

  useEffect(() => {
    if (!complete) return;
    const timeout = window.setTimeout(
      () => completionHeadingRef.current?.focus(),
      0,
    );
    return () => window.clearTimeout(timeout);
  }, [complete]);

  useEffect(
    () => () => {
      audioRef.current?.pause();
    },
    [],
  );

  const playWord = (word: VocabularyItem) => {
    audioRef.current?.pause();
    const query = new URLSearchParams({ text: word.fil, speed: 'normal' });
    const audio = new Audio(`/api/speech?${query}`);
    audioRef.current = audio;
    setStatus(`Playing “${word.fil}”…`);
    audio.onended = () => setStatus(`Now match “${word.fil}.”`);
    audio.onerror = () =>
      setStatus(
        'Audio is temporarily unavailable. You can keep matching by text.',
      );
    void audio
      .play()
      .catch(() =>
        setStatus(
          'Tap the speaker once more if your iPhone paused audio playback.',
        ),
      );
  };

  if (complete) {
    return (
      <main className="grid min-h-dvh place-items-center bg-background px-5 py-10 text-foreground">
        <section className="w-full max-w-xl rounded-[24px] border border-border bg-card p-7 text-center shadow-[0_4px_20px_rgba(25,1,52,0.14)] sm:p-10">
          <span className="mx-auto grid size-16 place-items-center rounded-full bg-[var(--f-green-1)] text-[var(--f-green-4)]">
            <CheckCircle2 className="size-7" />
          </span>
          <p className="mt-5 text-xs font-black uppercase tracking-[0.14em] text-[#9c0040]">
            Quick Match
          </p>
          <h1
            ref={completionHeadingRef}
            tabIndex={-1}
            className="mt-2 text-3xl font-black focus:outline-none"
          >
            All {words.length} pairs matched
          </h1>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            Missed pairs are now in Practice mistakes, so they will return
            instead of disappearing after this round.
          </p>
          <div className="mt-6 grid grid-cols-3 gap-3">
            <SummaryStat value={`+${sessionXp}`} label="XP" />
            <SummaryStat
              value={`${firstTryCorrect}/${words.length}`}
              label="first try"
            />
            <SummaryStat value={`${missed.size}`} label="to repair" />
          </div>
          <Button
            onClick={onExit}
            className="mt-7 min-h-12 w-full rounded-[5px] bg-primary font-black text-black hover:bg-[var(--f-pink-light)]"
          >
            Done <ArrowRight />
          </Button>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-dvh bg-background text-foreground">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex min-h-18 max-w-4xl items-center gap-4 px-5 py-3">
          <Button
            variant="ghost"
            size="icon-lg"
            onClick={onExit}
            className="size-11 rounded-full"
            aria-label="Exit vocabulary match"
          >
            <X className="size-5" />
          </Button>
          <div className="flex-1">
            <p className="text-xs font-black uppercase tracking-[0.12em] text-[#9c0040]">
              Unit {unit.number} · Quick Match
            </p>
            <p className="mt-0.5 font-black">{unit.title}</p>
          </div>
          <span className="text-sm font-black text-muted-foreground">
            {matched.size}/{words.length}
          </span>
        </div>
      </header>
      <div className="mx-auto max-w-4xl px-5 py-8 sm:py-10">
        <h1 className="text-2xl font-black tracking-[-0.035em] sm:text-3xl">
          Match each word to its meaning.
        </h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          Tap a speaker for Filipino audio. Tap-select works with touch,
          keyboard, and assistive technology—no dragging required.
        </p>
        <div className="mt-8 grid grid-cols-2 gap-4 sm:gap-8">
          <fieldset className="space-y-3">
            <legend className="sr-only">Tagalog words</legend>
            {filipinoOrder.map((word) => {
              const done = matched.has(word.id);
              return (
                <div
                  key={word.id}
                  className={`flex min-h-16 items-stretch overflow-hidden rounded-[8px] border ${
                    done
                      ? 'border-[var(--f-success-strong)] bg-[var(--f-green-1)] opacity-55'
                      : selectedFil === word.id
                        ? 'border-[#3174d2] bg-[var(--f-blue-3)]'
                        : 'border-border bg-card'
                  }`}
                >
                  <button
                    type="button"
                    ref={(node) => {
                      if (node) filipinoButtonRefs.current.set(word.id, node);
                      else filipinoButtonRefs.current.delete(word.id);
                    }}
                    disabled={done}
                    onClick={() => selectFilipino(word.id)}
                    aria-pressed={selectedFil === word.id}
                    className="min-w-0 flex-1 px-3 text-left text-sm font-black focus-visible:outline-3 focus-visible:outline-offset-[-3px] focus-visible:outline-ring sm:text-base"
                  >
                    <span lang="fil">{word.fil}</span>
                  </button>
                  <button
                    type="button"
                    disabled={done}
                    onClick={() => playWord(word)}
                    className="grid w-11 shrink-0 place-items-center border-l border-current/10 focus-visible:outline-3 focus-visible:outline-offset-[-3px] focus-visible:outline-ring"
                  >
                    <span className="sr-only">Hear </span>
                    <span lang="fil" className="sr-only">
                      {word.fil}
                    </span>
                    <Volume2 className="size-4" aria-hidden="true" />
                  </button>
                </div>
              );
            })}
          </fieldset>
          <fieldset className="space-y-3">
            <legend className="sr-only">English meanings</legend>
            {englishOrder.map((word) => {
              const done = matched.has(word.id);
              return (
                <button
                  key={word.id}
                  type="button"
                  disabled={done}
                  onClick={() => selectEnglish(word.id)}
                  aria-pressed={selectedEn === word.id}
                  aria-label={`${word.en}${done ? ', matched' : ''}`}
                  className={`min-h-16 w-full rounded-[8px] border px-3 text-left text-sm font-black focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring sm:text-base ${
                    done
                      ? 'border-[var(--f-success-strong)] bg-[var(--f-green-1)] opacity-55'
                      : selectedEn === word.id
                        ? 'border-[#3174d2] bg-[var(--f-blue-3)]'
                        : 'border-border bg-card'
                  }`}
                >
                  {word.en}
                </button>
              );
            })}
          </fieldset>
        </div>
        <output
          aria-live="polite"
          className="mt-6 block rounded-[8px] bg-muted p-4 text-sm font-bold"
        >
          {status}
        </output>
        <p className="mt-3 text-xs text-muted-foreground">
          Matching {words.length} words already introduced in this unit.
        </p>
      </div>
    </main>
  );
}

function LessonExperience({
  unit,
  lesson,
  sessionId,
  reviewMode,
  mistakesMode,
  replayMode,
  priorityReviewKey,
  progress,
  onReviewAttempt,
  onExit,
  onFinish,
  onNext,
}: {
  unit: Unit;
  lesson: CourseLesson;
  sessionId: string;
  reviewMode: boolean;
  mistakesMode: boolean;
  replayMode: boolean;
  priorityReviewKey?: string;
  progress: LearnerProgress;
  onReviewAttempt: (
    sessionId: string,
    reviewKey: string,
    outcome: AttemptOutcome,
  ) => number;
  onExit: () => void;
  onFinish: (
    unit: Unit,
    lesson: CourseLesson,
    sessionId: string,
    summary: {
      xp: number;
      firstTryCorrect: number;
      prompts: number;
      minutes: number;
      modes: SkillMode[];
      kind: ActivityKind;
      sourceUnitIds?: string[];
    },
  ) => void;
  onNext: (unitId: string, lessonId: string) => void;
}) {
  const [initialExercises] = useState<Exercise[]>(() =>
    reviewMode
      ? buildReviewLesson(unit, progress, false, priorityReviewKey)
      : mistakesMode
        ? buildReviewLesson(unit, progress, true)
        : buildLesson(unit, lesson),
  );
  const [queue, setQueue] = useState<Exercise[]>(initialExercises);
  const [index, setIndex] = useState(0);
  const [selected, setSelected] = useState('');
  const [typed, setTyped] = useState('');
  const [chosenTiles, setChosenTiles] = useState<number[]>([]);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [sessionXp, setSessionXp] = useState(0);
  const [firstTryCorrect, setFirstTryCorrect] = useState(0);
  const [missed, setMissed] = useState<Set<string>>(new Set());
  const [complete, setComplete] = useState(false);
  const [voiceStatus, setVoiceStatus] = useState('');
  const [showTranscript, setShowTranscript] = useState(false);
  const hintUsedRef = useRef(false);
  const [recording, setRecording] = useState(false);
  const [recordingPending, setRecordingPending] = useState(false);
  const [speechFallbackChosen, setSpeechFallbackChosen] = useState(false);
  const [recordedUrl, setRecordedUrl] = useState('');
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recordingRequestIdRef = useRef(0);
  const recordingPendingRef = useRef(false);
  const recordingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const modelAudioRef = useRef<HTMLAudioElement | null>(null);
  const speechRequestRef = useRef<AbortController | null>(null);
  const playbackIdRef = useRef(0);
  const startedAtRef = useRef(0);
  const answerSubmissionRef = useRef(false);
  const continueSubmissionRef = useRef(false);
  const lessonFinishedRef = useRef(false);
  const stopPlaybackAndRecordingForMic = useCallback(() => {
    recordingRequestIdRef.current += 1;
    recordingPendingRef.current = false;
    if (recordingTimeoutRef.current) clearTimeout(recordingTimeoutRef.current);
    recordingTimeoutRef.current = null;
    playbackIdRef.current += 1;
    speechRequestRef.current?.abort();
    speechRequestRef.current = null;
    modelAudioRef.current?.pause();
    modelAudioRef.current = null;
    window.speechSynthesis?.cancel();
    const recorder = recorderRef.current;
    if (recorder) {
      recorder.ondataavailable = null;
      recorder.onstop = null;
      recorder.onerror = null;
      if (recorder.state !== 'inactive') {
        try {
          recorder.stop();
        } catch {
          // The media tracks below still release the microphone.
        }
      }
    }
    recorderRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setRecording(false);
    setRecordingPending(false);
    setRecordedUrl((current) => {
      if (current) URL.revokeObjectURL(current);
      return '';
    });
    setVoiceStatus('');
  }, []);
  const speechCoach = useSpeechAssessment({
    onBeforeStart: stopPlaybackAndRecordingForMic,
  });
  const exercise = queue[index];
  const totalScoredPrompts = Math.max(
    1,
    initialExercises.filter((item) => item.kind !== 'vocabulary').length,
  );

  useEffect(() => {
    startedAtRef.current = Date.now();
    return () => {
      recordingRequestIdRef.current += 1;
      recordingPendingRef.current = false;
      if (recordingTimeoutRef.current)
        clearTimeout(recordingTimeoutRef.current);
      recordingTimeoutRef.current = null;
      const recorder = recorderRef.current;
      if (recorder) {
        recorder.ondataavailable = null;
        recorder.onstop = null;
        recorder.onerror = null;
        if (recorder.state !== 'inactive') {
          try {
            recorder.stop();
          } catch {
            // The stream is stopped below even if the recorder changed state.
          }
        }
      }
      streamRef.current?.getTracks().forEach((track) => track.stop());
      speechRequestRef.current?.abort();
      modelAudioRef.current?.pause();
      window.speechSynthesis?.cancel();
    };
  }, []);

  useEffect(() => {
    return () => {
      if (recordedUrl) URL.revokeObjectURL(recordedUrl);
    };
  }, [recordedUrl]);

  const resetPromptState = () => {
    answerSubmissionRef.current = false;
    continueSubmissionRef.current = false;
    setSelected('');
    setTyped('');
    setChosenTiles([]);
    setFeedback(null);
    setVoiceStatus('');
    setShowTranscript(false);
    speechCoach.reset();
    hintUsedRef.current = false;
    if (recordedUrl) URL.revokeObjectURL(recordedUrl);
    setRecordedUrl('');
    setRecording(false);
    setRecordingPending(false);
    setSpeechFallbackChosen(false);
    recordingRequestIdRef.current += 1;
    recordingPendingRef.current = false;
    if (recordingTimeoutRef.current) clearTimeout(recordingTimeoutRef.current);
    recordingTimeoutRef.current = null;
    playbackIdRef.current += 1;
    speechRequestRef.current?.abort();
    speechRequestRef.current = null;
    modelAudioRef.current?.pause();
    modelAudioRef.current = null;
    window.speechSynthesis?.cancel();
    const recorder = recorderRef.current;
    if (recorder) {
      recorder.ondataavailable = null;
      recorder.onstop = null;
      recorder.onerror = null;
      if (recorder.state !== 'inactive') {
        try {
          recorder.stop();
        } catch {
          // Stopping the media tracks below is the final fallback.
        }
      }
    }
    recorderRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  };

  const shuffledTiles = useMemo(() => {
    if (!exercise || exercise.kind !== 'arrange') return [];
    const tokens = exercise.tagalog.split(/\s+/);
    const tiles = tokens.map((token, tileIndex) => ({ token, tileIndex }));
    if (tiles.length < 2) return tiles;
    const shift = (unit.number % (tiles.length - 1)) + 1;
    return [...tiles.slice(shift), ...tiles.slice(0, shift)];
  }, [exercise, unit.number]);

  const arrangedAnswer = chosenTiles
    .map(
      (tileIndex) =>
        shuffledTiles.find((tile) => tile.tileIndex === tileIndex)?.token ?? '',
    )
    .join(' ');

  const toggleHint = () => {
    hintUsedRef.current = true;
    setShowTranscript((value) => !value);
  };

  const revealTranscriptWithSupport = () => {
    hintUsedRef.current = true;
    setShowTranscript(true);
  };

  const playDeviceVoice = (text: string, slow: boolean) => {
    if (!('speechSynthesis' in window)) {
      return false;
    }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    const voices = window.speechSynthesis.getVoices();
    const filipinoVoice =
      voices.find((voice) => /^fil(-|_)/i.test(voice.lang)) ??
      voices.find((voice) => /^tl(-|_)/i.test(voice.lang));
    if (!filipinoVoice) return false;
    utterance.voice = filipinoVoice;
    utterance.lang = filipinoVoice.lang;
    utterance.rate = slow ? 0.68 : 0.86;
    utterance.onstart = () =>
      setVoiceStatus(slow ? 'Playing slowly…' : 'Playing device voice…');
    utterance.onend = () =>
      setVoiceStatus(
        'Ready to replay. Device voice is a practice aid, not a pronunciation score.',
      );
    utterance.onerror = () => {
      setVoiceStatus('The device voice could not play. Please try again.');
    };
    window.speechSynthesis.speak(utterance);
    return true;
  };

  const playPhrase = async (text: string, slow = false) => {
    if (speechCoach.busy || recording || recordingPending) return;
    const playbackId = playbackIdRef.current + 1;
    playbackIdRef.current = playbackId;
    speechRequestRef.current?.abort();
    modelAudioRef.current?.pause();
    window.speechSynthesis?.cancel();

    const revealIfNeeded = () => {
      if (exercise.kind === 'listening' && !showTranscript) {
        revealTranscriptWithSupport();
      }
    };
    const fallBackToDeviceVoice = () => {
      if (playDeviceVoice(text, slow)) return;
      setVoiceStatus(
        'Filipino audio is temporarily unavailable. The transcript is available and your lesson can continue.',
      );
      revealIfNeeded();
    };
    setVoiceStatus('Loading the Filipino neural voice…');
    const query = new URLSearchParams({
      text,
      speed: slow ? 'slow' : 'normal',
    });
    const audio = new Audio(`/api/speech?${query}`);
    audio.preload = 'auto';
    modelAudioRef.current = audio;
    audio.onplay = () => {
      if (playbackId === playbackIdRef.current) {
        setVoiceStatus(
          slow
            ? 'Playing the Filipino neural voice slowly…'
            : 'Playing the Filipino neural voice…',
        );
      }
    };
    audio.onended = () => {
      if (playbackId === playbackIdRef.current) {
        setVoiceStatus(
          'Ready to replay. Tap any underlined Tagalog word to hear it.',
        );
      }
    };
    audio.onerror = () => {
      if (playbackId === playbackIdRef.current) fallBackToDeviceVoice();
    };
    try {
      await audio.play();
    } catch {
      if (playbackId === playbackIdRef.current) {
        setVoiceStatus('Tap the word or phrase once more to start audio.');
      }
    }
  };

  const playWord = (word: string) => {
    return playPhrase(word);
  };

  const toggleRecording = async () => {
    if (speechCoach.busy || recordingPendingRef.current) return;
    if (recording) {
      const recorder = recorderRef.current;
      if (!recorder || recorder.state === 'inactive') {
        setRecording(false);
        recorderRef.current = null;
        streamRef.current?.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
        setVoiceStatus(
          'Recording stopped. Start a new recording to try again.',
        );
        return;
      }
      try {
        recorder.stop();
      } catch {
        recorderRef.current = null;
        streamRef.current?.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
        setVoiceStatus(
          'Recording stopped unexpectedly. Start a new recording to try again.',
        );
      }
      setRecording(false);
      return;
    }
    if (
      !navigator.mediaDevices?.getUserMedia ||
      typeof MediaRecorder === 'undefined'
    ) {
      setVoiceStatus(
        'Recording is unavailable. You can still practice aloud and self-check.',
      );
      return;
    }
    if (!window.isSecureContext) {
      setVoiceStatus(
        'Recording needs a secure HTTPS connection. Open the published Salita site to use the microphone.',
      );
      return;
    }
    recordingRequestIdRef.current += 1;
    const recordingRequestId = recordingRequestIdRef.current;
    recordingPendingRef.current = true;
    playbackIdRef.current += 1;
    speechRequestRef.current?.abort();
    speechRequestRef.current = null;
    modelAudioRef.current?.pause();
    modelAudioRef.current = null;
    window.speechSynthesis?.cancel();
    setRecordedUrl((current) => {
      if (current) URL.revokeObjectURL(current);
      return '';
    });
    setRecordingPending(true);
    setVoiceStatus('Waiting for microphone permission…');
    let permissionTimeout: ReturnType<typeof setTimeout> | null = null;
    let permissionTimedOut = false;
    try {
      const mediaRequest = navigator.mediaDevices.getUserMedia({
        audio: {
          autoGainControl: true,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
        },
      });
      void mediaRequest.then((lateStream) => {
        if (
          permissionTimedOut ||
          recordingRequestId !== recordingRequestIdRef.current
        ) {
          lateStream.getTracks().forEach((track) => track.stop());
        }
      });
      const stream = await Promise.race([
        mediaRequest,
        new Promise<never>((_, reject) => {
          permissionTimeout = setTimeout(() => {
            permissionTimedOut = true;
            reject(new DOMException('Permission timed out.', 'AbortError'));
          }, 15_000);
        }),
      ]);
      if (permissionTimeout) clearTimeout(permissionTimeout);
      if (recordingRequestId !== recordingRequestIdRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      recordingPendingRef.current = false;
      setRecordingPending(false);
      streamRef.current = stream;
      const supportedMimeType = [
        'audio/mp4',
        'audio/webm;codecs=opus',
        'audio/webm',
      ].find((type) => MediaRecorder.isTypeSupported(type));
      const recorder = new MediaRecorder(
        stream,
        supportedMimeType ? { mimeType: supportedMimeType } : undefined,
      );
      const chunks: BlobPart[] = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size) chunks.push(event.data);
      };
      recorder.onstop = () => {
        if (recordingTimeoutRef.current)
          clearTimeout(recordingTimeoutRef.current);
        recordingTimeoutRef.current = null;
        const blob = new Blob(chunks, {
          type: recorder.mimeType || 'audio/webm',
        });
        if (recordedUrl) URL.revokeObjectURL(recordedUrl);
        setRecordedUrl(URL.createObjectURL(blob));
        stream.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
        recorderRef.current = null;
        setRecording(false);
        setVoiceStatus(
          'Recording ready. Replay it and compare with the model.',
        );
      };
      recorder.onerror = () => {
        if (recordingTimeoutRef.current)
          clearTimeout(recordingTimeoutRef.current);
        recordingTimeoutRef.current = null;
        stream.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
        recorderRef.current = null;
        setRecording(false);
        setVoiceStatus(
          'Recording stopped unexpectedly. You can try again or practice aloud.',
        );
      };
      recorderRef.current = recorder;
      recorder.start();
      recordingTimeoutRef.current = setTimeout(() => {
        if (recorder.state !== 'inactive') recorder.stop();
      }, 30_000);
      setRecording(true);
      setVoiceStatus('Recording… Tap stop when you’re done. Nothing is saved.');
    } catch {
      if (permissionTimeout) clearTimeout(permissionTimeout);
      if (recordingRequestId !== recordingRequestIdRef.current) return;
      recordingPendingRef.current = false;
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      recorderRef.current = null;
      setRecording(false);
      setRecordingPending(false);
      setVoiceStatus(
        permissionTimedOut
          ? 'Microphone permission took too long. Check this site’s microphone setting, then try again.'
          : 'Microphone permission was not available. Practice aloud or type instead—your lesson still counts.',
      );
    }
  };

  const submitAnswer = (selfAssessed = false) => {
    if (
      !exercise ||
      feedback ||
      answerSubmissionRef.current ||
      speechCoach.busy ||
      recording ||
      recordingPending
    ) {
      return;
    }
    answerSubmissionRef.current = true;
    const answer =
      exercise.kind === 'arrange'
        ? arrangedAnswer
        : exercise.kind === 'speaking'
          ? typed
          : selected;
    const accepted =
      exercise.kind === 'arrange' ? [exercise.tagalog] : exercise.accepted;
    const tagalogSpeechResult =
      exercise.kind === 'speaking' && speechCoach.state.results['fil-PH']
        ? speechCoach.state.results['fil-PH']
        : null;
    const speechWasUnderstood =
      tagalogSpeechResult?.level === 'verified' ||
      tagalogSpeechResult?.level === 'understood';
    const isCorrect =
      selfAssessed ||
      speechWasUnderstood ||
      accepted.some(
        (item) => normalizeAnswer(item) === normalizeAnswer(answer),
      );
    const alreadyMissed =
      missed.has(exercise.baseId) || Boolean(exercise.isRetry);
    const typedSpeakingFallback =
      exercise.kind === 'speaking' && !speechWasUnderstood;
    const score = scoreAttempt({
      correct: isCorrect,
      missed: alreadyMissed,
      isRetry: Boolean(exercise.isRetry),
      selfAssessed:
        selfAssessed ||
        typedSpeakingFallback ||
        tagalogSpeechResult?.level === 'understood' ||
        (exercise.kind === 'speaking' &&
          (speechCoach.state.bestAttemptByLanguage['fil-PH'] ?? 1) > 1),
      hintUsed: hintUsedRef.current,
    });
    const reviewKey = `${exercise.baseId}:${exercise.skill}`;
    const creditedPoints = onReviewAttempt(sessionId, reviewKey, score.outcome);
    setSessionXp((value) => value + creditedPoints);

    if (score.firstTryCorrect) {
      setFirstTryCorrect((value) => value + 1);
    }

    if (!isCorrect) {
      setMissed((current) => new Set(current).add(exercise.baseId));
      if (!exercise.isRetry) {
        setQueue((current) => {
          const retry = {
            ...exercise,
            instanceId: `${exercise.instanceId}-retry`,
            isRetry: true,
            eyebrow: 'Try again',
          };
          const next = [...current];
          next.splice(Math.min(current.length, index + 4), 0, retry);
          return next;
        });
      }
    }

    setFeedback({
      correct: isCorrect,
      title: isCorrect
        ? selfAssessed
          ? 'Practice logged'
          : score.usedSupport
            ? 'Correct with support'
            : 'Tama!'
        : 'Not quite yet',
      detail: isCorrect
        ? exercise.note
        : `A natural answer is “${exercise.correct}” ${exercise.note}`,
    });
  };

  const continueLesson = () => {
    if (
      speechCoach.busy ||
      recording ||
      recordingPending ||
      continueSubmissionRef.current
    )
      return;
    continueSubmissionRef.current = true;
    if (index + 1 >= queue.length) {
      if (lessonFinishedRef.current) return;
      lessonFinishedRef.current = true;
      onFinish(unit, lesson, sessionId, {
        xp: sessionXp,
        firstTryCorrect,
        prompts: totalScoredPrompts,
        minutes: elapsedMinutesSince(startedAtRef.current),
        modes: [...new Set(initialExercises.map((item) => item.skill))],
        kind:
          reviewMode || replayMode
            ? 'review'
            : mistakesMode
              ? 'mistakes'
              : 'lesson',
        sourceUnitIds:
          reviewMode || mistakesMode
            ? [
                ...new Set(
                  initialExercises.flatMap((item) => {
                    const source = findReviewTarget(item.baseId);
                    return source ? [source.unit.id] : [];
                  }),
                ),
              ]
            : undefined,
      });
      setComplete(true);
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    setIndex((value) => value + 1);
    resetPromptState();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  if (!exercise) {
    return (
      <main className="grid min-h-dvh place-items-center bg-background px-5 py-10 text-foreground">
        <section className="w-full max-w-lg rounded-[16px] border border-border bg-card p-8 text-center">
          <span className="mx-auto grid size-16 place-items-center rounded-full bg-[var(--f-green-1)] text-[var(--f-green-4)]">
            <CheckCircle2 className="size-7" />
          </span>
          <h1 className="mt-5 text-2xl font-black">You’re caught up</h1>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Another tab may have completed these reviews. Your schedule is up to
            date.
          </p>
          <Button
            onClick={onExit}
            className="mt-6 min-h-12 rounded-[5px] bg-primary px-5 font-black text-black hover:bg-[var(--f-pink-light)]"
          >
            Back home
          </Button>
        </section>
      </main>
    );
  }

  if (complete) {
    const next = nextLessonAfter(unit.id, lesson.id);
    const accuracy = Math.round((firstTryCorrect / totalScoredPrompts) * 100);
    const { current } = deriveStreaks(
      [...progress.completedDays, localDateKey()],
      localDateKey(),
    );
    return (
      <main className="grid min-h-dvh place-items-center bg-background px-5 py-10 text-foreground">
        <section className="w-full max-w-xl rounded-[24px] border border-border bg-card p-6 text-center shadow-[0_4px_20px_rgba(25,1,52,0.14)] sm:p-10">
          <span className="mx-auto grid size-18 place-items-center rounded-full bg-[var(--f-yellow-1)] text-[#5c4a00]">
            <Star className="size-8 fill-[var(--f-yellow-3)]" />
          </span>
          <p
            lang="fil"
            className="mt-6 text-xs font-black uppercase tracking-[0.14em] text-[#9c0040]"
          >
            Tapos na!
          </p>
          <h1 className="mt-2 text-3xl font-black tracking-[-0.045em]">
            {reviewMode
              ? 'Review complete'
              : replayMode
                ? 'Practice replay complete'
                : mistakesMode
                  ? 'Mistake practice complete'
                  : 'Lesson complete'}
          </h1>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            {reviewMode
              ? 'You brought due language skills back at the right time.'
              : replayMode
                ? 'You reinforced a completed lesson without changing your current place in the course.'
                : mistakesMode
                  ? 'You repaired difficult items. Two clean recalls on different days move each one out of the queue.'
                  : `You finished “${lesson.title}.” The next lesson reuses familiar material before adding more.`}
          </p>
          <div className="mt-7 grid grid-cols-3 gap-3">
            <SummaryStat value={`+${sessionXp}`} label="XP" />
            <SummaryStat value={`${accuracy}%`} label="first try" />
            <SummaryStat value={`${current}`} label="day streak" />
          </div>
          <div className="mt-7 rounded-[8px] bg-[var(--f-green-1)] p-4 text-left text-[var(--f-green-4)]">
            <p className="text-xs font-black uppercase tracking-[0.1em]">
              Practice focus
            </p>
            <p className="mt-1 text-sm font-bold">
              {reviewMode || mistakesMode
                ? 'Mixed recall across every unit with an item due today.'
                : unit.description}
            </p>
          </div>
          <div className="mt-7 flex flex-col gap-3 sm:flex-row">
            <Button
              variant="outline"
              onClick={onExit}
              className="min-h-12 flex-1 rounded-[5px] font-black"
            >
              Back home
            </Button>
            {!reviewMode &&
              !mistakesMode &&
              !replayMode &&
              !(
                unit.id === units.at(-1)?.id && lesson.kind === 'checkpoint'
              ) && (
                <Button
                  onClick={() => onNext(next.unit.id, next.lesson.id)}
                  className="min-h-12 flex-1 rounded-[5px] bg-primary font-black text-black hover:bg-[var(--f-pink-light)]"
                >
                  {next.completedUnit ? 'Next unit' : 'Next lesson'}{' '}
                  <ArrowRight />
                </Button>
              )}
          </div>
        </section>
      </main>
    );
  }

  const answerReady =
    !speechCoach.busy &&
    !recording &&
    !recordingPending &&
    (exercise.kind === 'arrange'
      ? chosenTiles.length > 0
      : exercise.kind === 'speaking'
        ? typed.trim().length > 0 ||
          speechCoach.state.results['fil-PH']?.level === 'verified' ||
          speechCoach.state.results['fil-PH']?.level === 'understood'
        : selected.length > 0);
  const progressPercent = Math.round((index / queue.length) * 100);

  return (
    <main className="min-h-dvh bg-background text-foreground">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex h-18 max-w-4xl items-center gap-4 px-5">
          <Button
            variant="ghost"
            size="icon-lg"
            onClick={onExit}
            className="size-11 rounded-full"
            aria-label="Exit lesson"
          >
            <X className="size-5" />
          </Button>
          <Progress
            value={progressPercent}
            aria-label={`${mistakesMode ? 'Mistake practice' : reviewMode ? 'Review' : lesson.title} progress: prompt ${index + 1} of ${queue.length}`}
            className="flex-1 [&_[data-slot=progress-track]]:h-2.5 [&_[data-slot=progress-indicator]]:bg-primary"
          />
          <span className="min-w-14 text-right text-xs font-black text-muted-foreground">
            {index + 1} / {queue.length}
          </span>
        </div>
      </header>

      <div className="mx-auto flex min-h-[calc(100dvh-72px)] max-w-3xl flex-col px-5 pb-28 pt-8 sm:pt-10">
        <section className="flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-xs font-black uppercase tracking-[0.14em] text-[#9c0040]">
              {exercise.eyebrow}
            </p>
            {exercise.isRetry && (
              <Tag className="bg-[var(--f-yellow-1)] text-[#6a5000]">
                Worth another look
              </Tag>
            )}
          </div>
          <h1 className="mt-2 text-2xl font-black tracking-[-0.035em] sm:text-3xl">
            {exercise.prompt}
          </h1>

          <div className="mt-8">
            <ExerciseBody
              exercise={exercise}
              selected={selected}
              setSelected={setSelected}
              typed={typed}
              setTyped={setTyped}
              shuffledTiles={shuffledTiles}
              chosenTiles={chosenTiles}
              setChosenTiles={setChosenTiles}
              arrangedAnswer={arrangedAnswer}
              feedback={feedback}
              playPhrase={playPhrase}
              playWord={playWord}
              speechState={speechCoach.state}
              speechBusy={speechCoach.busy}
              onStartSpeech={(language) =>
                void speechCoach.start(exercise.baseId, language)
              }
              onStopSpeech={speechCoach.stop}
              toggleRecording={toggleRecording}
              recording={recording}
              recordingPending={recordingPending}
              speechFallbackChosen={speechFallbackChosen}
              recordedUrl={recordedUrl}
              voiceStatus={voiceStatus}
              showTranscript={showTranscript}
              onToggleHint={toggleHint}
              onSelfAssess={() => submitAnswer(true)}
              onChooseSpeechFallback={() => setSpeechFallbackChosen(true)}
            />
            {voiceStatus &&
              exercise.kind !== 'listening' &&
              exercise.kind !== 'speaking' && (
                <div className="mt-4 flex items-start gap-2 rounded-[8px] bg-[var(--f-blue-3)] p-3 text-xs font-bold leading-5 text-[#183f7b]">
                  <Volume2 className="mt-0.5 size-4 shrink-0" />
                  <p aria-live="polite">{voiceStatus}</p>
                </div>
              )}
          </div>
        </section>

        {feedback && (
          <output
            aria-live="polite"
            className={`mt-8 flex items-start gap-3 rounded-[8px] p-4 ${
              feedback.correct
                ? 'bg-[var(--f-green-1)] text-[var(--f-green-4)]'
                : 'bg-[#fcabb4] text-[#71000f]'
            }`}
          >
            {feedback.correct ? (
              <CheckCircle2 className="mt-0.5 size-5 shrink-0" />
            ) : (
              <TriangleAlert className="mt-0.5 size-5 shrink-0" />
            )}
            <div>
              <p className="font-black">{feedback.title}</p>
              <p className="mt-1 text-sm leading-5">{feedback.detail}</p>
            </div>
          </output>
        )}

        <div className="fixed inset-x-0 bottom-0 border-t border-border bg-card/96 pb-[max(16px,env(safe-area-inset-bottom))] pl-[max(1.25rem,env(safe-area-inset-left))] pr-[max(1.25rem,env(safe-area-inset-right))] pt-4 backdrop-blur sm:static sm:mt-8 sm:border-0 sm:bg-transparent sm:px-0 sm:py-0">
          <div className="mx-auto flex max-w-3xl items-center justify-between gap-3">
            <Button
              variant="ghost"
              onClick={toggleHint}
              aria-expanded={showTranscript}
              className="min-h-12 rounded-[5px] font-black text-muted-foreground"
            >
              <CircleHelp /> Hint
            </Button>
            {exercise.kind === 'vocabulary' ? (
              <Button
                onClick={continueLesson}
                className="min-h-12 min-w-36 rounded-[5px] bg-primary px-5 font-black text-black hover:bg-[var(--f-pink-light)]"
              >
                I’m ready <ArrowRight />
              </Button>
            ) : feedback ? (
              <Button
                onClick={continueLesson}
                disabled={speechCoach.busy || recording || recordingPending}
                className="min-h-12 min-w-36 rounded-[5px] bg-[var(--f-success)] px-5 font-black text-black hover:bg-[#72d1a4]"
              >
                Continue <ArrowRight />
              </Button>
            ) : (
              <Button
                disabled={!answerReady}
                onClick={() => submitAnswer(false)}
                className="min-h-12 min-w-36 rounded-[5px] bg-primary px-5 font-black text-black hover:bg-[var(--f-pink-light)] disabled:bg-border disabled:text-muted-foreground"
              >
                Check answer
              </Button>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}

function SpeechAssessmentPanel({ state }: { state: SpeechSessionState }) {
  const activeCopy: Partial<Record<SpeechSessionState['phase'], string>> = {
    'requesting-permission': 'Waiting for microphone permission…',
    connecting: 'Connecting securely to Azure Speech…',
    listening: 'Listening… Speak naturally; Salita stops after your phrase.',
    scoring: 'Checking what Azure heard…',
  };
  const active = activeCopy[state.phase];
  if (active) {
    return (
      <output className="mt-4 flex items-center gap-3 rounded-[8px] bg-[var(--f-blue-3)] p-4 text-left text-sm font-bold text-[#183f7b]">
        <span className="relative grid size-9 shrink-0 place-items-center rounded-full bg-[var(--f-driver-bg)] text-[#10066c]">
          <span className="absolute inset-0 animate-ping rounded-full bg-[#83b7f5]/45" />
          <Mic className="relative size-4" />
        </span>
        <p aria-live="polite">{active}</p>
      </output>
    );
  }

  if (state.error) {
    return (
      <output className="mt-4 flex items-start gap-3 rounded-[8px] bg-[var(--f-yellow-1)] p-4 text-left text-xs leading-5 text-[#5c4a00]">
        <Info className="mt-0.5 size-4 shrink-0" />
        <p aria-live="polite">{state.error}</p>
      </output>
    );
  }

  const result = state.result;
  if (!result) return null;
  const verified = result.level === 'verified';
  const understood = result.level === 'understood';
  const title =
    result.level === 'unscored'
      ? 'Nothing was scored'
      : verified
        ? result.language === 'fil-PH'
          ? 'Words understood clearly'
          : 'Clear English match'
        : understood
          ? 'Understood—refine one part'
          : 'Try one part again';
  const panelStyle = verified
    ? 'bg-[var(--f-green-1)] text-[var(--f-green-4)]'
    : understood
      ? 'bg-[var(--f-yellow-1)] text-[#5c4a00]'
      : result.level === 'retry'
        ? 'bg-[#fcabb4] text-[#71000f]'
        : 'bg-muted text-muted-foreground';

  return (
    <output
      className={`mt-4 rounded-[8px] p-4 text-left ${panelStyle}`}
      aria-live="polite"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.1em]">
            {result.language === 'fil-PH'
              ? 'Filipino speech match'
              : 'English pronunciation coaching'}
          </p>
          <p className="mt-1 font-black">{title}</p>
        </div>
        {result.language === 'fil-PH' && result.level !== 'unscored' && (
          <Tag className="bg-white/55 text-current">
            {result.matchScore}% word match
          </Tag>
        )}
      </div>
      {state.retainedBest && (
        <p className="mt-2 text-xs font-bold">
          Your stronger earlier attempt still counts; this panel keeps that best
          result.
        </p>
      )}
      {result.transcript && (
        <p className="mt-3 text-sm leading-5">
          {result.usedAlternateHypothesis
            ? 'Closest Azure match'
            : 'Azure heard'}
          : <strong>“{result.transcript}”</strong>
        </p>
      )}
      {result.pronunciation && result.level !== 'unscored' && (
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {[
            ['Overall', result.pronunciation.pronunciation],
            ['Accuracy', result.pronunciation.accuracy],
            ['Fluency', result.pronunciation.fluency],
            ['Complete', result.pronunciation.completeness],
          ].map(([label, score]) => (
            <div key={String(label)} className="rounded-[6px] bg-white/55 p-2">
              <p className="text-lg font-black">{Math.round(Number(score))}</p>
              <p className="text-[10px] font-black uppercase tracking-wide">
                {label}
              </p>
            </div>
          ))}
        </div>
      )}
      {result.level !== 'unscored' && result.lowAccuracyWords.length > 0 && (
        <div className="mt-3">
          <p className="text-xs font-black">
            Word to focus on for your next try:
          </p>
          <ul className="mt-2 flex flex-wrap gap-2">
            {result.lowAccuracyWords.slice(0, 1).map((word) => (
              <li
                key={`${word.word}-${word.accuracy ?? 'unknown'}`}
                className="rounded-full bg-white/60 px-3 py-1 text-xs font-black"
              >
                {word.word}
                {word.accuracy === null
                  ? ''
                  : ` · accuracy ${Math.round(word.accuracy)}/100`}
              </li>
            ))}
          </ul>
        </div>
      )}
      {result.level === 'retry' && result.missingWords.length > 0 && (
        <p className="mt-3 text-xs leading-5">
          Listen for: <strong>{result.missingWords.join(' · ')}</strong>
        </p>
      )}
      {result.reminder && (
        <p className="mt-3 text-xs leading-5">{result.reminder}</p>
      )}
    </output>
  );
}

function ExerciseBody({
  exercise,
  selected,
  setSelected,
  typed,
  setTyped,
  shuffledTiles,
  chosenTiles,
  setChosenTiles,
  arrangedAnswer,
  feedback,
  playPhrase,
  playWord,
  speechState,
  speechBusy,
  onStartSpeech,
  onStopSpeech,
  toggleRecording,
  recording,
  recordingPending,
  speechFallbackChosen,
  recordedUrl,
  voiceStatus,
  showTranscript,
  onToggleHint,
  onSelfAssess,
  onChooseSpeechFallback,
}: {
  exercise: Exercise;
  selected: string;
  setSelected: (value: string) => void;
  typed: string;
  setTyped: (value: string) => void;
  shuffledTiles: { token: string; tileIndex: number }[];
  chosenTiles: number[];
  setChosenTiles: React.Dispatch<React.SetStateAction<number[]>>;
  arrangedAnswer: string;
  feedback: Feedback | null;
  playPhrase: (text: string, slow?: boolean) => void | Promise<void>;
  playWord: (word: string) => void | Promise<void>;
  speechState: SpeechSessionState;
  speechBusy: boolean;
  onStartSpeech: (language: SpeechAssessmentLanguage) => void;
  onStopSpeech: () => void;
  toggleRecording: () => void;
  recording: boolean;
  recordingPending: boolean;
  speechFallbackChosen: boolean;
  recordedUrl: string;
  voiceStatus: string;
  showTranscript: boolean;
  onToggleHint: () => void;
  onSelfAssess: () => void;
  onChooseSpeechFallback: () => void;
}) {
  if (exercise.kind === 'vocabulary') {
    const introductionItems =
      exercise.vocabularyItems ?? exercise.phraseItems ?? [];
    const introducesPhrases = Boolean(exercise.phraseItems);
    return (
      <>
        <section className="rounded-[16px] border border-border bg-card p-5 sm:p-7">
          <div className="flex items-start gap-3">
            <span className="grid size-11 shrink-0 place-items-center rounded-[8px] bg-[var(--f-cyan-1)] text-[#005c83]">
              <Languages className="size-5" />
            </span>
            <div>
              <p className="text-xs font-black uppercase tracking-[0.1em] text-muted-foreground">
                First encounter
              </p>
              <h2 className="mt-1 text-xl font-black">
                {introducesPhrases
                  ? 'Listen, read, then repeat each expression.'
                  : 'Listen, read, then say each word.'}
              </h2>
            </div>
          </div>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            {introductionItems.map((word) => (
              <article
                key={word.id}
                className="rounded-[8px] border border-border bg-muted p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <SpeakableTagalog
                      text={word.fil}
                      onSpeak={playWord}
                      className="text-lg font-black"
                    />
                    <p className="mt-1 text-sm font-bold text-foreground">
                      {word.en}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void playPhrase(word.fil)}
                    className="grid size-11 shrink-0 place-items-center rounded-full bg-card text-[#183f7b] focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring"
                    aria-label={`Hear ${word.fil}`}
                  >
                    <Volume2 className="size-4" />
                  </button>
                </div>
                <p className="mt-3 text-xs leading-5 text-muted-foreground">
                  {word.note}
                </p>
              </article>
            ))}
          </div>
          <p className="mt-4 rounded-[8px] bg-[var(--f-yellow-1)] p-3 text-xs font-bold leading-5 text-[#5c4a00]">
            {introducesPhrases
              ? 'Repeat each expression once. You will retrieve these expressions later, after this first encounter.'
              : 'Say each word once. Salita will ask you to retrieve each one in a later practice step before it enters spaced review.'}
          </p>
        </section>
        {showTranscript && <LearningHint text={exercise.note} />}
      </>
    );
  }

  if (exercise.kind === 'pronunciation') {
    return (
      <>
        <section className="overflow-hidden rounded-[16px] border border-[#83b7f5] bg-card">
          <div className="bg-[var(--f-blue-3)] p-5 text-[#183f7b] sm:p-6">
            <div className="flex items-start gap-3">
              <span className="grid size-11 shrink-0 place-items-center rounded-[8px] bg-[var(--f-driver-bg)] text-[#10066c]">
                <Volume2 className="size-5" />
              </span>
              <div>
                <p className="text-xs font-black uppercase tracking-[0.1em]">
                  Notice the sound
                </p>
                <h2 className="mt-1 text-xl font-black">
                  {exercise.lessonTitle}
                </h2>
              </div>
            </div>
            <p className="mt-4 text-sm leading-6">{exercise.lessonText}</p>
          </div>
          <div className="p-5 text-center sm:p-6">
            <SpeakableTagalog
              text={exercise.tagalog}
              onSpeak={playWord}
              className="text-2xl font-black tracking-[-0.03em]"
            />
            <WordAudioHint />
            <div className="mt-5 flex flex-wrap justify-center gap-3">
              <Button
                variant="outline"
                onClick={() => void playPhrase(exercise.tagalog)}
                disabled={
                  speechBusy ||
                  recording ||
                  recordingPending ||
                  Boolean(feedback)
                }
                className="min-h-11 rounded-[5px] font-black"
              >
                <Volume2 /> Hear model
              </Button>
              <Button
                variant="outline"
                onClick={() => void playPhrase(exercise.tagalog, true)}
                disabled={
                  speechBusy ||
                  recording ||
                  recordingPending ||
                  Boolean(feedback)
                }
                className="min-h-11 rounded-[5px] font-black"
              >
                <Pause /> Hear slowly
              </Button>
              <Button
                variant="outline"
                onClick={toggleRecording}
                disabled={speechBusy || recordingPending || Boolean(feedback)}
                className="min-h-11 rounded-[5px] font-black"
              >
                {recording ? (
                  <Square className="fill-current" />
                ) : (
                  <span className="size-3 rounded-full bg-[var(--f-error)]" />
                )}
                {recording
                  ? 'Stop recording'
                  : recordingPending
                    ? 'Opening microphone…'
                    : 'Record myself'}
              </Button>
              <Button
                onClick={() =>
                  speechBusy ? onStopSpeech() : onStartSpeech('fil-PH')
                }
                disabled={recording || recordingPending || Boolean(feedback)}
                className="min-h-11 rounded-[5px] bg-[var(--f-driver-bg)] font-black text-[#10066c] hover:bg-[var(--f-blue-2)]"
              >
                {speechBusy ? <Square className="fill-current" /> : <Mic />}
                {speechBusy ? 'Stop voice check' : 'Check my Tagalog'}
              </Button>
            </div>
            {recordedUrl && (
              <Button
                variant="ghost"
                onClick={() => void new Audio(recordedUrl).play()}
                className="mx-auto mt-3 min-h-11 rounded-[5px] font-black text-[#183f7b]"
              >
                <Play /> Compare my recording
              </Button>
            )}
            <SpeechAssessmentPanel state={speechState} />
            <div className="mx-auto mt-5 max-w-xl rounded-[8px] bg-[var(--f-yellow-1)] p-4 text-left text-[#5c4a00]">
              <p className="text-xs font-black uppercase tracking-[0.1em]">
                Syllable + stress guide
              </p>
              <p className="mt-2 font-black tracking-wide">
                {exercise.syllables}
              </p>
              <p className="mt-2 text-xs leading-5">{exercise.coach}</p>
            </div>
            <p className="mt-3 text-[11px] leading-5 text-muted-foreground">
              Record & compare stays in this tab. A voice check sends live audio
              securely to Azure for transcription; Salita does not retain the
              audio or transcript. Filipino results check understood words—not
              accent, stress, or a native-speaker pronunciation score.
            </p>
          </div>
        </section>
        <ChoiceOptions
          options={exercise.options ?? []}
          selected={selected}
          setSelected={setSelected}
          disabled={
            Boolean(feedback) || speechBusy || recording || recordingPending
          }
        />
        {showTranscript && <LearningHint text={exercise.note} />}
      </>
    );
  }

  if (exercise.kind === 'grammar') {
    return (
      <>
        <section className="overflow-hidden rounded-[16px] border border-border bg-card">
          <div className="bg-[var(--f-yellow-1)] p-5 text-[#5c4a00] sm:p-6">
            <div className="flex items-start gap-3">
              <span className="grid size-11 shrink-0 place-items-center rounded-[8px] bg-[var(--f-yellow-3)] text-[#5c3500]">
                <Languages className="size-5" />
              </span>
              <div>
                <p className="text-xs font-black uppercase tracking-[0.1em]">
                  Build the sentence
                </p>
                <h2 className="mt-1 text-xl font-black">
                  {exercise.lessonTitle}
                </h2>
              </div>
            </div>
            <p className="mt-4 text-sm leading-6">{exercise.lessonText}</p>
            <div className="mt-4 rounded-[8px] bg-white/55 p-3">
              <p className="text-[10px] font-black uppercase tracking-[0.1em]">
                Working frame
              </p>
              <p lang="fil" className="mt-1 text-sm font-black">
                {exercise.formula}
              </p>
            </div>
          </div>
          <div className="grid gap-3 p-5 sm:grid-cols-2 sm:p-6">
            {exercise.examples?.map((example) => (
              <div
                key={example.fil}
                className="rounded-[8px] border border-border bg-muted p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <SpeakableTagalog
                    text={example.fil}
                    onSpeak={playWord}
                    className="font-black"
                  />
                  <button
                    type="button"
                    onClick={() => void playPhrase(example.fil)}
                    className="grid size-9 shrink-0 place-items-center rounded-full text-[#183f7b] hover:bg-[var(--f-blue-3)] focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring"
                    aria-label={`Hear the complete example: ${example.fil}`}
                  >
                    <Volume2 className="size-4" />
                  </button>
                </div>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  {example.en}
                </p>
              </div>
            ))}
          </div>
        </section>
        <ChoiceOptions
          options={exercise.options ?? []}
          selected={selected}
          setSelected={setSelected}
          disabled={Boolean(feedback)}
          language="fil"
        />
        {showTranscript && <LearningHint text={exercise.note} />}
      </>
    );
  }

  if (exercise.kind === 'passage') {
    return (
      <>
        <section className="rounded-[16px] border border-border bg-card p-5 sm:p-7">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.1em] text-[#9c0040]">
                Read for meaning
              </p>
              <h2 className="mt-1 text-xl font-black">
                {exercise.lessonTitle}
              </h2>
            </div>
            <Button
              variant="outline"
              size="icon-lg"
              onClick={() => void playPhrase(exercise.tagalog)}
              className="size-11 shrink-0 rounded-full"
              aria-label="Hear the complete reading"
            >
              <Volume2 />
            </Button>
          </div>
          <div className="mt-5 rounded-[8px] bg-[var(--f-blue-3)] p-4 text-[#183f7b]">
            <SpeakableTagalog
              text={exercise.tagalog}
              onSpeak={playWord}
              className="text-base font-bold leading-7"
            />
          </div>
          <WordAudioHint />
          {showTranscript && (
            <div className="mt-4 rounded-[8px] bg-[var(--f-yellow-1)] p-4 text-sm leading-6 text-[#5c4a00]">
              <strong>English support:</strong> {exercise.translation}
            </div>
          )}
        </section>
        <ChoiceOptions
          options={exercise.options ?? []}
          selected={selected}
          setSelected={setSelected}
          disabled={Boolean(feedback)}
        />
      </>
    );
  }

  if (exercise.kind === 'listening') {
    return (
      <>
        <div className="flex min-h-48 flex-col items-center justify-center rounded-[16px] bg-[var(--f-blue-3)] p-6 text-center text-[#183f7b]">
          <button
            onClick={() => void playPhrase(exercise.tagalog)}
            className="grid size-18 place-items-center rounded-full bg-[var(--f-driver-bg)] text-[#10066c] shadow-[0_2px_10px_rgba(25,1,52,0.12)] focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring"
            aria-label="Play phrase with Filipino voice"
          >
            <Volume2 className="size-8" />
          </button>
          <div className="mt-4 flex gap-2">
            <Button
              variant="ghost"
              onClick={() => void playPhrase(exercise.tagalog, true)}
              className="min-h-11 rounded-[5px] font-black text-[#183f7b]"
            >
              <Pause /> Slow
            </Button>
            <Button
              variant="ghost"
              onClick={onToggleHint}
              aria-expanded={showTranscript}
              className="min-h-11 rounded-[5px] font-black text-[#183f7b]"
            >
              <BookOpen /> Transcript
            </Button>
          </div>
          <p className="mt-2 text-xs font-bold" aria-live="polite">
            {voiceStatus || 'Filipino neural voice · tap to listen'}
          </p>
          {showTranscript && (
            <div className="mt-4">
              <SpeakableTagalog
                text={exercise.tagalog}
                onSpeak={playWord}
                className="text-xl font-black"
              />
              <WordAudioHint />
            </div>
          )}
        </div>
        <ChoiceOptions
          options={exercise.options ?? []}
          selected={selected}
          setSelected={setSelected}
          disabled={Boolean(feedback)}
        />
      </>
    );
  }

  if (exercise.kind === 'arrange') {
    return (
      <>
        <PromptCard
          english={exercise.english}
          register={exercise.register}
          onSpeak={playWord}
        />
        <div
          className="mt-5 min-h-18 rounded-[8px] border-b-2 border-[#3174d2] bg-card p-4"
          aria-label="Your sentence"
        >
          {chosenTiles.length ? (
            <div className="flex flex-wrap gap-2">
              {chosenTiles.map((tileIndex) => {
                const tile = shuffledTiles.find(
                  (item) => item.tileIndex === tileIndex,
                );
                return (
                  <button
                    key={tileIndex}
                    disabled={Boolean(feedback)}
                    onClick={() => {
                      const speech = tile?.token
                        ? segmentTagalogText(tile.token).find(
                            (segment) => segment.speech,
                          )?.speech
                        : null;
                      if (speech) void playPhrase(speech);
                      setChosenTiles((current) =>
                        current.filter((index) => index !== tileIndex),
                      );
                    }}
                    className="min-h-11 rounded-[5px] bg-[var(--f-pink-3)] px-3 py-2 text-sm font-black text-[#9c0040]"
                  >
                    {tile?.token}
                  </button>
                );
              })}
            </div>
          ) : (
            <span className="text-sm text-muted-foreground">
              Tap the words below to build your answer.
            </span>
          )}
        </div>
        <div
          className="mt-5 flex flex-wrap gap-2"
          aria-label="Available word tiles"
        >
          {shuffledTiles.map((tile) => {
            const used = chosenTiles.includes(tile.tileIndex);
            return (
              <button
                key={tile.tileIndex}
                disabled={used || Boolean(feedback)}
                onClick={() => {
                  const speech = segmentTagalogText(tile.token).find(
                    (segment) => segment.speech,
                  )?.speech;
                  if (speech) void playPhrase(speech);
                  setChosenTiles((current) => [...current, tile.tileIndex]);
                }}
                aria-label={`Add “${tile.token}” and hear it pronounced`}
                className="min-h-11 rounded-[5px] border border-border bg-card px-4 text-sm font-black shadow-[0_2px_6px_rgba(25,1,52,0.06)] disabled:opacity-25"
              >
                {tile.token}
              </button>
            );
          })}
        </div>
        {showTranscript && (
          <HintPanel
            tagalog={exercise.tagalog}
            note={exercise.note}
            onSpeak={playWord}
          />
        )}
        <span className="sr-only">Current answer: {arrangedAnswer}</span>
      </>
    );
  }

  if (exercise.kind === 'speaking') {
    const speechFallbackAvailable =
      speechFallbackChosen ||
      speechState.phase === 'error' ||
      speechState.attemptsByLanguage['fil-PH'] >= 2;
    return (
      <>
        <div className="rounded-[16px] border border-border bg-card p-5 text-center sm:p-7">
          <Tag className={REGISTER_STYLES[exercise.register]}>
            {exercise.register}
          </Tag>
          <SpeakableTagalog
            text={exercise.tagalog}
            onSpeak={playWord}
            className="mt-4 text-3xl font-black tracking-[-0.035em]"
          />
          <WordAudioHint />
          <p className="mt-2 text-sm text-muted-foreground">
            {exercise.english}
          </p>
          <p className="mx-auto mt-3 max-w-lg text-xs font-bold leading-5 text-[#183f7b]">
            Speak naturally. Salita checks whether your words were understood;
            it does not require a native accent.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <Button
              variant="outline"
              onClick={() => void playPhrase(exercise.tagalog)}
              disabled={
                speechBusy || recording || recordingPending || Boolean(feedback)
              }
              className="min-h-12 rounded-[5px] font-black"
            >
              <Volume2 /> Hear model
            </Button>
            <Button
              variant="outline"
              onClick={() => void playPhrase(exercise.tagalog, true)}
              disabled={
                speechBusy || recording || recordingPending || Boolean(feedback)
              }
              className="min-h-12 rounded-[5px] font-black"
            >
              <Pause /> Hear slowly
            </Button>
            <Button
              onClick={() =>
                speechBusy && speechState.language === 'fil-PH'
                  ? onStopSpeech()
                  : onStartSpeech('fil-PH')
              }
              disabled={
                recording ||
                recordingPending ||
                Boolean(feedback) ||
                (speechBusy && speechState.language !== 'fil-PH')
              }
              className="min-h-12 rounded-[5px] bg-[var(--f-driver-bg)] font-black text-[#10066c] hover:bg-[var(--f-blue-2)]"
            >
              {speechBusy && speechState.language === 'fil-PH' ? (
                <Square className="fill-current" />
              ) : (
                <Mic />
              )}
              {speechBusy && speechState.language === 'fil-PH'
                ? 'Stop'
                : 'Check Tagalog'}
            </Button>
            <Button
              variant="outline"
              onClick={() =>
                speechBusy && speechState.language === 'en-US'
                  ? onStopSpeech()
                  : onStartSpeech('en-US')
              }
              disabled={
                recording ||
                recordingPending ||
                Boolean(feedback) ||
                (speechBusy && speechState.language !== 'en-US')
              }
              className="min-h-12 rounded-[5px] font-black text-[#183f7b]"
            >
              {speechBusy && speechState.language === 'en-US' ? (
                <Square className="fill-current" />
              ) : (
                <Languages />
              )}
              {speechBusy && speechState.language === 'en-US'
                ? 'Stop'
                : 'Check English'}
            </Button>
            <Button
              variant="outline"
              onClick={toggleRecording}
              disabled={speechBusy || recordingPending || Boolean(feedback)}
              className="min-h-12 rounded-[5px] font-black"
            >
              {recording ? (
                <Square className="fill-current" />
              ) : (
                <span className="size-3 rounded-full bg-[var(--f-error)]" />
              )}
              {recording
                ? 'Stop'
                : recordingPending
                  ? 'Opening microphone…'
                  : 'Record only'}
            </Button>
          </div>
          {voiceStatus && (
            <p
              className="mx-auto mt-4 max-w-md text-xs font-bold leading-5 text-muted-foreground"
              aria-live="polite"
            >
              {voiceStatus}
            </p>
          )}
          <SpeechAssessmentPanel state={speechState} />
          {speechState.result?.language === 'en-US' && (
            <p className="mt-2 text-xs font-bold text-[#183f7b]">
              English is bonus pronunciation coaching. Check Tagalog to complete
              this Tagalog speaking step.
            </p>
          )}
          {recordedUrl && (
            <Button
              variant="outline"
              onClick={() => {
                void new Audio(recordedUrl).play();
              }}
              className="mx-auto mt-4 min-h-11 rounded-[5px] font-black"
            >
              <Play /> Play my recording
            </Button>
          )}
          <div className="mx-auto mt-5 max-w-xl rounded-[8px] bg-[var(--f-yellow-1)] p-3 text-left text-xs leading-5 text-[#5c4a00]">
            <strong>Sound focus:</strong>{' '}
            {exercise.soundFocus ??
              'Say it slowly by syllable, then repeat at a natural speed.'}
          </div>
        </div>

        {speechFallbackAvailable ? (
          <div className="mt-5">
            <label htmlFor="spoken-answer" className="text-sm font-black">
              Accessible typed fallback
            </label>
            <input
              id="spoken-answer"
              value={typed}
              disabled={Boolean(feedback)}
              onChange={(event) => setTyped(event.target.value)}
              placeholder="Type the Tagalog phrase if you cannot use the mic"
              className="mt-2 min-h-12 w-full rounded-none border-0 border-b-2 border-input bg-card px-3 py-2 text-base outline-none transition focus:border-[#3174d2]"
            />
            <p className="mt-2 text-xs leading-5 text-muted-foreground">
              This keeps the lesson accessible and earns practice credit, not a
              verified speaking score.
            </p>
          </div>
        ) : (
          <button
            type="button"
            onClick={onChooseSpeechFallback}
            disabled={
              Boolean(feedback) || speechBusy || recording || recordingPending
            }
            className="mt-5 min-h-11 rounded-[5px] px-2 text-sm font-black text-[#183f7b] underline decoration-2 underline-offset-4 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            I can’t use a microphone—show the accessible fallback
          </button>
        )}
        {!feedback &&
          (speechFallbackChosen ||
            speechState.attemptsByLanguage['fil-PH'] >= 2 ||
            speechState.phase === 'error') && (
            <button
              onClick={onSelfAssess}
              className="mt-5 min-h-11 rounded-[5px] px-2 text-sm font-black text-[#183f7b] underline decoration-2 underline-offset-4 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              I practiced aloud—mark this complete
            </button>
          )}
        <div className="mt-5 flex items-start gap-2 rounded-[8px] bg-muted p-3 text-xs leading-5 text-muted-foreground">
          <LockKeyhole className="mt-0.5 size-4 shrink-0" />
          Salita does not retain voice-check audio. Live audio goes securely to
          Azure Speech for transcription. Record & compare clips remain only in
          this tab. Mic or service failures never break your streak.
        </div>
        {showTranscript && (
          <HintPanel
            tagalog={exercise.tagalog}
            note={exercise.note}
            onSpeak={playWord}
          />
        )}
      </>
    );
  }

  if (exercise.kind === 'dialogue') {
    return (
      <>
        <div className="rounded-[16px] bg-[var(--f-blue-3)] p-5 text-[#183f7b] sm:p-6">
          <p className="text-xs font-black uppercase tracking-[0.1em]">
            {exercise.situation}
          </p>
          <div className="mt-5 flex items-start gap-3">
            <span className="grid size-9 shrink-0 place-items-center rounded-full bg-[var(--f-driver-bg)] text-sm font-black text-[#10066c]">
              A
            </span>
            <div className="rounded-[8px] bg-card px-4 py-3 text-lg font-black text-foreground shadow-[0_2px_10px_rgba(25,1,52,0.08)]">
              <SpeakableTagalog text={exercise.tagalog} onSpeak={playWord} />
            </div>
          </div>
        </div>
        <ChoiceOptions
          options={exercise.options ?? []}
          selected={selected}
          setSelected={setSelected}
          disabled={Boolean(feedback)}
          language="fil"
        />
        {showTranscript && (
          <HintPanel
            tagalog={exercise.correct}
            note={exercise.note}
            onSpeak={playWord}
          />
        )}
      </>
    );
  }

  if (exercise.kind === 'pattern') {
    return (
      <>
        <PromptCard
          english={exercise.english}
          register={exercise.register}
          onSpeak={playWord}
        />
        <div className="mt-5 rounded-[8px] border border-[#83b7f5] bg-[var(--f-blue-3)] p-4 text-[#183f7b]">
          <p className="text-xs font-black uppercase tracking-[0.1em]">
            Sentence frame
          </p>
          <SpeakableTagalog
            text={exercise.patternFrame ?? ''}
            onSpeak={playWord}
            className="mt-2 text-lg font-black"
          />
          <p className="mt-2 text-sm">
            <strong>Swap:</strong> {exercise.patternTransform}
          </p>
        </div>
        <ChoiceOptions
          options={exercise.options ?? []}
          selected={selected}
          setSelected={setSelected}
          disabled={Boolean(feedback)}
          language="fil"
        />
        {showTranscript && (
          <HintPanel
            tagalog={exercise.tagalog}
            note={exercise.note}
            onSpeak={playWord}
          />
        )}
      </>
    );
  }

  return (
    <>
      <PromptCard
        tagalog={exercise.kind === 'reading' ? exercise.tagalog : undefined}
        english={exercise.kind === 'reading' ? undefined : exercise.english}
        register={exercise.register}
        onSpeak={playWord}
      />
      <ChoiceOptions
        options={exercise.options ?? []}
        selected={selected}
        setSelected={setSelected}
        disabled={Boolean(feedback)}
        language={exercise.kind === 'context' ? 'fil' : 'en'}
      />
      {showTranscript && (
        <HintPanel
          tagalog={exercise.tagalog}
          note={exercise.note}
          onSpeak={playWord}
        />
      )}
    </>
  );
}

function SpeakableTagalog({
  text,
  onSpeak,
  className = '',
}: {
  text: string;
  onSpeak: (word: string) => void | Promise<void>;
  className?: string;
}) {
  return (
    <span lang="fil" className={`inline leading-relaxed ${className}`}>
      {segmentTagalogText(text).map((segment, index) =>
        segment.speech ? (
          <button
            key={`${segment.display}-${index}`}
            type="button"
            onClick={() => void onSpeak(segment.speech!)}
            aria-label={
              segment.display.toLocaleLowerCase('fil-PH') ===
              segment.speech.toLocaleLowerCase('fil-PH')
                ? `Hear “${segment.display}” pronounced`
                : `Hear “${segment.display},” pronounced “${segment.speech}”`
            }
            title={`Hear “${segment.display}”`}
            className="inline-flex min-h-9 items-center rounded-[4px] px-0.5 [font:inherit] text-[inherit] underline decoration-[#3174d2] decoration-dotted decoration-2 underline-offset-4 hover:bg-[var(--f-blue-3)] focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            {segment.display}
          </button>
        ) : (
          <span key={`${segment.display}-${index}`}>{segment.display}</span>
        ),
      )}
    </span>
  );
}

function WordAudioHint() {
  return (
    <p className="mt-2 text-xs font-bold text-muted-foreground">
      Tap any underlined word to hear it.
    </p>
  );
}

function LearningHint({ text }: { text: string }) {
  return (
    <div className="mt-5 flex items-start gap-3 rounded-[8px] bg-[var(--f-yellow-1)] p-4 text-[#5c4a00]">
      <CircleHelp className="mt-0.5 size-5 shrink-0" />
      <p className="text-xs leading-5">{text}</p>
    </div>
  );
}

function PromptCard({
  tagalog,
  english,
  register,
  onSpeak,
}: {
  tagalog?: string;
  english?: string;
  register: Register;
  onSpeak: (word: string) => void | Promise<void>;
}) {
  return (
    <div className="rounded-[16px] border border-border bg-card p-6 text-center sm:p-8">
      <Tag className={REGISTER_STYLES[register]}>{register}</Tag>
      {tagalog && (
        <div className="mt-4">
          <SpeakableTagalog
            text={tagalog}
            onSpeak={onSpeak}
            className="text-2xl font-black tracking-[-0.03em] sm:text-3xl"
          />
          <WordAudioHint />
        </div>
      )}
      {english && (
        <p
          lang="en"
          className="mt-4 text-xl font-black tracking-[-0.02em] sm:text-2xl"
        >
          {english}
        </p>
      )}
    </div>
  );
}

function ChoiceOptions({
  options,
  selected,
  setSelected,
  disabled,
  language = 'en',
}: {
  options: string[];
  selected: string;
  setSelected: (value: string) => void;
  disabled: boolean;
  language?: 'en' | 'fil';
}) {
  return (
    <fieldset className="mt-5 grid gap-3">
      <legend className="sr-only">Answer choices</legend>
      {options.map((option, optionIndex) => (
        <label
          key={option}
          className={`flex min-h-14 items-center gap-3 rounded-[8px] border p-3 text-left text-sm font-bold transition focus-within:outline-3 focus-within:outline-offset-2 focus-within:outline-ring sm:text-base ${
            selected === option
              ? 'border-[#3174d2] bg-[var(--f-blue-3)] text-[#183f7b]'
              : 'border-border bg-card hover:border-[#83b7f5]'
          } ${disabled ? 'cursor-default' : 'cursor-pointer'}`}
        >
          <input
            type="radio"
            name="lesson-answer"
            value={option}
            checked={selected === option}
            disabled={disabled}
            onChange={() => setSelected(option)}
            className="sr-only"
          />
          <span
            className={`grid size-8 shrink-0 place-items-center rounded-full border text-xs font-black ${selected === option ? 'border-[#3174d2] bg-[var(--f-driver-bg)] text-[#10066c]' : 'border-border bg-muted text-muted-foreground'}`}
          >
            {String.fromCharCode(65 + optionIndex)}
          </span>
          <span lang={language}>{option}</span>
        </label>
      ))}
    </fieldset>
  );
}

function HintPanel({
  tagalog,
  note,
  onSpeak,
}: {
  tagalog: string;
  note: string;
  onSpeak: (word: string) => void | Promise<void>;
}) {
  return (
    <div className="mt-5 flex items-start gap-3 rounded-[8px] bg-[var(--f-yellow-1)] p-4 text-[#5c4a00]">
      <CircleHelp className="mt-0.5 size-5 shrink-0" />
      <div>
        <SpeakableTagalog
          text={tagalog}
          onSpeak={onSpeak}
          className="font-black"
        />
        <p className="mt-1 text-xs leading-5">{note}</p>
      </div>
    </div>
  );
}

function Tag({
  className,
  children,
}: {
  className: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className={`inline-flex min-h-5 items-center rounded-[5px] px-2 py-1 text-[11px] font-black leading-none ${className}`}
    >
      {children}
    </span>
  );
}

function SummaryStat({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-[8px] bg-muted p-3">
      <p className="text-xl font-black sm:text-2xl">{value}</p>
      <p className="mt-1 text-[10px] font-black uppercase tracking-[0.08em] text-muted-foreground">
        {label}
      </p>
    </div>
  );
}
