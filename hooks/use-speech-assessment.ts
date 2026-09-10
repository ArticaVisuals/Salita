'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  assessSpeechResult,
  getSpeechAssessmentTarget,
  type SpeechAssessmentLanguage,
  type SpeechAssessmentResult,
} from '@/lib/speech-assessment';
import {
  registerScoredSpeechAttempt,
  selectBestSpeechAttempt,
} from '@/lib/speech-attempt';

export type SpeechSessionPhase =
  | 'idle'
  | 'requesting-permission'
  | 'connecting'
  | 'listening'
  | 'scoring'
  | 'complete'
  | 'error';

export type SpeechSessionState = {
  phase: SpeechSessionPhase;
  attempts: number;
  attemptsByLanguage: Record<SpeechAssessmentLanguage, number>;
  language: SpeechAssessmentLanguage | null;
  result: SpeechAssessmentResult | null;
  results: Partial<Record<SpeechAssessmentLanguage, SpeechAssessmentResult>>;
  bestAttemptByLanguage: Partial<Record<SpeechAssessmentLanguage, number>>;
  retainedBest: boolean;
  error: string | null;
};

const INITIAL_STATE: SpeechSessionState = {
  phase: 'idle',
  attempts: 0,
  attemptsByLanguage: { 'fil-PH': 0, 'en-US': 0 },
  language: null,
  result: null,
  results: {},
  bestAttemptByLanguage: {},
  retainedBest: false,
  error: null,
};

function microphoneError(error: unknown) {
  if (error instanceof DOMException) {
    if (error.name === 'NotAllowedError' || error.name === 'SecurityError') {
      return 'The microphone is blocked. Enable it in this site’s settings, then try again. Your streak is safe.';
    }
    if (error.name === 'NotFoundError') {
      return 'No microphone was found. Connect one or use the practice-aloud fallback.';
    }
    if (error.name === 'NotReadableError' || error.name === 'AbortError') {
      return 'The microphone is busy or unavailable. Close other recording apps, then try again.';
    }
  }
  return null;
}

function recognitionError(error: unknown) {
  if (error && typeof error === 'object' && 'code' in error) {
    const code = String(error.code);
    if (code === 'SPEECH_NOT_CONFIGURED') {
      return 'Azure microphone coaching still needs its Speech key and region. Use Record & compare for now.';
    }
    if (code === 'TOO_MANY_REQUESTS') {
      return 'Please wait a moment before starting another voice check.';
    }
  }
  return 'The speech service could not score this attempt. Try again or use Record & compare; this does not count against you.';
}

export function useSpeechAssessment({
  onBeforeStart,
}: {
  onBeforeStart: () => void;
}) {
  const [state, setState] = useState<SpeechSessionState>(INITIAL_STATE);
  const abortRef = useRef<AbortController | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const attemptIdRef = useRef(0);
  const attemptCountRef = useRef<Record<SpeechAssessmentLanguage, number>>({
    'fil-PH': 0,
    'en-US': 0,
  });
  const scoredAttemptCountRef = useRef<
    Record<SpeechAssessmentLanguage, number>
  >({
    'fil-PH': 0,
    'en-US': 0,
  });
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cleanUp = useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = null;
    abortRef.current?.abort();
    abortRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  const reset = useCallback(() => {
    attemptIdRef.current += 1;
    attemptCountRef.current = { 'fil-PH': 0, 'en-US': 0 };
    scoredAttemptCountRef.current = { 'fil-PH': 0, 'en-US': 0 };
    cleanUp();
    setState(INITIAL_STATE);
  }, [cleanUp]);

  const stop = useCallback(() => {
    attemptIdRef.current += 1;
    cleanUp();
    setState((current) => ({
      ...current,
      phase: 'idle',
      result: null,
      retainedBest: false,
      error: 'Voice check stopped. Nothing was scored.',
    }));
  }, [cleanUp]);

  const start = useCallback(
    async (targetId: string, language: SpeechAssessmentLanguage) => {
      const target = getSpeechAssessmentTarget(targetId, language);
      if (!target) {
        setState((current) => ({
          ...current,
          phase: 'error',
          error: 'This prompt does not have a voice check yet.',
        }));
        return;
      }
      if (!navigator.mediaDevices?.getUserMedia) {
        setState((current) => ({
          ...current,
          phase: 'error',
          error:
            'This browser cannot open a microphone here. Use a current browser or the practice-aloud fallback.',
        }));
        return;
      }

      attemptIdRef.current += 1;
      const attemptId = attemptIdRef.current;
      attemptCountRef.current[language] += 1;
      const attemptNumber = attemptCountRef.current[language];
      cleanUp();
      onBeforeStart();
      setState((current) => ({
        ...current,
        phase: 'requesting-permission',
        attempts: attemptNumber,
        attemptsByLanguage: { ...attemptCountRef.current },
        language,
        result: null,
        retainedBest: false,
        error: null,
      }));

      const controller = new AbortController();
      abortRef.current = controller;
      let timedOut: 'connection' | 'speech' | null = null;
      let listeningStarted = false;
      const armTimeout = (
        stage: Exclude<typeof timedOut, null>,
        milliseconds: number,
      ) => {
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        timeoutRef.current = setTimeout(() => {
          timedOut = stage;
          controller.abort();
        }, milliseconds);
      };

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            autoGainControl: true,
            channelCount: 1,
            echoCancellation: true,
            noiseSuppression: true,
          },
        });
        if (attemptId !== attemptIdRef.current || controller.signal.aborted) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = stream;
        setState((current) => ({ ...current, phase: 'connecting' }));
        armTimeout('connection', 15_000);

        const { recognizeWithAzure } =
          await import('@/lib/azure-recognition-client');
        const raw = await recognizeWithAzure({
          stream,
          target,
          signal: controller.signal,
          onListening: () => {
            if (
              !listeningStarted &&
              attemptId === attemptIdRef.current &&
              !controller.signal.aborted
            ) {
              listeningStarted = true;
              armTimeout('speech', 20_000);
              setState((current) => ({ ...current, phase: 'listening' }));
            }
          },
        });
        if (attemptId !== attemptIdRef.current) return;
        setState((current) => ({ ...current, phase: 'scoring' }));
        const result = assessSpeechResult(target, raw);
        const scoredAttempt = registerScoredSpeechAttempt(
          scoredAttemptCountRef.current[language],
          result,
        );
        scoredAttemptCountRef.current[language] = scoredAttempt.scoredAttempts;
        setState((current) => {
          const previous = current.results[language];
          const best = selectBestSpeechAttempt({
            previous,
            previousAttempt: current.bestAttemptByLanguage[language],
            candidate: result,
            candidateAttempt: scoredAttempt.candidateAttempt,
          });
          return {
            ...current,
            phase: 'complete',
            result: result.level === 'unscored' ? result : best.result,
            results: { ...current.results, [language]: best.result },
            bestAttemptByLanguage: {
              ...current.bestAttemptByLanguage,
              [language]: best.attemptNumber,
            },
            retainedBest: best.retainedPrevious && result.level !== 'unscored',
            error: null,
          };
        });
      } catch (error) {
        if (attemptId !== attemptIdRef.current) return;
        if (timedOut) {
          setState((current) => ({
            ...current,
            phase: 'error',
            result: null,
            retainedBest: false,
            error:
              timedOut === 'connection'
                ? 'Azure took too long to connect. Try again or use Record & compare; nothing was scored.'
                : 'No complete phrase arrived in time. Move closer to the microphone and try once more; nothing was scored.',
          }));
          return;
        }
        if (controller.signal.aborted) return;
        setState((current) => ({
          ...current,
          phase: 'error',
          result: null,
          retainedBest: false,
          error: microphoneError(error) ?? recognitionError(error),
        }));
      } finally {
        if (attemptId === attemptIdRef.current) {
          if (timeoutRef.current) clearTimeout(timeoutRef.current);
          timeoutRef.current = null;
          streamRef.current?.getTracks().forEach((track) => track.stop());
          streamRef.current = null;
          abortRef.current = null;
        }
      }
    },
    [cleanUp, onBeforeStart],
  );

  useEffect(() => cleanUp, [cleanUp]);

  const busy = useMemo(
    () =>
      state.phase === 'requesting-permission' ||
      state.phase === 'connecting' ||
      state.phase === 'listening' ||
      state.phase === 'scoring',
    [state.phase],
  );

  return { state, busy, start, stop, reset };
}
