import base64
import json
import tempfile
import threading
import unittest
import urllib.request
import urllib.error
from pathlib import Path
from unittest.mock import patch
import app
import proof_projects as proof


class TestProof(unittest.TestCase):
    def setUp(self):
        self.job = dict(id='job-1', title='API Engineer', employer='Example', text='Required: build Python APIs.\nRequired: 5 years experience.')
        self.plan = proof.generate({}, app.assess({}, [self.job])[0])

    def test_generation_grounding_and_budget(self):
        self.assertEqual(self.plan['bullets'][0]['status'], 'LOCKED')
        self.assertIsNone(self.plan['bullets'][0]['resume_ready_text'])
        self.assertEqual(sum(m['hours'] for m in self.plan['project']['milestones']), 18)
        self.assertEqual(self.plan['gaps'][1]['bucket'], 'not_closable')
        self.assertNotIn('g2', self.plan['bullets'][0]['gap_ids'])
        self.assertTrue(self.plan['skill_revision'])

    def test_no_project_for_degree(self):
        job = {**self.job, 'text': 'Required: bachelor degree.'}
        with self.assertRaisesRegex(ValueError, 'No project-closable'):
            proof.generate({}, app.assess({}, [job])[0])

    @patch('proof_projects.github_json')
    def test_inspection_pins_commit_and_never_unlocks(self, fetch):
        fetch.side_effect = [{'default_branch':'main'}, {'sha':'abc123'},
                             dict(encoding='base64',size=20,content=base64.b64encode(b'Example code').decode())]
        result = proof.inspect_evidence(self.plan, 'https://github.com/example/repo', 'README.md')
        self.assertIn('/blob/abc123/', result['evidence'][0]['url'])
        self.assertEqual(result['bullets'][0]['status'], 'LOCKED')
        self.assertEqual(result['bullets'][0]['rubric'][0]['status'], 'cannot_verify')

    def test_review_transitions_and_fabricated_quote(self):
        self.plan['evidence'] = [dict(path='README.md',text='Setup command\nReal implementation\nTests pass',url='https://github.com/a/b/blob/sha/README.md')]
        rows = [dict(status='cannot_verify',reason='Not reviewed',path='README.md',quote='') for _ in range(3)]
        rows[0].update(status='met',quote='Real implementation',reason='Reviewed code and reproduced behavior')
        partial = proof.review(self.plan, rows)
        self.assertEqual(partial['bullets'][0]['status'], 'PARTIAL')
        self.assertNotIn('Added tests', partial['bullets'][0]['resume_ready_text'])
        rows[1].update(status='met',quote='Setup command')
        rows[2].update(status='met',quote='Tests pass')
        self.assertEqual(proof.review(partial, rows)['bullets'][0]['status'], 'UNLOCKED')
        rows[2]['quote']='Invented benchmark'
        with self.assertRaisesRegex(ValueError, 'exact quote'):
            proof.review(partial, rows)
        for row in rows:
            row['status']='cannot_verify'
        locked=proof.review(partial,rows)
        self.assertEqual(locked['bullets'][0]['status'], 'LOCKED')
        self.assertIsNone(locked['bullets'][0]['resume_ready_text'])

    def test_untrusted_url_rejected(self):
        for url in ['http://localhost/x/y','https://github.com.evil.test/x/y','https://github.com/x/y?token=secret']:
            with self.assertRaises(ValueError):
                proof.inspect_evidence(self.plan,url,'README.md')


class TestProofAPI(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.db_patch = patch.object(app, 'DB', Path(self.temp.name)/'test.db')
        self.db_patch.start();app.init()
        self.server = app.ThreadingHTTPServer(('127.0.0.1',0),app.Handler)
        self.thread = threading.Thread(target=self.server.serve_forever,daemon=True);self.thread.start()

    def tearDown(self):
        self.server.shutdown();self.server.server_close();self.thread.join()
        self.db_patch.stop();self.temp.cleanup()

    def post(self, route, sid='test-user-1', **data):
        request = urllib.request.Request('http://127.0.0.1:'+str(self.server.server_port)+'/api/'+route,
            data=json.dumps(dict(sid=sid,**data)).encode(),headers={'Content-Type':'application/json'})
        with urllib.request.urlopen(request) as response:
            return json.load(response)

    def test_persistence_isolation_and_stale_update(self):
        self.post('profile',resume='SQL projects')
        job=self.post('job',title='API Engineer',text='Required: build Python APIs.')
        plan=self.post('proof_generate',job_id=job['id'])
        saved=self.post('proof_save',id=plan['id'],updated=plan['updated'],notes='My project notes')
        self.assertEqual(self.post('proof_list')['plans'][0]['notes'],'My project notes')
        self.assertEqual(self.post('proof_list',sid='other-user-2')['plans'],[])
        with self.assertRaises(urllib.error.HTTPError):
            self.post('proof_save',sid='other-user-2',id=plan['id'],updated=saved['updated'],notes='Overwrite')
        with self.assertRaises(urllib.error.HTTPError):
            self.post('proof_save',id=plan['id'],updated=plan['updated'],notes='Stale')
        with self.assertRaises(urllib.error.HTTPError):
            self.post('proof_review',id=plan['id'],updated=saved['updated'],reviews=[])
