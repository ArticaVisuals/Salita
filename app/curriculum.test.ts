import assert from 'node:assert/strict';
import test from 'node:test';

import {
  getUnitLessons,
  getUnitVocabulary,
  isValidReviewKey,
  lessonIntroductionPlan,
  lessonScoredPracticePlan,
  units,
} from './curriculum.ts';
import { getFoundation } from './foundations.ts';

void test('course contains 43 gradual units and 258 micro-lessons', () => {
  assert.equal(units.length, 43);
  assert.equal(
    units.reduce((total, unit) => total + unit.phrases.length, 0),
    301,
  );
  for (const unit of units) {
    assert.equal(unit.phrases.length, 7, `${unit.id} must have seven phrases`);
    assert.equal(getUnitLessons(unit.id).length, 6);
    assert.equal(getUnitVocabulary(unit.id).length, 8);
    assert.ok(unit.soundFocus.length > 20);
    assert.ok(unit.pattern.frame.length > 5);
    assert.ok(unit.dialogue.reply.length > 0);
    assert.ok(!unit.dialogue.alternatives.includes(unit.dialogue.reply));
  }
});

void test('the original eight unit IDs remain available for progress migration', () => {
  const ids = new Set(units.map((unit) => unit.id));
  for (const id of [
    'greetings',
    'introductions',
    'needs',
    'food',
    'directions',
    'routine',
    'plans',
    'help',
  ]) {
    assert.ok(ids.has(id), `missing legacy unit ${id}`);
  }
});

void test('all unit and phrase identifiers are unique', () => {
  const unitIds = units.map((unit) => unit.id);
  const phraseIds = units.flatMap((unit) =>
    unit.phrases.map((phrase) => `${unit.id}:${phrase.id}`),
  );
  assert.equal(new Set(unitIds).size, unitIds.length);
  assert.equal(new Set(phraseIds).size, phraseIds.length);
  const lessonIds = units.flatMap((unit) =>
    getUnitLessons(unit.id).map((lesson) => lesson.id),
  );
  const vocabularyIds = units.flatMap((unit) =>
    getUnitVocabulary(unit.id).map((word) => `${unit.id}:${word.id}`),
  );
  assert.equal(new Set(lessonIds).size, 258);
  assert.equal(new Set(vocabularyIds).size, 344);
  for (const unit of units) {
    const englishLabels = getUnitVocabulary(unit.id).map((word) => word.en);
    assert.equal(
      new Set(englishLabels).size,
      englishLabels.length,
      `${unit.id} must not have ambiguous matching labels`,
    );
    for (const word of getUnitVocabulary(unit.id)) {
      assert.equal(
        isValidReviewKey(`${unit.id}-vocab-${word.id}:reading`),
        true,
      );
    }
  }
});

void test('audited beginner forms remain canonical', () => {
  const phrases = new Map(
    units.flatMap((unit) =>
      unit.phrases.map((phrase) => [phrase.id, phrase.fil]),
    ),
  );
  assert.equal(phrases.get('umuuwi'), 'Umuuwi ako nang alas-singko.');
  assert.equal(phrases.get('nawawala'), 'Naliligaw ako.');
  assert.equal(phrases.get('saan-banyo'), 'Nasaan ang banyo?');
  assert.equal(
    phrases.get('pasensya-hindi-puwede'),
    'Pasensiya na, hindi ako puwede.',
  );

  const numbers = units.find((unit) => unit.id === 'numbers-time');
  const change = numbers?.phrases.find(
    (phrase) => phrase.id === 'ikasampu-setyembre',
  );
  assert.equal(change?.fil, 'Tatlong piso ang sukli.');
  assert.equal(change?.en, 'The change is three pesos.');

  const recipients = units.find((unit) => unit.id === 'recipients-benefactive');
  assert.equal(
    recipients?.phrases.find((phrase) => phrase.id === 'ibinigay-ana')?.en,
    'I gave Ana a book.',
  );
  assert.equal(
    recipients?.phrases.find((phrase) => phrase.id === 'sino-bibigyan')?.en,
    'Who will you give a book to?',
  );

  assert.match(
    units.find((unit) => unit.id === 'existence-quantity')?.pattern.frame ?? '',
    /walang \+ noun/,
  );
  assert.match(
    units.find((unit) => unit.id === 'locative-focus')?.pattern.frame ?? '',
    /ng-form actor/,
  );
  assert.equal(
    units
      .find((unit) => unit.id === 'when-time-clauses')
      ?.phrases.find((phrase) => phrase.id === 'kung-aalis')?.en,
    'If you leave, I will go with you.',
  );
  assert.equal(
    units
      .find((unit) => unit.id === 'derived-result-nouns')
      ?.phrases.find((phrase) => phrase.id === 'ito-babasahin')?.en,
    'This is our reading material.',
  );
});

void test('multi-example grammar notes keep the first transformation as the drill', () => {
  assert.equal(
    getFoundation('requests-causatives').grammar.drill.correct,
    'pakiabot',
  );
  assert.equal(getFoundation('locative-focus').grammar.drill.correct, 'lagyan');
  assert.equal(getFoundation('spoken-filipino').grammar.drill.correct, '’di');
  assert.equal(getFoundation('food-cooking').grammar.drill.correct, 'hiwain');
});

void test('every scored word and expression has already been introduced', () => {
  const lessonOrder = [
    'sounds',
    'words',
    'pattern',
    'understand',
    'conversation',
    'checkpoint',
  ] as const;
  const introducedVocabulary = new Set<number>();
  const introducedPhrases = new Set<number>();

  for (const kind of lessonOrder) {
    lessonIntroductionPlan[kind].vocabulary.forEach((index) =>
      introducedVocabulary.add(index),
    );
    lessonIntroductionPlan[kind].phrases.forEach((index) =>
      introducedPhrases.add(index),
    );

    for (const index of lessonScoredPracticePlan[kind].vocabulary) {
      assert.ok(
        introducedVocabulary.has(index),
        `${kind} scores vocabulary ${index} before introducing it`,
      );
    }
    for (const index of lessonScoredPracticePlan[kind].phrases) {
      assert.ok(
        introducedPhrases.has(index),
        `${kind} scores phrase ${index} before introducing it`,
      );
    }
  }

  assert.deepEqual(
    [...introducedVocabulary].sort((a, b) => a - b),
    [0, 1, 2, 3, 4, 5, 6, 7],
  );
  assert.deepEqual(
    [...introducedPhrases].sort((a, b) => a - b),
    [0, 1, 2, 3, 4, 5, 6],
  );
});

void test('advanced structures follow the textbook progression', () => {
  const ids = units.map((unit) => unit.id);
  const orderedSegment = [
    'recipients-benefactive',
    'clock-calendar',
    'when-time-clauses',
    'word-building',
    'i-focus',
    'locative-focus',
    'adverbs-connectors',
    'causatives',
    'agreement-doubt',
    'derived-result-nouns',
    'reciprocal-reduplicated-actions',
    'spoken-filipino',
  ];
  const positions = orderedSegment.map((id) => ids.indexOf(id));
  assert.ok(positions.every((position) => position >= 0));
  assert.deepEqual(
    positions,
    [...positions].sort((a, b) => a - b),
  );

  const requests = units.find((unit) => unit.id === 'requests-causatives')!;
  assert.ok(requests.phrases.every((phrase) => !/magpa/iu.test(phrase.fil)));
  const when = units.find((unit) => unit.id === 'when-time-clauses')!;
  assert.ok(when.phrases.some((phrase) => phrase.fil.startsWith('Nang ')));
  assert.ok(when.phrases.some((phrase) => phrase.fil.startsWith('Kung ')));
});
