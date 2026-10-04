import { test, expect, type Page } from '@playwright/test';
import { createSession } from '../../shared/types';
import { professors, directions } from '../../server/catalog';
import { ResearchTurn } from '../../server/research-agent';
import { directionContext, studentContext } from '../../shared/workspace-context';
async function navigate(page: Page, name: RegExp) {
  if (await page.getByRole('button', { name: 'Open navigation' }).isVisible()) await page.getByRole('button', { name: 'Open navigation' }).click();
  await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('button', { name }).click();
}

test('personalized professor guidance and agent next steps persist, then invalidate on profile changes', async ({ page }, info) => {
  const state = createSession(); state.profile.experience = 'I know basic Python.'; state.profile.goal = 'Try a recommendation experiment.';
  const p = professors.find(p => p.id === 'joseph-konstan')!;
  const turn = new ResearchTurn({ state, mode:'openclaw', action:'chat',message:'Help me prepare.' });
  turn.execute('inspect_professor', { name:p.name, guidance:{fit:'Your Python comparison could explore recommendation quality.',question:'How could a toy ranking reveal a usability tradeoff?',experience:'Discuss your basic Python experience.',preparation:'Compare two rankings on paper first.',studentEvidence:['I know basic Python.'],sourceEvidence:p.research} });
  const result = turn.finish({ reply:'Your professor card is personalized.', suggestions:['Help compare two rankings'],needsInput:false,nextStep:{title:'Start with a tiny ranking comparison',description:'Use your Python background to frame a question.',stage:'connect',prompt:'Help compare two rankings'} });
  await page.addInitScript(s => { if(!localStorage.getItem('research-matchmaker-v1')) localStorage.setItem('research-matchmaker-v1',JSON.stringify(s)); },result.state);
  await page.goto('/');
  await expect(page.locator('.faculty-card')).toContainText('Your Python comparison');
  await expect(page.locator('.faculty-guidance')).toContainText('Discuss your basic Python experience.');
  await expect(page.locator('.next-step-card h2')).toHaveText('Start with a tiny ranking comparison');
  await expect(page.getByRole('button',{name:'Help compare two rankings',exact:true})).toBeVisible();
  await page.reload();
  await expect(page.locator('.next-step-card h2')).toHaveText('Start with a tiny ranking comparison');
  await page.screenshot({ path: info.outputPath('personalized-workspace.png'), fullPage: true, animations: 'disabled' });
  await page.getByRole('button',{name:'Add background or resume'}).click();
  const profile=page.getByRole('dialog',{name:'Your starting point'});
  await profile.getByLabel('Experience & things you’ve tried').fill('I have not learned Python.');
  await profile.getByRole('button',{name:'Save my starting point'}).click();
  await expect(page.locator('.faculty-card')).toContainText('General research context');
  await expect(page.locator('.faculty-card')).not.toContainText('Your Python comparison');
  await expect(page.getByRole('button',{name:'Connect this research to me'})).toBeVisible();
  await expect(page.getByRole('button',{name:'Help compare two rankings',exact:true})).toHaveCount(0);
  await expect(page.locator('.profile-details')).toContainText('I have not learned Python.');
});

test('opening an existing plan does not regenerate it; changed direction and draft content reset related UI', async ({ page }) => {
  const state=createSession();const d=structuredClone(directions[0]);
  state.directions=[d];state.selectedDirectionId=d.id;state.stage='explore';
  state.tasks=[{id:'kept',title:'Original completed task',description:'Keep my original work.',minutes:20,output:'A note',completed:true,resource:null}];
  state.planContext={directionId:d.id,title:d.title,question:d.question,revision:directionContext(state)};
  d.title='A newly revised direction';d.question='A different question?';
  state.professors=[professors[0]];state.selectedProfessorId=professors[0].id;
  state.draft={context:studentContext(state),professorId:professors[0].id,subject:'An older introduction',body:'My first draft',checklist:['Verify the claim in this draft.']};
  await page.addInitScript(s=>localStorage.setItem('research-matchmaker-v1',JSON.stringify(s)),state);
  let calls=0; await page.route('**/api/agent',route=>{calls++;return route.abort();});
  await page.goto('/');
  await page.getByRole('button',{name:'Open my plan'}).click();
  await expect(page.locator('.task-card').getByRole('checkbox')).toBeChecked();
  await expect(page.locator('.plan-overview')).toContainText(state.planContext.title);
  await expect(page.getByRole('status')).toContainText('Your direction changed');
  expect(calls).toBe(0);
  await navigate(page,/Outreach studio/);
  await page.getByLabel('Verify the claim in this draft.').check();
  await expect(page.locator('.checklist-card')).toContainText('1/1');
  await page.getByRole('textbox',{name:'Email body'}).fill('A changed claim that needs another review.');
  await expect(page.getByLabel('Verify the claim in this draft.')).not.toBeChecked();
  await expect(page.locator('.checklist-card')).toContainText('0/1');
  await page.getByRole('button',{name:'Add background or resume'}).click();
  const profile=page.getByRole('dialog',{name:'Your starting point'});
  await profile.getByLabel('Experience & things you’ve tried').fill('I have learned basic statistics.');
  await profile.getByRole('button',{name:'Save my starting point'}).click();
  await expect(page.getByRole('status').filter({hasText:'background or direction changed since this draft'})).toBeVisible();
  await expect(page.getByRole('textbox',{name:'Email body'})).toHaveValue('A changed claim that needs another review.');
});
