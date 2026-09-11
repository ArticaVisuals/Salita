import {
  createInitialProgress,
  isDateKey,
  isProgressEmpty,
  localDateKey,
  mergeLegacyProgress,
  parseProgress,
  updateMistake,
  updateReview,
  type AttemptOutcome,
  type LearnerProgress,
  type LessonHistoryItem,
  type SkillMode,
} from './progress.ts';
import { getUnitLessons, isValidReviewKey, units } from '../app/curriculum.ts';

export const PROGRESS_PROTOCOL_VERSION = 1 as const;
export const MAX_SYNC_EVENTS = 100;
export const MAX_SYNC_BODY_BYTES = 128 * 1024;

export type ActivityKind = 'lesson' | 'review' | 'mistakes' | 'vocab-match';

type EventBase = {
  version: 1;
  id: string;
  deviceId: string;
  clientSequence: number;
  occurredAt: string;
  timeZone: string;
};

export type ProgressEvent =
  | (EventBase & {
      type: 'active-unit-selected';
      unitId: string;
      lessonId: string;
    })
  | (EventBase & {
      type: 'review-attempt';
      sessionId: string;
      reviewKey: string;
      outcome: AttemptOutcome;
    })
  | (EventBase & {
      type: 'session-completed';
      sessionId: string;
      unitId: string;
      sourceUnitIds?: string[];
      lessonId?: string;
      nextUnitId: string;
      nextLessonId: string;
      completesUnit: boolean;
      kind: ActivityKind;
      minutes: number;
      firstTryCorrect: number;
      prompts: number;
      modes: SkillMode[];
      reportedXp: number;
    });

export type ProgressEventDraft =
  | Omit<
      Extract<ProgressEvent, { type: 'active-unit-selected' }>,
      keyof EventBase
    >
  | Omit<Extract<ProgressEvent, { type: 'review-attempt' }>, keyof EventBase>
  | Omit<
      Extract<ProgressEvent, { type: 'session-completed' }>,
      keyof EventBase
    >;

export type ProgressBootstrap = {
  protocolVersion: 1;
  accountKey: string;
  accountEmail: string;
  generation: number;
  revision: number;
  hasCloudData: boolean;
  progress: LearnerProgress;
  serverTime: string;
  updatedAt: string | null;
};

export type ProgressSyncResponse = ProgressBootstrap & {
  acknowledgedEventIds: string[];
};

export function applyProgressEvent(
  progress: LearnerProgress,
  event: ProgressEvent,
): { progress: LearnerProgress; awardedXp: number } {
  if (event.type === 'active-unit-selected') {
    if (
      event.unitId !== progress.activeUnitId ||
      event.lessonId !== progress.activeLessonId
    ) {
      return { awardedXp: 0, progress };
    }
    if (
      progress.activePathUpdatedAt &&
      event.occurredAt <= progress.activePathUpdatedAt
    ) {
      return { awardedXp: 0, progress };
    }
    return {
      awardedXp: 0,
      progress: {
        ...progress,
        activeUnitId: event.unitId,
        activeLessonId: event.lessonId,
        activePathUpdatedAt: event.occurredAt,
      },
    };
  }

  const dateKey = localDateKey(new Date(event.occurredAt), event.timeZone);
  if (event.type === 'review-attempt') {
    const currentReview = progress.reviews[event.reviewKey];
    const stale = Boolean(
      currentReview?.lastPracticedAt &&
      event.occurredAt <= currentReview.lastPracticedAt,
    );
    const due = !stale && (!currentReview || currentReview.dueDate <= dateKey);
    const awardedXp = due
      ? event.outcome === 'first-correct'
        ? 10
        : event.outcome === 'retry-correct'
          ? 5
          : 0
      : 0;
    const mistake = stale
      ? progress.mistakes[event.reviewKey]
      : updateMistake(
          progress.mistakes[event.reviewKey],
          event.outcome,
          dateKey,
          event.occurredAt,
        );
    const mistakes = { ...progress.mistakes };
    if (mistake) mistakes[event.reviewKey] = mistake;
    return {
      awardedXp,
      progress: {
        ...progress,
        xp: progress.xp + awardedXp,
        reviews: due
          ? {
              ...progress.reviews,
              [event.reviewKey]: updateReview(
                currentReview,
                event.outcome,
                dateKey,
                event.occurredAt,
              ),
            }
          : progress.reviews,
        mistakes,
      },
    };
  }

  if (progress.history.some((item) => item.id === event.sessionId)) {
    return { awardedXp: 0, progress };
  }
  const historyItem: LessonHistoryItem = {
    id: event.sessionId,
    dateKey,
    completedAt: event.occurredAt,
    unitId: event.unitId,
    sourceUnitIds: event.sourceUnitIds,
    lessonId: event.lessonId,
    xp: event.reportedXp,
    firstTryCorrect: event.firstTryCorrect,
    prompts: event.prompts,
    modes: event.modes,
    kind: event.kind,
  };
  const completedLessons =
    event.kind === 'lesson' &&
    event.lessonId &&
    event.unitId === progress.activeUnitId &&
    event.lessonId === progress.activeLessonId
      ? [...new Set([...progress.completedLessons, event.lessonId])]
      : progress.completedLessons;
  const completesCurrentLesson =
    event.kind === 'lesson' &&
    event.lessonId === progress.activeLessonId &&
    event.unitId === progress.activeUnitId;
  const advancesPath =
    completesCurrentLesson &&
    (!progress.activePathUpdatedAt ||
      event.occurredAt > progress.activePathUpdatedAt);
  return {
    awardedXp: 0,
    progress: {
      ...progress,
      totalSessions: progress.totalSessions + 1,
      completedDays: [...new Set([...progress.completedDays, dateKey])],
      completedUnits:
        completesCurrentLesson && event.completesUnit
          ? [...new Set([...progress.completedUnits, event.unitId])]
          : progress.completedUnits,
      completedLessons,
      activeUnitId: advancesPath ? event.nextUnitId : progress.activeUnitId,
      activeLessonId: advancesPath
        ? event.nextLessonId
        : progress.activeLessonId,
      activePathUpdatedAt: advancesPath
        ? event.occurredAt
        : progress.activePathUpdatedAt,
      dailyMinutes: {
        ...progress.dailyMinutes,
        [dateKey]: (progress.dailyMinutes[dateKey] ?? 0) + event.minutes,
      },
      history: [...progress.history, historyItem]
        .sort((a, b) => a.completedAt.localeCompare(b.completedAt))
        .slice(-120),
    },
  };
}

export function applyLegacyProgress(
  current: LearnerProgress,
  imported: LearnerProgress,
  mode: 'empty-only' | 'merge',
) {
  if (mode === 'empty-only')
    return isProgressEmpty(current) ? imported : current;
  return mergeLegacyProgress(current, imported);
}

export function normalizeCourseFrontier(
  progress: LearnerProgress,
): LearnerProgress {
  for (const unit of units) {
    const lesson = getUnitLessons(unit.id).find(
      (candidate) => !progress.completedLessons.includes(candidate.id),
    );
    if (!lesson) continue;
    if (
      progress.activeUnitId === unit.id &&
      progress.activeLessonId === lesson.id
    ) {
      return progress;
    }
    return {
      ...progress,
      activeUnitId: unit.id,
      activeLessonId: lesson.id,
    };
  }

  const finalUnit = units.at(-1);
  const finalLesson = finalUnit
    ? getUnitLessons(finalUnit.id).at(-1)
    : undefined;
  if (
    !finalUnit ||
    !finalLesson ||
    (progress.activeUnitId === finalUnit.id &&
      progress.activeLessonId === finalLesson.id)
  ) {
    return progress;
  }
  return {
    ...progress,
    activeUnitId: finalUnit.id,
    activeLessonId: finalLesson.id,
  };
}

export function parseStrictProgress(input: unknown): LearnerProgress | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const candidate = input as Record<string, unknown>;
  if (candidate.version !== 1) return null;
  const validUnits = new Set(units.map((unit) => unit.id));
  const validLessons = new Set(
    units.flatMap((unit) => getUnitLessons(unit.id).map((lesson) => lesson.id)),
  );
  if (
    !isBoundedInteger(candidate.xp, 0, 1_000_000_000) ||
    !isBoundedInteger(candidate.totalSessions, 0, 10_000_000) ||
    !Array.isArray(candidate.completedDays) ||
    candidate.completedDays.length > 20_000 ||
    !candidate.completedDays.every(isDateKey) ||
    !Array.isArray(candidate.completedUnits) ||
    candidate.completedUnits.length > units.length ||
    !candidate.completedUnits.every(
      (value) => typeof value === 'string' && validUnits.has(value),
    ) ||
    (candidate.completedLessons !== undefined &&
      (!Array.isArray(candidate.completedLessons) ||
        candidate.completedLessons.length > validLessons.size ||
        !candidate.completedLessons.every(
          (value) => typeof value === 'string' && validLessons.has(value),
        ))) ||
    typeof candidate.activeUnitId !== 'string' ||
    !validUnits.has(candidate.activeUnitId) ||
    (candidate.activeLessonId !== undefined &&
      (typeof candidate.activeLessonId !== 'string' ||
        !getUnitLessons(candidate.activeUnitId).some(
          (lesson) => lesson.id === candidate.activeLessonId,
        ))) ||
    (candidate.activePathUpdatedAt !== undefined &&
      candidate.activePathUpdatedAt !== '' &&
      !isIsoInstant(candidate.activePathUpdatedAt)) ||
    !isStrictNumberRecord(candidate.dailyMinutes) ||
    !isStrictReviewRecord(candidate.reviews) ||
    (candidate.mistakes !== undefined &&
      !isStrictMistakeRecord(candidate.mistakes)) ||
    !Array.isArray(candidate.history) ||
    candidate.history.length > 120 ||
    !candidate.history.every((item) =>
      isStrictHistoryItem(item, validUnits, validLessons),
    )
  ) {
    return null;
  }
  return normalizeCourseFrontier(parseProgress(JSON.stringify(candidate)));
}

export function validateProgressEvent(
  input: unknown,
  options: {
    now?: Date;
    validUnit: (unitId: string) => boolean;
    validLesson: (unitId: string, lessonId: string) => boolean;
    validReviewKey: (reviewKey: string) => boolean;
  },
): ProgressEvent | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const value = input as Record<string, unknown>;
  if (
    value.version !== 1 ||
    !isIdentifier(value.id) ||
    !isIdentifier(value.deviceId) ||
    !Number.isSafeInteger(value.clientSequence) ||
    Number(value.clientSequence) < 1 ||
    !isIsoInstant(value.occurredAt) ||
    !isTimeZone(value.timeZone)
  ) {
    return null;
  }
  const occurredAt = String(value.occurredAt);
  const now = options.now ?? new Date();
  const eventTime = Date.parse(occurredAt);
  if (eventTime > now.getTime() + 86_400_000) {
    return null;
  }
  const base = {
    version: 1 as const,
    id: String(value.id),
    deviceId: String(value.deviceId),
    clientSequence: Number(value.clientSequence),
    occurredAt,
    timeZone: String(value.timeZone),
  };
  if (value.type === 'active-unit-selected') {
    if (
      typeof value.unitId !== 'string' ||
      typeof value.lessonId !== 'string' ||
      !options.validUnit(value.unitId) ||
      !options.validLesson(value.unitId, value.lessonId)
    )
      return null;
    return {
      ...base,
      type: value.type,
      unitId: value.unitId,
      lessonId: value.lessonId,
    };
  }
  if (value.type === 'review-attempt') {
    if (
      !isIdentifier(value.sessionId) ||
      typeof value.reviewKey !== 'string' ||
      value.reviewKey.length > 220 ||
      !options.validReviewKey(value.reviewKey) ||
      (value.outcome !== 'first-correct' &&
        value.outcome !== 'retry-correct' &&
        value.outcome !== 'wrong')
    )
      return null;
    return {
      ...base,
      type: value.type,
      sessionId: String(value.sessionId),
      reviewKey: value.reviewKey,
      outcome: value.outcome,
    };
  }
  if (value.type !== 'session-completed') return null;
  if (
    !isIdentifier(value.sessionId) ||
    typeof value.unitId !== 'string' ||
    !options.validUnit(value.unitId) ||
    typeof value.nextUnitId !== 'string' ||
    !options.validUnit(value.nextUnitId) ||
    typeof value.nextLessonId !== 'string' ||
    !options.validLesson(value.nextUnitId, value.nextLessonId) ||
    typeof value.completesUnit !== 'boolean' ||
    (value.kind !== 'lesson' &&
      value.kind !== 'review' &&
      value.kind !== 'mistakes' &&
      value.kind !== 'vocab-match') ||
    !isBoundedInteger(value.minutes, 1, 180) ||
    !isBoundedInteger(value.firstTryCorrect, 0, 100) ||
    !isBoundedInteger(value.prompts, 1, 100) ||
    Number(value.firstTryCorrect) > Number(value.prompts) ||
    !isBoundedInteger(value.reportedXp, 0, 1000) ||
    Number(value.reportedXp) > Number(value.prompts) * 10 ||
    !Array.isArray(value.modes) ||
    value.modes.length < 1 ||
    value.modes.length > 5 ||
    !value.modes.every(isSkillMode)
  )
    return null;
  if (
    value.sourceUnitIds !== undefined &&
    (!Array.isArray(value.sourceUnitIds) ||
      value.sourceUnitIds.length < 1 ||
      value.sourceUnitIds.length > units.length ||
      !value.sourceUnitIds.every(
        (unitId) => typeof unitId === 'string' && options.validUnit(unitId),
      ))
  )
    return null;
  if (
    value.lessonId !== undefined &&
    (typeof value.lessonId !== 'string' ||
      !options.validLesson(value.unitId, value.lessonId))
  )
    return null;
  return {
    ...base,
    type: value.type,
    sessionId: String(value.sessionId),
    unitId: value.unitId,
    sourceUnitIds: value.sourceUnitIds
      ? [...new Set(value.sourceUnitIds as string[])]
      : undefined,
    lessonId: value.lessonId as string | undefined,
    nextUnitId: value.nextUnitId,
    nextLessonId: value.nextLessonId,
    completesUnit: value.completesUnit,
    kind: value.kind,
    minutes: Number(value.minutes),
    firstTryCorrect: Number(value.firstTryCorrect),
    prompts: Number(value.prompts),
    modes: [...new Set(value.modes as SkillMode[])],
    reportedXp: Number(value.reportedXp),
  };
}

export async function hashProgressEvent(event: ProgressEvent) {
  const bytes = new TextEncoder().encode(JSON.stringify(event));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

export async function accountCacheKey(userId: string) {
  const bytes = new TextEncoder().encode(`salita-account:${userId}`);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)]
    .slice(0, 16)
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

export function emptyProgress() {
  return createInitialProgress();
}

function isIdentifier(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^[a-zA-Z0-9][a-zA-Z0-9._:-]{7,79}$/u.test(value)
  );
}

function isIsoInstant(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const time = Date.parse(value);
  return Number.isFinite(time) && new Date(time).toISOString() === value;
}

function isTimeZone(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 80) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value }).format();
    return true;
  } catch {
    return false;
  }
}

function isBoundedInteger(value: unknown, minimum: number, maximum: number) {
  return (
    Number.isInteger(value) &&
    Number(value) >= minimum &&
    Number(value) <= maximum
  );
}

function isSkillMode(value: unknown): value is SkillMode {
  return (
    value === 'listening' ||
    value === 'reading' ||
    value === 'speaking' ||
    value === 'grammar' ||
    value === 'pronunciation'
  );
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isStrictNumberRecord(value: unknown) {
  if (!isPlainRecord(value)) return false;
  const entries = Object.entries(value);
  return (
    entries.length <= 20_000 &&
    entries.every(
      ([dateKey, minutes]) =>
        isDateKey(dateKey) && isBoundedInteger(minutes, 0, 10_000),
    )
  );
}

function isStrictReviewRecord(value: unknown) {
  if (!isPlainRecord(value)) return false;
  const entries = Object.entries(value);
  return (
    entries.length <= 20_000 &&
    entries.every(([key, item]) => {
      if (!isValidReviewKey(key) || !isPlainRecord(item)) return false;
      return (
        isBoundedInteger(item.stage, 0, 6) &&
        isDateKey(item.dueDate) &&
        isBoundedInteger(item.correct, 0, 10_000_000) &&
        isBoundedInteger(item.attempts, 0, 10_000_000) &&
        Number(item.correct) <= Number(item.attempts) &&
        (item.lastPracticedAt === undefined ||
          isIsoInstant(item.lastPracticedAt))
      );
    })
  );
}

function isStrictMistakeRecord(value: unknown) {
  if (!isPlainRecord(value)) return false;
  const entries = Object.entries(value);
  return (
    entries.length <= 20_000 &&
    entries.every(([key, item]) => {
      if (!isValidReviewKey(key) || !isPlainRecord(item)) return false;
      return (
        (item.state === 'active' ||
          item.state === 'recovering' ||
          item.state === 'recovered') &&
        isBoundedInteger(item.lapseCount, 1, 10_000_000) &&
        isBoundedInteger(item.cleanSuccesses, 0, 10_000_000) &&
        isIsoInstant(item.lastMissedAt) &&
        isIsoInstant(item.lastPracticedAt) &&
        isDateKey(item.nextPracticeDate) &&
        (item.source === undefined ||
          item.source === 'observed' ||
          item.source === 'legacy-inferred')
      );
    })
  );
}

function isStrictHistoryItem(
  value: unknown,
  validUnits: Set<string>,
  validLessons: Set<string>,
) {
  if (!isPlainRecord(value)) return false;
  return (
    typeof value.id === 'string' &&
    value.id.length >= 1 &&
    value.id.length <= 120 &&
    isDateKey(value.dateKey) &&
    isIsoInstant(value.completedAt) &&
    typeof value.unitId === 'string' &&
    validUnits.has(value.unitId) &&
    (value.sourceUnitIds === undefined ||
      (Array.isArray(value.sourceUnitIds) &&
        value.sourceUnitIds.length >= 1 &&
        value.sourceUnitIds.length <= validUnits.size &&
        value.sourceUnitIds.every(
          (unitId) => typeof unitId === 'string' && validUnits.has(unitId),
        ))) &&
    (value.lessonId === undefined ||
      (typeof value.lessonId === 'string' &&
        validLessons.has(value.lessonId) &&
        value.lessonId.startsWith(`${value.unitId}-`))) &&
    isBoundedInteger(value.xp, 0, 1_000) &&
    isBoundedInteger(value.firstTryCorrect, 0, 100) &&
    isBoundedInteger(value.prompts, 1, 100) &&
    Number(value.firstTryCorrect) <= Number(value.prompts) &&
    Number(value.xp) <= Number(value.prompts) * 10 &&
    Array.isArray(value.modes) &&
    value.modes.length >= 1 &&
    value.modes.length <= 5 &&
    value.modes.every(isSkillMode) &&
    (value.kind === undefined ||
      value.kind === 'lesson' ||
      value.kind === 'review' ||
      value.kind === 'mistakes' ||
      value.kind === 'vocab-match')
  );
}
