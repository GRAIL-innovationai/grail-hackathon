import { test, expect } from '@playwright/test';
import { ResearchTurn } from '../../server/research-agent';
import { pdf } from '../helpers/pdf';
import { directionCard } from '../helpers/direction';

test('CV preview cannot be silently omitted; save and explore sends fresh text and displays supporting evidence', async ({page}) => {
  let calls=0;
  const cv='Built a sparse next-place recommendation baseline in Python.';
  await page.route('**/api/agent',async route=>{
    calls++; const req=route.request().postDataJSON();
    expect(req.action).toBe('recommend'); expect(req.state.profile.experience).toContain(cv);
    expect(req.state.profile.interests).toBe('');
    const turn=new ResearchTurn(req);
    const saved=turn.execute('save_directions',{mode:'replace',options:[{...directionCard('Recommendation quality with sparse histories'),reason:'Extend your Python recommendation baseline with a controlled comparison.',backgroundEvidence:[cv]}]}) as any;
    expect(saved.ok).toBe(true);
    const result=turn.finish({reply:'Your CV-based direction is saved.',suggestions:[],needsInput:false});
    await route.fulfill({contentType:'application/x-ndjson',body:JSON.stringify({type:'result',result})+'\n'});
  });
  await page.goto('/');
  await page.getByRole('button',{name:'Add background or resume'}).click();
  const modal=page.getByRole('dialog',{name:'Your starting point'});
  await modal.locator('input[type=file]').setInputFiles({name:'cv.pdf',mimeType:'application/pdf',buffer:pdf(cv)});
  await expect(modal.getByRole('textbox',{name:'Resume text preview'})).toHaveValue(cv);
  await modal.getByRole('button',{name:'Save my starting point'}).click();
  await expect(modal.getByRole('alert')).toContainText('only a preview');
  await expect(modal).toBeVisible(); expect(calls).toBe(0);
  expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('research-matchmaker-v1')!).profile.experience)).toBe('');
  await modal.getByRole('button',{name:'Use this text as experience'}).click();
  await modal.getByRole('button',{name:'Save & explore directions'}).click();
  await expect(page.locator('.direction-card h2')).toHaveText('Recommendation quality with sparse histories');
  await page.locator('.direction-basis summary').click();
  await expect(page.locator('.direction-basis blockquote')).toHaveText(cv);
  expect(calls).toBe(1);
  await page.reload();
  await expect(page.locator('.direction-basis summary')).toHaveText('From your confirmed background');
  await page.getByRole('button',{name:'Add background or resume'}).click();
  await modal.getByLabel('Experience & things you’ve tried').fill('I have only read an overview.');
  await modal.getByRole('button',{name:'Save my starting point'}).click();
  await expect(page.locator('.background-review')).toContainText('not all been reviewed');
  await expect(page.locator('.direction-basis summary')).toContainText('earlier background');
  expect(calls).toBe(1);
});

test('failed analysis retains the confirmed CV and can retry with it', async ({page})=>{
  let calls=0;
  await page.route('**/api/agent',async route=>{
    calls++; expect(route.request().postDataJSON().state.profile.experience).toBe('My confirmed research project.');
    await route.fulfill({status:503,json:{error:'Temporary gateway failure'}});
  });
  await page.goto('/');
  await page.getByRole('button',{name:'Add background or resume'}).click();
  const modal=page.getByRole('dialog',{name:'Your starting point'});
  await modal.getByLabel('Experience & things you’ve tried').fill('My confirmed research project.');
  await modal.getByRole('button',{name:'Save & explore directions'}).click();
  await expect(page.getByRole('alert')).toContainText('Temporary gateway failure');
  expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('research-matchmaker-v1')!).profile.experience)).toBe('My confirmed research project.');
  await page.getByRole('button',{name:'Try again'}).click();
  await expect.poll(()=>calls).toBe(2);
});
