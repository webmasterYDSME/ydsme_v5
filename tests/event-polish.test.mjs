import test from 'node:test';
import assert from 'node:assert/strict';
import { eventPolishSchema, requestPolishedDescription } from '../lib/event-polish.ts';

const input = { description: 'Join our members for an afternoon of railway maintenance and conversation.', name: 'Club afternoon', audience: 'member_only', booking: 'none' };
const completed = text => ({ status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text }] }] });
const options = payload => ({ apiKey: 'test-key', model: 'test-model', fetcher: async () => Response.json(payload) });

test('polishing validates trimmed length and audience settings', () => {
  assert.equal(eventPolishSchema.safeParse(input).success, true);
  assert.equal(eventPolishSchema.safeParse({ ...input, description: ' '.repeat(50) }).success, false);
  assert.equal(eventPolishSchema.safeParse({ ...input, description: 'a'.repeat(49) }).success, false);
  assert.equal(eventPolishSchema.safeParse({ ...input, description: 'a'.repeat(50) }).success, true);
  assert.equal(eventPolishSchema.safeParse({ ...input, audience: 'unknown' }).success, false);
});

test('polishing sends factual context privately and preserves paragraphs', async () => {
  const description = 'Join fellow members for railway maintenance.\n\nEnjoy an afternoon of conversation.';
  const result = await requestPolishedDescription(input, { apiKey: 'test-key', model: 'configured-model', fetcher: async (url, init) => {
    assert.equal(url, 'https://api.openai.com/v1/responses');
    assert.equal(init.headers.Authorization, 'Bearer test-key');
    assert.equal(init.cache, 'no-store');
    const body = JSON.parse(init.body);
    assert.equal(body.store, false);
    assert.equal(body.model, 'configured-model');
    assert.deepEqual(JSON.parse(body.input), input);
    assert.match(body.instructions, /Do not invent/);
    return Response.json(completed(description));
  } });
  assert.equal(result, description);
});

test('polishing rejects failed, incomplete, refused and oversized responses', async () => {
  await assert.rejects(requestPolishedDescription(input, { ...options({}), fetcher: async () => new Response('upstream private error', { status: 500 }) }), /temporarily unavailable/);
  for (const payload of [{ ...completed('partial'), status: 'incomplete' }, { status: 'completed', output: [{ type: 'message', content: [{ type: 'refusal', refusal: 'No' }] }] }, completed(''), completed('a'.repeat(5001))]) {
    await assert.rejects(requestPolishedDescription(input, options(payload)));
  }
});
