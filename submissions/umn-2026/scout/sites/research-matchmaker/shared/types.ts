export type Stage = 'discover' | 'explore' | 'plan' | 'connect' | 'outreach';
export type Mode = 'demo' | 'live';
export interface StudentProfile {
  name: string;
  school: string;
  major: string;
  year: string;
  interests: string;
  experience: string;
  hoursPerWeek: number;
  goal: string;
}
export interface Source { title: string; url: string; checkedAt: string }
export interface Resource { title: string; url: string; description: string }
export interface Direction {
  id: string;
  title: string;
  field: string;
  question: string;
  description: string;
  why: string;
  activities: string[];
  firstStep: string;
  skills: string[];
  resources: Resource[];
  tags: string[];
}
export interface PlanTask {
  id: string;
  title: string;
  description: string;
  minutes: number;
  output: string;
  completed: boolean;
  resource: Resource | null;
}
export interface Professor {
  id: string;
  name: string;
  title: string;
  university: string;
  department: string;
  research: string;
  tags: string[];
  directionIds: string[];
  fit: string;
  conversationStarter: string;
  availability: 'unknown';
  verification?: 'curated' | 'web_sourced';
  sources: Source[];
}
export interface EmailDraft { professorId: string; subject: string; body: string; checklist: string[] }
export interface Message { id: string; role: 'user' | 'assistant'; content: string; createdAt: string }
export interface SessionState {
  version: 1;
  profile: StudentProfile;
  messages: Message[];
  stage: Stage;
  directions: Direction[];
  selectedDirectionId: string | null;
  tasks: PlanTask[];
  professors: Professor[];
  selectedProfessorId: string | null;
  draft: EmailDraft | null;
}
export type AgentAction = 'chat' | 'recommend' | 'select_direction' | 'create_plan' | 'find_professors' | 'draft_email' | 'simplify_plan';
export interface AgentRequest {
  state: SessionState;
  message: string;
  action: AgentAction;
  directionId?: string;
  professorId?: string;
  mode: Mode;
}
export interface AgentResponse {
  state: SessionState;
  reply: string;
  suggestions: string[];
  mode: Mode;
  toolActivity: string[];
}
export interface HealthResponse { ok: boolean; liveAvailable: boolean; model: string; facultyCount: number }
export const DEFAULT_PROFILE: StudentProfile = {
  name: '', school: '', major: '', year: '',
  interests: '', experience: '', hoursPerWeek: 4, goal: '',
};
export function createSession(): SessionState {
  return { version: 1, profile: { ...DEFAULT_PROFILE }, messages: [], stage: 'discover', directions: [],
    selectedDirectionId: null, tasks: [], professors: [], selectedProfessorId: null, draft: null };
}
