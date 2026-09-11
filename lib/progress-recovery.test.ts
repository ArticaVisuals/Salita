import assert from 'node:assert/strict';
import test from 'node:test';

import { createInitialProgress } from './progress.ts';
import {
  combineProgressRecoveries,
  persistProgressRecovery,
  readPendingProgressRecoveries,
  removeProgressRecoveries,
  type RecoveryStorage,
} from './progress-recovery.ts';
import type { ProgressEvent } from './progress-events.ts';

class MemoryStorage implements RecoveryStorage {
  readonly values: Map<string, string>;
  private readonly failWrites: boolean;

  constructor(values = new Map<string, string>(), failWrites = false) {
    this.values = values;
    this.failWrites = failWrites;
  }

  get length() {
    return this.values.size;
  }

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  key(index: number) {
    return [...this.values.keys()][index] ?? null;
  }

  removeItem(key: string) {
    this.values.delete(key);
  }

  setItem(key: string, value: string) {
    if (this.failWrites) throw new Error('storage full');
    this.values.set(key, value);
  }
}

class FirstWriteFailsStorage extends MemoryStorage {
  attempts = 0;

  setItem(key: string, value: string) {
    this.attempts += 1;
    if (this.attempts === 1) throw new Error('first payload too large');
    super.setItem(key, value);
  }
}

const accountA = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const accountB = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';

function reviewEvent(
  id: string,
  reviewKey: string,
  clientSequence: number,
): ProgressEvent {
  return {
    version: 1,
    id,
    deviceId: 'device:00000000-0000-4000-8000-000000000001',
    clientSequence,
    occurredAt: `2026-09-${String(10 + clientSequence).padStart(2, '0')}T18:00:00.000Z`,
    timeZone: 'America/Los_Angeles',
    type: 'review-attempt',
    sessionId: `session:${clientSequence.toString().padStart(32, '0')}`,
    reviewKey,
    outcome: 'first-correct',
  };
}

function lessonEvent({
  id,
  sessionId,
  deviceId,
  clientSequence,
  occurredAt,
  lessonId,
  nextLessonId,
  minutes,
}: {
  id: string;
  sessionId: string;
  deviceId: string;
  clientSequence: number;
  occurredAt: string;
  lessonId: string;
  nextLessonId: string;
  minutes: number;
}): Extract<ProgressEvent, { type: 'session-completed' }> {
  return {
    version: 1,
    id,
    deviceId,
    clientSequence,
    occurredAt,
    timeZone: 'America/Los_Angeles',
    type: 'session-completed',
    sessionId,
    unitId: 'greetings',
    lessonId,
    nextUnitId: 'greetings',
    nextLessonId,
    completesUnit: false,
    kind: 'lesson',
    minutes,
    firstTryCorrect: 2,
    prompts: 3,
    modes: ['reading'],
    reportedXp: 20,
  };
}

void test('a complete stale-generation recovery survives a fresh reader', () => {
  const values = new Map<string, string>();
  const event = reviewEvent(
    'event:00000000-0000-4000-8000-000000000001',
    'greetings-kumusta:reading',
    1,
  );
  const persisted = persistProgressRecovery(new MemoryStorage(values), {
    accountKey: accountA,
    generation: 1,
    baseProgress: { ...createInitialProgress(), xp: 5 },
    events: [event],
    capturedAt: '2026-09-11T18:00:00.000Z',
  });

  assert.equal(persisted.persisted, true);
  const afterReload = readPendingProgressRecoveries(
    new MemoryStorage(values),
    accountA,
    2,
  );
  assert.equal(afterReload.length, 1);
  assert.equal(afterReload[0].progress.xp, 15);
  assert.equal(afterReload[0].events[0].id, event.id);
  assert.equal(
    afterReload[0].progress.reviews['greetings-kumusta:reading'].attempts,
    1,
  );
});

void test('a failed recovery write keeps the only durable event untouched', () => {
  const outboxKey = `${accountA}:outbox:event`;
  const values = new Map([[outboxKey, 'durable event']]);
  const failed = persistProgressRecovery(new MemoryStorage(values, true), {
    accountKey: accountA,
    generation: 1,
    events: [
      reviewEvent(
        'event:00000000-0000-4000-8000-000000000002',
        'greetings-kumusta:pronunciation',
        2,
      ),
    ],
    capturedAt: '2026-09-11T19:00:00.000Z',
  });

  assert.equal(failed.persisted, false);
  assert.equal(values.get(outboxKey), 'durable event');
  assert.equal(failed.progress.xp, 10);
});

void test('the compact typed recovery retains its base and events after reload', () => {
  const storage = new FirstWriteFailsStorage();
  const event = reviewEvent(
    'event:00000000-0000-4000-8000-000000000020',
    'greetings-kumusta:reading',
    1,
  );
  const persisted = persistProgressRecovery(storage, {
    accountKey: accountA,
    generation: 1,
    baseProgress: { ...createInitialProgress(), xp: 7 },
    events: [event],
    capturedAt: '2026-09-11T20:00:00.000Z',
  });

  assert.equal(persisted.persisted, true);
  assert.equal(storage.attempts, 2);
  const afterReload = readPendingProgressRecoveries(storage, accountA, 2);
  assert.equal(afterReload.length, 1);
  assert.equal(afterReload[0].progress.xp, 17);
  assert.equal(afterReload[0].events[0].id, event.id);
});

void test('recovery reads are isolated by account and prior generation', () => {
  const storage = new MemoryStorage();
  for (const [accountKey, generation, capturedAt] of [
    [accountA, 1, '2026-09-11T18:00:00.000Z'],
    [accountB, 1, '2026-09-11T19:00:00.000Z'],
    [accountA, 3, '2026-09-11T20:00:00.000Z'],
  ] as const) {
    persistProgressRecovery(storage, {
      accountKey,
      generation,
      events: [],
      baseProgress: { ...createInitialProgress(), xp: generation },
      capturedAt,
    });
  }
  storage.setItem(
    `salita:recovery:${accountA}:2:0`,
    '{"accountKey":"not-the-key"}',
  );

  const recoveries = readPendingProgressRecoveries(storage, accountA, 3);
  assert.deepEqual(
    recoveries.map(({ accountKey, generation }) => ({
      accountKey,
      generation,
    })),
    [{ accountKey: accountA, generation: 1 }],
  );
});

void test('multiple recoveries combine deterministically and disappear after resolution', () => {
  const storage = new MemoryStorage();
  persistProgressRecovery(storage, {
    accountKey: accountA,
    generation: 1,
    events: [
      reviewEvent(
        'event:00000000-0000-4000-8000-000000000003',
        'greetings-kumusta:reading',
        1,
      ),
    ],
    capturedAt: '2026-09-11T18:00:00.000Z',
  });
  persistProgressRecovery(storage, {
    accountKey: accountA,
    generation: 2,
    events: [
      reviewEvent(
        'event:00000000-0000-4000-8000-000000000004',
        'greetings-kumusta:listening',
        2,
      ),
    ],
    capturedAt: '2026-09-11T19:00:00.000Z',
  });

  const recoveries = readPendingProgressRecoveries(storage, accountA, 3);
  const combined = combineProgressRecoveries(recoveries);
  assert.ok(combined);
  assert.deepEqual(combined.recoveryGenerations, [1, 2]);
  assert.equal(Object.keys(combined.progress.reviews).length, 2);
  assert.equal(combined.progress.xp, 20);
  assert.deepEqual(combined.recoveryEvents, [
    {
      generation: 1,
      eventId: 'event:00000000-0000-4000-8000-000000000003',
    },
    {
      generation: 2,
      eventId: 'event:00000000-0000-4000-8000-000000000004',
    },
  ]);

  removeProgressRecoveries(storage, combined.recoveryKeys);
  assert.deepEqual(readPendingProgressRecoveries(storage, accountA, 3), []);
});

void test('same-generation captures in the same millisecond use distinct immutable keys', () => {
  const storage = new MemoryStorage();
  const capturedAt = '2026-09-11T21:00:00.000Z';
  const first = persistProgressRecovery(storage, {
    accountKey: accountA,
    generation: 1,
    events: [
      reviewEvent(
        'event:00000000-0000-4000-8000-000000000030',
        'greetings-kumusta:reading',
        1,
      ),
    ],
    capturedAt,
  });
  const second = persistProgressRecovery(storage, {
    accountKey: accountA,
    generation: 1,
    events: [
      reviewEvent(
        'event:00000000-0000-4000-8000-000000000031',
        'greetings-kumusta:listening',
        2,
      ),
    ],
    capturedAt,
  });

  assert.notEqual(first.storageKey, second.storageKey);
  assert.equal(readPendingProgressRecoveries(storage, accountA, 2).length, 2);
});

void test('cross-device lesson events follow occurrence time, not local sequence', () => {
  const earlier = lessonEvent({
    id: 'event:00000000-0000-4000-8000-000000000040',
    sessionId: 'session:00000000-0000-4000-8000-000000000040',
    deviceId: 'device:zzzzzzzz-0000-4000-8000-000000000040',
    clientSequence: 50,
    occurredAt: '2026-09-11T18:00:00.000Z',
    lessonId: 'greetings-sounds',
    nextLessonId: 'greetings-words',
    minutes: 3,
  });
  const later = lessonEvent({
    id: 'event:00000000-0000-4000-8000-000000000041',
    sessionId: 'session:00000000-0000-4000-8000-000000000041',
    deviceId: 'device:aaaaaaaa-0000-4000-8000-000000000041',
    clientSequence: 1,
    occurredAt: '2026-09-11T18:05:00.000Z',
    lessonId: 'greetings-words',
    nextLessonId: 'greetings-pattern',
    minutes: 4,
  });
  const storage = new MemoryStorage();
  persistProgressRecovery(storage, {
    accountKey: accountA,
    generation: 1,
    events: [later],
    capturedAt: '2026-09-11T21:01:00.000Z',
  });
  persistProgressRecovery(storage, {
    accountKey: accountA,
    generation: 2,
    events: [earlier],
    capturedAt: '2026-09-11T21:02:00.000Z',
  });

  const combined = combineProgressRecoveries(
    readPendingProgressRecoveries(storage, accountA, 3),
  );
  assert.ok(combined);
  assert.equal(combined.progress.totalSessions, 2);
  assert.equal(combined.progress.dailyMinutes['2026-09-11'], 7);
  assert.deepEqual(combined.progress.completedLessons, [
    'greetings-sounds',
    'greetings-words',
  ]);
  assert.equal(combined.progress.activeLessonId, 'greetings-pattern');
  assert.deepEqual(
    combined.progress.history.map((item) => item.id),
    [earlier.sessionId, later.sessionId],
  );
});
