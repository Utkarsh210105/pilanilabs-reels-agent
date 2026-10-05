import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseManychat } from '../pipeline/leads.js';

test('reads our own External Request fields', () => {
  const p = parseManychat({ manychat_id: '123', ig_username: '@riya.k', name: 'Riya', keyword: 'AI', followed: 'true' });
  assert.equal(p.manychat_id, '123');
  assert.equal(p.ig_username, 'riya.k');
  assert.equal(p.followed, true);
});

test('reads nested Full Contact Data', () => {
  const p = parseManychat({ keyword: 'AI', contact: { id: 987, name: 'Aman', ig_username: 'aman_codes', ig_id: '555', last_input_text: 'AI' } });
  assert.equal(p.manychat_id, '987');
  assert.equal(p.ig_username, 'aman_codes');
  assert.equal(p.comment, 'AI');
});

test('ignores placeholders ManyChat left unfilled', () => {
  const p = parseManychat({ ig_username: '{{ig_username}}', post_url: '{{post_url}}', id: '42' });
  assert.equal(p.ig_username, null);
  assert.equal(p.post_url, null);
  assert.equal(p.manychat_id, '42');
});
