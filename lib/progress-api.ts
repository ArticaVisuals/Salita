import type { ChatGPTUser } from '@/app/chatgpt-auth';
import { accountCacheKey } from '@/lib/progress-events';

export function progressJson(value: unknown, status = 200) {
  return Response.json(value, {
    status,
    headers: {
      'Cache-Control': 'private, no-store, max-age=0',
      Pragma: 'no-cache',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

export function progressProblem(status: number, code: string, message: string) {
  return progressJson({ code, message }, status);
}

export function acceptsSameOriginMutation(request: Request) {
  const requestUrl = new URL(request.url);
  const origin = request.headers.get('Origin');
  if (origin) return origin === requestUrl.origin;
  return request.headers.get('Sec-Fetch-Site') === 'same-origin';
}

export async function readJsonBody(
  request: Request,
  maximumBytes: number,
): Promise<{ ok: true; value: unknown } | { ok: false; response: Response }> {
  if (
    !request.headers
      .get('Content-Type')
      ?.toLowerCase()
      .startsWith('application/json')
  ) {
    return {
      ok: false,
      response: progressProblem(
        415,
        'JSON_REQUIRED',
        'Send this request as JSON.',
      ),
    };
  }
  const declaredLength = Number(request.headers.get('Content-Length'));
  if (Number.isFinite(declaredLength) && declaredLength > maximumBytes) {
    return {
      ok: false,
      response: progressProblem(
        413,
        'REQUEST_TOO_LARGE',
        'That progress update is too large.',
      ),
    };
  }
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > maximumBytes) {
    return {
      ok: false,
      response: progressProblem(
        413,
        'REQUEST_TOO_LARGE',
        'That progress update is too large.',
      ),
    };
  }
  try {
    return { ok: true, value: JSON.parse(text) as unknown };
  } catch {
    return {
      ok: false,
      response: progressProblem(
        400,
        'INVALID_JSON',
        'That progress update is not valid JSON.',
      ),
    };
  }
}

export function requireProgressUser(user: ChatGPTUser | null) {
  if (user) return null;
  return progressProblem(
    401,
    'SIGN_IN_REQUIRED',
    'Sign in to Salita to synchronize your progress.',
  );
}

export async function requireExpectedAccount(
  expectedAccountKey: unknown,
  user: ChatGPTUser,
) {
  if (
    typeof expectedAccountKey !== 'string' ||
    !/^[a-f0-9]{32}$/u.test(expectedAccountKey)
  ) {
    return progressProblem(
      400,
      'INVALID_ACCOUNT_CONTEXT',
      'Reload Salita before changing synced progress.',
    );
  }
  if (expectedAccountKey !== (await accountCacheKey(user.userId))) {
    return progressProblem(
      409,
      'ACCOUNT_CHANGED',
      'The signed-in account changed. Reload its progress before continuing.',
    );
  }
  return null;
}
