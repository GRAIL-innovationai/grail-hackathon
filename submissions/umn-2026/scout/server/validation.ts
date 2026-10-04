import { z } from 'zod';
import type { AgentRequest } from '../shared/types';
import { directions, professors } from './catalog';
import { AgentError } from './errors';
import { getVerifiedWebProfessor } from './web-faculty';

const text = (max = 2000) => z.string().max(max);
const id = z.string().min(1).max(100).regex(/^[a-zA-Z0-9_-]+$/);
const url = z.string().url().max(2000).refine(value => /^https:\/\//i.test(value));
const resource = z.object({ title: text(300), url, description: text() });
const direction = z.object({ basis: z.object({ quotes: z.array(text(2000)).max(5), context: text(100) }).optional(), id, catalogDirectionId: id.nullable().optional(), title: text(300), field: text(300), question: text(), description: text(), why: text(), activities: z.array(text()).max(20), firstStep: text(), skills: z.array(text(300)).max(20), resources: z.array(resource).max(20), tags: z.array(text(100)).max(40) });
const professor = z.object({ guidance: z.object({ fit: text(), question: text(), experience: text(), preparation: text(), studentEvidence: z.array(text(8000)).max(8), sourceEvidence: text(2000), context: text(100) }).optional(), id, name: text(300), title: text(300), university: text(300), department: text(300), research: text(), tags: z.array(text(100)).max(40), directionIds: z.array(id).max(20), fit: text(), conversationStarter: text(), availability: z.literal('unknown'), verification: z.enum(['curated', 'web_sourced']).optional(), sources: z.array(z.object({ title: text(300), url, checkedAt: text(40) })).max(20) });
const draft = z.object({ context: text(100).optional(), professorId: id, subject: text(500), body: text(8000), checklist: z.array(text()).max(20) });
export const actions = ['chat', 'recommend', 'select_direction', 'create_plan', 'find_professors', 'draft_email', 'simplify_plan'] as const;
export const requestSchema = z.object({
  mode: z.enum(['demo', 'live', 'openclaw']), action: z.enum(actions), message: text(8000), directionId: id.optional(), professorId: id.optional(),
  state: z.object({
    version: z.literal(1),
    profile: z.object({ name: text(200), school: text(300), major: text(300), year: text(100), interests: text(3000), experience: text(16000), hoursPerWeek: z.number().finite().min(0.5).max(40), goal: text(2000) }),
    messages: z.array(z.object({ id: text(100), role: z.enum(['user', 'assistant']), content: text(12000), createdAt: text(100) })).max(100),
    stage: z.enum(['discover', 'explore', 'plan', 'connect', 'outreach']), directions: z.array(direction).max(12),
    selectedDirectionId: id.nullable(),
    tasks: z.array(z.object({ id: text(200), title: text(300), description: text(), minutes: z.number().int().min(1).max(2400), output: text(), completed: z.boolean(), resource: resource.nullable() })).max(12),
    professors: z.array(professor).max(20), selectedProfessorId: id.nullable(), draft: draft.nullable(),
    planContext: z.object({ directionId: id, title: text(300), question: text(), revision: text(100) }).optional(),
    guide: z.object({ title: text(300), description: text(5000), stage: z.enum(['discover', 'explore', 'plan', 'connect', 'outreach']), prompt: text(300).nullable(), suggestions: z.array(text(300)).max(3), context: text(100) }).optional(),
    profileEvidence: z.array(z.object({ field: z.enum(['name', 'school', 'major', 'year', 'interests', 'experience', 'hoursPerWeek', 'goal']), value: text(16000), quote: text(8000), source: z.literal('student_statement'), recordedAt: text(100) })).max(100).optional(),
  }),
});

export function parseAgentRequest(value: unknown): AgentRequest {
  const parsed = requestSchema.safeParse(value);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new AgentError(400, `Please check ${issue.path.join('.') || 'the request'}: ${issue.message}.`, 'INVALID_INPUT');
  }
  const req = parsed.data;
  const catalogId = (value: string) => directions.some(item => item.id === value);
  const knownDirection = (value: string) => catalogId(value) || (req.mode === 'openclaw' && req.state.directions.some(item => item.id === value && /^custom-[a-zA-Z0-9_-]+$/.test(value) && item.catalogDirectionId !== undefined));
  const directionIds = [req.directionId, req.state.selectedDirectionId, ...req.state.directions.map(item => item.id)].filter((value): value is string => !!value);
  if (new Set(req.state.directions.map(d => d.id)).size !== req.state.directions.length || directionIds.some(value => !knownDirection(value))) throw new AgentError(400, 'Unknown research direction. Please choose a saved direction.', 'UNKNOWN_DIRECTION');
  if (req.state.directions.some(d => d.catalogDirectionId && !catalogId(d.catalogDirectionId))) throw new AgentError(400, 'Unknown direction resource category.', 'UNKNOWN_DIRECTION');
  if (req.state.directions.some(d => catalogId(d.id) && d.catalogDirectionId !== undefined && d.catalogDirectionId !== d.id)) throw new AgentError(400, 'A catalog direction must retain its resource category.', 'UNKNOWN_DIRECTION');
  if (req.professorId && !professors.some(item => item.id === req.professorId) && !getVerifiedWebProfessor(req.professorId)) throw new AgentError(400, 'Unknown or expired professor profile. Please search for professor matches again.', 'UNKNOWN_PROFESSOR');
  // Browser sessions may outlive the server registry. Keep the student's work and let
  // them search again; old faculty facts must be recovered from a canonical source.
  req.state.professors = req.state.professors.filter(item => professors.some(candidate => candidate.id === item.id) || getVerifiedWebProfessor(item.id));
  if (!req.state.professors.some(item => item.id === req.state.selectedProfessorId)) { req.state.selectedProfessorId = null; req.state.draft = null; }
  if (req.action === 'select_direction' && !req.directionId) throw new AgentError(400, 'Choose a research direction first.', 'DIRECTION_REQUIRED');
  if (req.action === 'chat' && !req.message.trim()) throw new AgentError(400, 'Write a message to continue.', 'MESSAGE_REQUIRED');
  return req;
}
