import express, { type ErrorRequestHandler } from 'express';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { HealthResponse } from '../shared/types';
import { professors } from './catalog';
import { AgentError } from './errors';
import { runDemo } from './engine';
import { runLive } from './live';
import { checkOpenClawConnection, getOpenClawStatus, runOpenClaw } from './openclaw';
import { parseAgentRequest } from './validation';

export const app = express();
app.disable('x-powered-by');
const localHosts = new Set(['localhost', '127.0.0.1', '[::1]']);
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  if (req.path.startsWith('/api/')) {
    res.setHeader('Cache-Control', 'no-store');
    if (!localHosts.has(req.hostname)) return res.status(403).json({ error: 'This local app only accepts localhost requests.', code: 'INVALID_HOST' });
    const origin = req.get('origin');
    if (origin) {
      try {
        const url = new URL(origin);
        if (!localHosts.has(url.hostname) || !['http:', 'https:'].includes(url.protocol)) throw new Error('origin');
      } catch { return res.status(403).json({ error: 'Requests from this origin are not allowed.', code: 'INVALID_ORIGIN' }); }
    }
    if (req.get('sec-fetch-site') === 'cross-site') return res.status(403).json({ error: 'Cross-site requests are not allowed.', code: 'INVALID_ORIGIN' });
  }
  next();
});
app.use(express.json({ limit: '192kb' }));
app.get('/api/health', (_req, res) => {
  const response: HealthResponse = { ok: true, liveAvailable: !!process.env.OPENAI_API_KEY?.trim(), model: process.env.OPENAI_MODEL || 'gpt-5-mini', facultyCount: professors.length, openclaw: getOpenClawStatus() };
  res.json(response);
});
app.post('/api/openclaw/check', async (_req, res) => { res.json(await checkOpenClawConnection()); });
app.post('/api/agent', async (req, res) => {
  const request = parseAgentRequest(req.body);
  if (request.mode === 'openclaw' && req.get('accept') === 'application/x-ndjson') {
    res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();
    const controller = new AbortController();
    const abort = () => controller.abort();
    res.on('close', abort);
    const emit = (event: unknown) => { if (!res.destroyed) res.write(`${JSON.stringify(event)}\n`); };
    const heartbeat = setInterval(() => emit({ type: 'heartbeat' }), 15000);
    try {
      const result = await runOpenClaw(request, { signal: controller.signal, onToolEvent: event => emit({ type: 'tool', ...event }) });
      emit({ type: 'result', result });
    } catch (error) {
      emit({ type: 'error', error: error instanceof AgentError ? error.message : 'The agent could not complete this request. Please try again.' });
    } finally { clearInterval(heartbeat); res.off('close', abort); res.end(); }
    return;
  }
  res.json(request.mode === 'openclaw' ? await runOpenClaw(request) : request.mode === 'live' ? await runLive(request) : runDemo(request));
});
app.use('/api', (_req, res) => { res.status(404).json({ error: 'API route not found.', code: 'NOT_FOUND' }); });
const dist = resolve(dirname(fileURLToPath(import.meta.url)), '../dist');
app.use(express.static(dist, { index: 'index.html' }));
app.get('/{*path}', (_req, res) => {
  const index = resolve(dist, 'index.html');
  if (existsSync(index)) res.sendFile(index);
  else res.status(404).send('Start the development server with npm run dev, or build the app with npm run build.');
});
const errors: ErrorRequestHandler = (error, _req, res, _next) => {
  if (error instanceof AgentError) { res.status(error.status).json({ error: error.message, code: error.code }); return; }
  if (error?.type === 'entity.too.large') { res.status(413).json({ error: 'This session is too large. Start a new session or shorten your message.', code: 'BODY_TOO_LARGE' }); return; }
  if (error instanceof SyntaxError) { res.status(400).json({ error: 'The request must contain valid JSON.', code: 'INVALID_JSON' }); return; }
  res.status(500).json({ error: 'The agent could not complete this request. Please try again.', code: 'INTERNAL_ERROR' });
};
app.use(errors);
