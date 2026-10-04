import { runDemo } from '@/server/engine';
import { AgentError } from '@/server/errors';
import { parseAgentRequest } from '@/server/validation';

const MAX_BODY_BYTES = 192 * 1024;
const responseHeaders = { 'Cache-Control': 'no-store' };

async function readJson(request: Request): Promise<unknown> {
  const declaredLength = Number(request.headers.get('content-length'));
  if (declaredLength > MAX_BODY_BYTES) throw new AgentError(413, 'This session is too large. Export your work, then start a new session.', 'BODY_TOO_LARGE');
  const reader = request.body?.getReader();
  if (!reader) throw new AgentError(400, 'Send a message to continue.', 'INVALID_JSON');
  const decoder = new TextDecoder();
  let total = 0;
  let body = '';
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_BODY_BYTES) {
        await reader.cancel();
        throw new AgentError(413, 'This session is too large. Export your work, then start a new session.', 'BODY_TOO_LARGE');
      }
      body += decoder.decode(value, { stream: true });
    }
    body += decoder.decode();
  } finally { reader.releaseLock(); }
  try { return JSON.parse(body); }
  catch { throw new AgentError(400, 'The request could not be read. Please try again.', 'INVALID_JSON'); }
}

export async function POST(request: Request) {
  try {
    const origin = request.headers.get('origin');
    if (request.headers.get('sec-fetch-site') === 'cross-site' || (origin && origin !== new URL(request.url).origin)) {
      throw new AgentError(403, 'Open Research Matchmaker in its own tab to continue.', 'ORIGIN_NOT_ALLOWED');
    }
    if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) {
      throw new AgentError(415, 'The request must contain JSON.', 'UNSUPPORTED_CONTENT_TYPE');
    }
    const input = parseAgentRequest(await readJson(request));
    if (input.mode === 'live') throw new AgentError(503, 'Live AI is not enabled in this cloud preview. Choose Guided demo to continue.', 'LIVE_UNAVAILABLE');
    return Response.json(runDemo(input), { headers: responseHeaders });
  } catch (error) {
    if (error instanceof AgentError) return Response.json({ error: error.message, code: error.code }, { status: error.status, headers: responseHeaders });
    return Response.json({ error: 'We could not finish this step. Your work is still in this browser; please try again.', code: 'AGENT_ERROR' }, { status: 500, headers: responseHeaders });
  }
}
