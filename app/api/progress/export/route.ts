import { getChatGPTUser } from '@/app/chatgpt-auth';
import { getProgressDatabase } from '@/db';
import { getCloudProgress } from '@/lib/progress-d1';
import { localDateKey } from '@/lib/progress';
import {
  progressProblem,
  requireExpectedAccount,
  requireProgressUser,
} from '@/lib/progress-api';

export async function GET(request: Request) {
  const user = await getChatGPTUser();
  const authProblem = requireProgressUser(user);
  if (authProblem || !user) return authProblem!;
  const expectedAccountKey = new URL(request.url).searchParams.get(
    'expectedAccountKey',
  );
  const accountProblem = await requireExpectedAccount(expectedAccountKey, user);
  if (accountProblem) return accountProblem;
  try {
    const state = await getCloudProgress(getProgressDatabase(), user);
    return new Response(JSON.stringify(state.progress, null, 2), {
      headers: {
        'Cache-Control': 'private, no-store, max-age=0',
        'Content-Disposition': `attachment; filename="salita-progress-${localDateKey()}.json"`,
        'Content-Type': 'application/json; charset=utf-8',
        'X-Content-Type-Options': 'nosniff',
        'X-Salita-Export-Version': '1',
      },
    });
  } catch {
    return progressProblem(
      503,
      'SYNC_UNAVAILABLE',
      'Your cloud backup is temporarily unavailable.',
    );
  }
}
