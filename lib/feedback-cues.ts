const patterns = {
  correct: 18,
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
const clips = new Map<FeedbackCue, HTMLAudioElement>();
let devicePreferences: FeedbackPreferences | undefined;
let activeClip: HTMLAudioElement | null = null;
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

function loadClip(cue: FeedbackCue) {
  let clip = clips.get(cue);
  if (!clip) {
    clip = new Audio(`/feedback/${cue}.mp3`);
    clip.preload = 'auto';
    clips.set(cue, clip);
  }
  return clip;
}

export function preloadFeedbackCues() {
  if (!readFeedbackPreferences().sounds) return;
  for (const cue of Object.keys(patterns) as FeedbackCue[]) loadClip(cue);
}

export function stopFeedbackCue() {
  activeClip?.pause();
  activeClip = null;
  if (vibrationStarted) navigator.vibrate?.(0);
  vibrationStarted = false;
}

export function playFeedbackCue(cue: FeedbackCue, allowSound = true) {
  stopFeedbackCue();
  const preferences = readFeedbackPreferences();
  if (preferences.vibration) {
    vibrationStarted = navigator.vibrate?.(patterns[cue]) ?? false;
  }
  if (!preferences.sounds || !allowSound) return;
  const clip = loadClip(cue);
  if (clip.readyState) clip.currentTime = 0;
  activeClip = clip;
  void clip.play().catch(() => {
    // Visual feedback is already on screen if the browser blocks sound.
  });
}

export function isAudioPlaying(audio: HTMLAudioElement | null) {
  return Boolean(audio && !audio.paused && !audio.ended);
}
