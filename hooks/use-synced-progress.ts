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
};

const LEGACY_OWNER_KEY = 'salita:legacy-owner:v1';
const LEGACY_BACKUP_KEY = 'salita:legacy-backup:v1';
const LAST_ACCOUNT_KEY = 'salita:last-account:v1';
const ACCOUNT_PREFIX = 'salita:account:';
const RECOVERY_PREFIX = 'salita:recovery:';

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
  return events.sort(
    (a, b) =>
      a.clientSequence - b.clientSequence ||
      a.occurredAt.localeCompare(b.occurredAt),
  );
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
) {
  const pending = readPendingEvents(storage, accountKey, generation);
  if (!pending.length) {
    storageRemove(storage, accountBaseKey(accountKey, generation));
    return null;
  }
  const cached = readCachedBase(storage, accountKey, generation);
  const progress = applyEvents(
    cached?.progress ?? createInitialProgress(),
    pending,
  );
  try {
    if (
      !storageSet(
        storage,
        `${RECOVERY_PREFIX}${accountKey}:${generation}:${Date.now()}`,
        JSON.stringify({
          capturedAt: new Date().toISOString(),
          accountKey,
          generation,
          progress,
          events: pending,
        }),
      )
    ) {
      return progress;
    }
  } catch {
    return progress;
  }
  for (const event of pending) {
    storageRemove(storage, accountEventKey(accountKey, generation, event.id));
  }
  storageRemove(storage, accountBaseKey(accountKey, generation));
  return progress;
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
  const mountedRef = useRef(true);
  const syncAgainRef = useRef(false);
  const syncNowRef = useRef<() => Promise<void>>(async () => undefined);
  const bootstrapNowRef = useRef<() => Promise<void>>(async () => undefined);
  const completedSessionIdsRef = useRef(new Set<string>());
  const pageDeviceIdRef = useRef('');
  const pageSequenceRef = useRef(0);
  const volatileOutboxRef = useRef(new Map<string, VolatileProgressEvent>());

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
      return [...events.values()].sort(
        (a, b) =>
          a.clientSequence - b.clientSequence ||
          a.occurredAt.localeCompare(b.occurredAt),
      );
    },
    [],
  );

  const commitProgress = useCallback((next: LearnerProgress) => {
    progressRef.current = next;
    if (mountedRef.current) setProgressState(next);
  }, []);

  const acceptBootstrap = useCallback(
    (
      bootstrap: ProgressBootstrap,
      acknowledged: string[] = [],
      acknowledgedGeneration = bootstrap.generation,
    ) => {
      const storage = safeLocalStorage();
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
      const prior = accountRef.current ?? readLastAccount(storage);
      if (
        prior?.accountKey === bootstrap.accountKey &&
        prior.generation !== bootstrap.generation
      ) {
        const cached = readCachedBase(
          storage,
          bootstrap.accountKey,
          prior.generation,
        );
        let recovery = quarantinePendingGeneration(
          storage,
          bootstrap.accountKey,
          prior.generation,
        );
        const volatile = [...volatileOutboxRef.current.values()].filter(
          (queued) =>
            queued.accountKey === bootstrap.accountKey &&
            queued.generation === prior.generation,
        );
        if (volatile.length) {
          recovery = applyEvents(
            recovery ?? cached?.progress ?? createInitialProgress(),
            volatile.map((queued) => queued.event),
          );
        }
        if (recovery && !isProgressEmpty(recovery)) {
          setLegacyConflict({
            progress: recovery,
            belongsToAnotherAccount: false,
          });
          if (
            !storageSet(storage, LEGACY_BACKUP_KEY, JSON.stringify(recovery))
          ) {
            setStorageIssue(true);
          }
        }
        for (const queued of volatile) {
          volatileOutboxRef.current.delete(queued.event.id);
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
      imported: LearnerProgress,
      mode: 'empty-only' | 'merge' | 'replace',
    ) => {
      let currentAccount = accountRef.current;
      if (!currentAccount) return false;
      if (mode !== 'empty-only') {
        await syncNowRef.current();
        currentAccount = accountRef.current;
        if (
          !currentAccount ||
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
      setStatus('saving');
      try {
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
            importId: await deterministicOperationId(
              'import',
              JSON.stringify({
                accountKey: currentAccount.accountKey,
                generation: currentAccount.generation,
                mode,
                progress: imported,
              }),
            ),
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
        storageSet(storage, LEGACY_OWNER_KEY, body.accountKey);
        storageSet(storage, LEGACY_BACKUP_KEY, JSON.stringify(imported));
        storageRemove(storage, STORAGE_KEY);
        acceptBootstrap(body);
        setLegacyConflict(null);
        setStatus('saved');
        return true;
      } catch {
        setStatus('offline');
        return false;
      }
    },
    [acceptBootstrap, detachAccount, pendingEventsFor],
  );

  const bootstrapNow = useCallback(async () => {
    if (bootstrapInFlightRef.current) return;
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
      acceptBootstrap(body);
      const legacyOwner = storageGet(storage, LEGACY_OWNER_KEY);
      const hasLegacy = !isProgressEmpty(legacy);
      if (hasLegacy && !body.hasCloudData && legacyOwner === body.accountKey) {
        const imported = await importProgress(legacy, 'empty-only');
        if (!imported) {
          setLegacyConflict({
            progress: legacy,
            belongsToAnotherAccount: false,
          });
        }
      } else if (hasLegacy) {
        setLegacyConflict({
          progress: legacy,
          belongsToAnotherAccount:
            legacyOwner !== null && legacyOwner !== body.accountKey,
        });
      }
      setStatus('saved');
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
    }
  }, [acceptBootstrap, commitProgress, detachAccount, importProgress]);

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
      if (accountRef.current) void syncNowRef.current();
      else void bootstrapNowRef.current();
    };
    const online = () => {
      if (accountRef.current) void syncNowRef.current();
      else void bootstrapNowRef.current();
    };
    window.addEventListener('online', online);
    window.addEventListener('focus', online);
    document.addEventListener('visibilitychange', resume);
    return () => {
      window.removeEventListener('online', online);
      window.removeEventListener('focus', online);
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
      if (!legacyConflict || !accountRef.current) return false;
      if (choice === 'keep-cloud') {
        const storage = safeLocalStorage();
        storageSet(
          storage,
          LEGACY_BACKUP_KEY,
          JSON.stringify(legacyConflict.progress),
        );
        storageSet(storage, LEGACY_OWNER_KEY, accountRef.current.accountKey);
        storageRemove(storage, STORAGE_KEY);
        setLegacyConflict(null);
        return true;
      }
      return importProgress(legacyConflict.progress, choice);
    },
    [importProgress, legacyConflict],
  );

  const clearThisDevice = useCallback(async () => {
    const storage = safeLocalStorage();
    if (accountRef.current) {
      const expectedAccount = accountRef.current;
      await syncNowRef.current();
      const currentAccount = accountRef.current;
      if (
        !currentAccount ||
        currentAccount.accountKey !== expectedAccount.accountKey ||
        currentAccount.generation !== expectedAccount.generation ||
        pendingEventsFor(
          storage,
          currentAccount.accountKey,
          currentAccount.generation,
        ).length > 0
      ) {
        setStatus('attention');
        return false;
      }
      storageRemove(storage, STORAGE_KEY);
      const prefix = `${ACCOUNT_PREFIX}${currentAccount.accountKey}:`;
      for (const key of storageKeysStartingWith(storage, prefix)) {
        storageRemove(storage, key);
      }
      storageRemove(storage, LAST_ACCOUNT_KEY);
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
          setStatus('saved');
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
      storageRemove(storage, STORAGE_KEY);
      acceptBootstrap(body);
      setStatus('saved');
      return true;
    } catch {
      setStatus('offline');
      return false;
    }
  }, [acceptBootstrap, detachAccount]);

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
