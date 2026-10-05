import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanSpoken, normalizeSegments, runChecks, hinglishRatio, copiedPhrases } from '../pipeline/checks.js';

const seg = (text, visual = 'avatar', broll_query = '') => ({ text, visual, broll_query, on_screen_text: '' });
const words = (n) => Array.from({ length: n }, () => 'word').join(' ');

test('cleanSpoken removes em dashes, emojis, stage directions and hashtags', () => {
  assert.equal(cleanSpoken('AI is here — finally 🚀 [pause] #AI'), 'AI is here, finally');
  assert.equal(cleanSpoken('“Quoted” it’s fine'), '"Quoted" it\'s fine');
});

test('normalizeSegments drops empty lines and clears broll_query on avatar lines', () => {
  const out = normalizeSegments([seg('Hi', 'avatar', 'should go'), seg('   '), seg('Shown', 'broll', 'office')]);
  assert.equal(out.length, 2);
  assert.equal(out[0].broll_query, '');
  assert.equal(out[1].broll_query, 'office');
});

test('a well-formed B2B script has no errors', () => {
  const segments = [
    seg(words(10)), seg(words(25), 'broll', 'office team'), seg(words(25)),
    seg(words(25), 'broll', 'data centre'), seg(words(20)),
  ];
  const flags = runChecks(segments, 'b2b');
  assert.deepEqual(flags.filter((f) => f.severity === 'error'), []);
});

test('hook on B-roll, missing query and banned phrase are errors', () => {
  const segments = [
    seg(words(10), 'broll', 'x'), seg(words(30), 'broll', ''), seg(`This is a game changer ${words(30)}`), seg(words(30)),
  ];
  const codes = runChecks(segments, 'b2b').filter((f) => f.severity === 'error').map((f) => f.code);
  assert.ok(codes.includes('hook_not_avatar'));
  assert.ok(codes.includes('missing_broll_query'));
  assert.ok(codes.includes('banned_phrase'));
});

test('B2C script in plain English is flagged as not Hinglish', () => {
  const english = 'You are using ChatGPT the wrong way and here is how to fix it with a better prompt that gives better answers every time you try it at work';
  assert.ok(hinglishRatio(english) < 0.12);
  const hinglish = 'Aap ChatGPT ko galat tarah use kar rahe ho, aur isliye jawab bhi generic aata hai, toh ye trick try karo';
  assert.ok(hinglishRatio(hinglish) >= 0.12);
  const segments = [seg(english), seg(english, 'broll', 'phone'), seg(english), seg(english)];
  assert.ok(runChecks(segments, 'b2c').some((f) => f.code === 'not_hinglish'));
});

test('copy guard flags 5-word runs shared with the source reel', () => {
  const source = 'Aap ChatGPT ko galat tarah use kar rahe ho aur isliye jawab generic aata hai';
  const copied = [seg('Dekho, aap ChatGPT ko galat tarah use kar rahe ho.')];
  const original = [seg('Zyada log ChatGPT se ek line ka sawaal poochte hain.')];
  assert.equal(copiedPhrases(copied, source)[0]?.code, 'copied_phrase');
  assert.deepEqual(copiedPhrases(original, source), []);
});

test('prices are errors', () => {
  const segments = [seg(words(15)), seg(`Course fee sirf ₹4999 hai ${words(30)}`, 'broll', 'x'), seg(words(30)), seg(words(25))];
  assert.ok(runChecks(segments, 'b2c').some((f) => f.code === 'price_mentioned'));
});

test('too long scripts are errors', () => {
  const segments = [seg(words(15)), seg(words(60), 'broll', 'x'), seg(words(60)), seg(words(40))];
  assert.ok(runChecks(segments, 'b2b').some((f) => f.code === 'too_long'));
});
