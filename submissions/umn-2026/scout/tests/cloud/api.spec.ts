import { test, expect } from '@playwright/test';
import { createSession } from '../../shared/types';

test('cloud preview advertises demo only and rejects live AI requests', async ({ request }) => {
  const health = await request.get('/api/health');
  expect(health.status()).toBe(200);
  expect(await health.json()).toMatchObject({ ok: true, liveAvailable: false, model: 'guided-demo', facultyCount: 8 });
  const live = await request.post('/api/agent', { data: { mode: 'live', action: 'chat', message: 'Explore biology', state: createSession() } });
  expect(live.status()).toBe(503);
  expect(await live.json()).toMatchObject({ code: 'LIVE_UNAVAILABLE' });
});

test('cloud API rejects cross-origin, malformed, and oversized requests', async ({ request }) => {
  const headers = { 'Content-Type': 'application/json' };
  const crossOrigin = await request.post('/api/agent', { headers: { ...headers, Origin: 'https://example.org' }, data: '{}' });
  expect(crossOrigin.status()).toBe(403);
  const malformed = await request.post('/api/agent', { headers, data: '{' });
  expect(malformed.status()).toBe(400);
  const oversized = await request.post('/api/agent', { headers, data: JSON.stringify({ text: 'x'.repeat(200 * 1024) }) });
  expect(oversized.status()).toBe(413);
});
