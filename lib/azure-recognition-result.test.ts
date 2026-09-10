import assert from 'node:assert/strict';
import test from 'node:test';

import { parseAzureRecognitionHypotheses } from './azure-recognition-result.ts';

void test('Azure detailed results retain five unique display hypotheses', () => {
  const hypotheses = parseAzureRecognitionHypotheses(
    JSON.stringify({
      NBest: [
        { Display: 'Kita kami bukas.', Confidence: 0.61 },
        { Display: 'Kita tayo bukas.', Confidence: 0.58 },
        { Display: 'Kita tayo bukas.', Confidence: 0.57 },
        { ITN: 'Kita tayo.', Confidence: 0.4 },
      ],
    }),
  );

  assert.deepEqual(hypotheses, [
    { transcript: 'Kita kami bukas.', confidence: 0.61 },
    { transcript: 'Kita tayo bukas.', confidence: 0.58 },
    { transcript: 'Kita tayo.', confidence: 0.4 },
  ]);
});

void test('malformed Azure detail safely produces no hypotheses', () => {
  assert.deepEqual(parseAzureRecognitionHypotheses('{nope'), []);
  assert.deepEqual(
    parseAzureRecognitionHypotheses(
      JSON.stringify({ NBest: [{ Display: '', Confidence: 2 }] }),
    ),
    [],
  );
});
