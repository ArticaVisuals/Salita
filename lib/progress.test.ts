import assert from 'node:assert/strict';
import test from 'node:test';

import {
  addCalendarDays,
  deriveStreaks,
  isReviewDue,
  localDateKey,
  parseProgress,
  scoreAttempt,
  updateReview,
} from './progress.ts';

void test('local date keys respect the requested time zone at a date boundary', () => {
  const instant = new Date('2026-09-10T00:30:00.000Z');
  assert.equal(localDateKey(instant, 'UTC'), '2026-09-10');
  assert.equal(localDateKey(instant, 'America/Los_Angeles'), '2026-09-09');
});

void test('calendar arithmetic stays sequential across DST dates', () => {
  assert.equal(addCalendarDays('2026-03-08', 1), '2026-03-09');
  assert.equal(addCalendarDays('2026-11-01', 1), '2026-11-02');
});

void test('a current streak may end today or yesterday', () => {
  assert.deepEqual(
    deriveStreaks(['2026-09-07', '2026-09-08', '2026-09-09'], '2026-09-10'),
    { current: 3, best: 3 },
  );
  assert.deepEqual(
    deriveStreaks(['2026-09-08', '2026-09-09', '2026-09-10'], '2026-09-10'),
    { current: 3, best: 3 },
  );
});

void test('a missed day resets current streak without erasing best streak', () => {
  assert.deepEqual(
    deriveStreaks(['2026-09-01', '2026-09-02', '2026-09-03'], '2026-09-10'),
    { current: 0, best: 3 },
  );
});

void test('review stages advance, hold after retry, and fall after a miss', () => {
  const advanced = updateReview(undefined, 'first-correct', '2026-09-10');
  assert.equal(advanced.stage, 1);
  assert.equal(advanced.dueDate, '2026-09-11');
  const retry = updateReview(advanced, 'retry-correct', '2026-09-11');
  assert.equal(retry.stage, 1);
  const missed = updateReview(retry, 'wrong', '2026-09-12');
  assert.equal(missed.stage, 0);
  assert.equal(missed.dueDate, '2026-09-12');
});

void test('future reviews cannot be advanced by early practice', () => {
  assert.equal(isReviewDue(undefined, '2026-09-10'), true);
  assert.equal(
    isReviewDue(
      { stage: 2, dueDate: '2026-09-13', correct: 2, attempts: 2 },
      '2026-09-10',
    ),
    false,
  );
  assert.equal(
    isReviewDue(
      { stage: 2, dueDate: '2026-09-10', correct: 2, attempts: 2 },
      '2026-09-10',
    ),
    true,
  );
});

void test('hints and retries cannot earn first-try mastery', () => {
  assert.deepEqual(scoreAttempt({ correct: true }), {
    outcome: 'first-correct',
    points: 10,
    firstTryCorrect: true,
    usedSupport: false,
  });
  assert.deepEqual(scoreAttempt({ correct: true, hintUsed: true }), {
    outcome: 'retry-correct',
    points: 5,
    firstTryCorrect: false,
    usedSupport: true,
  });
  assert.equal(scoreAttempt({ correct: false }).points, 0);
});

void test('corrupt stored state safely falls back to initial progress', () => {
  assert.equal(parseProgress('{bad json').version, 1);
  assert.equal(parseProgress('{bad json').xp, 0);
});
