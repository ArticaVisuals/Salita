import { getChatGPTUser } from '@/app/chatgpt-auth';
import {
  getUnitLessons,
  isValidReviewKey,
  nextLessonAfter,
  units,
} from '@/app/curriculum';
import { getProgressDatabase } from '@/db';
import {
  acceptsSameOriginMutation,
  progressJson,
  progressProblem,
  readJsonBody,
  requireExpectedAccount,
  requireProgressUser,
} from '@/lib/progress-api';
import {
  getCloudProgress,
  ProgressStoreError,
  resetCloudProgress,
  syncCloudProgress,
} from '@/lib/progress-d1';
import {
  MAX_SYNC_BODY_BYTES,
  MAX_SYNC_EVENTS,
  validateProgressEvent,
  type ProgressEvent,
} from '@/lib/progress-events';

function databaseOrProblem() {
  try {
    return { database: getProgressDatabase() } as const;
  } catch {
    return {
      response: progressProblem(
        503,
        'SYNC_UNAVAILABLE',
        'Account sync is temporarily unavailable. Your work stays on this device.',
      ),
    } as const;
  }
}

function storeProblem(error: unknown) {
  if (error instanceof ProgressStoreError) {
    if (error.code === 'STALE_GENERATION') {
      return progressProblem(
        409,
        error.code,
        'This device has an older copy of your progress. Reload the synced copy before continuing.',
      );
    }
    if (error.code === 'EVENT_CONFLICT') {
      return progressProblem(
        409,
        error.code,
        'A saved progress event conflicted with another update. Reload and try once more.',
      );
    }
  }
  return progressProblem(
    503,
    'SYNC_UNAVAILABLE',
    'Account sync is temporarily unavailable. Your work stays on this device.',
  );
}

export async function GET() {
  const user = await getChatGPTUser();
  const authProblem = requireProgressUser(user);
  if (authProblem || !user) return authProblem!;
  const binding = databaseOrProblem();
  if ('response' in binding) return binding.response;
  try {
    return progressJson(await getCloudProgress(binding.database, user));
  } catch (error) {
    return storeProblem(error);
  }
}

export async function POST(request: Request) {
  const user = await getChatGPTUser();
  const authProblem = requireProgressUser(user);
  if (authProblem || !user) return authProblem!;
  if (!acceptsSameOriginMutation(request)) {
    return progressProblem(
      403,
      'ORIGIN_NOT_ALLOWED',
      'Use Salita to save progress.',
    );
  }
  const body = await readJsonBody(request, MAX_SYNC_BODY_BYTES);
  if (!body.ok) return body.response;
  if (
    !body.value ||
    typeof body.value !== 'object' ||
    Array.isArray(body.value)
  ) {
    return progressProblem(
      400,
      'INVALID_SYNC',
      'That progress update is invalid.',
    );
  }
  const value = body.value as Record<string, unknown>;
  if (
    value.protocolVersion !== 1 ||
    !Number.isSafeInteger(value.generation) ||
    Number(value.generation) < 1 ||
    !Array.isArray(value.events) ||
    value.events.length > MAX_SYNC_EVENTS
  ) {
    return progressProblem(
      400,
      'INVALID_SYNC',
      'That progress update is invalid.',
    );
  }
  const accountProblem = await requireExpectedAccount(
    value.expectedAccountKey,
    user,
  );
  if (accountProblem) return accountProblem;
  const validUnit = (unitId: string) =>
    units.some((unit) => unit.id === unitId);
  const validLesson = (unitId: string, lessonId: string) =>
    getUnitLessons(unitId).some((lesson) => lesson.id === lessonId);
  const events: ProgressEvent[] = [];
  for (const input of value.events) {
    const event = validateProgressEvent(input, {
      validUnit,
      validLesson,
      validReviewKey: isValidReviewKey,
    });
    if (!event) {
      return progressProblem(
        400,
        'INVALID_EVENT',
        'One saved learning event is invalid.',
      );
    }
    if (event.type === 'session-completed') {
      if (event.kind === 'lesson' && !event.lessonId) {
        return progressProblem(
          400,
          'INVALID_PATH',
          'A completed lesson must identify its lesson path.',
        );
      }
      if (event.kind === 'lesson' && event.lessonId) {
        const expected = nextLessonAfter(event.unitId, event.lessonId);
        if (
          expected.unit.id !== event.nextUnitId ||
          expected.lesson.id !== event.nextLessonId ||
          expected.completedUnit !== event.completesUnit
        ) {
          return progressProblem(
            400,
            'INVALID_PATH',
            'That lesson path is invalid.',
          );
        }
      } else if (event.completesUnit) {
        return progressProblem(
          400,
          'INVALID_PATH',
          'Practice cannot complete a course unit.',
        );
      }
    }
    events.push(event);
  }
  const binding = databaseOrProblem();
  if ('response' in binding) return binding.response;
  try {
    return progressJson(
      await syncCloudProgress(
        binding.database,
        user,
        Number(value.generation),
        events,
      ),
    );
  } catch (error) {
    return storeProblem(error);
  }
}

export async function DELETE(request: Request) {
  const user = await getChatGPTUser();
  const authProblem = requireProgressUser(user);
  if (authProblem || !user) return authProblem!;
  if (!acceptsSameOriginMutation(request)) {
    return progressProblem(
      403,
      'ORIGIN_NOT_ALLOWED',
      'Use Salita to delete progress.',
    );
  }
  const body = await readJsonBody(request, 4096);
  if (!body.ok) return body.response;
  const value = body.value as Record<string, unknown> | null;
  if (
    !value ||
    value.confirmation !== 'DELETE SYNCED PROGRESS' ||
    !Number.isSafeInteger(value.expectedGeneration) ||
    typeof value.resetId !== 'string' ||
    value.resetId.length < 8 ||
    value.resetId.length > 80
  ) {
    return progressProblem(
      400,
      'INVALID_RESET',
      'Confirm the synced-progress reset.',
    );
  }
  const accountProblem = await requireExpectedAccount(
    value.expectedAccountKey,
    user,
  );
  if (accountProblem) return accountProblem;
  const binding = databaseOrProblem();
  if ('response' in binding) return binding.response;
  try {
    return progressJson(
      await resetCloudProgress(
        binding.database,
        user,
        Number(value.expectedGeneration),
        value.resetId,
      ),
    );
  } catch (error) {
    return storeProblem(error);
  }
}
