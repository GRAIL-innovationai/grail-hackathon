import test from 'node:test';
import assert from 'node:assert/strict';
import { createSession } from '../shared/types';
import { studentContext, workspaceContext, directionContext } from '../shared/workspace-context';
import { currentGuide, nextStep } from '../src/workspace-view';
import { ResearchTurn } from '../server/research-agent';
import { professors, directions } from '../server/catalog';
const request = (state = createSession()) => ({ state, mode: 'openclaw' as const, action: 'chat' as const, message: 'Help me understand the research connection.' });

test('faculty lookup accepts omitted middle initials but rejects partial and unrelated names', () => {
  const turn = new ResearchTurn(request());
  for (const name of ['Joseph Konstan', 'Professor Joseph A. Konstan', 'Konstan']) {
    assert.equal((turn.execute('inspect_professor', { name }) as any).professors[0].id, 'joseph-konstan');
  }
  for (const name of ['Joseph Smith', 'Konst', 'A.']) {
    assert.equal((turn.execute('inspect_professor', { name }) as any).professors.length, 0);
  }
});

test('professor interpretation persists separately from canonical facts and becomes stale after background changes', () => {
  const state = createSession(); state.profile.experience = 'I know basic Python.';
  const p = professors.find(p => p.id === 'joseph-konstan')!;
  const turn = new ResearchTurn(request(state));
  const guidance = { fit: 'Explore how a Python comparison could inform recommendation experiences.', question: 'How would a small offline comparison reveal a usability tradeoff?', experience: 'Basic Python is a starting point.', preparation: 'Compare two toy rankings before asking about evaluation.', studentEvidence: ['I know basic Python.'], sourceEvidence: p.research };
  assert.equal((turn.execute('inspect_professor', { name: p.name, guidance }) as any).professors.length, 1);
  const after = new ResearchTurn(request(turn.state));
  assert.deepEqual(after.state.professors[0].guidance, turn.state.professors[0].guidance);
  assert.equal(after.state.professors[0].research, p.research);
  assert.equal(after.state.professors[0].guidance!.context, studentContext(after.state));
  after.state.profile.experience = 'I have not learned Python.';
  assert.notEqual(after.state.professors[0].guidance!.context, studentContext(after.state));
  const invalid = after.execute('inspect_professor', { name: p.name, guidance }) as any;
  assert.equal(invalid.ok, false); assert.match(invalid.error, /current confirmed profile/);
});

test('sidebar follows the agent next step, persists across parsing, and reacts to manual task changes', () => {
  const state = createSession(); state.professors = [professors[0]]; state.selectedProfessorId = professors[0].id;
  state.draft = { professorId: professors[0].id, subject: 'Old draft', body: 'Old body', checklist: [] };
  const turn = new ResearchTurn(request(state));
  const result = turn.finish({ reply: 'Let’s revisit your interests.', suggestions: ['Compare two interests'], needsInput: true, nextStep: { title: 'Choose a question to explore', description: 'Compare what interests you about learning and design.', stage: 'discover', prompt: 'Help me compare learning and design.' } });
  assert.equal(nextStep(result.state).title, 'Choose a question to explore');
  assert.equal(nextStep(new ResearchTurn(request(result.state)).state).stage, 'discover');
  assert.deepEqual(currentGuide(result.state)?.suggestions, ['Compare two interests']);
  result.state.stage = 'plan'; result.state.tasks = [{ id: 'task-1', title: 'My experiment', description: 'Try it', output: 'One observation', minutes: 20, completed: true, resource: null }];
  assert.equal(currentGuide(result.state), undefined);
  assert.equal(nextStep(result.state).title, 'Reflect on what you tried');
  assert.notEqual(nextStep(result.state).stage, 'outreach');
});

test('plan snapshot keeps the original question when a direction is revised', () => {
  const state = createSession(); state.selectedDirectionId = 'learning-analytics'; state.directions = [structuredClone(directions.find(d => d.id === state.selectedDirectionId)!)];
  state.tasks = [{ id: 't', title: 'Completed observation', description: 'Original work', minutes: 20, output: 'A note', completed: true, resource: null }];
  const turn = new ResearchTurn(request(state));
  const original = turn.state.planContext!;
  turn.state.directions[0].question = 'A materially different research question';
  assert.notEqual(original.revision, directionContext(turn.state));
  assert.notEqual(original.question, turn.state.directions[0].question);
  assert.equal(turn.state.tasks[0].completed, true);
});

test('draft-specific review points are saved with universal checks and next-step context excludes message history', () => {
  const state = createSession(); const turn = new ResearchTurn(request(state));
  turn.execute('inspect_professor', { name: 'Konstan' });
  const saved = turn.execute('save_email_draft', { professorId: 'joseph-konstan', subject: 'A question', body: 'Dear Professor Konstan, could we discuss recommendation evaluation? [Your name]', studentClaims: [], checklist: ['Replace [Your name] with your name.'] }) as any;
  assert.equal(saved.ok, true); assert.ok(turn.state.draft!.checklist.includes('Replace [Your name] with your name.'));
  const key = workspaceContext(turn.state); turn.state.messages.push({ id:'1',role:'assistant',content:'Saved.',createdAt:'' });
  assert.equal(workspaceContext(turn.state), key);
});

test('recommendations cannot finish after lookup alone without saving card guidance', () => {
  const turn = new ResearchTurn(request());
  turn.execute('inspect_professor', { name:'Konstan' });
  assert.throws(() => turn.finish({reply:'The personalized recommendation is ready.',suggestions:[],needsInput:false}), /Personalize the visible cards/);
  const p=professors.find(p=>p.id==='joseph-konstan')!;
  turn.execute('inspect_professor',{name:p.name,guidance:{fit:'Explore a question about recommendation experiences.',question:'How should a beginner compare two rankings?',experience:'',preparation:'Read the cited overview.',studentEvidence:[],sourceEvidence:p.research}});
  assert.equal(turn.finish({reply:'Your card is ready.',suggestions:[],needsInput:false}).state.professors.length,1);
});
