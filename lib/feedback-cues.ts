const patterns = {
  start: 8,
  correct: 18,
  recovered: 16,
  retry: 10,
  complete: [24, 35, 32],
  streak: [18, 30, 18, 35, 30],
};

type FeedbackCue = keyof typeof patterns;

type FeedbackPreferences = {
  sounds: boolean;
  vibration: boolean;
};

const storageKey = 'salita-feedback-v1';
const defaults = { sounds: true, vibration: true };
const attack = 0.005;
const release = 0.032;
const cueNotes: Record<FeedbackCue, readonly number[]> = {
  start: [493.88],
  correct: [659.25, 880],
  recovered: [587.33, 783.99],
  retry: [369.99],
  complete: [523.25, 659.25, 783.99, 1046.5],
  streak: [659.25, 880, 1174.66],
};
const clips = new Map<FeedbackCue, AudioBuffer>();
const fallbackClips = new Map<FeedbackCue, AudioBuffer>();
let devicePreferences: FeedbackPreferences | undefined;
let audio: AudioContext | undefined;
let clipsRequested = false;
let activeCue:
  | {
      source: AudioBufferSourceNode;
      gain: GainNode;
      startedAt: number;
      endsAt: number;
      level: number;
    }
  | undefined;
let fading: Promise<void> | undefined;
let vibrationStarted = false;

export function readFeedbackPreferences() {
  if (devicePreferences) return devicePreferences;
  try {
    const stored = JSON.parse(window.localStorage.getItem(storageKey) ?? '{}');
    if (stored && typeof stored === 'object') {
      devicePreferences = {
        sounds:
          typeof stored.sounds === 'boolean' ? stored.sounds : defaults.sounds,
        vibration:
          typeof stored.vibration === 'boolean'
            ? stored.vibration
            : defaults.vibration,
      };
    }
  } catch {
    // The switches still work for this visit when local storage is blocked.
  }
  return (devicePreferences ??= defaults);
}

export function saveFeedbackPreferences(preferences: FeedbackPreferences) {
  devicePreferences = preferences;
  stopFeedbackCue();
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(preferences));
  } catch {
    // Keep the in-memory preference for this visit.
  }
}

function loadClips(context: BaseAudioContext) {
  if (clipsRequested) return;
  clipsRequested = true;
  for (const cue of Object.keys(patterns) as FeedbackCue[]) {
    void fetch(`/feedback/${cue}.wav`)
      .then((response) => {
        if (!response.ok) throw new Error('Feedback clip unavailable');
        return response.arrayBuffer();
      })
      .then((file) => context.decodeAudioData(file))
      .then((clip) => clips.set(cue, clip))
      .catch(() => {});
  }
}

function loadAudio() {
  if (
    !readFeedbackPreferences().sounds ||
    typeof AudioContext === 'undefined'
  ) {
    return;
  }
  try {
    if (!audio) {
      audio = new AudioContext({ latencyHint: 'interactive' });
      loadClips(audio);
    }
    return audio;
  } catch {
    // Visual feedback remains available without an audio output.
  }
}

function wakeAudio(context: AudioContext) {
  if (context.state !== 'running') void context.resume().catch(() => {});
}

export function prepareFeedbackCues() {
  if (
    readFeedbackPreferences().sounds &&
    typeof OfflineAudioContext !== 'undefined'
  ) {
    loadClips(new OfflineAudioContext(1, 1, 24_000));
  }
  const onGesture = (event: Event) => {
    if (!event.isTrusted) return;
    const context = loadAudio();
    if (context) wakeAudio(context);
  };
  document.addEventListener('click', onGesture, true);
  document.addEventListener('keydown', onGesture, true);
  return () => {
    document.removeEventListener('click', onGesture, true);
    document.removeEventListener('keydown', onGesture, true);
  };
}

function fallbackClip(context: AudioContext, cue: FeedbackCue) {
  const cached = fallbackClips.get(cue);
  if (cached) return cached;
  // A short local tone keeps feedback responsive on a cold cache or offline.
  const rate = 24_000;
  const spacing = 0.067;
  const noteLength = 0.135;
  const notes = cueNotes[cue];
  const clip = context.createBuffer(
    1,
    Math.ceil(((notes.length - 1) * spacing + noteLength) * rate),
    rate,
  );
  const data = clip.getChannelData(0);
  notes.forEach((pitch, index) => {
    const offset = Math.round(index * spacing * rate);
    for (let sample = 0; sample < noteLength * rate; sample += 1) {
      const time = sample / rate;
      const envelope = Math.min(1, time / 0.009) * (1 - time / noteLength) ** 3;
      const phase = time * pitch * 2 * Math.PI;
      data[offset + sample] +=
        (Math.sin(phase) + 0.15 * Math.sin(phase * 2)) * envelope * 0.19;
    }
  });
  fallbackClips.set(cue, clip);
  return clip;
}

function fadeCue() {
  const cue = activeCue;
  activeCue = undefined;
  if (!audio || !cue) return;
  const now = audio.currentTime;
  if (now >= cue.endsAt) return;
  if (audio.state !== 'running') {
    cue.source.stop();
    return;
  }
  const end = Math.min(now + release, cue.endsAt);
  const level =
    cue.level * Math.min(1, Math.max(0, (now - cue.startedAt) / attack));
  cue.gain.gain.cancelScheduledValues(now);
  cue.gain.gain.setValueAtTime(level, now);
  cue.gain.gain.linearRampToValueAtTime(0, end);
  cue.source.stop(end);
  const drainMs = Math.ceil((end - now + (audio.baseLatency ?? 0)) * 1_000);
  const pending = new Promise<void>((resolve) => setTimeout(resolve, drainMs));
  fading = pending;
  void pending.then(() => {
    if (fading === pending) fading = undefined;
  });
}

export function stopFeedbackCue() {
  fadeCue();
  if (vibrationStarted) navigator.vibrate?.(0);
  vibrationStarted = false;
}

export function silenceFeedbackForRecording() {
  stopFeedbackCue();
  return fading;
}

export function playFeedbackCue(cue: FeedbackCue, underSpeech = false) {
  stopFeedbackCue();
  const preferences = readFeedbackPreferences();
  if (preferences.vibration) {
    vibrationStarted = navigator.vibrate?.(patterns[cue]) ?? false;
  }
  const context = loadAudio();
  if (!context) return;
  if (
    context.state !== 'running' &&
    navigator.userActivation?.isActive === false
  ) {
    return;
  }
  wakeAudio(context);
  try {
    const clip = clips.get(cue) ?? fallbackClip(context, cue);
    const source = context.createBufferSource();
    const gain = context.createGain();
    const level = underSpeech ? 0.5 : 1;
    const now = context.currentTime;
    source.buffer = clip;
    source.connect(gain).connect(context.destination);
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(level, now + attack);
    source.onended = () => {
      source.disconnect();
      gain.disconnect();
      if (activeCue?.source === source) activeCue = undefined;
    };
    source.start(now);
    activeCue = {
      source,
      gain,
      startedAt: now,
      endsAt: now + clip.duration,
      level,
    };
  } catch {
    // An unavailable cue must never block an answer or its score.
  }
}

export function isAudioPlaying(audio: HTMLAudioElement | null) {
  return Boolean(audio && !audio.paused && !audio.ended);
}
