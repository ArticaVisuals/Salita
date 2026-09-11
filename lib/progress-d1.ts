import {
  accountCacheKey,
  applyProgressEvent,
  hashProgressEvent,
  normalizeCourseFrontier,
  type ProgressBootstrap,
  type ProgressEvent,
  type ProgressSyncResponse,
} from './progress-events';
import {
  createInitialProgress,
  isProgressEmpty,
  localDateKey,
  parseProgress,
  type LearnerProgress,
} from './progress';

type AccountRow = {
  user_id: string;
  generation: number;
  last_reset_id: string | null;
  created_at: string;
  updated_at: string;
};

type SnapshotRow = {
  through_sequence: number;
  progress_json: string;
  import_id: string | null;
  updated_at: string;
};

type EventRow = {
  server_sequence: number;
  payload_json: string;
};

type ProgressDatabase = Pick<D1DatabaseSession, 'prepare' | 'batch'>;

export class ProgressStoreError extends Error {
  constructor(
    public code:
      | 'STALE_GENERATION'
      | 'EVENT_CONFLICT'
      | 'CLOUD_PROGRESS_EXISTS'
      | 'SYNC_CONFLICT',
  ) {
    super(code);
    this.name = 'ProgressStoreError';
  }
}

async function ensureAccount(
  database: ProgressDatabase,
  userId: string,
): Promise<AccountRow> {
  const now = new Date().toISOString();
  await database
    .prepare(
      `INSERT INTO learner_accounts
        (user_id, generation, last_reset_id, created_at, updated_at)
       VALUES (?, 1, NULL, ?, ?)
       ON CONFLICT(user_id) DO NOTHING`,
    )
    .bind(userId, now, now)
    .run();
  const row = await database
    .prepare(
      `SELECT user_id, generation, last_reset_id, created_at, updated_at
       FROM learner_accounts WHERE user_id = ?`,
    )
    .bind(userId)
    .first<AccountRow>();
  if (!row) throw new ProgressStoreError('SYNC_CONFLICT');
  return row;
}

async function readSnapshot(
  database: ProgressDatabase,
  userId: string,
  generation: number,
) {
  return database
    .prepare(
      `SELECT through_sequence, progress_json, import_id, updated_at
       FROM progress_snapshots
       WHERE user_id = ? AND generation = ?`,
    )
    .bind(userId, generation)
    .first<SnapshotRow>();
}

async function materializeProgress(
  database: ProgressDatabase,
  userId: string,
  generation: number,
) {
  const snapshot = await readSnapshot(database, userId, generation);
  const parsedSnapshot = snapshot
    ? parseProgress(snapshot.progress_json)
    : createInitialProgress();
  let progress = normalizeCourseFrontier(parsedSnapshot);
  const snapshotNeedsMigration =
    Boolean(snapshot) &&
    (parsedSnapshot.activeUnitId !== progress.activeUnitId ||
      parsedSnapshot.activeLessonId !== progress.activeLessonId);
  let throughSequence = snapshot?.through_sequence ?? 0;
  let materializedEvents = 0;
  while (true) {
    const events = await database
      .prepare(
        `SELECT server_sequence, payload_json
         FROM progress_events
         WHERE user_id = ? AND generation = ? AND server_sequence > ?
         ORDER BY server_sequence ASC
         LIMIT 1000`,
      )
      .bind(userId, generation, throughSequence)
      .all<EventRow>();

    for (const row of events.results) {
      const event = JSON.parse(row.payload_json) as ProgressEvent;
      progress = applyProgressEvent(progress, event).progress;
      throughSequence = row.server_sequence;
      materializedEvents += 1;
    }
    if (events.results.length < 1000) break;
  }

  if (materializedEvents > 0) {
    const now = new Date().toISOString();
    await database
      .prepare(
        `INSERT INTO progress_snapshots
          (user_id, generation, through_sequence, progress_json, import_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, NULL, ?, ?)
         ON CONFLICT(user_id, generation) DO UPDATE SET
           through_sequence = excluded.through_sequence,
           progress_json = excluded.progress_json,
           updated_at = excluded.updated_at
         WHERE progress_snapshots.through_sequence < excluded.through_sequence`,
      )
      .bind(
        userId,
        generation,
        throughSequence,
        JSON.stringify(progress),
        now,
        now,
      )
      .run();
  } else if (snapshot && snapshotNeedsMigration) {
    const now = new Date().toISOString();
    await database
      .prepare(
        `UPDATE progress_snapshots
         SET progress_json = ?, updated_at = ?
         WHERE user_id = ? AND generation = ? AND through_sequence = ?`,
      )
      .bind(
        JSON.stringify(progress),
        now,
        userId,
        generation,
        snapshot.through_sequence,
      )
      .run();
  }

  const canonical = await readSnapshot(database, userId, generation);
  if (canonical && canonical.through_sequence >= throughSequence) {
    return {
      progress: normalizeCourseFrontier(parseProgress(canonical.progress_json)),
      revision: canonical.through_sequence,
      importId: canonical.import_id,
      snapshotExists: true,
      updatedAt: canonical.updated_at,
    };
  }
  return {
    progress,
    revision: throughSequence,
    importId: snapshot?.import_id ?? null,
    snapshotExists: Boolean(snapshot),
    updatedAt: snapshot?.updated_at ?? null,
  };
}

async function bootstrapResponse(
  database: ProgressDatabase,
  user: { userId: string; email: string },
): Promise<ProgressBootstrap> {
  const account = await ensureAccount(database, user.userId);
  const state = await materializeProgress(
    database,
    user.userId,
    account.generation,
  );
  return {
    protocolVersion: 1,
    accountKey: await accountCacheKey(user.userId),
    accountEmail: user.email,
    generation: account.generation,
    revision: state.revision,
    hasCloudData:
      Boolean(state.importId) ||
      state.revision > 0 ||
      !isProgressEmpty(state.progress),
    progress: state.progress,
    serverTime: new Date().toISOString(),
    updatedAt: state.updatedAt,
  };
}

export async function getCloudProgress(
  database: D1Database,
  user: { userId: string; email: string },
) {
  return bootstrapResponse(database.withSession('first-primary'), user);
}

export async function syncCloudProgress(
  database: D1Database,
  user: { userId: string; email: string },
  generation: number,
  events: ProgressEvent[],
): Promise<ProgressSyncResponse> {
  const session = database.withSession('first-primary');
  const account = await ensureAccount(session, user.userId);
  if (account.generation !== generation) {
    throw new ProgressStoreError('STALE_GENERATION');
  }

  if (events.length > 0) {
    const receivedAt = new Date().toISOString();
    const statements = await Promise.all(
      events.map(async (event) => {
        const dateKey = localDateKey(
          new Date(event.occurredAt),
          event.timeZone,
        );
        const eventHash = await hashProgressEvent(event);
        return session
          .prepare(
            `INSERT INTO progress_events
              (user_id, generation, event_id, device_id, client_sequence,
               event_type, session_id, occurred_at, time_zone, date_key,
               payload_json, event_hash, received_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT(user_id, generation, event_id) DO NOTHING`,
          )
          .bind(
            user.userId,
            generation,
            event.id,
            event.deviceId,
            event.clientSequence,
            event.type,
            'sessionId' in event ? event.sessionId : null,
            event.occurredAt,
            event.timeZone,
            dateKey,
            JSON.stringify(event),
            eventHash,
            receivedAt,
          );
      }),
    );
    try {
      await session.batch(statements);
    } catch (error) {
      const message = String(error);
      if (
        /progress_event_id_conflict|progress_device_sequence_conflict|UNIQUE constraint failed/u.test(
          message,
        )
      ) {
        throw new ProgressStoreError('EVENT_CONFLICT');
      }
      if (/stale_progress_generation/u.test(message)) {
        throw new ProgressStoreError('STALE_GENERATION');
      }
      throw error;
    }
  }
  return {
    ...(await bootstrapResponse(session, user)),
    acknowledgedEventIds: events.map((event) => event.id),
  };
}

export async function importCloudProgress(
  database: D1Database,
  user: { userId: string; email: string },
  options: {
    expectedGeneration: number;
    expectedRevision: number;
    importId: string;
    progress: LearnerProgress;
    mode: 'empty-only' | 'replace' | 'merge';
  },
) {
  const session = database.withSession('first-primary');
  const account = await ensureAccount(session, user.userId);
  if (
    options.mode !== 'empty-only' &&
    account.generation === options.expectedGeneration + 1 &&
    account.last_reset_id === options.importId
  ) {
    return bootstrapResponse(session, user);
  }
  if (account.generation !== options.expectedGeneration) {
    throw new ProgressStoreError('STALE_GENERATION');
  }
  const current = await materializeProgress(
    session,
    user.userId,
    account.generation,
  );
  if (current.revision !== options.expectedRevision) {
    throw new ProgressStoreError('SYNC_CONFLICT');
  }
  if (options.mode === 'empty-only' && current.importId === options.importId) {
    return bootstrapResponse(session, user);
  }
  if (
    options.mode === 'empty-only' &&
    (current.revision > 0 ||
      Boolean(current.importId) ||
      !isProgressEmpty(current.progress))
  ) {
    throw new ProgressStoreError('CLOUD_PROGRESS_EXISTS');
  }

  let imported = options.progress;
  if (options.mode === 'merge') {
    const { mergeLegacyProgress } = await import('./progress.ts');
    imported = mergeLegacyProgress(current.progress, imported);
  }
  imported = normalizeCourseFrontier(imported);
  const now = new Date().toISOString();
  if (options.mode === 'empty-only') {
    const result = await session
      .prepare(
        `INSERT INTO progress_snapshots
          (user_id, generation, through_sequence, progress_json, import_id, created_at, updated_at)
         SELECT ?, ?, 0, ?, ?, ?, ?
         WHERE NOT EXISTS (
           SELECT 1 FROM progress_events
           WHERE user_id = ? AND generation = ?
         )
         AND NOT EXISTS (
           SELECT 1 FROM progress_snapshots
           WHERE user_id = ? AND generation = ?
         )`,
      )
      .bind(
        user.userId,
        account.generation,
        JSON.stringify(imported),
        options.importId,
        now,
        now,
        user.userId,
        account.generation,
        user.userId,
        account.generation,
      )
      .run();
    if (!result.meta.changes) {
      const existing = await readSnapshot(
        session,
        user.userId,
        account.generation,
      );
      if (existing?.import_id !== options.importId) {
        throw new ProgressStoreError('CLOUD_PROGRESS_EXISTS');
      }
    }
    return bootstrapResponse(session, user);
  }

  const nextGeneration = account.generation + 1;
  const reset = await session.batch([
    session
      .prepare(
        `UPDATE learner_accounts
         SET generation = ?, last_reset_id = ?, updated_at = ?
         WHERE user_id = ? AND generation = ?
         AND NOT EXISTS (
           SELECT 1 FROM progress_events
           WHERE user_id = ? AND generation = ? AND server_sequence > ?
         )
         AND (
           (? = 1 AND EXISTS (
             SELECT 1 FROM progress_snapshots
             WHERE user_id = ? AND generation = ?
               AND through_sequence = ?
               AND COALESCE(import_id, '') = ?
           ))
           OR
           (? = 0 AND NOT EXISTS (
             SELECT 1 FROM progress_snapshots
             WHERE user_id = ? AND generation = ?
           ))
         )`,
      )
      .bind(
        nextGeneration,
        options.importId,
        now,
        user.userId,
        account.generation,
        user.userId,
        account.generation,
        current.revision,
        current.snapshotExists ? 1 : 0,
        user.userId,
        account.generation,
        current.revision,
        current.importId ?? '',
        current.snapshotExists ? 1 : 0,
        user.userId,
        account.generation,
      ),
    session
      .prepare(
        `INSERT INTO progress_snapshots
          (user_id, generation, through_sequence, progress_json, import_id, created_at, updated_at)
         SELECT ?, ?, 0, ?, ?, ?, ?
         WHERE EXISTS (
           SELECT 1 FROM learner_accounts
           WHERE user_id = ? AND generation = ? AND last_reset_id = ?
         )`,
      )
      .bind(
        user.userId,
        nextGeneration,
        JSON.stringify(imported),
        options.importId,
        now,
        now,
        user.userId,
        nextGeneration,
        options.importId,
      ),
  ]);
  if (!reset[0]?.meta.changes) throw new ProgressStoreError('SYNC_CONFLICT');
  return bootstrapResponse(session, user);
}

export async function resetCloudProgress(
  database: D1Database,
  user: { userId: string; email: string },
  expectedGeneration: number,
  resetId: string,
) {
  const session = database.withSession('first-primary');
  const account = await ensureAccount(session, user.userId);
  if (
    account.generation === expectedGeneration + 1 &&
    account.last_reset_id === resetId
  ) {
    return bootstrapResponse(session, user);
  }
  if (account.generation !== expectedGeneration) {
    throw new ProgressStoreError('STALE_GENERATION');
  }
  const nextGeneration = expectedGeneration + 1;
  const now = new Date().toISOString();
  const result = await session.batch([
    session
      .prepare(
        `UPDATE learner_accounts
         SET generation = ?, last_reset_id = ?, updated_at = ?
         WHERE user_id = ? AND generation = ?`,
      )
      .bind(nextGeneration, resetId, now, user.userId, expectedGeneration),
    session
      .prepare(
        `DELETE FROM progress_events
         WHERE user_id = ? AND generation <= ?
         AND EXISTS (
           SELECT 1 FROM learner_accounts
           WHERE user_id = ? AND generation = ? AND last_reset_id = ?
         )`,
      )
      .bind(
        user.userId,
        expectedGeneration,
        user.userId,
        nextGeneration,
        resetId,
      ),
    session
      .prepare(
        `DELETE FROM progress_snapshots
         WHERE user_id = ? AND generation <= ?
         AND EXISTS (
           SELECT 1 FROM learner_accounts
           WHERE user_id = ? AND generation = ? AND last_reset_id = ?
         )`,
      )
      .bind(
        user.userId,
        expectedGeneration,
        user.userId,
        nextGeneration,
        resetId,
      ),
  ]);
  if (!result[0]?.meta.changes) {
    const latest = await ensureAccount(session, user.userId);
    if (
      latest.generation !== nextGeneration ||
      latest.last_reset_id !== resetId
    ) {
      throw new ProgressStoreError('SYNC_CONFLICT');
    }
  }
  return bootstrapResponse(session, user);
}
