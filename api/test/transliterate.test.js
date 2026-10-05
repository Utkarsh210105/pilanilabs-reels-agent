import { test } from 'node:test';
import assert from 'node:assert/strict';
import { devanagariToRoman, phoneticKey } from '../pipeline/transliterate.js';
import { alignScript } from '../pipeline/align.js';

test('common Hindi words come out in Hinglish spelling', () => {
  const cases = { 'करते': 'karte', 'एक': 'ek', 'नहीं': 'naheen', 'था': 'thaa', 'समझ': 'samajh', 'दिया': 'diyaa', 'ने': 'ne', 'से': 'se', 'है': 'hai' };
  for (const [dev, roman] of Object.entries(cases)) assert.equal(devanagariToRoman(dev), roman, dev);
});

test('phonetic keys make spelling variants equal', () => {
  assert.equal(phoneticKey('नहीं'), phoneticKey('naheen'));
  assert.equal(phoneticKey('था'), phoneticKey('tha'));
  assert.equal(phoneticKey('किया'), phoneticKey('kiya'));
  assert.equal(phoneticKey('दिन'), phoneticKey('din'));
});

test('Roman Hinglish script aligns with a Devanagari transcript', () => {
  const segments = [{ text: 'Ek AI ne abhi ek aisa code tod diya jo 20 saal se unlock nahi ho pa raha tha.' }];
  const words = 'एक AI ने अभी एक ऐसा code तोड़ दिया जो 20 साल से unlock नहीं हो पा रहा था।'.split(' ');
  const asr = words.map((word, i) => ({ word, start: i * 0.3, end: i * 0.3 + 0.25 }));
  const t = alignScript(segments, asr, 6);
  assert.ok(t.match_ratio >= 0.85, `match ratio ${t.match_ratio}`);
});
