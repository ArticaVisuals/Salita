import { getSpeechClipId } from './tagalog-speech';
import {
  normalizeSpeechMatchText,
  type RawSpeechRecognition,
  type SpeechAssessmentLanguage,
  type SpeechAssessmentTarget,
} from './speech-assessment';
import {
  comparePronunciation,
  compareSyllableTiming,
  encodeSpeechClip,
  SPEECH_SAMPLE_RATE,
  type PronunciationComparison,
  type SyllableFeedback,
} from './pronunciation-comparison';
import { getSyllableExercise, syllableModelUrl } from './syllable-practice';

export type PronunciationPractice = {
  modelUrl: string;
  attempt: Blob;
  comparison: PronunciationComparison | null;
  modelClip?: Blob;
  completeLine: boolean;
  syllables?: SyllableFeedback | null;
};

let worker: Worker | undefined;

function recordPhrase(
  stream: MediaStream,
  context: AudioContext,
  signal: AbortSignal,
) {
  const recorder = new MediaRecorder(stream);
  const source = context.createMediaStreamSource(stream);
  const analyser = context.createAnalyser();
  analyser.fftSize = 1024;
  source.connect(analyser);

  return new Promise<Blob | null>((resolve, reject) => {
    const chunks: Blob[] = [];
    const samples = new Float32Array(analyser.fftSize);
    let lastSound = 0;
    let framesWithSpeech = 0;
    let frame = 0;
    let timeout: ReturnType<typeof setTimeout>;

    const cleanUp = () => {
      cancelAnimationFrame(frame);
      clearTimeout(timeout);
      signal.removeEventListener('abort', abort);
      source.disconnect();
      analyser.disconnect();
    };
    const stop = () => {
      if (recorder.state !== 'inactive') recorder.stop();
    };
    const abort = () => {
      cleanUp();
      stop();
      reject(signal.reason);
    };
    const listen = (time: number) => {
      analyser.getFloatTimeDomainData(samples);
      const energy = samples.reduce((sum, sample) => sum + sample ** 2, 0);
      if (energy / samples.length >= 0.0001) {
        lastSound = time;
        framesWithSpeech += 1;
      }
      if (framesWithSpeech >= 6 && time - lastSound >= 1_100) stop();
      else frame = requestAnimationFrame(listen);
    };

    recorder.ondataavailable = ({ data }) => {
      if (data.size) chunks.push(data);
    };
    recorder.onstop = () => {
      cleanUp();
      resolve(
        framesWithSpeech >= 6 && chunks.length
          ? new Blob(chunks, { type: recorder.mimeType })
          : null,
      );
    };
    recorder.onerror = () => {
      cleanUp();
      reject(new Error('The microphone recording could not be read.'));
    };
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) {
      abort();
      return;
    }
    try {
      recorder.start();
      timeout = setTimeout(stop, 9_000);
      frame = requestAnimationFrame(listen);
    } catch (error) {
      cleanUp();
      reject(error);
    }
  });
}

function transcribePhrase(
  pcm: Float32Array,
  language: SpeechAssessmentLanguage,
  signal: AbortSignal,
) {
  signal.throwIfAborted();
  const current = (worker ??= new Worker('/api/speech/worker', {
    type: 'module',
  }));
  return new Promise<string>((resolve, reject) => {
    const cleanUp = () => {
      signal.removeEventListener('abort', abort);
      current.onmessage = null;
      current.onerror = null;
    };
    const fail = (error: unknown) => {
      cleanUp();
      current.terminate();
      worker = undefined;
      reject(error);
    };
    const abort = () => fail(signal.reason);
    current.onerror = () =>
      fail(new Error('On-device speech could not start.'));
    current.onmessage = ({ data }: MessageEvent<{ transcript?: string }>) => {
      if (typeof data.transcript !== 'string') {
        fail(
          new Error(
            'The on-device speech model could not process the recording.',
          ),
        );
        return;
      }
      cleanUp();
      resolve(data.transcript.trim());
    };
    signal.addEventListener('abort', abort, { once: true });
    current.postMessage(
      { pcm, language: language === 'fil-PH' ? 'tl' : 'en' },
      [pcm.buffer],
    );
  });
}

export async function recognizeOnDevice({
  stream,
  context,
  target,
  signal,
  onListening,
  onScoring,
}: {
  stream: MediaStream;
  context: AudioContext;
  target: SpeechAssessmentTarget;
  signal: AbortSignal;
  onListening: () => void;
  onScoring: () => void;
}): Promise<{
  raw: RawSpeechRecognition;
  practice: PronunciationPractice | null;
}> {
  signal.throwIfAborted();
  onListening();
  const recording = await recordPhrase(stream, context, signal);
  stream.getTracks().forEach((track) => track.stop());
  if (!recording) {
    return {
      raw: { transcript: '', confidence: null, pronunciation: null },
      practice: null,
    };
  }
  onScoring();

  const audio = await context.decodeAudioData(await recording.arrayBuffer());
  signal.throwIfAborted();
  const pcm = await speechPcm(audio);
  const tagalog = target.language === 'fil-PH';
  const transcript = await transcribePhrase(
    tagalog ? pcm.slice() : pcm,
    target.language,
    signal,
  );
  const raw = { transcript, confidence: null, pronunciation: null };
  const practice = tagalog
    ? await buildPronunciationPractice(
        pcm,
        recording,
        target,
        transcript,
        context,
        signal,
      )
    : null;
  return { raw, practice };
}

async function speechPcm(audio: AudioBuffer) {
  const offline = new OfflineAudioContext(
    1,
    Math.ceil(audio.duration * SPEECH_SAMPLE_RATE),
    SPEECH_SAMPLE_RATE,
  );
  const source = offline.createBufferSource();
  source.buffer = audio;
  source.connect(offline.destination);
  source.start();
  return (await offline.startRendering()).getChannelData(0);
}

async function buildPronunciationPractice(
  attemptPcm: Float32Array,
  recording: Blob,
  target: SpeechAssessmentTarget,
  transcript: string,
  context: AudioContext,
  signal: AbortSignal,
): Promise<PronunciationPractice> {
  const exercise = getSyllableExercise(target.id);
  const modelUrl = exercise
    ? syllableModelUrl(exercise)
    : `/speech/${getSpeechClipId(target.reference)}.mp3`;
  const heard = normalizeSpeechMatchText(transcript, 'fil-PH');
  const completeLine =
    heard === normalizeSpeechMatchText(target.reference, 'fil-PH') ||
    (exercise?.word === 'saan' && heard === 'san');
  const practice = {
    modelUrl,
    attempt: recording,
    completeLine,
    comparison: null,
  };
  if (!completeLine) return practice;

  try {
    const response = await fetch(modelUrl, {
      signal: AbortSignal.any([signal, AbortSignal.timeout(4_000)]),
    });
    if (!response.ok) return practice;
    const modelAudio = await context.decodeAudioData(
      await response.arrayBuffer(),
    );
    const modelPcm = await speechPcm(modelAudio);
    signal.throwIfAborted();
    if (exercise)
      return {
        ...practice,
        syllables: compareSyllableTiming(attemptPcm, modelPcm, exercise),
      };
    const comparison = comparePronunciation(attemptPcm, modelPcm);
    const focus = comparison?.focus;
    return {
      ...practice,
      comparison,
      attempt: focus ? encodeSpeechClip(attemptPcm, focus.attempt) : recording,
      modelClip: focus ? encodeSpeechClip(modelPcm, focus.model) : undefined,
    };
  } catch {
    return practice;
  }
}
