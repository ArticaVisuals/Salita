import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import {
  compareSyllableTiming,
  SPEECH_SAMPLE_RATE,
} from './pronunciation-comparison.ts';
import {
  getSyllableExercise,
  syllableExercises,
  syllableModelUrl,
} from './syllable-practice.ts';

function reference(word: string) {
  const exercise = getSyllableExercise(`syllable-${word}`);
  assert.ok(exercise);
  const wave = readFileSync(
    new URL(`../public${syllableModelUrl(exercise)}`, import.meta.url),
  );
  const data = new DataView(wave.buffer, wave.byteOffset, wave.byteLength);
  assert.equal(data.getUint32(24, true), SPEECH_SAMPLE_RATE);
  let offset = 12;
  while (offset + 8 <= wave.length) {
    const size = data.getUint32(offset + 4, true);
    if (data.getUint32(offset) === 0x64617461) {
      const pcm = Float32Array.from(
        { length: size / 2 },
        (_, i) => data.getInt16(offset + 8 + i * 2, true) / 32768,
      );
      return { exercise, pcm };
    }
    offset += 8 + size + (size % 2);
  }
  throw new Error(`Missing waveform data for ${word}`);
}

function changeDuration(
  pcm: Float32Array,
  start: number,
  end: number,
  scale: number,
) {
  const first = Math.round(start * SPEECH_SAMPLE_RATE);
  const last = Math.round(end * SPEECH_SAMPLE_RATE);
  const length = Math.round((last - first) * scale);
  const attempt = new Float32Array(first + length + pcm.length - last);
  attempt.set(pcm.subarray(0, first));
  for (let i = 0; i < length; i += 1) {
    const position = first + i / scale;
    const index = Math.floor(position);
    attempt[first + i] =
      pcm[index] + (pcm[index + 1] - pcm[index]) * (position - index);
  }
  attempt.set(pcm.subarray(last), first + length);
  return attempt;
}

void test('recorded Tagalog models support the marked syllables with quieter input', () => {
  for (const { word } of syllableExercises) {
    const { exercise, pcm } = reference(word);
    const attempt = new Float32Array(pcm.length + 9_000);
    attempt.set(
      pcm.map((sample) => sample * 0.65),
      3_200,
    );
    assert.equal(
      compareSyllableTiming(attempt, pcm, exercise)?.heard,
      exercise.stressed,
      word,
    );
  }
});

void test('stress feedback identifies the second syllable when vowel timing moves there', () => {
  const { exercise, pcm } = reference('kumusta');
  const shorterFinal = changeDuration(pcm, 0.71, 0.97, 0.42);
  const longerMiddle = changeDuration(shorterFinal, 0.31, 0.45, 2.5);
  assert.deepEqual(compareSyllableTiming(longerMiddle, pcm, exercise), {
    stress: 'shifted',
    heard: 1,
    catch: null,
  });
});

void test('a clear break in saan is distinguishable from a sustained vowel', () => {
  const { exercise, pcm } = reference('saan');
  const joined = pcm.slice();
  const frame = (seconds: number) => Math.floor(seconds * SPEECH_SAMPLE_RATE);
  joined.copyWithin(frame(0.216), frame(0.31), frame(0.4));
  assert.equal(compareSyllableTiming(pcm, pcm, exercise)?.catch, 'heard');
  assert.equal(compareSyllableTiming(joined, pcm, exercise)?.catch, 'unclear');
});

void test('there is no syllable correction for silence or a different word', () => {
  const { exercise, pcm } = reference('kumusta');
  assert.equal(
    compareSyllableTiming(new Float32Array(pcm.length), pcm, exercise),
    null,
  );
  const other = compareSyllableTiming(reference('saan').pcm, pcm, exercise);
  assert.ok(other === null || other.stress === 'unclear');
});
