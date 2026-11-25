import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import handler, { validate, costUSD, MODELS } from '../api/agent.js';

function fakeReq(body, headers = {}, method = 'POST') {
  const req = Readable.from([Buffer.from(JSON.stringify(body))]);
  req.method = method;
  req.headers = headers;
  return req;
}
function fakeRes() {
  const res = { statusCode: 0, headers: {}, chunks: [] };
  res.setHeader = (k, v) => (res.headers[k.toLowerCase()] = v);
  res.write = (c) => res.chunks.push(String(c));
  res.end = (c) => {
    if (c) res.chunks.push(String(c));
    res.ended = true;
  };
  res.body = () => res.chunks.join('');
  return res;
}

test('validate menolak agen asing dan urutan salah', () => {
  assert.ok(validate({ agentId: 'hacker', messages: [{ role: 'user', content: 'x' }] }).error);
  assert.ok(validate({ agentId: 'analis', messages: [] }).error);
  assert.ok(validate({ agentId: 'analis', messages: [{ role: 'assistant', content: 'x' }] }).error);
  assert.ok(validate({ agentId: 'analis', messages: [{ role: 'user', content: 'a' }, { role: 'user', content: 'b' }] }).error);
  assert.ok(validate({ agentId: 'analis', messages: [{ role: 'system', content: 'x' }] }).error);
  assert.ok(validate({ agentId: 'analis', messages: [{ role: 'user', content: 'x'.repeat(130_000) }] }).error);
  const ok = validate({ agentId: 'sutradara', tier: 'mantap', messages: [{ role: 'user', content: 'hai' }] });
  assert.equal(ok.error, undefined);
  assert.equal(ok.model.id, 'claude-sonnet-5-5');
});

test('tier tidak dikenal jatuh ke model hemat', () => {
  const ok = validate({ agentId: 'analis', tier: 'opus-mahal', messages: [{ role: 'user', content: 'hai' }] });
  assert.equal(ok.model.id, 'claude-haiku-5-5');
});

test('costUSD sesuai tarif per juta token', () => {
  assert.equal(costUSD(MODELS.mantap, 20_000, 3_000), 0.07);
  assert.ok(Math.abs(costUSD(MODELS.hemat, 20_000, 3_000) - 0.0035) < 1e-12);
});

test('handler: kode akses salah → 401', async () => {
  process.env.OFFICE_PASSCODE = 'rahasia-123';
  process.env.MOCK_API = '1';
  const res = fakeRes();
  await handler(fakeReq({ agentId: 'analis', messages: [{ role: 'user', content: 'hai' }] }, { 'x-office-code': 'salah' }), res);
  assert.equal(res.statusCode, 401);
});

test('handler: GET → 405', async () => {
  const res = fakeRes();
  await handler(fakeReq({}, {}, 'GET'), res);
  assert.equal(res.statusCode, 405);
});

test('handler mode MOCK mengalirkan delta lalu done', async () => {
  process.env.OFFICE_PASSCODE = 'rahasia-123';
  process.env.MOCK_API = '1';
  const res = fakeRes();
  await handler(fakeReq({ agentId: 'analis', messages: [{ role: 'user', content: 'hai' }] }, { 'x-office-code': 'rahasia-123' }), res);
  assert.equal(res.statusCode, 200);
  assert.match(res.headers['content-type'], /event-stream/);
  const events = res.body().split('\n\n').filter(Boolean).map((l) => JSON.parse(l.slice(5)));
  assert.ok(events.some((e) => e.type === 'delta'));
  assert.equal(events.at(-1).type, 'done');
  assert.ok(res.ended);
});

test('handler tanpa API key (bukan mock) → 500 yang jelas', async () => {
  process.env.OFFICE_PASSCODE = 'rahasia-123';
  delete process.env.MOCK_API;
  delete process.env.ANTHROPIC_API_KEY;
  const res = fakeRes();
  await handler(fakeReq({ agentId: 'analis', messages: [{ role: 'user', content: 'hai' }] }, { 'x-office-code': 'rahasia-123' }), res);
  assert.equal(res.statusCode, 500);
  assert.match(res.body(), /ANTHROPIC_API_KEY/);
});
