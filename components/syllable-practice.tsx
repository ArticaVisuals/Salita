'use client';

import { ChevronRight, Mic, Play, Square, Volume2 } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import { NativeSelect } from '@/components/ui/native-select';
import { stopFeedbackCue } from '@/lib/feedback-cues';
import { useSpeechAssessment } from '@/hooks/use-speech-assessment';
import {
  syllableExercises,
  syllableModelUrl,
  type SyllableExercise,
} from '@/lib/syllable-practice';

export function SyllablePractice() {
  const [open, setOpen] = useState(false);
  const [word, setWord] = useState(syllableExercises[0].word);
  const exercise =
    syllableExercises.find((item) => item.word === word) ??
    syllableExercises[0];

  return (
    <details
      onToggle={({ currentTarget }) => setOpen(currentTarget.open)}
      className="group mb-8 rounded-[16px] border border-border bg-card px-5"
    >
      <summary className="flex min-h-16 cursor-pointer list-none items-center gap-3 rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring [&::-webkit-details-marker]:hidden">
        <Mic className="size-5 text-secondary-foreground" aria-hidden="true" />
        <h2 className="flex-1 text-lg font-bold">Syllable practice</h2>
        <ChevronRight
          className="size-5 group-open:rotate-90"
          aria-hidden="true"
        />
      </summary>
      {open && (
        <div className="border-t border-border py-5">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <label htmlFor="syllable-word" className="text-sm font-bold">
              Practice word
            </label>
            <NativeSelect
              id="syllable-word"
              value={word}
              lang="fil"
              onChange={(event) => setWord(event.target.value)}
              className="[&_select]:h-11 [&_select]:bg-background [&_select]:text-base"
            >
              {syllableExercises.map((item) => (
                <option key={item.word} value={item.word}>
                  {item.word}
                </option>
              ))}
            </NativeSelect>
          </div>
          <SyllableDrill key={word} exercise={exercise} />
          <a
            href="/speech/syllables/ATTRIBUTION.txt"
            target="_blank"
            rel="noreferrer"
            className="mt-4 inline-block text-xs text-muted-foreground underline"
          >
            Recording credits
          </a>
        </div>
      )}
    </details>
  );
}

function SyllableDrill({ exercise }: { exercise: SyllableExercise }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const recordingUrl = useRef<string | null>(null);
  const [playbackError, setPlaybackError] = useState('');
  const stopAudio = useCallback(() => {
    audioRef.current?.pause();
    audioRef.current = null;
  }, []);
  const coach = useSpeechAssessment({ onBeforeStart: stopAudio });
  const { phase, practice, result, error } = coach.state;
  const attempt = practice?.attempt;
  const expected = exercise.syllables[exercise.stressed].toUpperCase();
  const detected = practice?.syllables;
  const heard =
    detected?.heard == null
      ? null
      : exercise.syllables[detected.heard].toUpperCase();

  useEffect(() => {
    if (!attempt) return;
    const url = URL.createObjectURL(attempt);
    recordingUrl.current = url;
    return () => {
      stopAudio();
      URL.revokeObjectURL(url);
      recordingUrl.current = null;
    };
  }, [attempt, stopAudio]);

  useEffect(() => stopAudio, [stopAudio]);

  const play = (url: string | null) => {
    if (!url || coach.busy) return;
    stopFeedbackCue();
    stopAudio();
    setPlaybackError('');
    const audio = new Audio(url);
    audioRef.current = audio;
    void audio.play().catch(() => {
      if (audioRef.current === audio)
        setPlaybackError('Tap again to replay the audio.');
    });
  };

  const status =
    error ??
    (phase === 'requesting-permission'
      ? 'Allow microphone access to start.'
      : phase === 'connecting'
        ? 'Opening the microphone…'
        : phase === 'listening'
          ? 'Listening. Say the word once.'
          : phase === 'scoring'
            ? 'Checking syllable timing on your device…'
            : '');

  return (
    <div className="mt-5">
      <p className="text-2xl font-black" lang="fil">
        {exercise.syllables.map((syllable, index) => (
          <span key={index}>
            {index > 0 && <span className="mx-1 text-muted-foreground">·</span>}
            {index === exercise.stressed ? (
              <strong className="rounded-[5px] bg-[var(--f-blue-3)] px-1.5 py-0.5 text-[#183f7b]">
                {expected}
              </strong>
            ) : (
              syllable
            )}
          </span>
        ))}
      </p>
      <p className="mt-1 text-sm text-muted-foreground">{exercise.meaning}</p>
      <p className="mt-3 text-sm leading-6">{exercise.cue}</p>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button
          variant="outline"
          disabled={coach.busy}
          onClick={() => play(syllableModelUrl(exercise))}
          className="min-h-11 font-bold"
        >
          <Volume2 /> Hear the word
        </Button>
        <Button
          onClick={() => {
            setPlaybackError('');
            if (coach.busy) coach.stop();
            else void coach.start(`syllable-${exercise.word}`, 'fil-PH');
          }}
          className="min-h-11 font-bold"
        >
          {coach.busy ? <Square /> : <Mic />}
          {coach.busy ? 'Stop' : 'Check my stress'}
        </Button>
        {attempt && (
          <Button
            variant="outline"
            onClick={() => play(recordingUrl.current)}
            className="min-h-11 font-bold"
          >
            <Play /> Hear my attempt
          </Button>
        )}
      </div>
      {playbackError && (
        <output className="mt-3 block text-sm">{playbackError}</output>
      )}
      {(status || phase === 'complete') && (
        <output className="mt-4 block space-y-1 rounded-[8px] bg-muted p-4 text-sm leading-6">
          {status ? (
            <span className="block">{status}</span>
          ) : (
            <>
              {practice?.completeLine ? (
                <>
                  {detected?.stress === 'shifted' ? (
                    <span className="block">
                      Your vowel timing points to <strong>{heard}</strong>. Try
                      giving <strong>{expected}</strong> more time.
                    </span>
                  ) : detected?.stress === 'expected' ? (
                    <span className="block">
                      Your vowel timing supports stress on{' '}
                      <strong>{expected}</strong>.
                    </span>
                  ) : (
                    <span className="block">
                      I couldn’t tell which syllable stood out. Listen for{' '}
                      <strong>{expected}</strong> and try once more.
                    </span>
                  )}
                  {detected?.catch && (
                    <span className="block">
                      {detected.catch === 'heard'
                        ? 'I heard a small break between the two a vowels.'
                        : 'I couldn’t hear a clear break between sa and an. Say both a vowels with a tiny catch between them.'}
                    </span>
                  )}
                </>
              ) : (
                <span className="block">
                  {result?.transcript
                    ? `I heard “${result.transcript}” instead. Try saying just ${exercise.word}.`
                    : `I couldn’t make out ${exercise.word}. Try saying the word once closer to the microphone.`}
                </span>
              )}
            </>
          )}
        </output>
      )}
    </div>
  );
}
