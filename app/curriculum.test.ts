import assert from 'node:assert/strict';
import test from 'node:test';

import { units } from './curriculum.ts';

void test('foundation path contains eight complete seven-phrase units', () => {
  assert.equal(units.length, 8);
  assert.equal(
    units.reduce((total, unit) => total + unit.phrases.length, 0),
    56,
  );
  for (const unit of units) {
    assert.equal(unit.phrases.length, 7, `${unit.id} must have seven phrases`);
    assert.ok(unit.soundFocus.length > 20);
    assert.ok(unit.pattern.frame.length > 5);
    assert.ok(unit.dialogue.reply.length > 0);
    assert.ok(!unit.dialogue.alternatives.includes(unit.dialogue.reply));
  }
});

void test('all unit and phrase identifiers are unique', () => {
  const unitIds = units.map((unit) => unit.id);
  const phraseIds = units.flatMap((unit) =>
    unit.phrases.map((phrase) => `${unit.id}:${phrase.id}`),
  );
  assert.equal(new Set(unitIds).size, unitIds.length);
  assert.equal(new Set(phraseIds).size, phraseIds.length);
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
});
