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
  Trash2,
  TriangleAlert,
  UserRound,
  Volume2,
  X,
} from 'lucide-react';
import Image from 'next/image';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import {
  getUnit,
  nextUnitAfter,
  type Phrase,
  type Register,
  type Unit,
  units,
} from './curriculum';
import { getFoundation, type FoundationExample } from './foundations';
import {
  STORAGE_KEY,
  addCalendarDays,
  createInitialProgress,
  deriveStreaks,
  firstTryAccuracy,
  isReviewDue,
  localDateKey,
  parseProgress,
  scoreAttempt,
  skillStrength,
  updateReview,
  type LearnerProgress,
  type SkillMode,
} from '@/lib/progress';
import { segmentTagalogText } from '@/lib/tagalog-speech';

type View = 'today' | 'learn' | 'review' | 'progress';
type ExerciseKind =
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
  isRetry?: boolean;
};

type Feedback = {
  correct: boolean;
  title: string;
  detail: string;
};

type SpeechRecognitionResultLike = {
  0: { transcript: string; confidence: number };
};

type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult:
    | ((event: { results: { 0: SpeechRecognitionResultLike } }) => void)
    | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
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

const NAV_ITEMS: { id: View; label: string; icon: typeof Sparkles }[] = [
  { id: 'today', label: 'Today', icon: Sparkles },
  { id: 'learn', label: 'Learn', icon: BookOpen },
  { id: 'review', label: 'Review', icon: RefreshCcw },
  { id: 'progress', label: 'Progress', icon: BarChart3 },
];

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

function buildLesson(unit: Unit): Exercise[] {
  return [
    foundationExercise(unit, 'pronunciation'),
    phraseExercise(
      unit,
      0,
      'listening',
      'listening',
      'Listen',
      'Play the phrase, then choose what it means.',
    ),
    phraseExercise(
      unit,
      1,
      'reading',
      'reading',
      'Read',
      'Choose the best meaning.',
    ),
    foundationExercise(unit, 'grammar'),
    phraseExercise(
      unit,
      2,
      'pattern',
      'grammar',
      'Pattern swap',
      'Notice the frame, then choose the Tagalog expression.',
    ),
    phraseExercise(
      unit,
      3,
      'arrange',
      'reading',
      'Build it',
      'Put the words in a natural order.',
    ),
    phraseExercise(
      unit,
      4,
      'listening',
      'listening',
      'Listen closely',
      'Play the phrase, then choose what it means.',
    ),
    phraseExercise(
      unit,
      5,
      'context',
      'reading',
      'In context',
      'Choose what you would say in this situation.',
    ),
    phraseExercise(
      unit,
      6,
      'speaking',
      'speaking',
      'Speak',
      'Listen, then say the phrase aloud.',
    ),
    dialogueExercise(unit),
    passageExercise(unit),
  ];
}

function buildReviewLesson(unit: Unit, progress: LearnerProgress): Exercise[] {
  const today = localDateKey();

  return Object.entries(progress.reviews)
    .filter(
      ([key, record]) =>
        key.startsWith(`${unit.id}-`) && record.dueDate <= today,
    )
    .sort(
      ([, a], [, b]) => a.dueDate.localeCompare(b.dueDate) || a.stage - b.stage,
    )
    .slice(0, 10)
    .flatMap(([key]) => {
      const separator = key.lastIndexOf(':');
      const baseId = key.slice(0, separator);
      const skill = key.slice(separator + 1) as SkillMode;

      if (baseId === `${unit.id}-foundation-pronunciation`) {
        const exercise = foundationExercise(unit, 'pronunciation');
        return [
          {
            ...exercise,
            instanceId: `${exercise.instanceId}-review`,
            eyebrow: 'Due sound review',
          },
        ];
      }

      if (baseId === `${unit.id}-foundation-grammar`) {
        const exercise = foundationExercise(unit, 'grammar');
        return [
          {
            ...exercise,
            instanceId: `${exercise.instanceId}-review`,
            eyebrow: 'Due grammar review',
          },
        ];
      }

      if (baseId === `${unit.id}-foundation-reading`) {
        const exercise = passageExercise(unit);
        return [
          {
            ...exercise,
            instanceId: `${exercise.instanceId}-review`,
            eyebrow: 'Due reading review',
          },
        ];
      }

      if (baseId === `${unit.id}-dialogue`) {
        const exercise = dialogueExercise(unit);
        return [
          {
            ...exercise,
            instanceId: `${exercise.instanceId}-review`,
            eyebrow: 'Due review',
          },
        ];
      }

      const found = findPhrase(baseId);
      if (!found || found.unit.id !== unit.id) return [];
      const phraseIndex = unit.phrases.findIndex(
        (phrase) => phrase.id === found.phrase.id,
      );
      const exercise =
        skill === 'listening'
          ? phraseExercise(
              unit,
              phraseIndex,
              'listening',
              'listening',
              'Due listening review',
              'Listen, then choose what it means.',
            )
          : skill === 'speaking'
            ? phraseExercise(
                unit,
                phraseIndex,
                'speaking',
                'speaking',
                'Due speaking review',
                'Listen, then say the phrase aloud.',
              )
            : skill === 'grammar'
              ? phraseExercise(
                  unit,
                  phraseIndex,
                  'pattern',
                  'grammar',
                  'Due pattern review',
                  'Use the sentence frame, then choose the natural expression.',
                )
              : phraseExercise(
                  unit,
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

export default function SalitaApp() {
  const [view, setView] = useState<View>('today');
  const [progress, setProgress] = useState<LearnerProgress>(
    createInitialProgress,
  );
  const [hydrated, setHydrated] = useState(false);
  const [storageIssue, setStorageIssue] = useState(false);
  const [lessonSession, setLessonSession] = useState<{
    unitId: string;
    mode: 'lesson' | 'review';
  } | null>(null);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      try {
        setProgress(parseProgress(window.localStorage.getItem(STORAGE_KEY)));
      } catch {
        setStorageIssue(true);
      }
      setHydrated(true);
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
    } catch {
      window.requestAnimationFrame(() => setStorageIssue(true));
    }
  }, [hydrated, progress]);

  useEffect(() => {
    const syncProgress = (event: StorageEvent) => {
      if (event.key === STORAGE_KEY) setProgress(parseProgress(event.newValue));
    };
    window.addEventListener('storage', syncProgress);
    return () => window.removeEventListener('storage', syncProgress);
  }, []);

  const startLesson = useCallback((unitId: string) => {
    const unit = getUnit(unitId);
    setProgress((current) => ({ ...current, activeUnitId: unit.id }));
    setLessonSession({ unitId: unit.id, mode: 'lesson' });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const startReview = useCallback((unitId: string) => {
    setLessonSession({ unitId: getUnit(unitId).id, mode: 'review' });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

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

  const finishLesson = useCallback(
    (
      unit: Unit,
      summary: {
        xp: number;
        firstTryCorrect: number;
        prompts: number;
        minutes: number;
        modes: SkillMode[];
        kind: 'lesson' | 'review';
      },
    ) => {
      const now = new Date();
      const dateKey = localDateKey(now);
      setProgress((current) => {
        const nextUnit = nextUnitAfter(unit.id);
        return {
          ...current,
          totalSessions: current.totalSessions + 1,
          completedDays: [...new Set([...current.completedDays, dateKey])],
          completedUnits:
            summary.kind === 'lesson'
              ? [...new Set([...current.completedUnits, unit.id])]
              : current.completedUnits,
          activeUnitId:
            summary.kind === 'lesson' ? nextUnit.id : current.activeUnitId,
          dailyMinutes: {
            ...current.dailyMinutes,
            [dateKey]: (current.dailyMinutes[dateKey] ?? 0) + summary.minutes,
          },
          history: [
            ...current.history,
            {
              id: `${unit.id}-${now.toISOString()}`,
              dateKey,
              completedAt: now.toISOString(),
              unitId: unit.id,
              xp: summary.xp,
              firstTryCorrect: summary.firstTryCorrect,
              prompts: summary.prompts,
              modes: summary.modes,
              kind: summary.kind,
            },
          ].slice(-120),
        };
      });
    },
    [],
  );

  const exportProgress = () => {
    const blob = new Blob([JSON.stringify(progress, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `salita-progress-${localDateKey()}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const resetProgress = () => {
    if (
      !window.confirm(
        'Reset all Salita progress on this device? This cannot be undone.',
      )
    )
      return;
    setProgress(createInitialProgress());
    setView('today');
  };

  if (lessonSession) {
    return (
      <LessonExperience
        key={`${lessonSession.unitId}-${lessonSession.mode}`}
        unit={getUnit(lessonSession.unitId)}
        reviewMode={lessonSession.mode === 'review'}
        progress={progress}
        setProgress={setProgress}
        onExit={() => setLessonSession(null)}
        onFinish={finishLesson}
        onNext={(unitId) => setLessonSession({ unitId, mode: 'lesson' })}
      />
    );
  }

  return (
    <main className="min-h-dvh bg-background text-foreground">
      <AppHeader view={view} onNavigate={setView} progress={progress} />
      <div className="mx-auto max-w-6xl px-5 pb-28 pt-8 lg:px-8 lg:pb-12 lg:pt-10">
        {storageIssue && (
          <output className="mb-5 flex items-start gap-3 rounded-[8px] bg-[var(--f-yellow-1)] p-4 text-sm text-[#5c4a00]">
            <TriangleAlert className="mt-0.5 size-5 shrink-0" />
            Progress is available for this visit, but this browser is currently
            blocking local storage.
          </output>
        )}
        {view === 'today' && (
          <TodayView
            progress={progress}
            onStart={startLesson}
            onNavigate={setView}
          />
        )}
        {view === 'learn' && (
          <LearnView progress={progress} onStart={startLesson} />
        )}
        {view === 'review' && (
          <ReviewView
            progress={progress}
            onStartLesson={startLesson}
            onStartReview={startReview}
          />
        )}
        {view === 'progress' && (
          <ProgressView
            progress={progress}
            onExport={exportProgress}
            onReset={resetProgress}
          />
        )}
      </div>
      <MobileNav view={view} onNavigate={setView} />
    </main>
  );
}

function AppHeader({
  view,
  onNavigate,
  progress,
}: {
  view: View;
  onNavigate: (view: View) => void;
  progress: LearnerProgress;
}) {
  const { current } = deriveStreaks(progress.completedDays, localDateKey());

  return (
    <header className="sticky top-0 z-30 border-b border-border bg-card/95 backdrop-blur">
      <div className="mx-auto flex h-18 max-w-6xl items-center justify-between gap-8 px-5 lg:px-8">
        <button
          onClick={() => onNavigate('today')}
          className="flex items-center gap-2.5 no-underline"
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
      className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-card/96 px-2 pb-[max(10px,env(safe-area-inset-bottom))] pt-2 backdrop-blur lg:hidden"
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
  onStart,
  onNavigate,
}: {
  progress: LearnerProgress;
  onStart: (unitId: string) => void;
  onNavigate: (view: View) => void;
}) {
  const unit = getUnit(progress.activeUnitId);
  const today = localDateKey();
  const minutes = progress.dailyMinutes[today] ?? 0;
  const goalPercent = Math.min(100, (minutes / 10) * 100);
  const { current } = deriveStreaks(progress.completedDays, today);
  const calculatedDay =
    progress.completedDays.length +
    (progress.completedDays.includes(today) ? 0 : 1);
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
              Unit {unit.number} · {unit.minutes} min
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
            <p className="mt-3 text-xs font-black uppercase tracking-[0.09em]">
              Sound · Grammar · Reading · Conversation
            </p>
            <div className="mt-6 flex flex-wrap items-center gap-4">
              <Button
                size="lg"
                onClick={() => onStart(unit.id)}
                className="h-12 rounded-[5px] bg-primary px-5 text-base font-black text-black hover:bg-[var(--f-pink-light)]"
              >
                {progress.history.length ? 'Continue lesson' : 'Start lesson'}
                <ArrowRight className="ml-1 size-4" />
              </Button>
              <div className="flex items-center gap-2 text-sm font-black">
                <Star className="size-4 fill-[var(--f-yellow-3)] text-[#5c4a00]" />{' '}
                up to 110 XP
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
            <button
              key={label}
              onClick={() => onStart(unit.id)}
              className="group flex min-h-18 items-center gap-3 rounded-[8px] border border-border bg-card p-4 text-left transition hover:-translate-y-0.5 hover:shadow-[0_2px_10px_rgba(25,1,52,0.08)] focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring"
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
            </button>
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
        <StreakCard progress={progress} />
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
            <p className="font-black">Filipino voice</p>
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
                  ? 'Azure connected'
                  : 'Setup needed'}
            </Tag>
          </div>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            {connected
              ? `${voice.voice?.replace('fil-PH-', '').replace('Neural', '') ?? 'Filipino'} neural voice · tap any underlined Tagalog word.`
              : 'Azure Speech support is built in. Until credentials are connected, Salita uses only a correctly matched Filipino device voice.'}
          </p>
        </div>
      </div>
    </section>
  );
}

function StreakCard({ progress }: { progress: LearnerProgress }) {
  const today = localDateKey();
  const { current } = deriveStreaks(progress.completedDays, today);
  const completed = new Set(progress.completedDays);
  const days = Array.from({ length: 7 }, (_, index) =>
    addCalendarDays(today, index - 6),
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
          const isToday = day === today;
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
  const complete = progress.completedUnits.includes(unit.id);
  const current = progress.activeUnitId === unit.id;
  const [background, color] = UNIT_COLORS[unit.number - 1];

  return (
    <button
      onClick={() => onStart(unit.id)}
      className={`flex w-full items-center gap-4 rounded-[8px] border bg-card p-4 text-left transition hover:-translate-y-0.5 hover:shadow-[0_2px_10px_rgba(25,1,52,0.08)] focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring ${
        current ? 'border-[#3174d2]' : 'border-border'
      }`}
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
        </span>
        <span className="mt-1 block truncate text-xs text-muted-foreground">
          {unit.title} · {unit.minutes} min
        </span>
      </span>
      <ChevronRight className="size-5 shrink-0 text-muted-foreground" />
    </button>
  );
}

function LearnView({
  progress,
  onStart,
}: {
  progress: LearnerProgress;
  onStart: (unitId: string) => void;
}) {
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
            Eight practical units build from greetings to everyday plans and
            urgent help. Every lesson mixes pronunciation, grammar, listening,
            graded reading, and speaking.
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
            8 units · 56 core phrases
          </p>
          <h2 className="mt-1 text-2xl font-black">
            Your conversational foundation
          </h2>
        </div>
        <p className="hidden text-sm font-bold text-muted-foreground sm:block">
          Choose any unit
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {units.map((unit) => {
          const complete = progress.completedUnits.includes(unit.id);
          const current = progress.activeUnitId === unit.id;
          const [background, color] = UNIT_COLORS[unit.number - 1];
          return (
            <article
              key={unit.id}
              className={`rounded-[16px] border bg-card p-5 ${current ? 'border-[#3174d2]' : 'border-border'}`}
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
                  </div>
                  <p className="mt-1 text-sm font-bold text-muted-foreground">
                    {unit.title}
                  </p>
                </div>
              </div>
              <p className="mt-4 min-h-10 text-sm leading-5 text-muted-foreground">
                {unit.description}
              </p>
              <div className="mt-4 flex items-center justify-between border-t border-border pt-4">
                <span className="flex items-center gap-1.5 text-xs font-bold text-muted-foreground">
                  <Clock3 className="size-4" /> {unit.minutes} min
                </span>
                <Button
                  onClick={() => onStart(unit.id)}
                  className="min-h-11 rounded-[5px] bg-primary px-4 font-black text-black hover:bg-[var(--f-pink-light)]"
                >
                  {complete ? 'Practice again' : 'Start unit'} <ArrowRight />
                </Button>
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
  onStartLesson,
  onStartReview,
}: {
  progress: LearnerProgress;
  onStartLesson: (unitId: string) => void;
  onStartReview: (unitId: string) => void;
}) {
  const today = localDateKey();
  const reviewItems = Object.entries(progress.reviews)
    .map(([key, record]) => ({
      key,
      record,
      found: findReviewTarget(key.slice(0, key.lastIndexOf(':'))),
    }))
    .filter((item) => item.found && item.record.dueDate <= today)
    .sort(
      (a, b) =>
        a.record.dueDate.localeCompare(b.record.dueDate) ||
        a.record.stage - b.record.stage,
    );
  const visibleItems = reviewItems.slice(0, 8);
  const hasPracticed = Object.keys(progress.reviews).some((key) =>
    Boolean(findReviewTarget(key.slice(0, key.lastIndexOf(':')))),
  );

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

      {!visibleItems.length ? (
        <div className="rounded-[24px] border border-border bg-card p-8 text-center sm:p-12">
          <span className="mx-auto grid size-16 place-items-center rounded-full bg-[var(--f-green-1)] text-[var(--f-green-4)]">
            <Sparkles className="size-7" />
          </span>
          <h2 className="mt-5 text-xl font-black">
            {hasPracticed
              ? 'You’re caught up'
              : 'Your review deck is ready to grow'}
          </h2>
          <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted-foreground">
            {hasPracticed
              ? 'Nothing is due right now. Your next lesson can introduce new phrases without moving future reviews ahead.'
              : 'Complete your first lesson. Salita will bring phrases back at useful intervals so they stick.'}
          </p>
          <Button
            onClick={() => onStartLesson(progress.activeUnitId)}
            className="mt-6 min-h-12 rounded-[5px] bg-primary px-5 font-black text-black hover:bg-[var(--f-pink-light)]"
          >
            Start today’s lesson <ArrowRight />
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
                  onClick={() => onStartReview(found.unit.id)}
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
  onExport,
  onReset,
}: {
  progress: LearnerProgress;
  onExport: () => void;
  onReset: () => void;
}) {
  const today = localDateKey();
  const { current, best } = deriveStreaks(progress.completedDays, today);
  const calendarDays = Array.from({ length: 35 }, (_, index) =>
    addCalendarDays(today, index - 34),
  );
  const completed = new Set(progress.completedDays);
  const strong = Object.values(progress.reviews).filter(
    (record) => record.stage >= 4,
  ).length;
  const introduced = Object.keys(progress.reviews).length;

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
                      : day === today
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
          <h2 className="mt-1 text-xl font-black">Stored on this device</h2>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            Export a backup anytime. Reset only affects this browser.
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <Button
              variant="outline"
              onClick={onExport}
              className="min-h-11 rounded-[5px] font-black"
            >
              <Download /> Export progress
            </Button>
            <Button
              variant="destructive"
              onClick={onReset}
              className="min-h-11 rounded-[5px] font-black"
            >
              <Trash2 /> Reset
            </Button>
          </div>
        </section>
      </div>
    </section>
  );
}

function LessonExperience({
  unit,
  reviewMode,
  progress,
  setProgress,
  onExit,
  onFinish,
  onNext,
}: {
  unit: Unit;
  reviewMode: boolean;
  progress: LearnerProgress;
  setProgress: React.Dispatch<React.SetStateAction<LearnerProgress>>;
  onExit: () => void;
  onFinish: (
    unit: Unit,
    summary: {
      xp: number;
      firstTryCorrect: number;
      prompts: number;
      minutes: number;
      modes: SkillMode[];
      kind: 'lesson' | 'review';
    },
  ) => void;
  onNext: (unitId: string) => void;
}) {
  const [initialExercises] = useState<Exercise[]>(() =>
    reviewMode ? buildReviewLesson(unit, progress) : buildLesson(unit),
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
  const [heard, setHeard] = useState('');
  const [showTranscript, setShowTranscript] = useState(false);
  const hintUsedRef = useRef(false);
  const [recording, setRecording] = useState(false);
  const [recordedUrl, setRecordedUrl] = useState('');
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const modelAudioRef = useRef<HTMLAudioElement | null>(null);
  const speechRequestRef = useRef<AbortController | null>(null);
  const audioCacheRef = useRef<Map<string, string>>(new Map());
  const cloudVoiceUnavailableRef = useRef(false);
  const playbackIdRef = useRef(0);
  const startedAtRef = useRef(0);
  const exercise = queue[index];
  const totalNewPrompts = initialExercises.length;

  useEffect(() => {
    startedAtRef.current = Date.now();
    const audioCache = audioCacheRef.current;
    return () => {
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
      for (const url of audioCache.values()) {
        URL.revokeObjectURL(url);
      }
      audioCache.clear();
      window.speechSynthesis?.cancel();
    };
  }, []);

  useEffect(() => {
    return () => {
      if (recordedUrl) URL.revokeObjectURL(recordedUrl);
    };
  }, [recordedUrl]);

  const resetPromptState = () => {
    setSelected('');
    setTyped('');
    setChosenTiles([]);
    setFeedback(null);
    setVoiceStatus('');
    setHeard('');
    setShowTranscript(false);
    hintUsedRef.current = false;
    if (recordedUrl) URL.revokeObjectURL(recordedUrl);
    setRecordedUrl('');
    setRecording(false);
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
        cloudVoiceUnavailableRef.current
          ? 'Filipino audio needs its Azure connection. The transcript is available for now.'
          : 'Filipino audio is temporarily unavailable. Please try again.',
      );
      revealIfNeeded();
    };
    const cacheKey = `${slow ? 'slow' : 'normal'}:${text}`;
    const playAudioUrl = async (url: string) => {
      if (playbackId !== playbackIdRef.current) return;
      const audio = new Audio(url);
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
          setVoiceStatus(
            'Audio is ready. Tap the word or phrase once more to play it.',
          );
        }
      }
    };

    const cachedUrl = audioCacheRef.current.get(cacheKey);
    if (cachedUrl) {
      await playAudioUrl(cachedUrl);
      return;
    }

    if (cloudVoiceUnavailableRef.current) {
      fallBackToDeviceVoice();
      return;
    }

    const controller = new AbortController();
    speechRequestRef.current = controller;
    setVoiceStatus('Loading the Filipino neural voice…');

    try {
      const query = new URLSearchParams({
        text,
        speed: slow ? 'slow' : 'normal',
      });
      const response = await fetch(`/api/speech?${query}`, {
        headers: { Accept: 'audio/mpeg' },
        signal: controller.signal,
      });

      if (!response.ok) {
        const problem = (await response.json().catch(() => null)) as {
          code?: string;
        } | null;
        if (problem?.code === 'VOICE_NOT_CONFIGURED') {
          cloudVoiceUnavailableRef.current = true;
        }
        if (playbackId === playbackIdRef.current) fallBackToDeviceVoice();
        return;
      }

      const audioBlob = await response.blob();
      if (!audioBlob.type.startsWith('audio/')) {
        if (playbackId === playbackIdRef.current) fallBackToDeviceVoice();
        return;
      }
      const audioUrl = URL.createObjectURL(audioBlob);
      audioCacheRef.current.set(cacheKey, audioUrl);
      await playAudioUrl(audioUrl);
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      if (playbackId === playbackIdRef.current) fallBackToDeviceVoice();
    } finally {
      if (speechRequestRef.current === controller) {
        speechRequestRef.current = null;
      }
    }
  };

  const playWord = (word: string) => {
    return playPhrase(word);
  };

  const runRecognition = (lang: 'fil-PH' | 'tl-PH', canRetry: boolean) => {
    const speechWindow = window as typeof window & {
      SpeechRecognition?: new () => SpeechRecognitionLike;
      webkitSpeechRecognition?: new () => SpeechRecognitionLike;
    };
    const Recognition =
      speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition;
    if (!Recognition) {
      setVoiceStatus(
        'Live speech recognition is not available here. Record and compare, or type what you said.',
      );
      return;
    }
    const recognition = new Recognition();
    recognition.lang = lang;
    recognition.continuous = false;
    recognition.interimResults = false;
    setVoiceStatus('Listening…');
    recognition.onresult = (event) => {
      const result = event.results[0][0];
      setHeard(result.transcript);
      setTyped(result.transcript);
      setVoiceStatus(`I heard: “${result.transcript}”`);
    };
    recognition.onerror = (event) => {
      if (
        canRetry &&
        (event.error === 'language-not-supported' ||
          event.error === 'bad-grammar')
      ) {
        runRecognition('tl-PH', false);
        return;
      }
      setVoiceStatus(
        'I couldn’t capture that. Record and compare, or type what you said—your lesson still counts.',
      );
    };
    recognition.onend = () =>
      setVoiceStatus((status) =>
        status === 'Listening…'
          ? 'No speech captured. Try again or use the fallback.'
          : status,
      );
    try {
      recognition.start();
    } catch {
      setVoiceStatus(
        'The microphone is busy. Try again or use the recording fallback.',
      );
    }
  };

  const toggleRecording = async () => {
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
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const recorder = new MediaRecorder(stream);
      const chunks: BlobPart[] = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size) chunks.push(event.data);
      };
      recorder.onstop = () => {
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
      setRecording(true);
      setVoiceStatus('Recording… Tap stop when you’re done. Nothing is saved.');
    } catch {
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      recorderRef.current = null;
      setRecording(false);
      setVoiceStatus(
        'Microphone permission was not available. Practice aloud or type instead—your lesson still counts.',
      );
    }
  };

  const submitAnswer = (selfAssessed = false) => {
    if (!exercise || feedback) return;
    const answer =
      exercise.kind === 'arrange'
        ? arrangedAnswer
        : exercise.kind === 'speaking'
          ? typed
          : selected;
    const accepted =
      exercise.kind === 'arrange' ? [exercise.tagalog] : exercise.accepted;
    const isCorrect =
      selfAssessed ||
      accepted.some(
        (item) => normalizeAnswer(item) === normalizeAnswer(answer),
      );
    const alreadyMissed =
      missed.has(exercise.baseId) || Boolean(exercise.isRetry);
    const score = scoreAttempt({
      correct: isCorrect,
      missed: alreadyMissed,
      isRetry: Boolean(exercise.isRetry),
      selfAssessed,
      hintUsed: hintUsedRef.current,
    });
    const today = localDateKey();
    const reviewKey = `${exercise.baseId}:${exercise.skill}`;
    const existingRecord = progress.reviews[reviewKey];
    const eligibleForCredit = isReviewDue(existingRecord, today);
    const creditedPoints = eligibleForCredit ? score.points : 0;

    setProgress((current) => {
      const currentRecord = current.reviews[reviewKey];
      const isDue = isReviewDue(currentRecord, today);
      return {
        ...current,
        xp: current.xp + (isDue ? score.points : 0),
        reviews: isDue
          ? {
              ...current.reviews,
              [reviewKey]: updateReview(currentRecord, score.outcome, today),
            }
          : current.reviews,
      };
    });
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
    if (index + 1 >= queue.length) {
      onFinish(unit, {
        xp: sessionXp,
        firstTryCorrect,
        prompts: totalNewPrompts,
        minutes: Math.max(
          1,
          Math.round((Date.now() - startedAtRef.current) / 60_000),
        ),
        modes: [...new Set(initialExercises.map((item) => item.skill))],
        kind: reviewMode ? 'review' : 'lesson',
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
    const next = nextUnitAfter(unit.id);
    const accuracy = Math.round((firstTryCorrect / totalNewPrompts) * 100);
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
            {reviewMode ? 'Review complete' : 'Lesson complete'}
          </h1>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            {reviewMode
              ? 'You brought due language skills back at the right time.'
              : 'You practiced sounds, grammar, listening, reading, and speaking in context.'}
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
            <p className="mt-1 text-sm font-bold">{unit.description}</p>
          </div>
          <div className="mt-7 flex flex-col gap-3 sm:flex-row">
            <Button
              variant="outline"
              onClick={onExit}
              className="min-h-12 flex-1 rounded-[5px] font-black"
            >
              Back home
            </Button>
            {!reviewMode && next.id !== unit.id && (
              <Button
                onClick={() => onNext(next.id)}
                className="min-h-12 flex-1 rounded-[5px] bg-primary font-black text-black hover:bg-[var(--f-pink-light)]"
              >
                Next unit <ArrowRight />
              </Button>
            )}
          </div>
        </section>
      </main>
    );
  }

  const answerReady =
    exercise.kind === 'arrange'
      ? chosenTiles.length > 0
      : exercise.kind === 'speaking'
        ? typed.trim().length > 0
        : selected.length > 0;
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
            aria-label={`Lesson progress: prompt ${index + 1} of ${queue.length}`}
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
              runRecognition={() => runRecognition('fil-PH', true)}
              toggleRecording={toggleRecording}
              recording={recording}
              recordedUrl={recordedUrl}
              voiceStatus={voiceStatus}
              heard={heard}
              showTranscript={showTranscript}
              onToggleHint={toggleHint}
              onSelfAssess={() => submitAnswer(true)}
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

        <div className="fixed inset-x-0 bottom-0 border-t border-border bg-card/96 px-5 py-4 backdrop-blur sm:static sm:mt-8 sm:border-0 sm:bg-transparent sm:px-0 sm:py-0">
          <div className="mx-auto flex max-w-3xl items-center justify-between gap-3">
            <Button
              variant="ghost"
              onClick={toggleHint}
              aria-expanded={showTranscript}
              className="min-h-12 rounded-[5px] font-black text-muted-foreground"
            >
              <CircleHelp /> Hint
            </Button>
            {feedback ? (
              <Button
                onClick={continueLesson}
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
  runRecognition,
  toggleRecording,
  recording,
  recordedUrl,
  voiceStatus,
  heard,
  showTranscript,
  onToggleHint,
  onSelfAssess,
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
  runRecognition: () => void;
  toggleRecording: () => void;
  recording: boolean;
  recordedUrl: string;
  voiceStatus: string;
  heard: string;
  showTranscript: boolean;
  onToggleHint: () => void;
  onSelfAssess: () => void;
}) {
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
                className="min-h-11 rounded-[5px] font-black"
              >
                <Volume2 /> Hear model
              </Button>
              <Button
                variant="outline"
                onClick={() => void playPhrase(exercise.tagalog, true)}
                className="min-h-11 rounded-[5px] font-black"
              >
                <Pause /> Hear slowly
              </Button>
              <Button
                variant="outline"
                onClick={toggleRecording}
                className="min-h-11 rounded-[5px] font-black"
              >
                {recording ? (
                  <Square className="fill-current" />
                ) : (
                  <span className="size-3 rounded-full bg-[var(--f-error)]" />
                )}
                {recording ? 'Stop recording' : 'Record myself'}
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
              Your recording stays in this tab and is discarded when you leave
              the prompt. Salita does not turn browser recognition into a
              pronunciation score.
            </p>
          </div>
        </section>
        <ChoiceOptions
          options={exercise.options ?? []}
          selected={selected}
          setSelected={setSelected}
          disabled={Boolean(feedback)}
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
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <Button
              variant="outline"
              onClick={() => void playPhrase(exercise.tagalog)}
              className="min-h-12 rounded-[5px] font-black"
            >
              <Volume2 /> Hear model
            </Button>
            <Button
              variant="outline"
              onClick={() => void playPhrase(exercise.tagalog, true)}
              className="min-h-12 rounded-[5px] font-black"
            >
              <Pause /> Hear slowly
            </Button>
            <Button
              onClick={runRecognition}
              className="min-h-12 rounded-[5px] bg-[var(--f-driver-bg)] font-black text-[#10066c] hover:bg-[var(--f-blue-2)]"
            >
              <Mic /> Speak now
            </Button>
            <Button
              variant="outline"
              onClick={toggleRecording}
              className="min-h-12 rounded-[5px] font-black"
            >
              {recording ? (
                <Square className="fill-current" />
              ) : (
                <span className="size-3 rounded-full bg-[var(--f-error)]" />
              )}
              {recording ? 'Stop' : 'Record only'}
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
          {heard && (
            <p className="mt-2 text-xs text-muted-foreground">
              Recognition is a transcript, not a pronunciation score.
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

        <div className="mt-5">
          <label htmlFor="spoken-answer" className="text-sm font-black">
            What did you say?
          </label>
          <input
            id="spoken-answer"
            value={typed}
            disabled={Boolean(feedback)}
            onChange={(event) => setTyped(event.target.value)}
            placeholder="Type the phrase or use speech recognition"
            className="mt-2 min-h-12 w-full rounded-none border-0 border-b-2 border-input bg-card px-3 py-2 text-base outline-none transition focus:border-[#3174d2]"
          />
        </div>
        {!feedback && (
          <button
            onClick={onSelfAssess}
            className="mt-5 min-h-11 rounded-[5px] px-2 text-sm font-black text-[#183f7b] underline decoration-2 underline-offset-4 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            I practiced aloud—mark this complete
          </button>
        )}
        <div className="mt-5 flex items-start gap-2 rounded-[8px] bg-muted p-3 text-xs leading-5 text-muted-foreground">
          <LockKeyhole className="mt-0.5 size-4 shrink-0" />
          Live recognition may use your browser’s speech service. Recordings
          stay in this tab and are discarded when you leave the prompt.
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
