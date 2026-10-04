import type { SessionState } from './types';
// Compact invalidation keys only, not authentication or evidence verification.
function fingerprint(value: unknown) {
  const text = JSON.stringify(value); let hash = 2166136261;
  for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 16777619);
  return `${text.length}-${hash >>> 0}`;
}
export function directionContext(state: SessionState) {
  const d = state.directions.find(d => d.id === state.selectedDirectionId);
  return fingerprint(d ? [d.id, d.title, d.question, d.description, d.activities, d.firstStep, d.skills] : null);
}
export function studentContext(state: SessionState) {
  const p = state.profile;
  return fingerprint([p.name, p.school, p.major, p.year, p.interests, p.experience, p.hoursPerWeek, p.goal, directionContext(state)]);
}
export function profileContext(state: SessionState) {
  const p = state.profile;
  return fingerprint([p.name, p.school, p.major, p.year, p.interests, p.experience, p.hoursPerWeek, p.goal]);
}
export function workspaceContext(state: SessionState) {
  return fingerprint([studentContext(state), state.stage, state.tasks.map(t => [t.id,t.title,t.description,t.minutes,t.completed]), state.professors.map(p => p.id), state.draft && [state.draft.professorId,state.draft.subject,state.draft.body], state.directions.map(d => [d.id,d.title,d.question])]);
}
