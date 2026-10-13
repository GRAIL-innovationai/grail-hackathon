import unittest,sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from app import lines,assess,report,questions
class TestCore(unittest.TestCase):
 def setUp(self):
  self.profile={'resume':'Built Python pipelines with PyTorch.\nDeployed a Flask API.','projects':'Used Python for data analysis.','transcript':'Statistics and SQL','target':'AI Intern','interests':'ML','constraints_text':'Summer'}
  self.jobs=[{'title':'ML Intern','employer':'Example','text':'Required: Python model development.\nRequired: Docker and Kubernetes deployment.\nPreferred: PyTorch experience.'}]
 def test_lines(self):self.assertEqual(lines('hi\nthere','RESUME')[1]['id'],'RESUME:2')
 def test_evidence(self):
  a=assess(self.profile,self.jobs)[0]
  self.assertEqual(a['requirements'][0]['requirement']['id'],'JD:1')
  self.assertTrue(any(x['id'].startswith('RESUME:') for x in a['requirements'][0]['evidence']))
 def test_no_false_docker(self):self.assertNotEqual(assess(self.profile,self.jobs)[0]['requirements'][1]['status'],'supported')
 def test_contract(self):
  r=report(self.profile,self.jobs)
  self.assertEqual(len(r['plan']),14)
  self.assertIn('NOT an offer probability',r['caveats'][0])
 def test_questions(self):self.assertLessEqual(len(questions({})),3)
if __name__=='__main__':unittest.main()
