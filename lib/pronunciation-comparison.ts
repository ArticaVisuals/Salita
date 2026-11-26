import type { SyllableExercise } from './syllable-practice';

export const SPEECH_SAMPLE_RATE = 16_000;

const WINDOW = 512;
const HOP = 320;
const FRAME_SECONDS = HOP / SPEECH_SAMPLE_RATE;
const MEL_BANDS = 24;
const COEFFICIENTS = 10;

type Range = { start: number; end: number };
type Features = { start: number; frames: Float32Array[] };
export type PronunciationComparison = {
  pace: 'similar' | 'slower' | 'faster';
  focus: {
    position: 'beginning' | 'middle' | 'end';
    model: Range;
    attempt: Range;
  } | null;
};

const taper = Float32Array.from(
  { length: WINDOW },
  (_, n) => 0.5 - 0.5 * Math.cos((2 * Math.PI * n) / (WINDOW - 1)),
);
const bins = Array.from({ length: MEL_BANDS + 2 }, (_, n) => {
  const mel = 2595 * Math.log10(1 + 80 / 700);
  const top = 2595 * Math.log10(1 + 7400 / 700);
  return (
    (700 *
      (10 ** ((mel + (n * (top - mel)) / (MEL_BANDS + 1)) / 2595) - 1) *
      WINDOW) /
    SPEECH_SAMPLE_RATE
  );
});
const cosine = Array.from({ length: COEFFICIENTS }, (_, n) =>
  Float32Array.from({ length: MEL_BANDS }, (_, k) =>
    Math.cos((Math.PI * (n + 1) * (k + 0.5)) / MEL_BANDS),
  ),
);

function fft(real: Float32Array, imaginary: Float32Array) {
  for (let i = 1, j = 0; i < WINDOW; i += 1) {
    let bit = WINDOW >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) [real[i], real[j]] = [real[j], real[i]];
  }

  for (let size = 2; size <= WINDOW; size *= 2) {
    const step = (-2 * Math.PI) / size;
    for (let offset = 0; offset < size / 2; offset += 1) {
      const c = Math.cos(step * offset);
      const s = Math.sin(step * offset);
      for (let i = offset; i < WINDOW; i += size) {
        const j = i + size / 2;
        const re = c * real[j] - s * imaginary[j];
        const im = s * real[j] + c * imaginary[j];
        real[j] = real[i] - re;
        imaginary[j] = imaginary[i] - im;
        real[i] += re;
        imaginary[i] += im;
      }
    }
  }
}

function features(pcm: Float32Array): Features | null {
  const count = Math.floor((pcm.length - WINDOW) / HOP) + 1;
  if (count < 18 || count > 480) return null;
  const energy = Array.from({ length: count }, (_, i) => {
    let sum = 0;
    for (let k = i * HOP; k < i * HOP + WINDOW; k += 1) sum += pcm[k] ** 2;
    return Math.sqrt(sum / WINDOW);
  });
  const peak = Math.max(...energy);
  if (!Number.isFinite(peak) || peak < 0.015) return null;
  const audible = energy.map((value) => value > Math.max(0.004, peak * 0.09));
  const start = Math.max(0, audible.indexOf(true) - 2);
  const end = Math.min(count, audible.lastIndexOf(true) + 3);
  if (end - start < 18 || audible.filter(Boolean).length < (end - start) * 0.35)
    return null;

  const real = new Float32Array(WINDOW);
  const imaginary = new Float32Array(WINDOW);
  const bands = new Float32Array(MEL_BANDS);
  const frames = Array.from({ length: end - start }, (_, frame) => {
    const offset = (start + frame) * HOP;
    for (let i = 0; i < WINDOW; i += 1) {
      const index = offset + i;
      real[i] = (pcm[index] - 0.95 * (pcm[index - 1] ?? 0)) * taper[i];
    }
    imaginary.fill(0);
    fft(real, imaginary);
    for (let band = 0; band < MEL_BANDS; band += 1) {
      const [left, middle, right] = [
        bins[band],
        bins[band + 1],
        bins[band + 2],
      ];
      let power = 0;
      for (let k = Math.ceil(left); k <= right; k += 1) {
        const weight =
          k <= middle
            ? (k - left) / (middle - left)
            : (right - k) / (right - middle);
        power += (real[k] ** 2 + imaginary[k] ** 2) * weight;
      }
      bands[band] = Math.log(Math.max(power, 1e-8));
    }
    return Float32Array.from(cosine, (weights) =>
      weights.reduce((sum, weight, k) => sum + weight * bands[k], 0),
    );
  });

  // Normalize spectral color within each voice so gain and timbre carry less weight.
  for (let k = 0; k < COEFFICIENTS; k += 1) {
    const mean =
      frames.reduce((sum, frame) => sum + frame[k], 0) / frames.length;
    const variance =
      frames.reduce((sum, frame) => sum + (frame[k] - mean) ** 2, 0) /
      frames.length;
    const scale = Math.max(3, Math.sqrt(variance));
    for (const frame of frames) frame[k] = (frame[k] - mean) / scale;
  }
  return { start, frames };
}

function distance(left: Float32Array, right: Float32Array) {
  let sum = 0;
  for (let k = 0; k < COEFFICIENTS; k += 1)
    sum += Math.min(3, Math.abs(left[k] - right[k]));
  return sum / COEFFICIENTS;
}

function alignSpeech(attemptPcm: Float32Array, modelPcm: Float32Array) {
  const attempt = features(attemptPcm);
  const model = features(modelPcm);
  if (!attempt || !model) return null;
  const rows = model.frames.length;
  const columns = attempt.frames.length;
  const ratio = columns / rows;
  if (ratio > 2.5 || ratio < 0.4) return null;

  // Constrained dynamic time warping follows the same phrase across different tempos.
  const stride = columns + 1;
  const costs = new Float32Array((rows + 1) * stride).fill(Infinity);
  const path = new Uint8Array(costs.length);
  costs[0] = 0;
  const slack = Math.max(10, Math.ceil(columns * 0.22));
  for (let i = 1; i <= rows; i += 1) {
    for (
      let j = Math.max(1, Math.floor(i * ratio - slack));
      j <= Math.min(columns, Math.ceil(i * ratio + slack));
      j += 1
    ) {
      const index = i * stride + j;
      const diagonal = costs[index - stride - 1];
      const left = costs[index - 1] + 0.12;
      const up = costs[index - stride] + 0.12;
      const least = Math.min(diagonal, left, up);
      costs[index] =
        least + distance(model.frames[i - 1], attempt.frames[j - 1]);
      path[index] = least === diagonal ? 1 : least === left ? 2 : 3;
    }
  }

  const pairs: Array<{ model: number; attempt: number; difference: number }> =
    [];
  for (let i = rows, j = columns; i > 0 && j > 0;) {
    const step = path[i * stride + j];
    if (!step) return null;
    pairs.push({
      model: i - 1,
      attempt: j - 1,
      difference: distance(model.frames[i - 1], attempt.frames[j - 1]),
    });
    if (step !== 2) i -= 1;
    if (step !== 3) j -= 1;
  }
  return { model, attempt, ratio, pairs };
}

export function comparePronunciation(
  attemptPcm: Float32Array,
  modelPcm: Float32Array,
): PronunciationComparison | null {
  const aligned = alignSpeech(attemptPcm, modelPcm);
  if (!aligned) return null;
  const { model, attempt, ratio, pairs } = aligned;
  const rows = model.frames.length;
  const columns = attempt.frames.length;
  const pace = ratio > 1.25 ? 'slower' : ratio < 0.8 ? 'faster' : 'similar';
  const sections = Array.from({ length: 3 }, () => ({
    total: 0,
    count: 0,
    modelStart: rows,
    modelEnd: 0,
    attemptStart: columns,
    attemptEnd: 0,
  }));
  for (const pair of pairs) {
    const section = sections[Math.min(2, Math.floor((pair.model * 3) / rows))];
    section.total += pair.difference;
    section.count += 1;
    section.modelStart = Math.min(section.modelStart, pair.model);
    section.modelEnd = Math.max(section.modelEnd, pair.model + 1);
    section.attemptStart = Math.min(section.attemptStart, pair.attempt);
    section.attemptEnd = Math.max(section.attemptEnd, pair.attempt + 1);
  }
  const means = sections.map(({ total, count }) => total / count);
  const highest = Math.max(...means);
  const lowest = Math.min(...means);
  if (rows < 45 || highest < 0.63 || highest - lowest < 0.23)
    return { pace, focus: null };

  const index = means.indexOf(highest);
  const section = sections[index];
  const range = (
    start: number,
    first: number,
    last: number,
    length: number,
  ) => ({
    start: Math.max(0, (start + first) * FRAME_SECONDS - 0.16),
    end: Math.min(
      length / SPEECH_SAMPLE_RATE,
      (start + last) * FRAME_SECONDS + 0.16,
    ),
  });
  return {
    pace,
    focus: {
      position: (['beginning', 'middle', 'end'] as const)[index],
      model: range(
        model.start,
        section.modelStart,
        section.modelEnd,
        modelPcm.length,
      ),
      attempt: range(
        attempt.start,
        section.attemptStart,
        section.attemptEnd,
        attemptPcm.length,
      ),
    },
  };
}

export type SyllableFeedback = {
  stress: 'expected' | 'shifted' | 'unclear';
  heard: number | null;
  catch: 'heard' | 'unclear' | null;
};

export function compareSyllableTiming(
  attemptPcm: Float32Array,
  modelPcm: Float32Array,
  exercise: SyllableExercise,
): SyllableFeedback | null {
  const aligned = alignSpeech(attemptPcm, modelPcm);
  if (!aligned) return null;
  const { model, attempt, ratio, pairs } = aligned;
  if (ratio < 0.55 || ratio > 1.9) return null;
  const meanDifference =
    pairs.reduce((sum, pair) => sum + pair.difference, 0) / pairs.length;
  if (meanDifference > 0.9) return null;

  const first = new Float32Array(model.frames.length).fill(Infinity);
  const last = new Float32Array(model.frames.length);
  for (const pair of pairs) {
    first[pair.model] = Math.min(first[pair.model], pair.attempt);
    last[pair.model] = Math.max(last[pair.model], pair.attempt);
  }
  const center = WINDOW / (2 * SPEECH_SAMPLE_RATE);
  const mappedTime = (time: number) => {
    const index = Math.max(
      0,
      Math.min(first.length - 1, (time - center) / FRAME_SECONDS - model.start),
    );
    const low = Math.floor(index);
    const high = Math.ceil(index);
    const lowPoint = (first[low] + last[low]) / 2;
    const highPoint = (first[high] + last[high]) / 2;
    return (
      center +
      (attempt.start + lowPoint + (highPoint - lowPoint) * (index - low)) *
        FRAME_SECONDS
    );
  };
  const vowels = exercise.vowelWindows.map(([start, end]) => ({
    start: mappedTime(start),
    end: mappedTime(end),
  }));
  const lengths = vowels.map(({ start, end }) => end - start);
  if (lengths.some((length) => !Number.isFinite(length) || length < 0.019))
    return null;
  const longest = Math.max(...lengths);
  const heard = lengths.indexOf(longest);
  const next = Math.max(...lengths.filter((_, index) => index !== heard));
  const expected = lengths[exercise.stressed];
  const stress =
    heard === exercise.stressed && longest >= next * 1.12
      ? 'expected'
      : heard !== exercise.stressed &&
          meanDifference < 0.77 &&
          longest >= expected * 1.3 &&
          longest - expected >= 0.04
        ? 'shifted'
        : 'unclear';

  return {
    stress,
    heard: stress === 'unclear' ? null : heard,
    catch: exercise.catchWindow
      ? compareVowelBreak(
          attemptPcm,
          vowels,
          exercise.catchWindow.map(mappedTime),
        )
      : null,
  };
}

function compareVowelBreak(
  pcm: Float32Array,
  vowels: Range[],
  [start, end]: number[],
): 'heard' | 'unclear' {
  const energy = (from: number, to: number) => {
    const first = Math.max(1, Math.floor(from * SPEECH_SAMPLE_RATE));
    const last = Math.min(pcm.length, Math.floor(to * SPEECH_SAMPLE_RATE));
    let power = 0;
    for (let i = first; i < last; i += 1) power += (pcm[i] - pcm[i - 1]) ** 2;
    return Math.sqrt(power / Math.max(1, last - first));
  };
  const vowel = Math.min(...vowels.map(({ start, end }) => energy(start, end)));
  // A glottal catch can keep voicing. Look for the dip in the vowel's energy.
  if (vowel < 0.002) return 'unclear';
  for (let time = start; time + 0.018 <= end; time += 0.006) {
    if (energy(time, time + 0.018) / vowel < 0.4) return 'heard';
  }
  return 'unclear';
}

export function encodeSpeechClip(pcm: Float32Array, range: Range) {
  const samples = pcm.subarray(
    Math.max(0, Math.floor(range.start * SPEECH_SAMPLE_RATE)),
    Math.ceil(range.end * SPEECH_SAMPLE_RATE),
  );
  const view = new DataView(new ArrayBuffer(44 + samples.length * 2));
  for (const [offset, text] of [
    [0, 'RIFF'],
    [8, 'WAVE'],
    [12, 'fmt '],
    [36, 'data'],
  ] as const) {
    for (let i = 0; i < text.length; i += 1)
      view.setUint8(offset + i, text.charCodeAt(i));
  }
  view.setUint32(4, view.byteLength - 8, true);
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, SPEECH_SAMPLE_RATE, true);
  view.setUint32(28, SPEECH_SAMPLE_RATE * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  view.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i += 1)
    view.setInt16(
      44 + i * 2,
      Math.max(-1, Math.min(1, samples[i])) * 32767,
      true,
    );
  return new Blob([view], { type: 'audio/wav' });
}
