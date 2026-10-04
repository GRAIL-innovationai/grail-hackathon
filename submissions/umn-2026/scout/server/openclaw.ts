import type { AgentRequest, AgentResponse, HealthResponse, OpenClawCheckResponse } from '../shared/types';
import { AgentError } from './errors';
import { agentInstructions, agentTools, ResearchTurn } from './research-agent';

export interface OpenClawOptions {
  webFetchImpl?: typeof fetch;
  baseUrl?: string;
  gatewayToken?: string;
  agentId?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  signal?: AbortSignal;
  onToolEvent?: (event: { name: string; ok: boolean; error?: string }) => void;
}
type Config = { baseUrl: string; gatewayToken: string; agentId: string };
type OutputItem = { type: string; name?: string; call_id?: string; arguments?: string; status?: string } & Record<string, unknown>;
const defaultAgent = 'research-matchmaker';

function configuration(options: OpenClawOptions = {}): Config {
  const agentId = options.agentId ?? process.env.OPENCLAW_AGENT_ID ?? defaultAgent;
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/.test(agentId)) throw new AgentError(503, 'OPENCLAW_AGENT_ID must be a valid local agent name.', 'OPENCLAW_CONFIGURATION');
  let url: URL;
  try {
    url = new URL(options.baseUrl ?? process.env.OPENCLAW_BASE_URL ?? 'http://127.0.0.1:18789');
    if (!['http:', 'https:'].includes(url.protocol) || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) || url.username || url.password || url.search || url.hash || url.pathname !== '/') throw new Error('invalid');
  } catch { throw new AgentError(503, 'OPENCLAW_BASE_URL must be a local gateway origin, such as http://127.0.0.1:18789, without a path or credentials.', 'OPENCLAW_CONFIGURATION'); }
  const gatewayToken = (options.gatewayToken ?? process.env.OPENCLAW_GATEWAY_TOKEN ?? '').trim();
  if (!gatewayToken) throw new AgentError(503, 'OpenClaw is not configured. Set OPENCLAW_GATEWAY_TOKEN on the app server after setting up your local gateway.', 'OPENCLAW_NOT_CONFIGURED');
  if (/[\r\n]/.test(gatewayToken)) throw new AgentError(503, 'The local OpenClaw gateway token configuration is invalid.', 'OPENCLAW_CONFIGURATION');
  return { baseUrl: url.origin, gatewayToken, agentId };
}

export function getOpenClawStatus(options: OpenClawOptions = {}): NonNullable<HealthResponse['openclaw']> {
  try {
    const config = configuration(options);
    return { configured: true, agentId: config.agentId, message: 'Configured. Check the gateway connection before using OpenClaw.' };
  } catch (error) {
    return { configured: false, agentId: defaultAgent, message: error instanceof AgentError ? error.message : 'OpenClaw configuration is unavailable.' };
  }
}

function upstreamError(status: number): AgentError {
  if (status === 401 || status === 403) return new AgentError(502, 'OpenClaw rejected authentication. Check the server gateway token and its permissions.', 'OPENCLAW_AUTH');
  if (status === 404 || status === 405) return new AgentError(502, 'OpenClaw Responses API is unavailable. Enable gateway.http.endpoints.responses.enabled and restart the gateway.', 'OPENCLAW_ENDPOINT');
  if (status === 429) return new AgentError(429, 'OpenClaw or its model provider is rate limited. Please try again later.', 'OPENCLAW_RATE_LIMIT');
  return new AgentError(502, 'The local OpenClaw gateway could not complete the request. Check its agent and model configuration.', 'OPENCLAW_UPSTREAM');
}

function connectionError(error: unknown, signal: AbortSignal): AgentError {
  if (error instanceof AgentError) return error;
  if (signal.aborted || (error instanceof Error && /abort|timeout/i.test(error.name))) return new AgentError(504, 'The OpenClaw request timed out. Check the local gateway and try again.', 'OPENCLAW_TIMEOUT');
  return new AgentError(502, 'The local OpenClaw gateway could not be reached. Start the gateway and check the connection.', 'OPENCLAW_CONNECTION');
}

export async function checkOpenClawConnection(options: OpenClawOptions = {}): Promise<OpenClawCheckResponse> {
  const status = getOpenClawStatus(options);
  if (!status.configured) return { ok: false, message: status.message, agentId: status.agentId };
  const config = configuration(options);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 8000);
  try {
    const response = await (options.fetchImpl ?? fetch)(`${config.baseUrl}/v1/models`, {
      method: 'GET', redirect: 'error', signal: controller.signal,
      headers: { Authorization: `Bearer ${config.gatewayToken}`, 'x-openclaw-agent-id': config.agentId },
    });
    if (!response.ok) throw upstreamError(response.status);
    const body = await response.json() as { data?: unknown };
    if (!Array.isArray(body.data)) throw new AgentError(502, 'The gateway returned an unexpected response. Check that the OpenClaw Responses API is enabled.', 'OPENCLAW_INVALID_RESPONSE');
    return { ok: true, agentId: config.agentId, message: 'Gateway connected and authentication accepted. Model sign-in and inference will be checked when you send a message.' };
  } catch (error) { return { ok: false, agentId: config.agentId, message: connectionError(error, controller.signal).message }; }
  finally { clearTimeout(timer); }
}

export async function runOpenClaw(request: AgentRequest, options: OpenClawOptions = {}): Promise<AgentResponse> {
  const config = configuration(options);
  const turn = new ResearchTurn(request, options.webFetchImpl);
  const history = turn.state.messages.slice(-16).map(message => ({ type: 'message', role: message.role, content: message.content }));
  const input: unknown[] = [
    { type: 'message', role: 'developer', content: agentInstructions },
    { type: 'message', role: 'developer', content: `Requested action: ${request.action}. Explicit direction ID: ${request.directionId || 'none'}. Explicit professor ID: ${request.professorId || 'none'}. Current workspace DATA: ${JSON.stringify({ ...turn.state, messages: undefined })}` },
    ...history,
  ];
  if (!history.length || history.at(-1)?.content !== request.message) input.push({ type: 'message', role: 'user', content: request.message || `Please perform ${request.action}.` });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 180_000);
  const abort = () => controller.abort();
  options.signal?.addEventListener('abort', abort, { once: true });
  if (options.signal?.aborted) controller.abort();
  const callIds = new Set<string>();
  const maxRounds = 16; // Web discovery may need search, several pages, evidence repair and personalization.
  let previousResponseId: string | undefined;
  let continuation: unknown[] = [];
  try {
    for (let round = 0; round < maxRounds; round++) {
      const response = await (options.fetchImpl ?? fetch)(`${config.baseUrl}/v1/responses`, {
        method: 'POST', redirect: 'error', signal: controller.signal,
        headers: { Authorization: `Bearer ${config.gatewayToken}`, 'Content-Type': 'application/json', 'x-openclaw-agent-id': config.agentId },
        body: JSON.stringify({ model: `openclaw/${config.agentId}`, input: previousResponseId ? continuation : input, previous_response_id: previousResponseId, instructions: agentInstructions, tools: agentTools, tool_choice: 'required', stream: false, max_output_tokens: 6000 }),
      });
      if (!response.ok) throw upstreamError(response.status);
      let data: { id?: string; status?: string; output?: OutputItem[] };
      try { data = await response.json(); } catch { throw new AgentError(502, 'OpenClaw returned an invalid response. Please try again.', 'OPENCLAW_INVALID_RESPONSE'); }
      if (data.status !== 'completed' || !Array.isArray(data.output) || data.output.some(item => !item || typeof item.type !== 'string' || item.status === 'incomplete' || item.status === 'failed')) throw new AgentError(502, 'OpenClaw did not complete the research step. No changes were saved; please try again.', 'OPENCLAW_INCOMPLETE');
      const calls = data.output.filter(item => item.type === 'function_call');
      if (!calls.length || calls.length > 6) throw new AgentError(502, 'OpenClaw did not return valid research tool calls. Check model tool support.', 'OPENCLAW_TOOL_CALL');
      if (calls.some(call => call.name === 'complete_research_step') && calls.length !== 1) throw new AgentError(502, 'Complete the turn in a separate call after reading tool results.', 'OPENCLAW_TOOL_ORDER');
      input.push(...data.output);
      previousResponseId = typeof data.id === 'string' && data.id ? data.id : undefined;
      continuation = [];
      for (const call of calls) {
        if (!call.call_id || callIds.has(call.call_id) || typeof call.arguments !== 'string' || !agentTools.some(tool => tool.name === call.name)) throw new AgentError(502, 'OpenClaw requested an unsupported research tool or invalid tool call.', 'OPENCLAW_TOOL_CALL');
        callIds.add(call.call_id);
        let output: unknown;
        try {
          const args = JSON.parse(call.arguments);
          if (call.name === 'complete_research_step') {
            const result = turn.finish(args);
            options.onToolEvent?.({ name: call.name, ok: true });
            result.toolActivity.unshift('Connected to local OpenClaw');
            return result;
          }
          output = await turn.executeAsync(call.name!, args, controller.signal);
        } catch (error) {
          output = { ok: false, error: error instanceof SyntaxError ? 'Tool arguments must be valid JSON.' : error instanceof Error ? error.message : 'Invalid or unfinished research step. Correct the arguments or ask for missing information.' };
        }
        const failed = output as { ok?: boolean; error?: string };
        options.onToolEvent?.({ name: call.name!, ok: failed?.ok !== false, ...(failed?.ok === false ? { error: failed.error } : {}) });
        const toolOutput = { type: 'function_call_output', call_id: call.call_id, output: JSON.stringify(output) };
        input.push(toolOutput); continuation.push(toolOutput);
      }
    }
    throw new AgentError(502, 'The agent reached its tool limit. No changes from this turn were saved. Please try a smaller request.', 'OPENCLAW_TOOL_LIMIT');
  } catch (error) { throw connectionError(error, controller.signal); }
  finally { clearTimeout(timer); options.signal?.removeEventListener('abort', abort); }
}
