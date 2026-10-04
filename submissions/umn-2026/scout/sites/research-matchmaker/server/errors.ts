export class AgentError extends Error {
  constructor(public status: number, message: string, public code = 'AGENT_ERROR') {
    super(message);
    this.name = 'AgentError';
  }
}
