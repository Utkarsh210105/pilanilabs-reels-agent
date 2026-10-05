import { test } from 'node:test';
import assert from 'node:assert/strict';
import { alignScript, similar, normWord } from '../pipeline/align.js';

const seg = (text) => ({ text, visual: 'avatar' });
const asrOf = (text, start = 0, per = 0.4) => text.split(' ').map((word, i) => ({ word, start: start + i * per, end: start + i * per + per * 0.9 }));

test('fuzzy word match tolerates small spelling differences', () => {
  assert.ok(similar(normWord('Anthropic,'), normWord('anthropic')));
  assert.ok(similar('hisaab', 'hisab'));
  assert.ok(!similar('the', 'then'));
  assert.ok(!similar('forty', '40'));
});

test('exact transcript aligns every word and splits segments at first words', () => {
  const segments = [seg('OpenAI just shipped a model.'), seg('It costs half as much.')];
  const asr = asrOf('OpenAI just shipped a model. It costs half as much.', 0.5);
  const t = alignScript(segments, asr, 6);
  assert.equal(t.match_ratio, 1);
  assert.equal(t.words.length, 10);
  assert.equal(t.segments[0].start, 0);
  assert.equal(t.segments[1].start, t.words[5].start);
  assert.equal(t.segments[0].end, t.segments[1].start);
  assert.equal(t.segments[1].end, 6);
});

test('unmatched words are spread between neighbouring matches', () => {
  const segments = [seg('Costs dropped forty percent this week')];
  const asr = [
    { word: 'Costs', start: 0, end: 0.4 }, { word: 'dropped', start: 0.4, end: 0.9 },
    { word: '40%', start: 1.0, end: 1.8 }, { word: 'this', start: 2.0, end: 2.2 }, { word: 'week', start: 2.2, end: 2.6 },
  ];
  const t = alignScript(segments, asr, 3);
  const forty = t.words[2];
  const percent = t.words[3];
  assert.ok(forty.start >= 0.9 && percent.end <= 2.0, 'filled words sit inside the gap');
  assert.ok(forty.start < percent.start);
  assert.equal(t.words[4].start, 2.0);
});

test('an empty transcript still yields monotonic timings', () => {
  const t = alignScript([seg('one two three'), seg('four five')], [], 5);
  const starts = t.words.map((w) => w.start);
  assert.deepEqual([...starts].sort((a, b) => a - b), starts);
  assert.equal(t.match_ratio, 0);
});
