import type { SessionState, Stage } from '../shared/types';
import { workspaceContext } from '../shared/workspace-context';
export function currentGuide(state: SessionState) {
  return state.guide?.context === workspaceContext(state) ? state.guide : undefined;
}
export function nextStep(state: SessionState): { title: string; description: string; stage: Stage; prompt: string | null } {
  const guide = currentGuide(state); if (guide) return guide;
  if (state.stage === 'outreach' && state.draft) return { title: 'Review your introduction', description: state.draft.subject, stage: 'outreach', prompt: null };
  if (state.stage === 'connect' && state.professors.length) return { title: 'Explore the research connection', description: state.professors.map(p => p.name).join(' · '), stage: 'connect', prompt: null };
  if (state.stage === 'plan' && state.tasks.length) {
    const task = state.tasks.find(t => !t.completed);
    return task ? { title: task.title, description: `${task.minutes} min · ${task.output}`, stage: 'plan', prompt: null } : { title: 'Reflect on what you tried', description: 'What interested you, and what was difficult?', stage: 'discover', prompt: 'I have marked the saved tasks complete. Help me reflect on what I learned and decide what to try next.' };
  }
  if (state.directions.length) return { title: 'Compare your research questions', description: state.directions.map(d => d.title).join(' · '), stage: 'explore', prompt: null };
  return { title: 'Start with what you notice', description: state.profile.interests || state.profile.goal || 'Share a question, a class, or a problem that interests you.', stage: 'discover', prompt: null };
}
