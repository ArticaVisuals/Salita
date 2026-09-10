export type SkillMode =
  | 'listening'
  | 'reading'
  | 'speaking'
  | 'grammar'
  | 'pronunciation';
export type AttemptOutcome = 'first-correct' | 'retry-correct' | 'wrong';

export type ReviewRecord = {
  stage: number;
  dueDate: string;
  correct: number;
  attempts: number;
};

export type LessonHistoryItem = {
  id: string;
  dateKey: string;
  completedAt: string;
  unitId: string;
  xp: number;
  firstTryCorrect: number;
  prompts: number;
  modes: SkillMode[];
  kind?: 'lesson' | 'review';
};

export type LearnerProgress = {
  version: 1;
  xp: number;
  totalSessions: number;
  completedDays: string[];
  completedUnits: string[];
  activeUnitId: string;
  dailyMinutes: Record<string, number>;
  reviews: Record<string, ReviewRecord>;
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
    activeUnitId: 'greetings',
    dailyMinutes: {},
    reviews: {},
    history: [],
  };
}

export function parseProgress(value: string | null): LearnerProgress {
  if (!value) return createInitialProgress();

  try {
    const parsed = JSON.parse(value) as Partial<LearnerProgress>;
    if (parsed.version !== 1) return createInitialProgress();
    const history = Array.isArray(parsed.history)
      ? parsed.history.filter(isHistoryItem).slice(-120)
      : [];

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
      activeUnitId:
        typeof parsed.activeUnitId === 'string'
          ? parsed.activeUnitId
          : 'greetings',
      dailyMinutes: isRecord(parsed.dailyMinutes)
        ? sanitizeNumberRecord(parsed.dailyMinutes)
        : {},
      reviews: isRecord(parsed.reviews) ? sanitizeReviews(parsed.reviews) : {},
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
): ReviewRecord {
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
  };
}

export function skillStrength(progress: LearnerProgress, mode: SkillMode) {
  const records = Object.entries(progress.reviews).filter(([key]) =>
    key.endsWith(`:${mode}`),
  );
  if (!records.length) return 0;
  const points = records.reduce((total, [, record]) => total + record.stage, 0);
  return Math.round((points / (records.length * 6)) * 100);
}

export function firstTryAccuracy(progress: LearnerProgress, mode?: SkillMode) {
  const recent = progress.history
    .filter((item) => !mode || item.modes.includes(mode))
    .slice(-30);
  const prompts = recent.reduce((sum, item) => sum + item.prompts, 0);
  if (!prompts) return 0;
  const correct = recent.reduce((sum, item) => sum + item.firstTryCorrect, 0);
  return Math.round((correct / prompts) * 100);
}

function isDateKey(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
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
          },
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
    typeof value.unitId === 'string' &&
    Number.isFinite(value.xp) &&
    Number.isFinite(value.firstTryCorrect) &&
    Number.isFinite(value.prompts) &&
    Array.isArray(value.modes)
  );
}
