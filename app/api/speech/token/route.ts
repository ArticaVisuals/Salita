import { env } from 'cloudflare:workers';

import {
  getSpeechAssessmentTarget,
  isSpeechAssessmentLanguage,
} from '@/lib/speech-assessment';

type RuntimeEnvironment = Record<string, string | undefined>;

const requestWindows = new Map<string, { count: number; startedAt: number }>();
const WINDOW_MS = 60_000;
const MAX_REQUESTS_PER_WINDOW = 12;

function runtimeValue(key: string) {
  const workerEnvironment = env as unknown as RuntimeEnvironment;
  return (
    workerEnvironment[key] ??
    (typeof process === 'undefined' ? undefined : process.env[key])
  );
}

function speechConfiguration() {
  const key = runtimeValue('AZURE_SPEECH_KEY')?.trim();
  const region = runtimeValue('AZURE_SPEECH_REGION')?.trim().toLowerCase();
  if (!key || !region || !/^[a-z0-9-]+$/u.test(region)) return null;
  return { key, region };
}

function jsonError(status: number, code: string, message: string) {
  return Response.json(
    { code, message },
    {
      status,
      headers: {
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    },
  );
}

function exceedsRateLimit(request: Request) {
  const key = request.headers.get('CF-Connecting-IP') ?? 'local';
  const now = Date.now();
  const current = requestWindows.get(key);
  if (requestWindows.size > 250) {
    for (const [client, window] of requestWindows) {
      if (now - window.startedAt >= WINDOW_MS) requestWindows.delete(client);
    }
  }
  if (!current || now - current.startedAt >= WINDOW_MS) {
    requestWindows.set(key, { count: 1, startedAt: now });
    return false;
  }
  current.count += 1;
  return current.count > MAX_REQUESTS_PER_WINDOW;
}

export async function POST(request: Request) {
  const requestUrl = new URL(request.url);
  const origin = request.headers.get('Origin');
  if (origin && origin !== requestUrl.origin) {
    return jsonError(
      403,
      'ORIGIN_NOT_ALLOWED',
      'Use Salita to start the microphone.',
    );
  }
  if (exceedsRateLimit(request)) {
    return jsonError(
      429,
      'TOO_MANY_REQUESTS',
      'Please wait a moment before starting another voice check.',
    );
  }

  let input: unknown;
  try {
    input = await request.json();
  } catch {
    return jsonError(400, 'INVALID_INPUT', 'Choose a valid voice exercise.');
  }
  if (!input || typeof input !== 'object') {
    return jsonError(400, 'INVALID_INPUT', 'Choose a valid voice exercise.');
  }
  const { targetId, language } = input as {
    targetId?: unknown;
    language?: unknown;
  };
  if (
    typeof targetId !== 'string' ||
    !isSpeechAssessmentLanguage(language) ||
    !getSpeechAssessmentTarget(targetId, language)
  ) {
    return jsonError(400, 'UNKNOWN_TARGET', 'Choose a valid voice exercise.');
  }

  const configuration = speechConfiguration();
  if (!configuration) {
    return jsonError(
      503,
      'SPEECH_NOT_CONFIGURED',
      'Azure microphone coaching is not configured yet.',
    );
  }

  let upstream: Response;
  try {
    upstream = await fetch(
      `https://${configuration.region}.api.cognitive.microsoft.com/sts/v1.0/issueToken`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Ocp-Apim-Subscription-Key': configuration.key,
        },
        body: '',
        signal: AbortSignal.timeout(8_000),
      },
    );
  } catch {
    return jsonError(
      502,
      'SPEECH_UNAVAILABLE',
      'Azure microphone coaching could not be reached.',
    );
  }

  if (!upstream.ok) {
    return jsonError(
      502,
      'SPEECH_AUTH_FAILED',
      'Azure microphone coaching could not authenticate.',
    );
  }
  const token = (await upstream.text()).trim();
  if (!token || token.length > 4096) {
    return jsonError(
      502,
      'SPEECH_AUTH_FAILED',
      'Azure microphone coaching returned an invalid session.',
    );
  }

  return Response.json(
    {
      token,
      region: configuration.region,
      expiresInSeconds: 9 * 60,
    },
    {
      headers: {
        'Cache-Control': 'no-store, max-age=0',
        Pragma: 'no-cache',
        'X-Content-Type-Options': 'nosniff',
      },
    },
  );
}
