'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import {
  applyProgressEvent,
  normalizeCourseFrontier,
  parseStrictProgress,
  type ProgressBootstrap,
  type ProgressEvent,
  type ProgressEventDraft,
  type ProgressSyncResponse,
} from '@/lib/progress-events';
import {
  STORAGE_KEY,
  createInitialProgress,
  isProgressEmpty,
  parseProgress,
  type LearnerProgress,
} from '@/lib/progress';
import {
  RECOVERY_PREFIX,
  compareProgressEvents,
  combineProgressRecoveries,
  persistProgressRecovery,
  readPendingProgressRecoveries,
  removeAllProgressRecoveriesForAccount,
  removeProgressRecoveries,
  type ProgressRecovery,
  type RecoveryEventRef,
} from '@/lib/progress-recovery';

type SyncStatus =
  | 'loading'
  | 'saved'
  | 'saving'
  | 'offline'
  | 'device-only'
  | 'attention';

type AccountState = {
  accountKey: string;
  accountEmail: string;
  generation: number;
  revision: number;
  updatedAt: string | null;
};

export type LegacyConflict = {
  progress: LearnerProgress;
  belongsToAnotherAccount: boolean;
  source: 'legacy' | 'stale-generation';
  recoveryKeys: string[];
  recoveryGenerations: number[];
  recoveryEvents: RecoveryEventRef[];
};

const LEGACY_OWNER_KEY = 'salita:legacy-owner:v1';
const LEGACY_BACKUP_KEY = 'salita:legacy-backup:v1';
const LAST_ACCOUNT_KEY = 'salita:last-account:v1';
const ACCOUNT_PREFIX = 'salita:account:';

type CachedAccount = {
  accountKey: string;
  accountEmail: string;
  generation: number;
};

type CachedBase = {
  generation: number;
  revision?: number;
  updatedAt?: string | null;
  progress: LearnerProgress;
};

type QueuedProgressEvent = {
  generation: number;
  event: ProgressEvent;
};

type VolatileProgressEvent = QueuedProgressEvent & {
  accountKey: string;
};

function safeLocalStorage() {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function storageGet(storage: Storage | null, key: string) {
  try {
    return storage?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

function storageSet(storage: Storage | null, key: string, value: string) {
  try {
    if (!storage) return false;
    storage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

function storageRemove(storage: Storage | null, key: string) {
  try {
    storage?.removeItem(key);
  } catch {
    // Cache cleanup is best-effort; the cloud copy remains canonical.
  }
}

function storageKeysStartingWith(storage: Storage | null, prefix: string) {
  const keys: string[] = [];
  if (!storage) return keys;
  try {
    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index);
      if (key?.startsWith(prefix)) keys.push(key);
    }
  } catch {
    return keys;
  }
  return keys;
}

function newId(prefix: string) {
  return `${prefix}:${crypto.randomUUID()}`;
}

async function deterministicOperationId(prefix: string, value: string) {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(value),
  );
  const hex = [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
  return `${prefix}:${hex}`;
}

function accountGenerationPrefix(accountKey: string, generation: number) {
  return `${ACCOUNT_PREFIX}${accountKey}:generation:${generation}:`;
}

function accountBaseKey(accountKey: string, generation: number) {
  return `${accountGenerationPrefix(accountKey, generation)}base:v1`;
}

function accountEventPrefix(accountKey: string, generation: number) {
  return `${accountGenerationPrefix(accountKey, generation)}event:`;
}

function accountEventKey(
  accountKey: string,
  generation: number,
  eventId: string,
) {
  return `${accountEventPrefix(accountKey, generation)}${eventId}`;
}

function olderPendingGenerations(
  storage: Storage | null,
  accountKey: string,
  currentGeneration: number,
) {
  const prefix = `${ACCOUNT_PREFIX}${accountKey}:generation:`;
  const generations = new Set<number>();
  for (const key of storageKeysStartingWith(storage, prefix)) {
    const suffix = key.slice(prefix.length);
    const match = /^(\d+):event:/u.exec(suffix);
    const generation = match ? Number(match[1]) : Number.NaN;
    if (
      Number.isSafeInteger(generation) &&
      generation >= 1 &&
      generation < currentGeneration
    ) {
      generations.add(generation);
    }
  }
  return [...generations].sort((a, b) => a - b);
}

function readPendingEvents(
  storage: Storage | null,
  accountKey: string,
  generation: number,
) {
  if (!storage) return [];
  const prefix = accountEventPrefix(accountKey, generation);
  const events: ProgressEvent[] = [];
  for (const key of storageKeysStartingWith(storage, prefix)) {
    try {
      const parsed = JSON.parse(
        storageGet(storage, key) ?? '',
      ) as QueuedProgressEvent;
      if (
        parsed?.generation === generation &&
        parsed.event?.id &&
        key === accountEventKey(accountKey, generation, parsed.event.id)
      ) {
        events.push(parsed.event);
      } else {
        storageRemove(storage, key);
      }
    } catch {
      storageRemove(storage, key);
    }
  }
  return events.sort(compareProgressEvents);
}

function readCachedBase(
  storage: Storage | null,
  accountKey: string,
  generation: number,
) {
  try {
    const parsed = JSON.parse(
      storageGet(storage, accountBaseKey(accountKey, generation)) ?? '',
    ) as CachedBase;
    if (parsed?.generation !== generation) return null;
    const progress = parseStrictProgress(parsed.progress);
    return progress
      ? {
          generation,
          revision: parsed.revision,
          updatedAt: parsed.updatedAt,
          progress,
        }
      : null;
  } catch {
    return null;
  }
}

function readLastAccount(storage: Storage | null) {
  try {
    const parsed = JSON.parse(
      storageGet(storage, LAST_ACCOUNT_KEY) ?? '',
    ) as CachedAccount;
    if (
      typeof parsed?.accountKey !== 'string' ||
      typeof parsed.accountEmail !== 'string' ||
      !Number.isSafeInteger(parsed.generation) ||
      parsed.generation < 1
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function readCachedAccount(storage: Storage | null) {
  const descriptor = readLastAccount(storage);
  if (!descriptor) return null;
  const base = readCachedBase(
    storage,
    descriptor.accountKey,
    descriptor.generation,
  );
  const canonical = base?.progress ?? createInitialProgress();
  const pending = readPendingEvents(
    storage,
    descriptor.accountKey,
    descriptor.generation,
  );
  return {
    account: {
      ...descriptor,
      revision:
        Number.isSafeInteger(base?.revision) && Number(base?.revision) >= 0
          ? Number(base?.revision)
          : 0,
      updatedAt:
        typeof base?.updatedAt === 'string' || base?.updatedAt === null
          ? base.updatedAt
          : null,
    } satisfies AccountState,
    canonical,
    progress: applyEvents(canonical, pending),
  };
}

function applyEvents(progress: LearnerProgress, events: ProgressEvent[]) {
  return events.reduce(
    (current, event) => applyProgressEvent(current, event).progress,
    progress,
  );
}

function quarantinePendingGeneration(
  storage: Storage | null,
  accountKey: string,
  generation: number,
  volatileEvents: ProgressEvent[] = [],
  fallbackBaseProgress?: LearnerProgress,
) {
  const durableEvents = readPendingEvents(storage, accountKey, generation);
  const pending = new Map<string, ProgressEvent>();
  for (const event of [...durableEvents, ...volatileEvents]) {
    pending.set(event.id, event);
  }
  if (!pending.size) return null;
  const cached = readCachedBase(storage, accountKey, generation);
  const recovery = persistProgressRecovery(storage, {
    accountKey,
    generation,
    baseProgress: cached?.progress ?? fallbackBaseProgress,
    events: [...pending.values()],
  });
  if (recovery.persisted) {
    for (const event of durableEvents) {
      storageRemove(storage, accountEventKey(accountKey, generation, event.id));
    }
  }
  return recovery;
}

function downloadProgress(progress: LearnerProgress) {
  const blob = new Blob([JSON.stringify(progress, null, 2)], {
    type: 'application/json',
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `salita-progress-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

function responseIsBootstrap(value: unknown): value is ProgressBootstrap {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const candidate = value as Record<string, unknown>;
  return (
    candidate.protocolVersion === 1 &&
    typeof candidate.accountKey === 'string' &&
    typeof candidate.accountEmail === 'string' &&
    Number.isSafeInteger(candidate.generation) &&
    Number.isSafeInteger(candidate.revision) &&
    Boolean(parseStrictProgress(candidate.progress))
  );
}

export function useSyncedProgress() {
  const [progress, setProgressState] = useState<LearnerProgress>(
    createInitialProgress,
  );
  const [hydrated, setHydrated] = useState(false);
  const [status, setStatus] = useState<SyncStatus>('loading');
  const [storageIssue, setStorageIssue] = useState(false);
  const [account, setAccount] = useState<AccountState | null>(null);
  const [legacyConflict, setLegacyConflict] = useState<LegacyConflict | null>(
    null,
  );
  const progressRef = useRef(progress);
  const canonicalRef = useRef(progress);
  const accountRef = useRef<AccountState | null>(null);
  const deviceOnlyRef = useRef(false);
  const inFlightRef = useRef(false);
  const syncIdlePromiseRef = useRef<Promise<void> | null>(null);
  const resolveSyncIdleRef = useRef<(() => void) | null>(null);
  const bootstrapInFlightRef = useRef(false);
  const bootstrapAgainRef = useRef(false);
  const mountedRef = useRef(true);
  const syncAgainRef = useRef(false);
  const syncNowRef = useRef<() => Promise<void>>(async () => undefined);
  const bootstrapNowRef = useRef<() => Promise<void>>(async () => undefined);
  const completedSessionIdsRef = useRef(new Set<string>());
  const pageDeviceIdRef = useRef('');
  const pageSequenceRef = useRef(0);
  const volatileOutboxRef = useRef(new Map<string, VolatileProgressEvent>());
  const legacyConflictRef = useRef<LegacyConflict | null>(null);

  const pendingEventsFor = useCallback(
    (storage: Storage | null, accountKey: string, generation: number) => {
      const events = new Map(
        readPendingEvents(storage, accountKey, generation).map((event) => [
          event.id,
          event,
        ]),
      );
      for (const queued of volatileOutboxRef.current.values()) {
        if (
          queued.accountKey === accountKey &&
          queued.generation === generation
        ) {
          events.set(queued.event.id, queued.event);
        }
      }
      return [...events.values()].sort(compareProgressEvents);
    },
    [],
  );

  const commitProgress = useCallback((next: LearnerProgress) => {
    progressRef.current = next;
    if (mountedRef.current) setProgressState(next);
  }, []);

  const commitLegacyConflict = useCallback((next: LegacyConflict | null) => {
    legacyConflictRef.current = next;
    if (mountedRef.current) setLegacyConflict(next);
  }, []);

  const acceptBootstrap = useCallback(
    (
      bootstrap: ProgressBootstrap,
      acknowledged: string[] = [],
      acknowledgedGeneration = bootstrap.generation,
    ) => {
      const storage = safeLocalStorage();
      let generationRecovery: ReturnType<
        typeof persistProgressRecovery
      > | null = null;
      for (const eventId of acknowledged) {
        storageRemove(
          storage,
          accountEventKey(
            bootstrap.accountKey,
            acknowledgedGeneration,
            eventId,
          ),
        );
        const volatile = volatileOutboxRef.current.get(eventId);
        if (
          volatile?.accountKey === bootstrap.accountKey &&
          volatile.generation === acknowledgedGeneration
        ) {
          volatileOutboxRef.current.delete(eventId);
        }
      }
      const inMemoryPrior = accountRef.current;
      const prior = inMemoryPrior ?? readLastAccount(storage);
      if (
        prior?.accountKey === bootstrap.accountKey &&
        prior.generation !== bootstrap.generation
      ) {
        const volatile = [...volatileOutboxRef.current.values()].filter(
          (queued) =>
            queued.accountKey === bootstrap.accountKey &&
            queued.generation === prior.generation,
        );
        generationRecovery = quarantinePendingGeneration(
          storage,
          bootstrap.accountKey,
          prior.generation,
          volatile.map((queued) => queued.event),
          inMemoryPrior?.accountKey === bootstrap.accountKey &&
            inMemoryPrior.generation === prior.generation
            ? canonicalRef.current
            : undefined,
        );
        if (generationRecovery?.persisted) {
          for (const queued of volatile) {
            volatileOutboxRef.current.delete(queued.event.id);
          }
        } else if (generationRecovery) {
          setStorageIssue(true);
        }
      }
      const nextAccount: AccountState = {
        accountKey: bootstrap.accountKey,
        accountEmail: bootstrap.accountEmail,
        generation: bootstrap.generation,
        revision: bootstrap.revision,
        updatedAt: bootstrap.updatedAt,
      };
      accountRef.current = nextAccount;
      deviceOnlyRef.current = false;
      setAccount(nextAccount);
      canonicalRef.current = bootstrap.progress;
      const cachedBase = storageSet(
        storage,
        accountBaseKey(bootstrap.accountKey, bootstrap.generation),
        JSON.stringify({
          generation: bootstrap.generation,
          revision: bootstrap.revision,
          updatedAt: bootstrap.updatedAt,
          progress: bootstrap.progress,
        } satisfies CachedBase),
      );
      const cachedAccount = storageSet(
        storage,
        LAST_ACCOUNT_KEY,
        JSON.stringify({
          accountKey: bootstrap.accountKey,
          accountEmail: bootstrap.accountEmail,
          generation: bootstrap.generation,
        } satisfies CachedAccount),
      );
      if (!cachedBase || !cachedAccount) setStorageIssue(true);
      const pending = pendingEventsFor(
        storage,
        bootstrap.accountKey,
        bootstrap.generation,
      );
      commitProgress(applyEvents(bootstrap.progress, pending));
      return generationRecovery;
    },
    [commitProgress, pendingEventsFor],
  );

  const detachAccount = useCallback(() => {
    accountRef.current = null;
    deviceOnlyRef.current = true;
    setAccount(null);
    const storage = safeLocalStorage();
    // A confirmed 401 must not let an offline retry revive the prior identity.
    // Its namespaced base and outbox remain available if that account signs in again.
    storageRemove(storage, LAST_ACCOUNT_KEY);
    const local = normalizeCourseFrontier(
      parseProgress(storageGet(storage, STORAGE_KEY)),
    );
    canonicalRef.current = local;
    commitProgress(local);
    setStatus('device-only');
  }, [commitProgress]);

  const syncNow = useCallback(async () => {
    const currentAccount = accountRef.current;
    if (!currentAccount || deviceOnlyRef.current) {
      if (!inFlightRef.current && syncIdlePromiseRef.current) {
        resolveSyncIdleRef.current?.();
        resolveSyncIdleRef.current = null;
        syncIdlePromiseRef.current = null;
      }
      return;
    }
    if (inFlightRef.current) {
      syncAgainRef.current = true;
      await syncIdlePromiseRef.current;
      return;
    }
    if (!syncIdlePromiseRef.current) {
      syncIdlePromiseRef.current = new Promise((resolve) => {
        resolveSyncIdleRef.current = resolve;
      });
    }
    const idlePromise = syncIdlePromiseRef.current;
    const storage = safeLocalStorage();
    const sentGeneration = currentAccount.generation;
    inFlightRef.current = true;
    try {
      while (true) {
        const events = pendingEventsFor(
          storage,
          currentAccount.accountKey,
          sentGeneration,
        ).slice(0, 100);
        if (events.length) setStatus('saving');
        const response = await fetch('/api/progress', {
          method: 'POST',
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            protocolVersion: 1,
            expectedAccountKey: currentAccount.accountKey,
            generation: sentGeneration,
            events,
          }),
        });
        const body = (await response.json().catch(() => null)) as unknown;
        if (!response.ok || !responseIsBootstrap(body)) {
          const code =
            body && typeof body === 'object' && 'code' in body
              ? String((body as { code: unknown }).code)
              : '';
          if (response.status === 401) {
            detachAccount();
          } else if (
            code === 'STALE_GENERATION' ||
            code === 'ACCOUNT_CHANGED'
          ) {
            setStatus('attention');
            queueMicrotask(() => void bootstrapNowRef.current());
          } else if (
            code === 'EVENT_CONFLICT' ||
            response.status === 400 ||
            response.status === 409
          ) {
            setStatus('attention');
          } else {
            setStatus('offline');
          }
          return;
        }
        const syncResponse = body as ProgressSyncResponse;
        if (
          accountRef.current?.accountKey !== currentAccount.accountKey ||
          accountRef.current.generation !== sentGeneration
        ) {
          queueMicrotask(() => void bootstrapNowRef.current());
          return;
        }
        acceptBootstrap(
          syncResponse,
          syncResponse.acknowledgedEventIds ?? [],
          sentGeneration,
        );
        if (events.length < 100) break;
      }
      setStatus('saved');
    } catch {
      setStatus('offline');
    } finally {
      inFlightRef.current = false;
      if (syncAgainRef.current) {
        syncAgainRef.current = false;
        queueMicrotask(() => void syncNowRef.current());
      } else {
        resolveSyncIdleRef.current?.();
        resolveSyncIdleRef.current = null;
        syncIdlePromiseRef.current = null;
      }
    }
    await idlePromise;
  }, [acceptBootstrap, detachAccount, pendingEventsFor]);

  useEffect(() => {
    syncNowRef.current = syncNow;
  }, [syncNow]);

  const importProgress = useCallback(
    async (
      importedInput: LearnerProgress | (() => LearnerProgress),
      mode: 'empty-only' | 'merge' | 'replace',
      preserveLegacyStorage = false,
      isStillCurrent?: () => boolean,
    ) => {
      let currentAccount = accountRef.current;
      if (!currentAccount) return false;
      if (isStillCurrent && !isStillCurrent()) {
        setStatus('attention');
        queueMicrotask(() => void bootstrapNowRef.current());
        return false;
      }
      if (mode !== 'empty-only') {
        await syncNowRef.current();
        currentAccount = accountRef.current;
        if (
          !currentAccount ||
          (isStillCurrent && !isStillCurrent()) ||
          pendingEventsFor(
            safeLocalStorage(),
            currentAccount.accountKey,
            currentAccount.generation,
          ).length > 0
        ) {
          setStatus('attention');
          return false;
        }
      }
      const imported =
        typeof importedInput === 'function' ? importedInput() : importedInput;
      try {
        const importId = await deterministicOperationId(
          'import',
          JSON.stringify({
            accountKey: currentAccount.accountKey,
            generation: currentAccount.generation,
            mode,
            progress: imported,
          }),
        );
        if (isStillCurrent && !isStillCurrent()) {
          setStatus('attention');
          queueMicrotask(() => void bootstrapNowRef.current());
          return false;
        }
        setStatus('saving');
        const response = await fetch('/api/progress/import', {
          method: 'POST',
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            protocolVersion: 1,
            expectedAccountKey: currentAccount.accountKey,
            expectedGeneration: currentAccount.generation,
            expectedRevision: currentAccount.revision,
            importId,
            mode,
            progress: imported,
          }),
        });
        const body = (await response.json().catch(() => null)) as unknown;
        if (!response.ok || !responseIsBootstrap(body)) {
          if (response.status === 401) {
            detachAccount();
          } else {
            setStatus(response.status === 409 ? 'attention' : 'offline');
          }
          if (response.status === 409) {
            queueMicrotask(() => void bootstrapNowRef.current());
          }
          return false;
        }
        const storage = safeLocalStorage();
        if (!preserveLegacyStorage) {
          storageSet(storage, LEGACY_OWNER_KEY, body.accountKey);
          storageSet(storage, LEGACY_BACKUP_KEY, JSON.stringify(imported));
          storageRemove(storage, STORAGE_KEY);
        }
        const generationRecovery = acceptBootstrap(body);
        commitLegacyConflict(null);
        setStatus('saved');
        if (generationRecovery) {
          queueMicrotask(() => void bootstrapNowRef.current());
        }
        return true;
      } catch {
        setStatus('offline');
        return false;
      }
    },
    [acceptBootstrap, commitLegacyConflict, detachAccount, pendingEventsFor],
  );

  const bootstrapNow = useCallback(async () => {
    if (bootstrapInFlightRef.current) {
      bootstrapAgainRef.current = true;
      return;
    }
    bootstrapInFlightRef.current = true;
    const storage = safeLocalStorage();
    if (!storage) setStorageIssue(true);
    const legacy = normalizeCourseFrontier(
      parseProgress(storageGet(storage, STORAGE_KEY)),
    );
    const restoreCachedAccount = () => {
      const cached = readCachedAccount(storage);
      if (!cached) return false;
      accountRef.current = cached.account;
      canonicalRef.current = cached.canonical;
      deviceOnlyRef.current = false;
      setAccount(cached.account);
      commitProgress(cached.progress);
      return true;
    };
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 10_000);
    try {
      const response = await fetch('/api/progress', {
        headers: { Accept: 'application/json' },
        cache: 'no-store',
        signal: controller.signal,
      });
      if (response.status === 401) {
        detachAccount();
        return;
      }
      const body = (await response.json().catch(() => null)) as unknown;
      if (!response.ok || !responseIsBootstrap(body)) {
        if (!accountRef.current) {
          if (!restoreCachedAccount()) {
            canonicalRef.current = legacy;
            commitProgress(legacy);
          }
        }
        setStatus('offline');
        return;
      }
      const priorAccount = accountRef.current;
      const priorCanonical = canonicalRef.current;
      const immediateRecovery = acceptBootstrap(body);
      const inMemoryRecoveries: ProgressRecovery[] = [];
      if (immediateRecovery && !immediateRecovery.persisted) {
        inMemoryRecoveries.push(immediateRecovery);
      }
      const alreadyQuarantined = new Set(
        immediateRecovery?.eventRefs.map((event) => event.generation) ?? [],
      );
      const staleGenerations = new Set(
        olderPendingGenerations(storage, body.accountKey, body.generation),
      );
      for (const queued of volatileOutboxRef.current.values()) {
        if (
          queued.accountKey === body.accountKey &&
          queued.generation < body.generation
        ) {
          staleGenerations.add(queued.generation);
        }
      }
      for (const generation of [...staleGenerations].sort((a, b) => a - b)) {
        if (alreadyQuarantined.has(generation)) continue;
        const volatile = [...volatileOutboxRef.current.values()].filter(
          (queued) =>
            queued.accountKey === body.accountKey &&
            queued.generation === generation,
        );
        const recovery = quarantinePendingGeneration(
          storage,
          body.accountKey,
          generation,
          volatile.map((queued) => queued.event),
          priorAccount?.accountKey === body.accountKey &&
            priorAccount.generation === generation
            ? priorCanonical
            : undefined,
        );
        if (!recovery) continue;
        if (recovery.persisted) {
          for (const queued of volatile) {
            volatileOutboxRef.current.delete(queued.event.id);
          }
        } else {
          inMemoryRecoveries.push(recovery);
          setStorageIssue(true);
        }
      }
      const storedRecoveries = readPendingProgressRecoveries(
        storage,
        body.accountKey,
        body.generation,
      );
      const recoveries = new Map<string, ProgressRecovery>();
      for (const recovery of [...storedRecoveries, ...inMemoryRecoveries]) {
        recoveries.set(recovery.storageKey, recovery);
      }
      const combinedRecovery = combineProgressRecoveries([
        ...recoveries.values(),
      ]);
      const storedRecoveryKeys = new Set(
        storedRecoveries.map((recovery) => recovery.storageKey),
      );
      const recoveryConflict =
        combinedRecovery && !isProgressEmpty(combinedRecovery.progress)
          ? ({
              progress: combinedRecovery.progress,
              belongsToAnotherAccount: false,
              source: 'stale-generation',
              recoveryKeys: combinedRecovery.recoveryKeys.filter((key) =>
                storedRecoveryKeys.has(key),
              ),
              recoveryGenerations: combinedRecovery.recoveryGenerations,
              recoveryEvents: combinedRecovery.recoveryEvents,
            } satisfies LegacyConflict)
          : null;
      if (combinedRecovery && isProgressEmpty(combinedRecovery.progress)) {
        removeProgressRecoveries(storage, combinedRecovery.recoveryKeys);
      }
      const legacyOwner = storageGet(storage, LEGACY_OWNER_KEY);
      const hasLegacy = !isProgressEmpty(legacy);
      if (recoveryConflict) {
        commitLegacyConflict(recoveryConflict);
        setStatus('attention');
      } else if (
        hasLegacy &&
        !body.hasCloudData &&
        legacyOwner === body.accountKey
      ) {
        const imported = await importProgress(legacy, 'empty-only');
        if (!imported) {
          commitLegacyConflict({
            progress: legacy,
            belongsToAnotherAccount: false,
            source: 'legacy',
            recoveryKeys: [],
            recoveryGenerations: [],
            recoveryEvents: [],
          });
          setStatus('attention');
        }
      } else if (hasLegacy) {
        commitLegacyConflict({
          progress: legacy,
          belongsToAnotherAccount:
            legacyOwner !== null && legacyOwner !== body.accountKey,
          source: 'legacy',
          recoveryKeys: [],
          recoveryGenerations: [],
          recoveryEvents: [],
        });
        setStatus('attention');
      } else {
        commitLegacyConflict(null);
        setStatus('saved');
      }
      void syncNowRef.current();
    } catch {
      if (!accountRef.current) {
        if (!restoreCachedAccount()) {
          canonicalRef.current = legacy;
          commitProgress(legacy);
        }
      }
      setStatus('offline');
    } finally {
      window.clearTimeout(timeout);
      bootstrapInFlightRef.current = false;
      if (mountedRef.current) setHydrated(true);
      if (bootstrapAgainRef.current) {
        bootstrapAgainRef.current = false;
        queueMicrotask(() => void bootstrapNowRef.current());
      }
    }
  }, [
    acceptBootstrap,
    commitLegacyConflict,
    commitProgress,
    detachAccount,
    importProgress,
  ]);

  useEffect(() => {
    bootstrapNowRef.current = bootstrapNow;
  }, [bootstrapNow]);

  useEffect(() => {
    mountedRef.current = true;
    void bootstrapNowRef.current();

    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    const resume = () => {
      if (document.visibilityState !== 'visible') return;
      void bootstrapNowRef.current();
    };
    const online = () => {
      void bootstrapNowRef.current();
    };
    const storageChanged = (event: StorageEvent) => {
      const currentAccount = accountRef.current;
      if (!currentAccount || !event.key) return;
      const recoveryPrefix = `${RECOVERY_PREFIX}${currentAccount.accountKey}:`;
      const accountPrefix = `${ACCOUNT_PREFIX}${currentAccount.accountKey}:`;
      if (
        event.key.startsWith(recoveryPrefix) ||
        (event.key.startsWith(accountPrefix) &&
          event.key.includes(':event:')) ||
        event.key === STORAGE_KEY
      ) {
        void bootstrapNowRef.current();
      }
    };
    window.addEventListener('online', online);
    window.addEventListener('focus', online);
    window.addEventListener('storage', storageChanged);
    document.addEventListener('visibilitychange', resume);
    return () => {
      window.removeEventListener('online', online);
      window.removeEventListener('focus', online);
      window.removeEventListener('storage', storageChanged);
      document.removeEventListener('visibilitychange', resume);
    };
  }, []);

  const dispatch = useCallback(
    (draft: ProgressEventDraft) => {
      if (draft.type === 'session-completed') {
        if (completedSessionIdsRef.current.has(draft.sessionId)) return 0;
        completedSessionIdsRef.current.add(draft.sessionId);
      }
      const storage = safeLocalStorage();
      if (!pageDeviceIdRef.current) pageDeviceIdRef.current = newId('device');
      const event = {
        ...draft,
        version: 1,
        id: newId('event'),
        deviceId: pageDeviceIdRef.current,
        clientSequence: pageSequenceRef.current + 1,
        occurredAt: new Date().toISOString(),
        timeZone:
          Intl.DateTimeFormat().resolvedOptions().timeZone ||
          'America/Los_Angeles',
      } as ProgressEvent;
      pageSequenceRef.current = event.clientSequence;
      const applied = applyProgressEvent(progressRef.current, event);
      if (deviceOnlyRef.current || !accountRef.current) {
        try {
          if (!storage) throw new Error('LOCAL_STORAGE_UNAVAILABLE');
          storage.setItem(STORAGE_KEY, JSON.stringify(applied.progress));
        } catch {
          setStorageIssue(true);
        }
      } else {
        const currentAccount = accountRef.current;
        try {
          if (!storage) throw new Error('LOCAL_STORAGE_UNAVAILABLE');
          storage.setItem(
            accountEventKey(
              currentAccount.accountKey,
              currentAccount.generation,
              event.id,
            ),
            JSON.stringify({
              generation: currentAccount.generation,
              event,
            } satisfies QueuedProgressEvent),
          );
        } catch {
          volatileOutboxRef.current.set(event.id, {
            accountKey: currentAccount.accountKey,
            generation: currentAccount.generation,
            event,
          });
          setStorageIssue(true);
          setStatus('offline');
        }
        queueMicrotask(() => void syncNowRef.current());
      }
      commitProgress(applied.progress);
      return applied.awardedXp;
    },
    [commitProgress],
  );

  const exportProgress = useCallback(async () => {
    const expectedAccount = accountRef.current;
    if (!expectedAccount || deviceOnlyRef.current) {
      downloadProgress(progressRef.current);
      return;
    }
    try {
      await syncNowRef.current();
      const currentAccount = accountRef.current;
      if (
        !currentAccount ||
        deviceOnlyRef.current ||
        currentAccount.accountKey !== expectedAccount.accountKey ||
        currentAccount.generation !== expectedAccount.generation ||
        pendingEventsFor(
          safeLocalStorage(),
          currentAccount.accountKey,
          currentAccount.generation,
        ).length > 0
      ) {
        downloadProgress(progressRef.current);
        return;
      }
      const query = new URLSearchParams({
        expectedAccountKey: currentAccount.accountKey,
      });
      const response = await fetch(`/api/progress/export?${query}`, {
        cache: 'no-store',
      });
      if (response.status === 401) detachAccount();
      if (!response.ok) throw new Error('export unavailable');
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `salita-progress-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
    } catch {
      downloadProgress(progressRef.current);
    }
  }, [detachAccount, pendingEventsFor]);

  const importBackup = useCallback(
    async (input: unknown, mode: 'merge' | 'replace') => {
      const parsed = parseStrictProgress(input);
      if (!parsed) return { ok: false, reason: 'invalid' as const };
      if (legacyConflictRef.current) {
        setStatus('attention');
        return { ok: false, reason: 'unavailable' as const };
      }
      if (!accountRef.current || deviceOnlyRef.current) {
        canonicalRef.current = parsed;
        commitProgress(parsed);
        if (
          !storageSet(safeLocalStorage(), STORAGE_KEY, JSON.stringify(parsed))
        ) {
          setStorageIssue(true);
        }
        return { ok: true as const };
      }
      return (await importProgress(parsed, mode))
        ? { ok: true as const }
        : { ok: false as const, reason: 'unavailable' as const };
    },
    [commitProgress, importProgress],
  );

  const resolveLegacyConflict = useCallback(
    async (choice: 'keep-cloud' | 'merge' | 'replace') => {
      const currentAccount = accountRef.current;
      const conflict = legacyConflict;
      if (!conflict || !currentAccount) return false;
      const storage = safeLocalStorage();
      const conflictStillCurrent = () => {
        const latestAccount = accountRef.current;
        if (
          legacyConflictRef.current !== conflict ||
          latestAccount?.accountKey !== currentAccount.accountKey ||
          latestAccount.generation !== currentAccount.generation
        ) {
          return false;
        }
        if (conflict.source === 'stale-generation') {
          if (!conflict.recoveryKeys.length) return true;
          const currentKeys = new Set(
            readPendingProgressRecoveries(
              storage,
              currentAccount.accountKey,
              currentAccount.generation,
            ).map((recovery) => recovery.storageKey),
          );
          return conflict.recoveryKeys.every((key) => currentKeys.has(key));
        }
        const currentLegacy = normalizeCourseFrontier(
          parseProgress(storageGet(storage, STORAGE_KEY)),
        );
        return (
          !isProgressEmpty(currentLegacy) &&
          JSON.stringify(currentLegacy) === JSON.stringify(conflict.progress)
        );
      };
      const invalidateConflict = () => {
        commitLegacyConflict(null);
        setStatus('attention');
        queueMicrotask(() => void bootstrapNowRef.current());
      };
      const removeResolvedRecovery = () => {
        removeProgressRecoveries(storage, conflict.recoveryKeys);
        for (const event of conflict.recoveryEvents) {
          storageRemove(
            storage,
            accountEventKey(
              currentAccount.accountKey,
              event.generation,
              event.eventId,
            ),
          );
        }
        for (const [eventId, queued] of volatileOutboxRef.current) {
          if (
            queued.accountKey === currentAccount.accountKey &&
            conflict.recoveryEvents.some(
              (event) =>
                event.generation === queued.generation &&
                event.eventId === eventId,
            )
          ) {
            volatileOutboxRef.current.delete(eventId);
          }
        }
      };
      if (!conflictStillCurrent()) {
        invalidateConflict();
        return false;
      }
      if (choice === 'keep-cloud') {
        const backupStored =
          conflict.source === 'stale-generation'
            ? true
            : storageSet(
                storage,
                LEGACY_BACKUP_KEY,
                JSON.stringify(conflict.progress),
              );
        if (!backupStored) {
          setStorageIssue(true);
          return false;
        }
        // A no-op replace makes "keep" a server-CAS decision, so a second tab
        // cannot subsequently overwrite the choice with a stale conflict.
        const confirmed = await importProgress(
          () => canonicalRef.current,
          'replace',
          true,
          conflictStillCurrent,
        );
        if (!confirmed) return false;
        removeResolvedRecovery();
        if (conflict.source === 'legacy') {
          storageRemove(storage, STORAGE_KEY);
          storageRemove(storage, LEGACY_OWNER_KEY);
        }
        commitLegacyConflict(null);
        queueMicrotask(() => void bootstrapNowRef.current());
        return true;
      }
      const imported = await importProgress(
        conflict.progress,
        choice,
        conflict.source === 'stale-generation',
        conflictStillCurrent,
      );
      if (!imported) return false;
      removeResolvedRecovery();
      queueMicrotask(() => void bootstrapNowRef.current());
      return true;
    },
    [commitLegacyConflict, importProgress, legacyConflict],
  );

  const clearThisDevice = useCallback(async () => {
    if (legacyConflictRef.current) {
      setStatus('attention');
      return false;
    }
    const storage = safeLocalStorage();
    if (accountRef.current) {
      const expectedAccount = accountRef.current;
      await syncNowRef.current();
      const currentAccount = accountRef.current;
      const hasStaleVolatile = [...volatileOutboxRef.current.values()].some(
        (queued) =>
          queued.accountKey === currentAccount?.accountKey &&
          queued.generation !== currentAccount.generation,
      );
      if (
        !currentAccount ||
        Boolean(legacyConflictRef.current) ||
        currentAccount.accountKey !== expectedAccount.accountKey ||
        currentAccount.generation !== expectedAccount.generation ||
        readPendingProgressRecoveries(
          storage,
          currentAccount.accountKey,
          currentAccount.generation,
        ).length > 0 ||
        olderPendingGenerations(
          storage,
          currentAccount.accountKey,
          currentAccount.generation,
        ).length > 0 ||
        hasStaleVolatile ||
        pendingEventsFor(
          storage,
          currentAccount.accountKey,
          currentAccount.generation,
        ).length > 0
      ) {
        setStatus('attention');
        queueMicrotask(() => void bootstrapNowRef.current());
        return false;
      }
      storageRemove(storage, STORAGE_KEY);
      // Delete only the cache entry observed above. A broad prefix deletion can
      // erase an event another tab writes immediately after the final scan.
      storageRemove(
        storage,
        accountBaseKey(currentAccount.accountKey, currentAccount.generation),
      );
      storageRemove(storage, LAST_ACCOUNT_KEY);
      storageRemove(storage, LEGACY_OWNER_KEY);
      storageRemove(storage, LEGACY_BACKUP_KEY);
      for (const [eventId, queued] of volatileOutboxRef.current) {
        if (queued.accountKey === currentAccount.accountKey) {
          volatileOutboxRef.current.delete(eventId);
        }
      }
      try {
        const response = await fetch('/api/progress', {
          headers: { Accept: 'application/json' },
          cache: 'no-store',
        });
        const body = (await response.json().catch(() => null)) as unknown;
        if (response.ok && responseIsBootstrap(body)) {
          acceptBootstrap(body);
          setStatus('saving');
          queueMicrotask(() => void syncNowRef.current());
          return true;
        }
        if (response.status === 401) {
          detachAccount();
          return true;
        }
      } catch {
        // The canonical cloud copy remains intact.
      }
      commitProgress(canonicalRef.current);
    } else {
      storageRemove(storage, STORAGE_KEY);
      const empty = createInitialProgress();
      canonicalRef.current = empty;
      commitProgress(empty);
    }
    return true;
  }, [acceptBootstrap, commitProgress, detachAccount, pendingEventsFor]);

  const deleteEverywhere = useCallback(async () => {
    const currentAccount = accountRef.current;
    if (!currentAccount || deviceOnlyRef.current) {
      return false;
    }
    setStatus('saving');
    try {
      const response = await fetch('/api/progress', {
        method: 'DELETE',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          expectedAccountKey: currentAccount.accountKey,
          expectedGeneration: currentAccount.generation,
          resetId: await deterministicOperationId(
            'reset',
            `${currentAccount.accountKey}:${currentAccount.generation}`,
          ),
          confirmation: 'DELETE SYNCED PROGRESS',
        }),
      });
      const body = (await response.json().catch(() => null)) as unknown;
      if (!response.ok || !responseIsBootstrap(body)) {
        if (response.status === 401) {
          detachAccount();
        } else {
          setStatus(response.status === 409 ? 'attention' : 'offline');
        }
        if (response.status === 409) {
          queueMicrotask(() => void bootstrapNowRef.current());
        }
        return false;
      }
      const storage = safeLocalStorage();
      const prefix = `${ACCOUNT_PREFIX}${currentAccount.accountKey}:`;
      for (const key of storageKeysStartingWith(storage, prefix)) {
        storageRemove(storage, key);
      }
      for (const [eventId, queued] of volatileOutboxRef.current) {
        if (queued.accountKey === currentAccount.accountKey) {
          volatileOutboxRef.current.delete(eventId);
        }
      }
      removeAllProgressRecoveriesForAccount(storage, currentAccount.accountKey);
      storageRemove(storage, STORAGE_KEY);
      storageRemove(storage, LEGACY_OWNER_KEY);
      storageRemove(storage, LEGACY_BACKUP_KEY);
      commitLegacyConflict(null);
      acceptBootstrap(body);
      setStatus('saved');
      return true;
    } catch {
      setStatus('offline');
      return false;
    }
  }, [acceptBootstrap, commitLegacyConflict, detachAccount]);

  return {
    progress,
    hydrated,
    status,
    storageIssue,
    accountEmail: account?.accountEmail ?? null,
    updatedAt: account?.updatedAt ?? null,
    legacyConflict,
    dispatch,
    syncNow,
    exportProgress,
    importBackup,
    resolveLegacyConflict,
    clearThisDevice,
    deleteEverywhere,
  };
}
