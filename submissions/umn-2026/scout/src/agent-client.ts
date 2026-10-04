import type { AgentRequest, AgentResponse } from '../shared/types';

const steps: Record<string, string> = {
  search_faculty_web: 'Searched public university pages',
  read_faculty_page: 'Read a faculty source page',
  save_web_faculty: 'Saved a source-backed faculty card',
  get_student_context: 'Read your background and saved work',
  update_student_profile: 'Updated your background',
  search_research_directions: 'Looked up research directions',
  save_directions: 'Saved your research directions',
  get_learning_resources: 'Looked up learning resources',
  save_plan: 'Prepared your research plan',
  update_task_progress: 'Updated task progress',
  find_faculty: 'Looked up faculty matches',
  inspect_professor: 'Read a faculty profile',
  save_email_draft: 'Prepared your email draft',
  complete_research_step: 'Finished this step',
};

/** Tool events show progress only. Commit workspace changes only after the final result. */
export async function requestAgent(request: AgentRequest, signal: AbortSignal, onActivity: (step: string) => void): Promise<AgentResponse> {
  const response = await fetch('/api/agent', {
    method: 'POST', signal,
    headers: { 'Content-Type': 'application/json', Accept: request.mode === 'openclaw' ? 'application/x-ndjson' : 'application/json' },
    body: JSON.stringify(request),
  });
  if (!response.ok || !response.headers.get('content-type')?.includes('application/x-ndjson')) {
    const data = await response.json();
    if (!response.ok) throw new Error(typeof data.error === 'string' ? data.error : 'Something interrupted this step. Please try again.');
    return data as AgentResponse;
  }
  if (!response.body) throw new Error('No agent response was received. Please try again.');
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let result: AgentResponse | undefined;
  function consume(line: string) {
    if (!line.trim()) return;
    const event = JSON.parse(line);
    if (event.type === 'error') throw new Error(event.error);
    if (event.type === 'tool') onActivity(event.ok ? steps[event.name] || 'Completed a research step' : 'Checking and correcting a research step');
    if (event.type === 'result') result = event.result;
  }
  try {
    while (true) {
      const { done, value } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      let boundary: number;
      while ((boundary = buffer.indexOf('\n')) >= 0) { consume(buffer.slice(0, boundary)); buffer = buffer.slice(boundary + 1); }
      if (done) { consume(buffer); break; }
    }
    if (!result) throw new Error('The connection ended before the agent finished. Your previous work is still saved; try again.');
    return result;
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
}
