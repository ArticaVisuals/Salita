'use client';

import {
  playFeedbackCue,
  silenceFeedbackForRecording,
} from '@/lib/feedback-cues';
import type { PronunciationPractice } from '@/lib/local-recognition-client';
import { getSyllableExercise, syllableTarget } from '@/lib/syllable-practice';

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
  practice: PronunciationPractice | null;
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
  practice: null,
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
      practice: null,
      error: 'Voice check stopped. Nothing was scored.',
    }));
  }, [cleanUp]);

  const start = useCallback(
    async (targetId: string, language: SpeechAssessmentLanguage) => {
      const exercise =
        language === 'fil-PH' ? getSyllableExercise(targetId) : null;
      const target = exercise
        ? syllableTarget(exercise)
        : getSpeechAssessmentTarget(targetId, language);
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
      if (!window.isSecureContext) {
        setState((current) => ({
          ...current,
          phase: 'error',
          error:
            'Microphone coaching needs a secure HTTPS connection. Open the published Salita site instead of an insecure preview.',
        }));
        return;
      }

      if (
        typeof AudioContext === 'undefined' ||
        typeof MediaRecorder === 'undefined'
      ) {
        setState((current) => ({
          ...current,
          phase: 'error',
          error:
            'This browser cannot run voice checks. Open Salita in a current browser or use Record & compare.',
        }));
        return;
      }

      attemptIdRef.current += 1;
      const attemptId = attemptIdRef.current;
      attemptCountRef.current[language] += 1;
      const attemptNumber = attemptCountRef.current[language];
      cleanUp();
      const cueTail = silenceFeedbackForRecording();
      onBeforeStart();
      setState((current) => ({
        ...current,
        phase: 'requesting-permission',
        attempts: attemptNumber,
        attemptsByLanguage: { ...attemptCountRef.current },
        language,
        result: null,
        retainedBest: false,
        practice: null,
        error: null,
      }));

      const controller = new AbortController();
      abortRef.current = controller;
      let timedOut: 'permission' | 'speech' | 'scoring' | null = null;
      let audioContext: AudioContext | undefined;
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
        const context = new AudioContext();
        audioContext = context;
        const audioReady = context.resume();
        void audioReady.catch(() => {});
        armTimeout('permission', 15_000);
        const mediaRequest = navigator.mediaDevices.getUserMedia({
          audio: {
            autoGainControl: true,
            channelCount: 1,
            echoCancellation: true,
            noiseSuppression: true,
          },
        });
        void mediaRequest.then(
          (lateStream) => {
            if (
              controller.signal.aborted ||
              attemptId !== attemptIdRef.current
            ) {
              lateStream.getTracks().forEach((track) => track.stop());
            }
          },
          () => {},
        );
        const interrupted = new Promise<never>((_, reject) => {
          controller.signal.addEventListener(
            'abort',
            () => reject(controller.signal.reason),
            { once: true },
          );
        });
        const stream = await Promise.race([mediaRequest, interrupted]);
        if (attemptId !== attemptIdRef.current || controller.signal.aborted) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = stream;
        setState((current) => ({ ...current, phase: 'connecting' }));
        armTimeout('speech', 20_000);
        await Promise.race([Promise.all([audioReady, cueTail]), interrupted]);

        const { recognizeOnDevice } =
          await import('@/lib/local-recognition-client');
        const { raw, practice } = await recognizeOnDevice({
          stream,
          context,
          target,
          signal: controller.signal,
          onListening: () => {
            if (
              attemptId === attemptIdRef.current &&
              !controller.signal.aborted
            ) {
              setState((current) => ({ ...current, phase: 'listening' }));
            }
          },
          onScoring: () => {
            if (
              attemptId === attemptIdRef.current &&
              !controller.signal.aborted
            ) {
              armTimeout('scoring', 90_000);
              setState((current) => ({ ...current, phase: 'scoring' }));
            }
          },
        });
        if (attemptId !== attemptIdRef.current) return;
        controller.signal.throwIfAborted();
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
            result:
              exercise || result.level === 'unscored' ? result : best.result,
            results: { ...current.results, [language]: best.result },
            bestAttemptByLanguage: {
              ...current.bestAttemptByLanguage,
              [language]: best.attemptNumber,
            },
            retainedBest: best.retainedPrevious && result.level !== 'unscored',
            practice,
            error: null,
          };
        });
        const accepted = exercise
          ? practice?.syllables?.stress === 'expected' &&
            practice.syllables.catch !== 'unclear'
          : language === 'fil-PH' &&
            (result.level === 'verified' || result.level === 'understood');
        if (accepted) {
          playFeedbackCue(
            result.level === 'understood' || attemptNumber > 1
              ? 'recovered'
              : 'correct',
          );
        }
      } catch (error) {
        if (attemptId !== attemptIdRef.current) return;
        if (timedOut) {
          setState((current) => ({
            ...current,
            phase: 'error',
            result: null,
            retainedBest: false,
            error:
              timedOut === 'permission'
                ? 'Microphone permission took too long. Check this site’s microphone setting, then try again; nothing was scored.'
                : timedOut === 'scoring'
                  ? 'The on-device voice check took too long. Connect to Wi-Fi for the first check and try again.'
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
          error:
            microphoneError(error) ??
            'The on-device voice check could not read this recording. Try again or use Record & compare.',
        }));
      } finally {
        void audioContext?.close().catch(() => {});
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

  useEffect(() => {
    const pageHide = () => cleanUp();
    window.addEventListener('pagehide', pageHide);
    return () => {
      window.removeEventListener('pagehide', pageHide);
      cleanUp();
    };
  }, [cleanUp]);

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
