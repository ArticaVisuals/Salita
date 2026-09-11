import {
  check,
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

export const learnerAccounts = sqliteTable(
  'learner_accounts',
  {
    userId: text('user_id').primaryKey().notNull(),
    generation: integer('generation').notNull().default(1),
    lastResetId: text('last_reset_id'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    check(
      'learner_accounts_user_id_length',
      sql`length(${table.userId}) BETWEEN 1 AND 255`,
    ),
    check(
      'learner_accounts_generation_range',
      sql`${table.generation} BETWEEN 1 AND 2147483647`,
    ),
  ],
);

export const progressSnapshots = sqliteTable(
  'progress_snapshots',
  {
    userId: text('user_id')
      .notNull()
      .references(() => learnerAccounts.userId, { onDelete: 'cascade' }),
    generation: integer('generation').notNull(),
    throughSequence: integer('through_sequence').notNull().default(0),
    progressJson: text('progress_json').notNull(),
    importId: text('import_id'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.generation] }),
    check(
      'progress_snapshots_generation_positive',
      sql`${table.generation} >= 1`,
    ),
    check(
      'progress_snapshots_sequence_positive',
      sql`${table.throughSequence} >= 0`,
    ),
    check(
      'progress_snapshots_json_valid',
      sql`json_valid(${table.progressJson})`,
    ),
  ],
);

export const progressEvents = sqliteTable(
  'progress_events',
  {
    serverSequence: integer('server_sequence', { mode: 'number' }).primaryKey({
      autoIncrement: true,
    }),
    userId: text('user_id')
      .notNull()
      .references(() => learnerAccounts.userId, { onDelete: 'cascade' }),
    generation: integer('generation').notNull(),
    eventId: text('event_id').notNull(),
    deviceId: text('device_id').notNull(),
    clientSequence: integer('client_sequence').notNull(),
    eventType: text('event_type').notNull(),
    sessionId: text('session_id'),
    occurredAt: text('occurred_at').notNull(),
    timeZone: text('time_zone').notNull(),
    dateKey: text('date_key').notNull(),
    payloadJson: text('payload_json').notNull(),
    eventHash: text('event_hash').notNull(),
    receivedAt: text('received_at').notNull(),
  },
  (table) => [
    uniqueIndex('progress_events_event_id_unique').on(
      table.userId,
      table.generation,
      table.eventId,
    ),
    uniqueIndex('progress_events_device_sequence_unique').on(
      table.userId,
      table.generation,
      table.deviceId,
      table.clientSequence,
    ),
    index('progress_events_materialize_idx').on(
      table.userId,
      table.generation,
      table.serverSequence,
    ),
    uniqueIndex('progress_events_one_completion_per_session')
      .on(table.userId, table.generation, table.sessionId)
      .where(sql`${table.eventType} = 'session-completed'`),
    check('progress_events_generation_positive', sql`${table.generation} >= 1`),
    check(
      'progress_events_event_id_length',
      sql`length(${table.eventId}) BETWEEN 8 AND 80`,
    ),
    check(
      'progress_events_device_id_length',
      sql`length(${table.deviceId}) BETWEEN 8 AND 80`,
    ),
    check(
      'progress_events_client_sequence_positive',
      sql`${table.clientSequence} >= 1`,
    ),
    check(
      'progress_events_type_valid',
      sql`${table.eventType} IN ('review-attempt', 'session-completed', 'active-unit-selected')`,
    ),
    check(
      'progress_events_date_key_length',
      sql`length(${table.dateKey}) = 10`,
    ),
    check(
      'progress_events_payload_json_valid',
      sql`json_valid(${table.payloadJson})`,
    ),
    check('progress_events_hash_length', sql`length(${table.eventHash}) = 64`),
  ],
);
