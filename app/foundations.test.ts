import assert from 'node:assert/strict';
import test from 'node:test';

import { units } from './curriculum.ts';
import { foundations } from './foundations.ts';

void test('every curriculum unit has a complete mixed-method foundation', () => {
  assert.deepEqual(
    Object.keys(foundations).sort(),
    units.map((unit) => unit.id).sort(),
  );

  for (const unit of units) {
    const foundation = foundations[unit.id];
    assert.ok(foundation.pronunciation.model.length > 4);
    assert.ok(foundation.pronunciation.syllables.length > 4);
    assert.ok(foundation.grammar.examples.length >= 2);
    assert.ok(foundation.reading.passage.length >= 25);

    for (const drill of [
      foundation.pronunciation.drill,
      foundation.grammar.drill,
      foundation.reading.drill,
    ]) {
      assert.equal(drill.options.length, 3);
      assert.equal(new Set(drill.options).size, 3);
      assert.ok(drill.options.includes(drill.correct));
      assert.ok(drill.note.length > 20);
    }
  }
});

void test('foundation readings remain graded for a beginner', () => {
  for (const [unitId, foundation] of Object.entries(foundations)) {
    const words = foundation.reading.passage.trim().split(/\s+/);
    assert.ok(
      words.length <= 45,
      `${unitId} reading is too long for this stage`,
    );
  }
});

void test('audited sound guides preserve lexical stress and glottal stops', () => {
  assert.equal(
    foundations.greetings.pronunciation.syllables,
    'ku-mus-TA · ma-gan-DANG u-MA-ga',
  );
  assert.match(foundations.introductions.pronunciation.syllables, /sa-ʔAN/);
  assert.match(foundations.food.pronunciation.syllables, /ma-sa-RAP/);
  assert.match(foundations.directions.pronunciation.syllables, /li-WAʔ/);
  assert.match(foundations.routine.pronunciation.syllables, /nag-LA-la-KAD/);
  assert.match(foundations.help.pronunciation.syllables, /ka-ʔi-LA-ngan/);
  assert.equal(
    foundations['thoughts-feelings'].pronunciation.syllables,
    'sa ti-NGIN ko · pa-la-GAY ko',
  );
  assert.match(
    foundations['location-prepositions'].pronunciation.syllables,
    /na-ri-TO/,
  );
  assert.match(
    foundations['locative-focus'].pronunciation.syllables,
    /pun-ta-HAN/,
  );
  assert.match(
    foundations['reciprocal-reduplicated-actions'].pronunciation.syllables,
    /mag-ʔU-sap-ʔU-sap/,
  );
  assert.match(foundations.comparisons.pronunciation.syllables, /ma-bi-LIS/);
  assert.match(
    foundations['requests-causatives'].pronunciation.syllables,
    /pa-ki-a-BOT/,
  );
  assert.match(
    foundations['derived-result-nouns'].pronunciation.syllables,
    /ba-ba-sa-HIN/,
  );
  assert.match(
    foundations['shopping-colors'].pronunciation.syllables,
    /su-KA-tin/,
  );
  assert.match(
    foundations['food-cooking'].pronunciation.syllables,
    /hi-wa-IN.*pa-ku-lu-AN/,
  );
  assert.match(
    foundations['travel-health'].pronunciation.syllables,
    /sa-KA-yan/,
  );
});
