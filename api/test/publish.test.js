import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaultCaption, validateCaption } from '../pipeline/publish.js';

test('default caption is the script caption plus at most 5 hashtags', () => {
  const c = defaultCaption({ caption: 'Pehli job chahiye?\nComment "JOB" 👇', hashtags: ['internship', 'freshers', 'chatgpt', 'careertips', 'pehlijob', 'extra'] });
  assert.match(c, /^Pehli job chahiye\?/);
  assert.equal((c.match(/#\w+/g) || []).length, 5);
  assert.ok(!c.includes('#extra'));
});

test('caption checks: empty, too long, too many hashtags', () => {
  assert.equal(validateCaption('Good caption #ai #jobs'), null);
  assert.match(validateCaption('   '), /empty/);
  assert.match(validateCaption('x'.repeat(2201)), /2200/);
  assert.match(validateCaption('#a #b #c #d #e #f'), /6 hashtags/);
});
