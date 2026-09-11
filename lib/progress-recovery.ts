import {
  applyProgressEvent,
  parseStrictProgress,
  type ProgressEvent,
} from './progress-events.ts';
import {
  createInitialProgress,
  mergeLegacyProgress,
  type LearnerProgress,
} from './progress.ts';

export const RECOVERY_PREFIX = 'salita:recovery:';

export type RecoveryStorage = Pick<
  Storage,
  'getItem' | 'setItem' | 'removeItem' | 'key' | 'length'
>;

export type ProgressRecovery = {
  storageKey: string;
  capturedAt: string;
  accountKey: string;
  generation: number;
  baseProgress: LearnerProgress | null;
  progress: LearnerProgress;
  events: ProgressEvent[];
  eventRefs: RecoveryEventRef[];
};

export type RecoveryEventRef = {
  generation: number;
  eventId: string;
};

type RecoveryInput = {
  accountKey: string;
  generation: number;
  baseProgress?: LearnerProgress | null;
  events: ProgressEvent[];
  capturedAt?: string;
};

function recoveryStorageKey(
  accountKey: string,
  generation: number,
  capturedAt: string,
  recoveryId: string,
) {
  return `${RECOVERY_PREFIX}${accountKey}:${generation}:${Date.parse(capturedAt)}:${recoveryId}`;
}

export function compareProgressEvents(a: ProgressEvent, b: ProgressEvent) {
  return (
    a.occurredAt.localeCompare(b.occurredAt) ||
    a.deviceId.localeCompare(b.deviceId) ||
    a.clientSequence - b.clientSequence ||
    a.id.localeCompare(b.id)
  );
}

function orderedUniqueEvents(events: ProgressEvent[]) {
  const unique = new Map<string, ProgressEvent>();
  for (const event of events) unique.set(event.id, event);
  return [...unique.values()].sort(compareProgressEvents);
}

function uniqueEventRefs(eventRefs: RecoveryEventRef[]) {
  return [
    ...new Map(
      eventRefs.map((eventRef) => [
        `${eventRef.generation}:${eventRef.eventId}`,
        eventRef,
      ]),
    ).values(),
  ].sort(
    (a, b) => a.generation - b.generation || a.eventId.localeCompare(b.eventId),
  );
}

function embeddedEventIds(recoveries: ProgressRecovery[]) {
  const embedded = new Set<string>();
  for (const recovery of recoveries) {
    const recoverable = new Set(recovery.events.map((event) => event.id));
    for (const eventRef of recovery.eventRefs) {
      if (!recoverable.has(eventRef.eventId)) embedded.add(eventRef.eventId);
    }
  }
  return embedded;
}

export function persistProgressRecovery(
  storage: RecoveryStorage | null,
  input: RecoveryInput,
) {
  const baseProgress = input.baseProgress ?? createInitialProgress();
  const events = orderedUniqueEvents(input.events);
  const eventRefs = uniqueEventRefs(
    events.map((event) => ({
      generation: input.generation,
      eventId: event.id,
    })),
  );
  const progress = events.reduce(
    (current, event) => applyProgressEvent(current, event).progress,
    baseProgress,
  );
  const capturedAt = input.capturedAt ?? new Date().toISOString();
  const recoveryId = crypto.randomUUID();
  // Recovery records are append-only. A unique key prevents concurrent tabs
  // from replacing or compacting away work they did not observe.
  const storageKey = recoveryStorageKey(
    input.accountKey,
    input.generation,
    capturedAt,
    recoveryId,
  );
  const record: ProgressRecovery = {
    storageKey,
    capturedAt,
    accountKey: input.accountKey,
    generation: input.generation,
    baseProgress,
    progress,
    events,
    eventRefs,
  };
  if (!storage) return { ...record, persisted: false as const };

  const payloads = [
    {
      capturedAt,
      accountKey: input.accountKey,
      generation: input.generation,
      baseProgress,
      progress,
      events,
      eventRefs,
    },
    {
      capturedAt,
      accountKey: input.accountKey,
      generation: input.generation,
      baseProgress,
      events,
      eventRefs,
    },
  ];
  for (const payload of payloads) {
    try {
      storage.setItem(storageKey, JSON.stringify(payload));
      return { ...record, persisted: true as const };
    } catch {
      // Retry with a smaller, still account-scoped representation.
    }
  }

  return { ...record, persisted: false as const };
}

function parseRecovery(
  storageKey: string,
  raw: string | null,
  accountKey: string,
  currentGeneration: number,
): ProgressRecovery | null {
  const prefix = `${RECOVERY_PREFIX}${accountKey}:`;
  if (!storageKey.startsWith(prefix) || !raw) return null;
  const suffix = storageKey.slice(prefix.length).split(':');
  if (suffix.length < 2) return null;
  const keyGeneration = Number(suffix[0]);
  const capturedAtMilliseconds = Number(suffix[1]);
  if (
    !Number.isSafeInteger(keyGeneration) ||
    keyGeneration < 1 ||
    keyGeneration >= currentGeneration ||
    !Number.isSafeInteger(capturedAtMilliseconds) ||
    capturedAtMilliseconds < 0
  ) {
    return null;
  }
  try {
    const value = JSON.parse(raw) as Record<string, unknown>;
    const capturedAt =
      typeof value.capturedAt === 'string' ? value.capturedAt : '';
    const events = Array.isArray(value.events)
      ? (value.events.filter(
          (event) =>
            Boolean(event) &&
            typeof event === 'object' &&
            typeof (event as { id?: unknown }).id === 'string',
        ) as ProgressEvent[])
      : [];
    const baseProgress =
      value.baseProgress === undefined
        ? null
        : parseStrictProgress(value.baseProgress);
    const storedProgress = parseStrictProgress(value.progress);
    const progress =
      storedProgress ??
      (baseProgress
        ? events.reduce(
            (current, event) => applyProgressEvent(current, event).progress,
            baseProgress,
          )
        : null);
    const eventRefs = uniqueEventRefs([
      ...(Array.isArray(value.eventRefs)
        ? value.eventRefs.flatMap((eventRef) => {
            if (!eventRef || typeof eventRef !== 'object') return [];
            const candidate = eventRef as Record<string, unknown>;
            return Number.isSafeInteger(candidate.generation) &&
              Number(candidate.generation) >= 1 &&
              Number(candidate.generation) < currentGeneration &&
              typeof candidate.eventId === 'string'
              ? [
                  {
                    generation: Number(candidate.generation),
                    eventId: candidate.eventId,
                  },
                ]
              : [];
          })
        : []),
      ...(Array.isArray(value.eventIds)
        ? value.eventIds.flatMap((eventId) =>
            typeof eventId === 'string'
              ? [{ generation: keyGeneration, eventId }]
              : [],
          )
        : []),
      ...events.map((event) => ({
        generation: keyGeneration,
        eventId: event.id,
      })),
    ]);
    if (
      value.accountKey !== accountKey ||
      value.generation !== keyGeneration ||
      (value.baseProgress !== undefined && !baseProgress) ||
      !progress ||
      Date.parse(capturedAt) !== capturedAtMilliseconds
    ) {
      return null;
    }
    return {
      storageKey,
      capturedAt,
      accountKey,
      generation: keyGeneration,
      baseProgress,
      progress,
      events,
      eventRefs,
    };
  } catch {
    return null;
  }
}

export function readPendingProgressRecoveries(
  storage: RecoveryStorage | null,
  accountKey: string,
  currentGeneration: number,
) {
  if (
    !storage ||
    !accountKey ||
    !Number.isSafeInteger(currentGeneration) ||
    currentGeneration < 1
  )
    return [];
  const recoveries: ProgressRecovery[] = [];
  try {
    for (let index = 0; index < storage.length; index += 1) {
      const storageKey = storage.key(index);
      if (!storageKey) continue;
      const recovery = parseRecovery(
        storageKey,
        storage.getItem(storageKey),
        accountKey,
        currentGeneration,
      );
      if (recovery) recoveries.push(recovery);
    }
  } catch {
    return recoveries;
  }
  return recoveries.sort(
    (a, b) =>
      a.generation - b.generation ||
      a.capturedAt.localeCompare(b.capturedAt) ||
      a.storageKey.localeCompare(b.storageKey),
  );
}

export function combineProgressRecoveries(recoveries: ProgressRecovery[]) {
  if (!recoveries.length) return null;
  const embedded = embeddedEventIds(recoveries);
  const baseProgress = recoveries.reduce(
    (current, recovery) =>
      mergeLegacyProgress(current, recovery.baseProgress ?? recovery.progress),
    createInitialProgress(),
  );
  const events = orderedUniqueEvents(
    recoveries.flatMap((recovery) => recovery.events),
  ).filter((event) => !embedded.has(event.id));
  const recoveryEvents = uniqueEventRefs(
    recoveries.flatMap((recovery) => recovery.eventRefs),
  );
  return {
    progress: events.reduce(
      (current, event) => applyProgressEvent(current, event).progress,
      baseProgress,
    ),
    recoveryKeys: [
      ...new Set(recoveries.map((recovery) => recovery.storageKey)),
    ],
    recoveryGenerations: [
      ...new Set(recoveryEvents.map((event) => event.generation)),
    ],
    recoveryEvents,
  };
}

export function removeProgressRecoveries(
  storage: RecoveryStorage | null,
  storageKeys: string[],
) {
  if (!storage) return;
  for (const storageKey of storageKeys) {
    if (!storageKey.startsWith(RECOVERY_PREFIX)) continue;
    try {
      storage.removeItem(storageKey);
    } catch {
      // A later retry can remove a recovery that local storage kept.
    }
  }
}

export function removeAllProgressRecoveriesForAccount(
  storage: RecoveryStorage | null,
  accountKey: string,
) {
  if (!storage) return;
  const prefix = `${RECOVERY_PREFIX}${accountKey}:`;
  const keys: string[] = [];
  try {
    for (let index = 0; index < storage.length; index += 1) {
      const storageKey = storage.key(index);
      if (storageKey?.startsWith(prefix)) keys.push(storageKey);
    }
  } catch {
    return;
  }
  removeProgressRecoveries(storage, keys);
}
