import * as SpeechSDK from 'microsoft-cognitiveservices-speech-sdk';

import { parseAzureRecognitionHypotheses } from './azure-recognition-result';
import type {
  AzurePronunciationScores,
  RawSpeechRecognition,
  SpeechAssessmentTarget,
} from './speech-assessment';

type CachedAuthorization = {
  token: string;
  region: string;
  validUntil: number;
};

let cachedAuthorization: CachedAuthorization | null = null;

export class AzureRecognitionError extends Error {
  code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'AzureRecognitionError';
    this.code = code;
  }
}

async function getAuthorization(
  target: SpeechAssessmentTarget,
  signal: AbortSignal,
) {
  if (
    cachedAuthorization &&
    cachedAuthorization.validUntil > performance.now() + 30_000
  ) {
    return cachedAuthorization;
  }

  const response = await fetch('/api/speech/token', {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ targetId: target.id, language: target.language }),
    cache: 'no-store',
    signal,
  });
  const value = (await response.json().catch(() => null)) as {
    code?: unknown;
    message?: unknown;
    token?: unknown;
    region?: unknown;
    expiresInSeconds?: unknown;
  } | null;

  if (!response.ok) {
    throw new AzureRecognitionError(
      typeof value?.code === 'string' ? value.code : 'SPEECH_UNAVAILABLE',
      typeof value?.message === 'string'
        ? value.message
        : 'Microphone coaching is temporarily unavailable.',
    );
  }
  if (
    typeof value?.token !== 'string' ||
    typeof value.region !== 'string' ||
    !/^[a-z0-9-]+$/u.test(value.region) ||
    typeof value.expiresInSeconds !== 'number' ||
    value.expiresInSeconds < 60 ||
    value.expiresInSeconds > 600
  ) {
    throw new AzureRecognitionError(
      'INVALID_SESSION',
      'Microphone coaching returned an invalid session.',
    );
  }

  cachedAuthorization = {
    token: value.token,
    region: value.region,
    validUntil: performance.now() + value.expiresInSeconds * 1000,
  };
  return cachedAuthorization;
}

function finiteScore(value: number) {
  return Number.isFinite(value) && value >= 0 ? value : null;
}

function pronunciationScores(
  result: SpeechSDK.SpeechRecognitionResult,
): AzurePronunciationScores | null {
  try {
    const assessment =
      SpeechSDK.PronunciationAssessmentResult.fromResult(result);
    const accuracy = finiteScore(assessment.accuracyScore);
    const fluency = finiteScore(assessment.fluencyScore);
    const completeness = finiteScore(assessment.completenessScore);
    const pronunciation = finiteScore(assessment.pronunciationScore);
    if (
      accuracy === null ||
      fluency === null ||
      completeness === null ||
      pronunciation === null
    ) {
      return null;
    }

    return {
      accuracy,
      fluency,
      completeness,
      pronunciation,
      prosody: finiteScore(assessment.prosodyScore),
      words: assessment.detailResult.Words.map((word) => ({
        word: word.Word,
        accuracy: finiteScore(
          word.PronunciationAssessment?.AccuracyScore ?? Number.NaN,
        ),
        errorType: word.PronunciationAssessment?.ErrorType ?? null,
      })),
    };
  } catch {
    return null;
  }
}

function hypothesesFromResult(result: SpeechSDK.SpeechRecognitionResult) {
  try {
    const raw = result.properties.getProperty(
      SpeechSDK.PropertyId.SpeechServiceResponse_JsonResult,
    );
    return parseAzureRecognitionHypotheses(raw);
  } catch {
    return [];
  }
}

export async function recognizeWithAzure({
  stream,
  target,
  signal,
  onListening,
}: {
  stream: MediaStream;
  target: SpeechAssessmentTarget;
  signal: AbortSignal;
  onListening: () => void;
}): Promise<RawSpeechRecognition> {
  const authorization = await getAuthorization(target, signal);
  if (signal.aborted) throw new DOMException('Stopped', 'AbortError');

  const speechConfig = SpeechSDK.SpeechConfig.fromAuthorizationToken(
    authorization.token,
    authorization.region,
  );
  speechConfig.speechRecognitionLanguage = target.language;
  speechConfig.outputFormat = SpeechSDK.OutputFormat.Detailed;
  speechConfig.setProperty(
    SpeechSDK.PropertyId.SpeechServiceConnection_InitialSilenceTimeoutMs,
    '8000',
  );
  speechConfig.setProperty(
    SpeechSDK.PropertyId.Speech_SegmentationSilenceTimeoutMs,
    target.id.endsWith('-foundation-pronunciation') ? '2500' : '1600',
  );

  const audioConfig = SpeechSDK.AudioConfig.fromStreamInput(stream);
  const recognizer = new SpeechSDK.SpeechRecognizer(speechConfig, audioConfig);
  if (target.language === 'en-US') {
    const phrases = SpeechSDK.PhraseListGrammar.fromRecognizer(recognizer);
    phrases.addPhrases(target.accepted);
    phrases.setWeight(1);
  }

  if (target.kind === 'pronunciation' && target.language === 'en-US') {
    const pronunciation = new SpeechSDK.PronunciationAssessmentConfig(
      target.reference,
      SpeechSDK.PronunciationAssessmentGradingSystem.HundredMark,
      SpeechSDK.PronunciationAssessmentGranularity.Word,
      true,
    );
    pronunciation.applyTo(recognizer);
  }

  return await new Promise<RawSpeechRecognition>((resolve, reject) => {
    let settled = false;
    const close = () => {
      signal.removeEventListener('abort', onAbort);
      recognizer.close();
      audioConfig.close();
      speechConfig.close();
    };
    const finish = (callback: () => void, clearAuthorization = false) => {
      if (settled) return;
      settled = true;
      if (clearAuthorization) cachedAuthorization = null;
      close();
      callback();
    };
    const onAbort = () =>
      finish(() => reject(new DOMException('Stopped', 'AbortError')));

    signal.addEventListener('abort', onAbort, { once: true });
    recognizer.sessionStarted = () => {
      if (!settled) onListening();
    };
    if (signal.aborted) {
      onAbort();
      return;
    }
    recognizer.recognizeOnceAsync(
      (result) => {
        if (result.reason === SpeechSDK.ResultReason.RecognizedSpeech) {
          const hypotheses = hypothesesFromResult(result);
          finish(() =>
            resolve({
              transcript: result.text ?? '',
              confidence: hypotheses[0]?.confidence ?? null,
              hypotheses: target.language === 'fil-PH' ? hypotheses : undefined,
              pronunciation:
                target.language === 'en-US'
                  ? pronunciationScores(result)
                  : null,
            }),
          );
          return;
        }
        if (result.reason === SpeechSDK.ResultReason.NoMatch) {
          finish(() =>
            resolve({
              transcript: '',
              confidence: null,
              pronunciation: null,
            }),
          );
          return;
        }
        const cancellation = SpeechSDK.CancellationDetails.fromResult(result);
        finish(
          () =>
            reject(
              new AzureRecognitionError(
                'RECOGNITION_FAILED',
                cancellation.errorDetails ||
                  'Azure could not complete this voice check.',
              ),
            ),
          cancellation.ErrorCode ===
            SpeechSDK.CancellationErrorCode.AuthenticationFailure,
        );
      },
      (error) => {
        const message = String(error || 'Azure could not hear that attempt.');
        finish(
          () =>
            reject(new AzureRecognitionError('RECOGNITION_FAILED', message)),
          /auth|token|401|403/iu.test(message),
        );
      },
    );
  });
}
