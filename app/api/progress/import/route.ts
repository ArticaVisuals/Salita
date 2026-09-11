import { getChatGPTUser } from '@/app/chatgpt-auth';
import { getProgressDatabase } from '@/db';
import {
  acceptsSameOriginMutation,
  progressJson,
  progressProblem,
  readJsonBody,
  requireExpectedAccount,
  requireProgressUser,
} from '@/lib/progress-api';
import { importCloudProgress, ProgressStoreError } from '@/lib/progress-d1';
import { parseStrictProgress } from '@/lib/progress-events';

export async function POST(request: Request) {
  const user = await getChatGPTUser();
  const authProblem = requireProgressUser(user);
  if (authProblem || !user) return authProblem!;
  if (!acceptsSameOriginMutation(request)) {
    return progressProblem(
      403,
      'ORIGIN_NOT_ALLOWED',
      'Use Salita to import progress.',
    );
  }
  const body = await readJsonBody(request, 512 * 1024);
  if (!body.ok) return body.response;
  const value = body.value as Record<string, unknown> | null;
  const progress = value ? parseStrictProgress(value.progress) : null;
  if (
    !value ||
    value.protocolVersion !== 1 ||
    !Number.isSafeInteger(value.expectedGeneration) ||
    !Number.isSafeInteger(value.expectedRevision) ||
    Number(value.expectedRevision) < 0 ||
    typeof value.importId !== 'string' ||
    value.importId.length < 8 ||
    value.importId.length > 80 ||
    (value.mode !== 'empty-only' &&
      value.mode !== 'replace' &&
      value.mode !== 'merge') ||
    !progress
  ) {
    return progressProblem(
      400,
      'INVALID_IMPORT',
      'That Salita backup is invalid.',
    );
  }
  const accountProblem = await requireExpectedAccount(
    value.expectedAccountKey,
    user,
  );
  if (accountProblem) return accountProblem;
  try {
    const response = await importCloudProgress(getProgressDatabase(), user, {
      expectedGeneration: Number(value.expectedGeneration),
      expectedRevision: Number(value.expectedRevision),
      importId: value.importId,
      mode: value.mode,
      progress,
    });
    return progressJson(response);
  } catch (error) {
    if (error instanceof ProgressStoreError) {
      const status = error.code === 'CLOUD_PROGRESS_EXISTS' ? 409 : 409;
      return progressProblem(
        status,
        error.code,
        error.code === 'CLOUD_PROGRESS_EXISTS'
          ? 'This account already has progress. Choose which copy to keep.'
          : 'Your synced progress changed. Reload before importing.',
      );
    }
    return progressProblem(
      503,
      'SYNC_UNAVAILABLE',
      'Import is temporarily unavailable. Your existing progress was not changed.',
    );
  }
}
