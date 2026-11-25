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

function resetEnv(extra = {}) {
  for (const k of ['ANTHROPIC_API_KEY', 'GEMINI_API_KEY', 'GEMINI_MODEL', 'MOCK_API', 'OFFICE_PASSCODE']) delete process.env[k];
  Object.assign(process.env, extra);
}

test('validate menolak agen asing dan urutan salah', () => {
  resetEnv({ ANTHROPIC_API_KEY: 'x' });
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

test('tier tidak dikenal / key tidak ada → model pertama yang tersedia', () => {
  resetEnv({ ANTHROPIC_API_KEY: 'x' });
  let ok = validate({ agentId: 'analis', tier: 'opus-mahal', messages: [{ role: 'user', content: 'hai' }] });
  assert.equal(ok.model.id, 'claude-haiku-5-5');
  resetEnv({ GEMINI_API_KEY: 'g' });
  ok = validate({ agentId: 'analis', tier: 'mantap', messages: [{ role: 'user', content: 'hai' }] });
  assert.equal(ok.tier, 'gemini');
});

test('GET melaporkan model aktif tanpa membuka rahasia', async () => {
  resetEnv({ GEMINI_API_KEY: 'rahasia-g', OFFICE_PASSCODE: 'p' });
  const res = fakeRes();
  await handler(fakeReq({}, {}, 'GET'), res);
  assert.equal(res.statusCode, 200);
  const j = JSON.parse(res.body());
  assert.deepEqual(j.models.map((m) => m.tier), ['gemini', 'gemini-lite']);
  assert.equal(j.passcode, true);
  assert.ok(!res.body().includes('rahasia-g'));
});

test('Gemini: streaming, lewati model 404, abaikan bagian "thought"', async () => {
  resetEnv({ GEMINI_API_KEY: 'g', OFFICE_PASSCODE: 'p' });
  const calls = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    calls.push({ url, init });
    if (calls.length === 1) return new Response(JSON.stringify({ error: { message: 'not found' } }), { status: 404 });
    const sse =
      'data: {"candidates":[{"content":{"parts":[{"text":"mikir","thought":true}]}}]}\r\n\r\n' +
      'data: {"candidates":[{"content":{"parts":[{"text":"Halo "}]}}]}\r\n\r\n' +
      'data: {"candidates":[{"content":{"parts":[{"text":"Toni"}]},"finishReason":"STOP"}],"usageMetadata":{"promptTokenCount":100,"candidatesTokenCount":5}}\r\n\r\n';
    return new Response(sse, { status: 200, headers: { 'content-type': 'text/event-stream' } });
  };
  try {
    const res = fakeRes();
    await handler(fakeReq({ agentId: 'sutradara', tier: 'gemini', messages: [{ role: 'user', content: 'hai' }, { role: 'assistant', content: 'ya' }, { role: 'user', content: 'lagi' }] }, { 'x-office-code': 'p' }), res);
    const events = res.body().split('\n\n').filter(Boolean).map((l) => JSON.parse(l.slice(5)));
    const text = events.filter((e) => e.type === 'delta').map((e) => e.text).join('');
    assert.equal(text, 'Halo Toni');
    const done = events.at(-1);
    assert.equal(done.type, 'done');
    assert.equal(done.cost, 0);
    assert.equal(done.free, true);
    assert.equal(calls.length, 2);
    assert.match(calls[1].url, /:streamGenerateContent\?alt=sse$/);
    assert.equal(calls[1].init.headers['x-goog-api-key'], 'g');
    const sent = JSON.parse(calls[1].init.body);
    assert.deepEqual(sent.contents.map((c) => c.role), ['user', 'model', 'user']);
    assert.ok(sent.systemInstruction.parts[0].text.includes('Sutradara'));
  } finally {
    globalThis.fetch = realFetch;
  }
});

test('Gemini: kuota habis di semua model → pesan jelas', async () => {
  resetEnv({ GEMINI_API_KEY: 'g', OFFICE_PASSCODE: 'p' });
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response('{"error":{"message":"quota"}}', { status: 429 });
  try {
    const res = fakeRes();
    await handler(fakeReq({ agentId: 'analis', tier: 'gemini', messages: [{ role: 'user', content: 'hai' }] }, { 'x-office-code': 'p' }), res);
    const events = res.body().split('\n\n').filter(Boolean).map((l) => JSON.parse(l.slice(5)));
    assert.equal(events[0].type, 'error');
    assert.match(events[0].error, /Kuota gratis Gemini habis/);
  } finally {
    globalThis.fetch = realFetch;
  }
});

test('costUSD sesuai tarif per juta token', () => {
  assert.equal(costUSD(MODELS.gemini, 1000, 1000), 0);
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

test('handler: PUT → 405', async () => {
  const res = fakeRes();
  await handler(fakeReq({}, {}, 'PUT'), res);
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
  resetEnv({ OFFICE_PASSCODE: 'rahasia-123' });
  const res = fakeRes();
  await handler(fakeReq({ agentId: 'analis', messages: [{ role: 'user', content: 'hai' }] }, { 'x-office-code': 'rahasia-123' }), res);
  assert.equal(res.statusCode, 500);
  assert.match(res.body(), /GEMINI_API_KEY/);
});
