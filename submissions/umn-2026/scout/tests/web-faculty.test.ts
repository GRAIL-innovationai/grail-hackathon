import assert from 'node:assert/strict';
import test from 'node:test';
import { searchWebFaculty, getVerifiedWebProfessor, webFacultyMatchesSchool } from '../server/web-faculty.js';
import type { Direction } from '../shared/types.js';

const direction: Direction = { id: 'hci', title: 'Human computer interaction', field: 'Computing', question: 'How can interfaces help learners?', description: '', why: '', activities: [], firstStep: '', skills: [], resources: [], tags: [] };
const url = 'https://example.edu/faculty/ava';
const row = { name: 'Ava Example', title: 'Professor', university: 'Example University', department: 'Computer Science', research: 'Studies interfaces that support learning.', fit: 'Research connects directly to learning interfaces.', conversationStarter: 'How do you evaluate a learning interface?', institutionMatches: true, officialFacultySource: true, sourceUrls: [url] };
function mock(rows: unknown[], citations = true) {
  const calls: any[] = [];
  const fetchImpl = (async (_input: any, init: any) => {
    calls.push(JSON.parse(init.body));
    const content = calls.length === 1
      ? [{ type: 'output_text', text: 'Ava Example is a professor who studies learning interfaces.', annotations: citations ? [{ type: 'url_citation', url, title: 'Ava Example — Faculty' }] : [] }]
      : [{ type: 'output_text', text: JSON.stringify({ professors: rows }) }];
    return new Response(JSON.stringify({ status: 'completed', output: [{ type: 'message', content }] }), { status: 200 });
  }) as typeof fetch;
  return { fetchImpl, calls, apiKey: 'unit-test-placeholder' };
}
test('web faculty uses cited evidence, unknown availability, and a server registry', async () => {
  const client = mock([row]);
  const result = await searchWebFaculty('Example University', direction, client);
  assert.equal(result.length, 1);
  assert.equal(result[0].availability, 'unknown');
  assert.equal(result[0].verification, 'web_sourced');
  assert.equal(result[0].sources[0].url, url);
  assert.deepEqual(getVerifiedWebProfessor(result[0].id), result[0]);
  assert.deepEqual(JSON.parse(client.calls[0].input), { university: 'Example University', researchDirection: direction.title, researchQuestion: direction.question });
  assert.equal(client.calls[0].store, false);
  assert.equal(client.calls[1].tools, undefined);
});
test('invented, unsafe, or unsupported sources are discarded', async () => {
  for (const sourceUrls of [['https://invented.edu/profile'], ['javascript:alert(1)'], ['http://127.0.0.1/admin']]) {
    const result = await searchWebFaculty('Example University', direction, mock([{ ...row, sourceUrls }]));
    assert.deepEqual(result, []);
  }
});
test('unconfirmed institution and unofficial-only evidence are excluded', async () => {
  const result = await searchWebFaculty('Example University', direction, mock([{ ...row, institutionMatches: false }, { ...row, officialFacultySource: false }]));
  assert.deepEqual(result, []);
});
test('no search citations means no extraction or fabricated candidates', async () => {
  const client = mock([row], false);
  assert.deepEqual(await searchWebFaculty('Example University', direction, client), []);
  assert.equal(client.calls.length, 1);
});
test('missing school and missing key are handled before a provider request', async () => {
  assert.deepEqual(await searchWebFaculty('', direction, { apiKey: '' }), []);
  await assert.rejects(searchWebFaculty('Example University', direction, { apiKey: '' }), /API key/);
});
test('verified school aliases survive normalization without matching another school', async () => {
  const result = await searchWebFaculty('Example U', direction, mock([row]));
  assert.equal(result[0].university, 'Example University');
  assert.equal(webFacultyMatchesSchool(result[0].id, 'Example U'), true);
  assert.equal(webFacultyMatchesSchool(result[0].id, 'Example University'), true);
  assert.equal(webFacultyMatchesSchool(result[0].id, 'Different University'), false);
});
test('an extracted name absent from search evidence is never retained', async () => {
  const result = await searchWebFaculty('Example University', direction, mock([{ ...row, name: 'Invented Researcher' }]));
  assert.deepEqual(result, []);
});
