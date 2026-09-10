import assert from 'node:assert/strict';
import test from 'node:test';

import {
  registerScoredSpeechAttempt,
  selectBestSpeechAttempt,
} from './speech-attempt.ts';
import type {
  SpeechAssessmentLevel,
  SpeechAssessmentResult,
} from './speech-assessment.ts';

function result(level: SpeechAssessmentLevel, matchScore = 100) {
  return {
    language: 'fil-PH',
    level,
    transcript: 'Kita tayo bukas.',
    reference: 'Kita tayo bukas.',
    matchScore,
    pronunciation: null,
    missingWords: [],
    extraWords: [],
    lowAccuracyWords: [],
    usedAlternateHypothesis: false,
    reminder: null,
  } satisfies SpeechAssessmentResult;
}

void test('an exploratory retry cannot erase first-attempt verification', () => {
  const selected = selectBestSpeechAttempt({
    previous: result('verified'),
    previousAttempt: 1,
    candidate: result('retry', 45),
    candidateAttempt: 2,
  });

  assert.equal(selected.result.level, 'verified');
  assert.equal(selected.attemptNumber, 1);
  assert.equal(selected.retainedPrevious, true);
});

void test('later verification replaces an earlier retry but keeps its attempt number', () => {
  const selected = selectBestSpeechAttempt({
    previous: result('retry', 50),
    previousAttempt: 1,
    candidate: result('verified'),
    candidateAttempt: 2,
  });

  assert.equal(selected.result.level, 'verified');
  assert.equal(selected.attemptNumber, 2);
  assert.equal(selected.retainedPrevious, false);
});

void test('unscored failures do not consume first scored-attempt credit', () => {
  const unscored = registerScoredSpeechAttempt(0, result('unscored', 0));
  assert.deepEqual(unscored, { scoredAttempts: 0, candidateAttempt: 1 });

  const verified = registerScoredSpeechAttempt(
    unscored.scoredAttempts,
    result('verified'),
  );
  assert.deepEqual(verified, { scoredAttempts: 1, candidateAttempt: 1 });
});
