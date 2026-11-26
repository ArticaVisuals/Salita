import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  comparePronunciation,
  encodeSpeechClip,
  SPEECH_SAMPLE_RATE,
} from './pronunciation-comparison.ts';

const vowels = [
  [120, 480, 1080],
  [150, 750, 2400],
  [220, 1100, 3300],
];

function phrase(sounds: number[][], secondsPerSound = 0.45, gain = 1) {
  return Float32Array.from(
    {
      length: Math.round(SPEECH_SAMPLE_RATE * secondsPerSound * sounds.length),
    },
    (_, index) => {
      const time = index / SPEECH_SAMPLE_RATE;
      const part = Math.min(
        sounds.length - 1,
        Math.floor(time / secondsPerSound),
      );
      const within = time % secondsPerSound;
      const envelope = Math.min(
        1,
        within * 45,
        (secondsPerSound - within) * 45,
      );
      return (
        envelope *
        gain *
        sounds[part].reduce(
          (sum, frequency, harmonic) =>
            sum +
            (0.22 * Math.sin(2 * Math.PI * frequency * time)) / (harmonic + 1),
          0,
        )
      );
    },
  );
}

void test('sound feedback ignores mic gain and silence around the phrase', () => {
  const quieter = phrase(vowels, 0.45, 0.45);
  const padded = new Float32Array(quieter.length + 9_000);
  padded.set(quieter, 3_200);
  assert.deepEqual(comparePronunciation(padded, phrase(vowels)), {
    pace: 'similar',
    focus: null,
  });
});

void test('the timing comparison detects a slower reading of the same sounds', () => {
  assert.equal(
    comparePronunciation(phrase(vowels, 0.68), phrase(vowels))?.pace,
    'slower',
  );
});

void test('sound feedback locates a different final sound and returns playable ranges', async () => {
  const model = phrase(vowels);
  const attempt = phrase([vowels[0], vowels[1], [360, 2560, 4600]]);
  const comparison = comparePronunciation(attempt, model);
  assert.equal(comparison?.pace, 'similar');
  assert.equal(comparison?.focus?.position, 'end');
  assert.ok(comparison.focus.model.start > 0.6);
  assert.ok(
    comparison.focus.attempt.end <= attempt.length / SPEECH_SAMPLE_RATE,
  );

  const clip = encodeSpeechClip(attempt, comparison.focus.attempt);
  assert.equal(clip.type, 'audio/wav');
  const data = new DataView(await clip.arrayBuffer());
  assert.equal(data.getUint32(4, true), clip.size - 8);
  assert.equal(data.getUint32(24, true), SPEECH_SAMPLE_RATE);
  assert.equal(data.getUint32(40, true), clip.size - 44);
});

void test('sound feedback needs clear recorded audio', () => {
  assert.equal(
    comparePronunciation(new Float32Array(20_000), phrase(vowels)),
    null,
  );
});
