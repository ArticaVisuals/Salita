export type SkillMode =
  | 'listening'
  | 'reading'
  | 'speaking'
  | 'grammar'
  | 'pronunciation';
export type AttemptOutcome = 'first-correct' | 'retry-correct' | 'wrong';

export type MistakeRecord = {
  state: 'active' | 'recovering' | 'recovered';
  lapseCount: number;
  cleanSuccesses: number;
  lastMissedAt: string;
  lastPracticedAt: string;
  nextPracticeDate: string;
  source?: 'observed' | 'legacy-inferred';
};

export type ReviewRecord = {
  stage: number;
  dueDate: string;
  correct: number;
  attempts: number;
  lastPracticedAt?: string;
};

export type LessonHistoryItem = {
  id: string;
  dateKey: string;
  completedAt: string;
  unitId: string;
  sourceUnitIds?: string[];
  xp: number;
  firstTryCorrect: number;
  prompts: number;
  modes: SkillMode[];
  kind?: 'lesson' | 'review' | 'mistakes' | 'vocab-match';
  lessonId?: string;
};

export type LearnerProgress = {
  version: 1;
  xp: number;
  totalSessions: number;
  completedDays: string[];
  completedUnits: string[];
  completedLessons: string[];
  activeUnitId: string;
  activeLessonId: string;
  activePathUpdatedAt: string;
  dailyMinutes: Record<string, number>;
  reviews: Record<string, ReviewRecord>;
  mistakes: Record<string, MistakeRecord>;
  history: LessonHistoryItem[];
};

export const STORAGE_KEY = 'salita-progress-v1';
export const REVIEW_INTERVALS = [1, 3, 7, 14, 30, 60] as const;

export function isReviewDue(
  record: ReviewRecord | undefined,
  todayKey: string,
) {
  return !record || record.dueDate <= todayKey;
}

export function scoreAttempt({
  correct,
  missed = false,
  isRetry = false,
  selfAssessed = false,
  hintUsed = false,
}: {
  correct: boolean;
  missed?: boolean;
  isRetry?: boolean;
  selfAssessed?: boolean;
  hintUsed?: boolean;
}): {
  outcome: AttemptOutcome;
  points: number;
  firstTryCorrect: boolean;
  usedSupport: boolean;
} {
  const usedSupport = missed || isRetry || selfAssessed || hintUsed;
  return {
    outcome: correct
      ? usedSupport
        ? 'retry-correct'
        : 'first-correct'
      : 'wrong',
    points: correct ? (usedSupport ? 5 : 10) : 0,
    firstTryCorrect: correct && !usedSupport,
    usedSupport,
  };
}

export function createInitialProgress(): LearnerProgress {
  return {
    version: 1,
    xp: 0,
    totalSessions: 0,
    completedDays: [],
    completedUnits: [],
    completedLessons: [],
    activeUnitId: 'greetings',
    activeLessonId: 'greetings-sounds',
    activePathUpdatedAt: '',
    dailyMinutes: {},
    reviews: {},
    mistakes: {},
    history: [],
  };
}

export function parseProgress(value: string | null): LearnerProgress {
  if (!value) return createInitialProgress();

  try {
    const parsed = JSON.parse(value) as Partial<LearnerProgress>;
    if (parsed.version !== 1) return createInitialProgress();
    const history = Array.isArray(parsed.history)
      ? parsed.history
          .filter(isHistoryItem)
          .sort((a, b) => a.completedAt.localeCompare(b.completedAt))
          .slice(-120)
      : [];

    const reviews = isRecord(parsed.reviews)
      ? sanitizeReviews(parsed.reviews)
      : {};
    const hasExplicitMistakes = Object.prototype.hasOwnProperty.call(
      parsed,
      'mistakes',
    );
    const explicitMistakes = isRecord(parsed.mistakes)
      ? sanitizeMistakes(parsed.mistakes)
      : {};
    return {
      version: 1,
      xp: Number.isFinite(parsed.xp) ? Math.max(0, Number(parsed.xp)) : 0,
      totalSessions: Number.isFinite(parsed.totalSessions)
        ? Math.max(history.length, Number(parsed.totalSessions))
        : history.length,
      completedDays: Array.isArray(parsed.completedDays)
        ? [...new Set(parsed.completedDays.filter(isDateKey))]
        : [],
      completedUnits: Array.isArray(parsed.completedUnits)
        ? [
            ...new Set(
              parsed.completedUnits.filter(
                (id): id is string => typeof id === 'string',
              ),
            ),
          ]
        : [],
      completedLessons: Array.isArray(parsed.completedLessons)
        ? [
            ...new Set(
              parsed.completedLessons.filter(
                (id): id is string =>
                  typeof id === 'string' && id.length <= 120,
              ),
            ),
          ]
        : [],
      activeUnitId:
        typeof parsed.activeUnitId === 'string'
          ? parsed.activeUnitId
          : 'greetings',
      activeLessonId:
        typeof parsed.activeLessonId === 'string'
          ? parsed.activeLessonId
          : `${typeof parsed.activeUnitId === 'string' ? parsed.activeUnitId : 'greetings'}-sounds`,
      activePathUpdatedAt:
        typeof parsed.activePathUpdatedAt === 'string' &&
        Number.isFinite(Date.parse(parsed.activePathUpdatedAt))
          ? parsed.activePathUpdatedAt
          : (history.at(-1)?.completedAt ?? ''),
      dailyMinutes: isRecord(parsed.dailyMinutes)
        ? sanitizeNumberRecord(parsed.dailyMinutes)
        : {},
      reviews,
      mistakes: hasExplicitMistakes
        ? explicitMistakes
        : inferLegacyMistakes(reviews),
      history,
    };
  } catch {
    return createInitialProgress();
  }
}

export function localDateKey(date = new Date(), timeZone?: string): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const values = Object.fromEntries(
    parts.map((part) => [part.type, part.value]),
  );
  return `${values.year}-${values.month}-${values.day}`;
}

export function addCalendarDays(dateKey: string, amount: number): string {
  const [year, month, day] = dateKey.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + amount, 12));
  return date.toISOString().slice(0, 10);
}

export function deriveStreaks(completedDays: string[], todayKey: string) {
  const days = [...new Set(completedDays.filter(isDateKey))].sort();
  const completed = new Set(days);
  let current = 0;
  let cursor = completed.has(todayKey)
    ? todayKey
    : addCalendarDays(todayKey, -1);

  while (completed.has(cursor)) {
    current += 1;
    cursor = addCalendarDays(cursor, -1);
  }

  let best = 0;
  let run = 0;
  let previous: string | undefined;
  for (const day of days) {
    run = previous && addCalendarDays(previous, 1) === day ? run + 1 : 1;
    best = Math.max(best, run);
    previous = day;
  }

  return { current, best };
}

export function updateReview(
  record: ReviewRecord | undefined,
  result: AttemptOutcome,
  todayKey: string,
  occurredAt?: string,
): ReviewRecord {
  if (
    record?.lastPracticedAt &&
    occurredAt &&
    occurredAt <= record.lastPracticedAt
  ) {
    return record;
  }
  const previous = record ?? {
    stage: 0,
    dueDate: todayKey,
    correct: 0,
    attempts: 0,
  };
  const stage =
    result === 'first-correct'
      ? Math.min(6, previous.stage + 1)
      : result === 'wrong'
        ? Math.max(0, previous.stage - 1)
        : previous.stage;
  const interval = REVIEW_INTERVALS[Math.max(0, stage - 1)] ?? 1;

  return {
    stage,
    dueDate:
      result === 'wrong' ? todayKey : addCalendarDays(todayKey, interval),
    correct: previous.correct + (result === 'wrong' ? 0 : 1),
    attempts: previous.attempts + 1,
    ...(occurredAt ? { lastPracticedAt: occurredAt } : {}),
  };
}

export function updateMistake(
  record: MistakeRecord | undefined,
  result: AttemptOutcome,
  dateKey: string,
  occurredAt: string,
): MistakeRecord | undefined {
  if (result === 'wrong') {
    if (record && occurredAt <= record.lastPracticedAt) return record;
    return {
      state: 'active',
      lapseCount: (record?.lapseCount ?? 0) + 1,
      cleanSuccesses: 0,
      lastMissedAt: occurredAt,
      lastPracticedAt: occurredAt,
      nextPracticeDate: dateKey,
      source: 'observed',
    };
  }
  if (!record) return undefined;
  if (occurredAt <= record.lastPracticedAt) return record;
  if (result === 'retry-correct') {
    return { ...record, lastPracticedAt: occurredAt };
  }
  if (record.state === 'active') {
    return {
      ...record,
      state: 'recovering',
      cleanSuccesses: 1,
      lastPracticedAt: occurredAt,
      nextPracticeDate: addCalendarDays(dateKey, 1),
    };
  }
  if (record.state === 'recovering' && dateKey >= record.nextPracticeDate) {
    return {
      ...record,
      state: 'recovered',
      cleanSuccesses: Math.max(2, record.cleanSuccesses + 1),
      lastPracticedAt: occurredAt,
      nextPracticeDate: addCalendarDays(dateKey, 7),
    };
  }
  return { ...record, lastPracticedAt: occurredAt };
}

export function isProgressEmpty(progress: LearnerProgress) {
  return (
    progress.xp === 0 &&
    progress.totalSessions === 0 &&
    progress.completedDays.length === 0 &&
    progress.completedUnits.length === 0 &&
    progress.completedLessons.length === 0 &&
    Object.keys(progress.reviews).length === 0 &&
    progress.history.length === 0
  );
}

export function mergeLegacyProgress(
  cloud: LearnerProgress,
  local: LearnerProgress,
): LearnerProgress {
  const history = new Map(
    [...cloud.history, ...local.history].map((item) => [item.id, item]),
  );
  const reviews = { ...cloud.reviews };
  for (const [key, candidate] of Object.entries(local.reviews)) {
    const current = reviews[key];
    if (
      !current ||
      candidate.attempts > current.attempts ||
      (candidate.attempts === current.attempts &&
        candidate.stage > current.stage)
    ) {
      reviews[key] = candidate;
    }
  }
  const mistakes = { ...cloud.mistakes };
  for (const [key, candidate] of Object.entries(local.mistakes)) {
    const current = mistakes[key];
    if (!current || candidate.lastPracticedAt > current.lastPracticedAt) {
      mistakes[key] = candidate;
    }
  }
  const dailyMinutes = { ...cloud.dailyMinutes };
  for (const [dateKey, minutes] of Object.entries(local.dailyMinutes)) {
    dailyMinutes[dateKey] = Math.max(dailyMinutes[dateKey] ?? 0, minutes);
  }
  const useLocalPath =
    local.activePathUpdatedAt > cloud.activePathUpdatedAt ||
    (!cloud.activePathUpdatedAt && Boolean(local.activePathUpdatedAt));
  return {
    ...cloud,
    xp: Math.max(cloud.xp, local.xp),
    totalSessions: Math.max(
      cloud.totalSessions,
      local.totalSessions,
      history.size,
    ),
    completedDays: [
      ...new Set([...cloud.completedDays, ...local.completedDays]),
    ].sort(),
    completedUnits: [
      ...new Set([...cloud.completedUnits, ...local.completedUnits]),
    ],
    completedLessons: [
      ...new Set([...cloud.completedLessons, ...local.completedLessons]),
    ],
    activeUnitId: useLocalPath ? local.activeUnitId : cloud.activeUnitId,
    activeLessonId: useLocalPath ? local.activeLessonId : cloud.activeLessonId,
    activePathUpdatedAt: useLocalPath
      ? local.activePathUpdatedAt
      : cloud.activePathUpdatedAt,
    dailyMinutes,
    reviews,
    mistakes,
    history: [...history.values()]
      .sort((a, b) => a.completedAt.localeCompare(b.completedAt))
      .slice(-120),
  };
}

export function skillStrength(progress: LearnerProgress, mode: SkillMode) {
  const records = Object.entries(progress.reviews).filter(
    ([key]) =>
      key.endsWith(`:${mode}`) &&
      !(mode === 'reading' && key.includes('-vocab-')),
  );
  if (!records.length) return 0;
  const points = records.reduce((total, [, record]) => total + record.stage, 0);
  return Math.round((points / (records.length * 6)) * 100);
}

export function firstTryAccuracy(progress: LearnerProgress, mode?: SkillMode) {
  const recent = progress.history
    .filter(
      (item) =>
        item.kind !== 'vocab-match' && (!mode || item.modes.includes(mode)),
    )
    .slice(-30);
  const prompts = recent.reduce((sum, item) => sum + item.prompts, 0);
  if (!prompts) return 0;
  const correct = recent.reduce((sum, item) => sum + item.firstTryCorrect, 0);
  return Math.round((correct / prompts) * 100);
}

export function isDateKey(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }
  const [year, month, day] = value.split('-').map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day, 12));
  return (
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function sanitizeNumberRecord(value: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key, amount]) => isDateKey(key) && Number.isFinite(amount))
      .map(([key, amount]) => [key, Math.max(0, Number(amount))]),
  );
}

function sanitizeReviews(
  value: Record<string, unknown>,
): Record<string, ReviewRecord> {
  return Object.fromEntries(
    Object.entries(value).flatMap(([key, item]) => {
      if (!isRecord(item)) return [];
      const stage = Number(item.stage);
      const correct = Number(item.correct);
      const attempts = Number(item.attempts);
      if (!Number.isFinite(stage) || !isDateKey(item.dueDate)) return [];
      return [
        [
          key,
          {
            stage: Math.min(6, Math.max(0, stage)),
            dueDate: item.dueDate,
            correct: Number.isFinite(correct) ? Math.max(0, correct) : 0,
            attempts: Number.isFinite(attempts) ? Math.max(0, attempts) : 0,
            ...(typeof item.lastPracticedAt === 'string' &&
            Number.isFinite(Date.parse(item.lastPracticedAt))
              ? { lastPracticedAt: item.lastPracticedAt }
              : {}),
          },
        ],
      ];
    }),
  );
}

function sanitizeMistakes(
  value: Record<string, unknown>,
): Record<string, MistakeRecord> {
  return Object.fromEntries(
    Object.entries(value).flatMap(([key, item]) => {
      if (!isRecord(item)) return [];
      const state = item.state;
      const lapseCount = Number(item.lapseCount);
      const cleanSuccesses = Number(item.cleanSuccesses);
      if (
        (state !== 'active' &&
          state !== 'recovering' &&
          state !== 'recovered') ||
        !Number.isInteger(lapseCount) ||
        !Number.isInteger(cleanSuccesses) ||
        typeof item.lastMissedAt !== 'string' ||
        typeof item.lastPracticedAt !== 'string' ||
        !isDateKey(item.nextPracticeDate)
      ) {
        return [];
      }
      return [
        [
          key,
          {
            state,
            lapseCount: Math.max(1, lapseCount),
            cleanSuccesses: Math.max(0, cleanSuccesses),
            lastMissedAt: item.lastMissedAt,
            lastPracticedAt: item.lastPracticedAt,
            nextPracticeDate: item.nextPracticeDate,
            source:
              item.source === 'legacy-inferred'
                ? 'legacy-inferred'
                : 'observed',
          } satisfies MistakeRecord,
        ],
      ];
    }),
  );
}

function inferLegacyMistakes(
  reviews: Record<string, ReviewRecord>,
): Record<string, MistakeRecord> {
  return Object.fromEntries(
    Object.entries(reviews).flatMap(([key, record]) => {
      if (record.attempts <= record.correct || record.stage > 2) return [];
      const timestamp = `${record.dueDate}T12:00:00.000Z`;
      return [
        [
          key,
          {
            state: 'active',
            lapseCount: Math.max(1, record.attempts - record.correct),
            cleanSuccesses: 0,
            lastMissedAt: timestamp,
            lastPracticedAt: timestamp,
            nextPracticeDate: record.dueDate,
            source: 'legacy-inferred',
          } satisfies MistakeRecord,
        ],
      ];
    }),
  );
}

function isHistoryItem(value: unknown): value is LessonHistoryItem {
  if (!isRecord(value)) return false;
  return (
    typeof value.id === 'string' &&
    isDateKey(value.dateKey) &&
    typeof value.completedAt === 'string' &&
    Number.isFinite(Date.parse(value.completedAt)) &&
    typeof value.unitId === 'string' &&
    (value.sourceUnitIds === undefined ||
      (Array.isArray(value.sourceUnitIds) &&
        value.sourceUnitIds.length >= 1 &&
        value.sourceUnitIds.length <= 100 &&
        value.sourceUnitIds.every((unitId) => typeof unitId === 'string'))) &&
    Number.isInteger(value.xp) &&
    Number.isInteger(value.firstTryCorrect) &&
    Number.isInteger(value.prompts) &&
    Array.isArray(value.modes) &&
    value.modes.every(
      (mode) =>
        mode === 'listening' ||
        mode === 'reading' ||
        mode === 'speaking' ||
        mode === 'grammar' ||
        mode === 'pronunciation',
    )
  );
}
