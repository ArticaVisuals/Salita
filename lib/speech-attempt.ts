import type { SpeechAssessmentResult } from './speech-assessment';

const RESULT_RANK: Record<SpeechAssessmentResult['level'], number> = {
  unscored: 0,
  retry: 1,
  understood: 2,
  verified: 3,
};

function resultQuality(result: SpeechAssessmentResult) {
  return (
    RESULT_RANK[result.level] * 1_000_000 +
    result.matchScore * 1_000 +
    (result.pronunciation?.pronunciation ?? 0)
  );
}

export function selectBestSpeechAttempt({
  previous,
  previousAttempt,
  candidate,
  candidateAttempt,
}: {
  previous: SpeechAssessmentResult | undefined;
  previousAttempt: number | undefined;
  candidate: SpeechAssessmentResult;
  candidateAttempt: number;
}) {
  const retainedPrevious = Boolean(
    previous && resultQuality(previous) >= resultQuality(candidate),
  );
  return {
    result: retainedPrevious && previous ? previous : candidate,
    attemptNumber:
      retainedPrevious && previousAttempt ? previousAttempt : candidateAttempt,
    retainedPrevious,
  };
}

export function registerScoredSpeechAttempt(
  scoredAttempts: number,
  result: SpeechAssessmentResult,
) {
  if (result.level === 'unscored') {
    return {
      scoredAttempts,
      candidateAttempt: Math.max(1, scoredAttempts),
    };
  }
  return {
    scoredAttempts: scoredAttempts + 1,
    candidateAttempt: scoredAttempts + 1,
  };
}
