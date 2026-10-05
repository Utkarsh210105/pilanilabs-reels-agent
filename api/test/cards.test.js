import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseStat, publisherName, planCards, buildAss } from '../pipeline/captions.js';

test('parseStat pulls the number out of on-screen text', () => {
  assert.deepEqual(parseStat('40% cost drop'), { value: '40%', label: 'cost drop' });
  assert.deepEqual(parseStat('1/3 the cost'), { value: '1/3', label: 'the cost' });
  assert.deepEqual(parseStat('2 din mein solve'), { value: '2', label: 'din mein solve' });
  assert.equal(parseStat('Always verify'), null);
});

test('publisherName names the real site, not our feed', () => {
  assert.equal(publisherName('https://techcrunch.com/2026/09/23/x', 'TechCrunch AI'), 'TechCrunch');
  assert.equal(publisherName('https://www.somesite.io/post', 'Hacker News (AI, 150+ points)'), 'Somesite');
  assert.equal(publisherName('not a url', 'Hacker News (AI, 150+ points)'), 'Hacker News');
});

test('headline goes on the first B-roll line, numbers on B-roll lines with stats', () => {
  const segments = [
    { text: 'a', visual: 'avatar', on_screen_text: '40% drop' },
    { text: 'b', visual: 'broll', on_screen_text: '30% faster' },
    { text: 'c', visual: 'broll', on_screen_text: '1/3 the cost' },
    { text: 'd', visual: 'broll', on_screen_text: 'No number' },
  ];
  const plan = planCards({ segments, news: { title: 'X launches Y', source: 'TechCrunch' } });
  assert.equal(plan[1].type, 'headline');
  assert.equal(plan[2].type, 'number');
  assert.equal(plan[0], undefined, 'never over the avatar');
  assert.equal(plan[3], undefined);
});

test('the ASS file has the card events and valid timestamps', () => {
  const segments = [{ text: 'Hook line here', visual: 'avatar', on_screen_text: '' }, { text: 'Costs fell forty percent', visual: 'broll', on_screen_text: '40% cheaper' }];
  const timings = {
    words: 'Hook line here Costs fell forty percent'.split(' ').map((w, i) => ({ w, start: i * 0.5, end: i * 0.5 + 0.4, seg: i < 3 ? 0 : 1 })),
    segments: [{ start: 0, end: 1.5 }, { start: 1.5, end: 4 }],
  };
  const ass = buildAss({ timings, segments });
  assert.match(ass, /StatValue,,0,0,0,,\{[^}]*\}40%/);
  assert.match(ass, /StatLabel/);
  assert.ok(!/NaN/.test(ass));
});
