import { env } from 'cloudflare:workers';

import {
  buildAzureSpeechMarkup,
  isAzureFilipinoVoice,
  isSpeechSpeed,
  type AzureFilipinoVoice,
} from '@/lib/azure-speech';
import { isAllowedSpeechText, normalizeSpeechText } from '@/lib/tagalog-speech';

const DEFAULT_VOICE: AzureFilipinoVoice = 'fil-PH-BlessicaNeural';
const OUTPUT_FORMAT = 'audio-24khz-48kbitrate-mono-mp3';

type RuntimeEnvironment = Record<string, string | undefined>;

function runtimeValue(key: string) {
  const workerEnvironment = env as unknown as RuntimeEnvironment;
  return (
    workerEnvironment[key] ??
    (typeof process === 'undefined' ? undefined : process.env[key])
  );
}

function voiceConfiguration() {
  const key = runtimeValue('AZURE_SPEECH_KEY')?.trim();
  const region = runtimeValue('AZURE_SPEECH_REGION')?.trim().toLowerCase();
  const requestedVoice = runtimeValue('AZURE_SPEECH_VOICE')?.trim() ?? '';
  const voice = isAzureFilipinoVoice(requestedVoice)
    ? requestedVoice
    : DEFAULT_VOICE;

  if (!key || !region || !/^[a-z0-9-]+$/.test(region)) return null;
  return { key, region, voice };
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

export async function GET(request: Request) {
  const url = new URL(request.url);
  const rawText = url.searchParams.get('text');
  const rawSpeed = url.searchParams.get('speed');

  if (rawText === null && rawSpeed === null) {
    const configuration = voiceConfiguration();
    return Response.json(
      {
        configured: Boolean(configuration),
        provider: configuration ? 'Azure Speech' : null,
        locale: 'fil-PH',
        voice: configuration?.voice ?? null,
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  }

  if (rawText === null || !isSpeechSpeed(rawSpeed)) {
    return jsonError(
      400,
      'INVALID_INPUT',
      'Choose a valid phrase and playback speed.',
    );
  }

  const text = normalizeSpeechText(rawText);
  if (!isAllowedSpeechText(text)) {
    return jsonError(
      400,
      'UNKNOWN_TEXT',
      'That text is not part of the Salita curriculum.',
    );
  }

  const configuration = voiceConfiguration();
  if (!configuration) {
    return jsonError(
      503,
      'VOICE_NOT_CONFIGURED',
      'The Filipino cloud voice is not configured yet.',
    );
  }

  const endpoint = `https://${configuration.region}.tts.speech.microsoft.com/cognitiveservices/v1`;
  let upstream: Response;

  try {
    upstream = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Accept: 'audio/mpeg',
        'Content-Type': 'application/ssml+xml',
        'Ocp-Apim-Subscription-Key': configuration.key,
        'User-Agent': 'SalitaTagalogLearningApp',
        'X-Microsoft-OutputFormat': OUTPUT_FORMAT,
      },
      body: buildAzureSpeechMarkup(text, rawSpeed, configuration.voice),
      signal: AbortSignal.timeout(12_000),
    });
  } catch {
    return jsonError(
      502,
      'VOICE_UNAVAILABLE',
      'The Filipino voice could not be reached.',
    );
  }

  if (!upstream.ok || !upstream.body) {
    return jsonError(
      502,
      'VOICE_FAILED',
      'The Filipino voice could not generate audio.',
    );
  }

  return new Response(upstream.body, {
    headers: {
      'Cache-Control': 'public, max-age=604800, s-maxage=2592000, immutable',
      'Content-Language': 'fil-PH',
      'Content-Type': upstream.headers.get('Content-Type') ?? 'audio/mpeg',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
