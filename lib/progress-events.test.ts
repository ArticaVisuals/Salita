import assert from 'node:assert/strict';
import test from 'node:test';

import { getUnitLessons, isValidReviewKey, units } from '../app/curriculum.ts';
import { createInitialProgress } from './progress.ts';
import {
  applyProgressEvent,
  normalizeCourseFrontier,
  parseStrictProgress,
  validateProgressEvent,
  type ProgressEvent,
} from './progress-events.ts';

function eventBase(overrides: Partial<ProgressEvent> = {}) {
  return {
    version: 1 as const,
    id: 'event:00000000-0000-4000-8000-000000000001',
    deviceId: 'device:00000000-0000-4000-8000-000000000001',
    clientSequence: 1,
    occurredAt: '2026-09-10T18:00:00.000Z',
    timeZone: 'America/Los_Angeles',
    ...overrides,
  };
}

void test('active path events cannot skip ahead to a locked lesson', () => {
  const initial = createInitialProgress();
  const event: ProgressEvent = {
    ...eventBase(),
    type: 'active-unit-selected',
    unitId: 'greetings',
    lessonId: 'greetings-pattern',
  };
  const result = applyProgressEvent(initial, event).progress;
  assert.equal(result.activeUnitId, 'greetings');
  assert.equal(result.activeLessonId, 'greetings-sounds');
  assert.equal(result.activePathUpdatedAt, '');
});

void test('stale active path events cannot rewind a newer lesson position', () => {
  const initial = {
    ...createInitialProgress(),
    completedLessons: ['greetings-sounds'],
    activeUnitId: 'greetings',
    activeLessonId: 'greetings-words',
    activePathUpdatedAt: '2026-09-11T18:00:00.000Z',
  };
  const event: ProgressEvent = {
    ...eventBase(),
    type: 'active-unit-selected',
    unitId: 'greetings',
    lessonId: 'greetings-sounds',
  };
  assert.deepEqual(applyProgressEvent(initial, event).progress, initial);
});

void test('newer active path events cannot rewind to a completed lesson', () => {
  const initial = {
    ...createInitialProgress(),
    completedLessons: ['greetings-sounds'],
    activeLessonId: 'greetings-words',
    activePathUpdatedAt: '2026-09-10T17:00:00.000Z',
  };
  const event: ProgressEvent = {
    ...eventBase({ occurredAt: '2026-09-10T19:00:00.000Z' }),
    type: 'active-unit-selected',
    unitId: 'greetings',
    lessonId: 'greetings-sounds',
  };
  assert.deepEqual(applyProgressEvent(initial, event).progress, initial);
});

void test('a mistake requires clean recall on separate due days to recover', () => {
  const reviewKey = 'greetings-kumusta:reading';
  const wrong: ProgressEvent = {
    ...eventBase(),
    type: 'review-attempt',
    sessionId: 'session:00000000-0000-4000-8000-000000000001',
    reviewKey,
    outcome: 'wrong',
  };
  const afterWrong = applyProgressEvent(
    createInitialProgress(),
    wrong,
  ).progress;
  assert.equal(afterWrong.mistakes[reviewKey].state, 'active');

  const sameDayRetry: ProgressEvent = {
    ...wrong,
    id: 'event:00000000-0000-4000-8000-000000000002',
    clientSequence: 2,
    outcome: 'retry-correct',
  };
  const afterRetry = applyProgressEvent(afterWrong, sameDayRetry).progress;
  assert.equal(afterRetry.mistakes[reviewKey].state, 'active');

  const nextDay: ProgressEvent = {
    ...wrong,
    id: 'event:00000000-0000-4000-8000-000000000003',
    clientSequence: 3,
    occurredAt: '2026-09-11T18:00:00.000Z',
    outcome: 'first-correct',
  };
  const afterFirstClean = applyProgressEvent(afterRetry, nextDay).progress;
  assert.equal(afterFirstClean.mistakes[reviewKey].state, 'recovering');

  const followingDay: ProgressEvent = {
    ...wrong,
    id: 'event:00000000-0000-4000-8000-000000000004',
    clientSequence: 4,
    occurredAt: '2026-09-12T18:00:00.000Z',
    outcome: 'first-correct',
  };
  const recovered = applyProgressEvent(afterFirstClean, followingDay).progress;
  assert.equal(recovered.mistakes[reviewKey].state, 'recovered');
});

void test('lesson completion advances one micro-lesson without erasing legacy progress', () => {
  const initial = {
    ...createInitialProgress(),
    xp: 40,
    completedUnits: ['greetings'],
  };
  const event: ProgressEvent = {
    ...eventBase(),
    type: 'session-completed',
    sessionId: 'session:00000000-0000-4000-8000-000000000005',
    unitId: 'greetings',
    lessonId: 'greetings-sounds',
    nextUnitId: 'greetings',
    nextLessonId: 'greetings-words',
    completesUnit: false,
    kind: 'lesson',
    minutes: 6,
    firstTryCorrect: 3,
    prompts: 4,
    modes: ['pronunciation', 'listening', 'reading', 'speaking'],
    reportedXp: 30,
  };
  const result = applyProgressEvent(initial, event).progress;
  assert.equal(result.xp, 40);
  assert.deepEqual(result.completedUnits, ['greetings']);
  assert.ok(result.completedLessons.includes('greetings-sounds'));
  assert.equal(result.activeLessonId, 'greetings-words');
  assert.equal(result.totalSessions, 1);
});

void test('strict progress parsing migrates a valid legacy v1 snapshot', () => {
  const legacy = createInitialProgress();
  const {
    completedLessons: _lessons,
    activeLessonId: _lesson,
    activePathUpdatedAt: _pathUpdated,
    mistakes: _mistakes,
    ...oldShape
  } = legacy;
  const parsed = parseStrictProgress(oldShape);
  assert.ok(parsed);
  assert.deepEqual(parsed.completedLessons, []);
  assert.equal(parsed.activeLessonId, 'greetings-sounds');
});

void test('legacy unit progress returns to the earliest incomplete micro-lesson', () => {
  const legacy = {
    ...createInitialProgress(),
    completedUnits: ['greetings', 'introductions'],
    activeUnitId: 'needs',
    activeLessonId: 'needs-sounds',
    activePathUpdatedAt: '2026-09-10T18:00:00.000Z',
  };
  const normalized = normalizeCourseFrontier(legacy);
  assert.equal(normalized.activeUnitId, 'greetings');
  assert.equal(normalized.activeLessonId, 'greetings-sounds');
  assert.deepEqual(normalized.completedUnits, legacy.completedUnits);
  assert.equal(normalized.xp, legacy.xp);
});

void test('the course frontier follows completed micro-lessons in order', () => {
  const normalized = normalizeCourseFrontier({
    ...createInitialProgress(),
    completedLessons: ['greetings-sounds'],
    activeUnitId: 'help',
    activeLessonId: 'help-checkpoint',
  });
  assert.equal(normalized.activeUnitId, 'greetings');
  assert.equal(normalized.activeLessonId, 'greetings-words');
});

void test('strict progress parsing rejects unknown curriculum data', () => {
  assert.equal(
    parseStrictProgress({
      ...createInitialProgress(),
      reviews: {
        'invented-item:reading': {
          stage: 1,
          dueDate: '2026-09-11',
          correct: 1,
          attempts: 1,
        },
      },
    }),
    null,
  );
  assert.equal(
    parseStrictProgress({
      ...createInitialProgress(),
      dailyMinutes: { 'not-a-date': 6 },
    }),
    null,
  );
});

void test('older review events cannot overwrite newer recall state', () => {
  const reviewKey = 'greetings-kumusta:reading';
  const newer: ProgressEvent = {
    ...eventBase({ occurredAt: '2026-09-12T18:00:00.000Z' }),
    type: 'review-attempt',
    sessionId: 'session:00000000-0000-4000-8000-000000000020',
    reviewKey,
    outcome: 'first-correct',
  };
  const older: ProgressEvent = {
    ...eventBase({
      id: 'event:00000000-0000-4000-8000-000000000021',
      clientSequence: 2,
    }),
    type: 'review-attempt',
    sessionId: 'session:00000000-0000-4000-8000-000000000021',
    reviewKey,
    outcome: 'wrong',
  };
  const afterNewer = applyProgressEvent(
    createInitialProgress(),
    newer,
  ).progress;
  const afterOlder = applyProgressEvent(afterNewer, older).progress;
  assert.deepEqual(
    afterOlder.reviews[reviewKey],
    afterNewer.reviews[reviewKey],
  );
  assert.equal(afterOlder.mistakes[reviewKey], undefined);
  assert.equal(afterOlder.xp, 10);
});

void test('session history stays chronological when devices sync out of order', () => {
  const later: ProgressEvent = {
    ...eventBase({ occurredAt: '2026-09-12T18:00:00.000Z' }),
    type: 'session-completed',
    sessionId: 'session:00000000-0000-4000-8000-000000000030',
    unitId: 'greetings',
    lessonId: 'greetings-sounds',
    nextUnitId: 'greetings',
    nextLessonId: 'greetings-words',
    completesUnit: false,
    kind: 'lesson',
    minutes: 6,
    firstTryCorrect: 2,
    prompts: 3,
    modes: ['listening'],
    reportedXp: 20,
  };
  const earlier: ProgressEvent = {
    ...later,
    id: 'event:00000000-0000-4000-8000-000000000031',
    clientSequence: 2,
    occurredAt: '2026-09-11T18:00:00.000Z',
    sessionId: 'session:00000000-0000-4000-8000-000000000031',
    kind: 'review',
  };
  const afterLater = applyProgressEvent(
    createInitialProgress(),
    later,
  ).progress;
  const result = applyProgressEvent(afterLater, earlier).progress;
  assert.deepEqual(
    result.history.map((item) => item.id),
    [earlier.sessionId, later.sessionId],
  );
  assert.equal(result.activeLessonId, 'greetings-words');
});

void test('event validation accepts only known units, lessons, and review keys', () => {
  const input = {
    ...eventBase(),
    type: 'review-attempt',
    sessionId: 'session:00000000-0000-4000-8000-000000000006',
    reviewKey: 'greetings-kumusta:reading',
    outcome: 'first-correct',
  };
  const options = {
    now: new Date('2026-09-10T20:00:00.000Z'),
    validUnit: (unitId: string) => units.some((unit) => unit.id === unitId),
    validLesson: (unitId: string, lessonId: string) =>
      getUnitLessons(unitId).some((lesson) => lesson.id === lessonId),
    validReviewKey: isValidReviewKey,
  };
  assert.ok(validateProgressEvent(input, options));
  assert.equal(
    validateProgressEvent({ ...input, reviewKey: 'made-up:item' }, options),
    null,
  );
  assert.equal(
    validateProgressEvent({ ...input, timeZone: 'Not/AZone' }, options),
    null,
  );

  const mixedReview = validateProgressEvent(
    {
      ...eventBase({ clientSequence: 2 }),
      type: 'session-completed',
      sessionId: 'session:00000000-0000-4000-8000-000000000007',
      unitId: 'greetings',
      sourceUnitIds: ['greetings', 'introductions', 'greetings'],
      nextUnitId: 'greetings',
      nextLessonId: 'greetings-sounds',
      completesUnit: false,
      kind: 'review',
      minutes: 4,
      firstTryCorrect: 2,
      prompts: 3,
      modes: ['reading'],
      reportedXp: 20,
    },
    options,
  );
  assert.deepEqual(
    mixedReview?.type === 'session-completed'
      ? mixedReview.sourceUnitIds
      : undefined,
    ['greetings', 'introductions'],
  );
  assert.equal(
    validateProgressEvent(
      {
        ...(mixedReview as ProgressEvent),
        sourceUnitIds: ['invented-unit'],
      },
      options,
    ),
    null,
  );
});
