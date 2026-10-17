"""Contract tests without paid inference or real credentials."""
import sys
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
sys.path[:0] = [str(ROOT / '.python-packages'), str(ROOT)]

import asyncio
import unittest
import time
import base64
import hashlib
import json
from urllib.parse import urlparse, parse_qs
from unittest.mock import AsyncMock, patch
from fastapi.testclient import TestClient
from pydantic import ValidationError

import llm
import main
from main import AnalyzeRequest, combine_feedback, app
from auth import ChatGPTAuth, AuthError
import jwt
from cryptography.hazmat.primitives.asymmetric import rsa


def reading(*rows, solved=False):
    return llm.BoardReading(lines=[llm.ReadLine(id=str(i+1), text=row.get('text', 'x=8'), status=row.get('status', 'correct'),
        confidence=row.get('confidence', .99), transcriptionConfidence=row.get('ocr', .99), hint=row.get('hint', 'Review this.'),
        hint2='Check each term.', errorType='distribution') for i, row in enumerate(rows)], summary='Keep going.', solved=solved)


class FeedbackTests(unittest.TestCase):
    def request(self, count=2):
        return AnalyzeRequest(problem='2(x-3)=10', revision=7, lines=[{'id': str(i+1), 'bbox': {'x': 10, 'y': i*60, 'width': 200, 'height': 40}} for i in range(count)])

    def test_earliest_error_suppresses_cascade(self):
        result = combine_feedback(self.request(), reading({'text':'2x-3=10','status':'incorrect'}, {'text':'x=6.5','status':'incorrect'}), {'available':False})
        self.assertEqual([line['status'] for line in result['lines']], ['incorrect', 'pending'])
        self.assertEqual(result['firstErrorLineId'], '1')
        self.assertEqual(result['revision'], 7)
        self.assertFalse(result['solved'])

    def test_unclear_handwriting_never_becomes_red(self):
        result = combine_feedback(self.request(), reading({'status':'incorrect','ocr':.55},{'status':'incorrect'}),
                                  {'available':True,'results':[{'id':'1','status':'incorrect'}]})
        self.assertEqual([line['status'] for line in result['lines']], ['uncertain','pending'])
        self.assertIsNone(result['firstErrorLineId'])

    def test_sympy_overrides_ai_false_positive(self):
        result = combine_feedback(self.request(1), reading({'status':'incorrect'}),
                                  {'available':True,'results':[{'id':'1','status':'correct','reason':'Equivalent.'}]})
        self.assertEqual(result['lines'][0]['status'], 'correct')
        self.assertEqual(result['lines'][0]['hint'], '')
        self.assertEqual(result['lines'][0]['verifiedBy'], 'sympy')

    def test_ai_uncertainty_is_not_a_mistake(self):
        result = combine_feedback(self.request(1), reading({'status':'incorrect','confidence':.7}), {'available':True,'results':[{'id':'1','status':'unknown'}]})
        self.assertEqual(result['lines'][0]['status'], 'uncertain')
        self.assertIsNone(result['firstErrorLineId'])

    def test_low_confidence_ai_hint_not_reused_on_symbolic_error(self):
        result = combine_feedback(self.request(1), reading({'status':'incorrect','confidence':.5,'hint':'Unreliable hint'}), {'available':True,'results':[{'id':'1','status':'incorrect'}]})
        self.assertEqual(result['lines'][0]['status'], 'incorrect')
        self.assertNotEqual(result['lines'][0]['hint'], 'Unreliable hint')

    def test_missing_row_is_uncertain_and_does_not_solve(self):
        result = combine_feedback(self.request(), reading({'status':'correct'}, solved=True), {'available':False})
        self.assertEqual(result['lines'][1]['status'], 'uncertain')
        self.assertFalse(result['solved'])

    def test_correction_does_not_retain_prior_error(self):
        first = combine_feedback(self.request(1), reading({'status':'incorrect'}), {'available':False})
        corrected = combine_feedback(self.request(1), reading({'status':'correct'}, solved=True), {'available':True,'results':[{'id':'1','status':'correct'}]})
        self.assertIsNotNone(first['firstErrorLineId'])
        self.assertIsNone(corrected['firstErrorLineId'])
        self.assertTrue(corrected['solved'])

    def test_response_confidence_validated(self):
        with self.assertRaises(ValidationError):
            reading({'confidence':1.2})

    def test_multiple_statements_override_even_confident_correct_verdict(self):
        compound='3(x+2)-4=2x+10\n3x+6-4=2x+10\n2x+4=2x+10'
        request=AnalyzeRequest(problem='3(x+2)-4=2x+10',lines=[{'id':'1','text':compound}])
        result=combine_feedback(request,reading({'text':compound,'status':'correct'},solved=True),
            {'available':True,'results':[{'id':'1','status':'correct','reason':'Mistaken judgment'}]})
        self.assertEqual(result['lines'][0]['status'],'uncertain')
        self.assertEqual(result['lines'][0]['readingIssue'],'multiple_statements')
        self.assertFalse(result['solved'])


class EndpointTests(unittest.TestCase):
    def setUp(self):
        main._verified_prefixes.clear()
        llm._ocr_cache.clear()
        self.client = TestClient(app)

    def test_health(self):
        self.assertTrue(self.client.get('/api/health').json()['ok'])

    def test_blank_board_is_free_and_preserves_revision(self):
        with patch('llm.read_and_coach', new_callable=AsyncMock) as model:
            response = self.client.post('/api/analyze', json={'problem':'2(x-3)=10','lines':[],'revision':44})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()['revision'], 44)
        model.assert_not_called()

    def test_cross_origin_blocked(self):
        response = self.client.post('/api/chat', json={}, headers={'origin':'https://untrusted.example'})
        self.assertEqual(response.status_code, 403)

    def test_request_errors_never_echo_board_or_secret(self):
        response = self.client.post('/api/analyze', json={'problem':'PRIVATE STRING', 'image':123})
        self.assertEqual(response.status_code, 422)
        self.assertNotIn('PRIVATE STRING', response.text)

    def test_integration_uses_real_symbolic_verifier_and_preserves_boxes(self):
        with patch('llm.read_and_coach', new_callable=AsyncMock, return_value=reading({'text':'2x-3=10','status':'incorrect'},{'text':'2x=13','status':'incorrect'})):
            response = self.client.post('/api/analyze', json={'problem':'Solve 2(x-3)=10','revision':8,'lines':[
                {'id':'1','bbox':{'x':5,'y':20,'width':100,'height':40}}, {'id':'2','bbox':{'x':5,'y':80,'width':100,'height':40}}]})
        self.assertEqual(response.status_code,200)
        result=response.json()
        self.assertEqual(result['firstErrorLineId'],'1')
        self.assertEqual(result['lines'][0]['verifiedBy'],'sympy')
        self.assertEqual(result['lines'][0]['bbox']['y'],20)
        self.assertEqual(result['lines'][1]['status'],'pending')

    def test_auth_callback_rejects_unbound_state(self):
        response=self.client.get('/auth/callback?state=nonexistent&code=fake')
        self.assertEqual(response.status_code,400)
        self.assertIn('expired',response.text)

    def test_typed_demo_is_local_and_correction_solves_immediately(self):
        scenarios = [(['2(x-3)=10'], ['correct'], False),
                     (['2(x-3)=10','2x-3=10'], ['correct','incorrect'], False),
                     (['2(x-3)=10','2x-6=10','2x=16','x=8'], ['correct']*4, True)]
        with patch('llm._generate', new_callable=AsyncMock, side_effect=AssertionError('Typed algebra must not call AI')) as model:
            for texts, expected, solved in scenarios:
                started=time.perf_counter()
                response=self.client.post('/api/analyze', json={'problem':'Solve 2(x-3)=10','lines':[{'id':str(i),'text':text} for i,text in enumerate(texts)]})
                duration=time.perf_counter()-started
                self.assertEqual(response.status_code,200)
                self.assertEqual([row['status'] for row in response.json()['lines']],expected)
                self.assertTrue(all(row['verifiedBy']=='sympy' for row in response.json()['lines']))
                self.assertEqual(response.json()['solved'],solved)
                self.assertLess(duration,1.0)
        model.assert_not_called()

    def test_distribution_hint_is_specific_without_answer(self):
        with patch('llm._generate', new_callable=AsyncMock, side_effect=AssertionError('Must stay local')):
            result=self.client.post('/api/analyze',json={'problem':'2(x-3)=10','lines':[{'id':'1','text':'2x-3=10'}]}).json()
        self.assertIn('every term',result['lines'][0]['hint'])
        self.assertNotIn('8',result['lines'][0]['hint'])

    def test_division_and_nested_fraction_steps_stay_local(self):
        scenarios = [
            ('Solve x ÷ 2 = 3', ['x ÷ 2 = 3', 'x = 6']),
            ('Solve (x+1)/2=3', ['(x+1)/(2)=3', 'x+1=6', 'x=5']),
            ('Solve x/(2/3)=6', ['(x)/((2)/(3))=6', '3x/2=6', 'x=4']),
            ('Solve (x/2)/3=1', ['((x)/(2))/(3)=1', 'x/6=1', 'x=6']),
        ]
        with patch('llm._generate',new_callable=AsyncMock,side_effect=AssertionError('Supported fractions must stay local')) as model:
            for problem,texts in scenarios:
                with self.subTest(problem=problem):
                    result=self.client.post('/api/analyze',json={'problem':problem,'revision':41,
                        'lines':[{'id':str(i),'text':text} for i,text in enumerate(texts)]}).json()
                    self.assertEqual([row['status'] for row in result['lines']],['correct']*len(texts))
                    self.assertTrue(all(row['verifiedBy']=='sympy' for row in result['lines']))
                    self.assertEqual(result['processingMode'],'local')
                    self.assertTrue(result['solved'])
                    self.assertEqual(result['revision'],41)
        model.assert_not_called()

    def test_wrong_division_step_is_flagged_without_revealing_answer(self):
        with patch('llm._generate',new_callable=AsyncMock,side_effect=AssertionError('Must stay local')):
            result=self.client.post('/api/analyze',json={'problem':'x ÷ 2 = 3',
                'lines':[{'id':'setup','text':'x/2=3'},{'id':'wrong','text':'x=3/2'}]}).json()
        self.assertEqual([row['status'] for row in result['lines']],['correct','incorrect'])
        self.assertEqual(result['firstErrorLineId'],'wrong')
        self.assertFalse(result['solved'])
        self.assertNotIn('x=6',result['lines'][1]['hint'].replace(' ',''))

    def test_uncertain_fraction_then_student_confirmation_uses_no_more_ai(self):
        unclear=llm.VisionReading(lines=[llm.VisionRow(id='fraction-step',text='x / ? = 3',confidence=.5)])
        box={'x':.05,'y':.1,'width':.9,'height':.3}
        payload={'problem':'x/2=3','revision':51,'image':'data:image/png;base64,aGVsbG8=',
                 'lines':[{'id':'fraction-step','bbox':box,'fingerprint':'uncertain-fraction-demo'}]}
        with patch('llm._generate',new_callable=AsyncMock,return_value=unclear) as model:
            first=self.client.post('/api/analyze',json=payload).json()
            self.assertEqual(first['lines'][0]['status'],'uncertain')
            self.assertIsNone(first['firstErrorLineId'])
            payload['revision']=52
            payload['lines'][0]['text']='(x)/(2)=3'
            payload['lines'].append({'id':'answer','text':'x=6'})
            confirmed=self.client.post('/api/analyze',json=payload).json()
        model.assert_awaited_once()
        self.assertEqual([row['status'] for row in confirmed['lines']],['correct','correct'])
        self.assertEqual(confirmed['lines'][0]['bbox'],box)
        self.assertEqual(confirmed['lines'][0]['transcriptionConfidence'],1)
        self.assertTrue(all(row['verifiedBy']=='sympy' for row in confirmed['lines']))
        self.assertEqual(confirmed['processingMode'],'local')
        self.assertTrue(confirmed['solved'])
        self.assertEqual(confirmed['revision'],52)

    def test_one_fraction_row_remains_one_symbolic_step(self):
        llm._ocr_cache.clear()
        transcribed=llm.VisionReading(lines=[llm.VisionRow(id='whole-fraction',text='(x+1)/(2)=3',confidence=.99)])
        box={'x':.05,'y':.1,'width':.9,'height':.4}
        with patch('llm._generate',new_callable=AsyncMock,return_value=transcribed) as model:
            response=self.client.post('/api/analyze',json={'problem':'(x+1)/2=3','image':'data:image/png;base64,aGVsbG8=',
                'lines':[{'id':'whole-fraction','bbox':box,'fingerprint':'whole-fraction-row'}]})
        self.assertEqual(response.status_code,200)
        result=response.json()
        self.assertEqual(len(result['lines']),1)
        self.assertEqual(result['lines'][0]['id'],'whole-fraction')
        self.assertEqual(result['lines'][0]['text'],'(x+1)/(2)=3')
        self.assertEqual(result['lines'][0]['bbox'],box)
        self.assertEqual(result['lines'][0]['status'],'correct')
        self.assertEqual(result['lines'][0]['verifiedBy'],'sympy')
        model.assert_awaited_once()

    def test_problem_transcription_is_literal_and_echoes_revision(self):
        literal='Solve 2(x - 3) = 10\nDo not expand first.'
        with patch('llm.read_problem',new_callable=AsyncMock,return_value=llm.ProblemReading(text=literal,confidence=.96)) as reader, \
             patch.object(main,'verify_lines',side_effect=AssertionError('Problem input must never be solved')):
            response=self.client.post('/api/read-problem',json={'image':'data:image/png;base64,aGVsbG8=','revision':981})
        self.assertEqual(response.status_code,200)
        self.assertEqual(response.json(),{'text':literal,'confidence':.96,'revision':981})
        reader.assert_awaited_once()

    def test_problem_image_and_revision_validation(self):
        for payload in [{}, {'image':'https://example.com/image.png','revision':1},
                        {'image':'data:image/png;base64,aGVsbG8=','revision':-1}]:
            with patch('llm.read_problem',new_callable=AsyncMock) as reader:
                response=self.client.post('/api/read-problem',json=payload)
            self.assertEqual(response.status_code,422)
            reader.assert_not_called()

    def test_problem_provider_errors_use_existing_safe_contract(self):
        with patch('llm.read_problem',new_callable=AsyncMock,side_effect=llm.LLMError('Please connect your tutor.',401,'sign_in_required')):
            response=self.client.post('/api/read-problem',json={'image':'data:image/png;base64,aGVsbG8=','revision':2})
        self.assertEqual(response.status_code,401)
        self.assertEqual(response.json(),{'error':'Please connect your tutor.','code':'sign_in_required'})

    def test_screenshot_multi_statement_ocr_and_confirmed_text_cannot_be_green(self):
        problem='Solve 3(x+2)-4=2x+10'
        compound='3(x+2)-4=2x+10\n3x+6-4=2x+10\n2x+4=2x+10'
        rows=[{'id':'1','text':'3(x+2)-4=2x+10'}, {'id':'2','text':'3x+6-4=2x+10'},
              {'id':'3','fingerprint':'screenshot-bad-row','image':'data:image/png;base64,Y3JvcA=='}]
        ocr=llm.VisionReading(lines=[llm.VisionRow(id='3',text=compound,confidence=.99)])
        with patch('llm._generate',new_callable=AsyncMock,return_value=ocr) as model:
            response=self.client.post('/api/analyze',json={'problem':problem,'lines':rows})
        model.assert_awaited_once()
        self.assertEqual(response.status_code,200)
        result=response.json()
        self.assertEqual([row['status'] for row in result['lines']],['correct','correct','uncertain'])
        self.assertEqual(result['lines'][2]['readingIssue'],'multiple_statements')
        self.assertFalse(result['solved'])
        self.assertEqual(len(llm._ocr_cache),0)
        self.assertTrue(all(len(key[1])<=2 for key in main._verified_prefixes))
        rows[2]['text']=compound
        with patch('llm._generate',new_callable=AsyncMock,side_effect=AssertionError('Malformed confirmed text must not receive AI judgment')) as model:
            confirmed=self.client.post('/api/analyze',json={'problem':problem,'lines':rows}).json()
        model.assert_not_called()
        self.assertEqual(confirmed['lines'][2]['status'],'uncertain')
        self.assertEqual(confirmed['lines'][2]['readingIssue'],'multiple_statements')

    def test_screenshot_exact_single_bad_and_corrected_third_steps(self):
        rows=[{'id':'1','text':'3(x+2)-4=2x+10'}, {'id':'2','text':'3x+6-4=2x+10'},
              {'id':'3','fingerprint':'single-bad-row','image':'data:image/png;base64,Y3JvcA=='}]
        ocr=llm.VisionReading(lines=[llm.VisionRow(id='3',text='2x+4=2x+10',confidence=.99)])
        with patch('llm._generate',new_callable=AsyncMock,return_value=ocr) as model:
            bad=self.client.post('/api/analyze',json={'problem':'Solve 3(x+2)-4=2x+10','lines':rows}).json()
        model.assert_awaited_once()
        self.assertEqual([row['status'] for row in bad['lines']],['correct','correct','incorrect'])
        self.assertEqual(bad['firstErrorLineId'],'3')
        self.assertEqual(bad['lines'][2]['verifiedBy'],'sympy')
        rows[2]['text']='3x+2=2x+10'
        with patch('llm._generate',new_callable=AsyncMock,side_effect=AssertionError('Corrected single statement is local')) as model:
            good=self.client.post('/api/analyze',json={'problem':'Solve 3(x+2)-4=2x+10','lines':rows}).json()
        model.assert_not_called()
        self.assertEqual([row['status'] for row in good['lines']],['correct']*3)
        self.assertIsNone(good['firstErrorLineId'])

    def test_row_image_validation_rejects_urls_and_invalid_base64(self):
        for image in ['https://example.com/image.png','data:image/png;base64,a','data:image/png;base64,!!!!']:
            with patch('llm.read_and_coach',new_callable=AsyncMock) as reader:
                response=self.client.post('/api/analyze',json={'problem':'x=1','lines':[{'id':'1','image':image}]})
            self.assertEqual(response.status_code,422)
            reader.assert_not_called()


class ReaderCacheTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        llm._ocr_cache.clear()

    async def test_unchanged_ink_reuses_reading_but_changed_fingerprint_rechecks(self):
        result=llm.VisionReading(lines=[llm.VisionRow(id='1',text='2x-3=10',confidence=.99)])
        with patch('llm._generate', new_callable=AsyncMock, return_value=result) as model:
            first=await llm.read_and_coach('2(x-3)=10','test-image',[{'id':'1','fingerprint':'old'}])
            second=await llm.read_and_coach('2(x-3)=10','changed-board-image',[{'id':'1','fingerprint':'old'}])
            self.assertEqual(model.await_count,1)
            self.assertEqual(first.lines[0].text,second.lines[0].text)
            await llm.read_and_coach('2(x-3)=10','changed-board-image',[{'id':'1','fingerprint':'new'}])
            self.assertEqual(model.await_count,2)

    async def test_typed_correction_overrides_cached_ocr(self):
        with patch('llm._generate',new_callable=AsyncMock,side_effect=AssertionError('Exact text needs no OCR')):
            result=await llm.read_and_coach('2(x-3)=10','test-image',[{'id':'1','text':'2x-6=10','fingerprint':'old'}])
        self.assertEqual(result.lines[0].text,'2x-6=10')
        self.assertEqual(result.lines[0].transcriptionConfidence,1)

    async def test_uncertain_ocr_never_enters_cache(self):
        unclear=llm.VisionReading(lines=[llm.VisionRow(id='1',text='2x ? 3 = 10',confidence=.99)])
        with patch('llm._generate',new_callable=AsyncMock,return_value=unclear) as model:
            first=await llm.read_and_coach('2(x-3)=10','test-image',[{'id':'1','fingerprint':'old'}])
            await llm.read_and_coach('2(x-3)=10','test-image',[{'id':'1','fingerprint':'old'}])
        self.assertEqual(model.await_count,2)
        self.assertEqual(first.lines[0].status,'uncertain')
        self.assertLess(first.lines[0].transcriptionConfidence,.8)

    async def test_problem_ambiguity_is_not_confidently_accepted(self):
        with patch('llm._generate',new_callable=AsyncMock,return_value=llm.ProblemReading(text='2x + [?] = 10',confidence=.99)):
            result=await llm.read_problem('test-image')
        self.assertEqual(result.text,'2x + [?] = 10')
        self.assertLess(result.confidence,.8)

    async def test_blank_problem_returns_no_invented_text(self):
        with patch('llm._generate',new_callable=AsyncMock,return_value=llm.ProblemReading(text='  ',confidence=.99)):
            result=await llm.read_problem('test-image')
        self.assertEqual(result.text,'')
        self.assertEqual(result.confidence,0)

    async def test_row_crops_are_read_alone_and_serially(self):
        active=0
        peak=0
        images=[]
        async def generate(prompt,image,**_kwargs):
            nonlocal active,peak
            active+=1; peak=max(peak,active); images.append(image)
            await asyncio.sleep(0)
            target=json.loads(prompt.split('\nRows: ')[-1])[0]['id']
            active-=1
            return llm.VisionReading(lines=[llm.VisionRow(id=target,text='x/2=3' if target=='1' else 'x=6',confidence=.99)])
        with patch('llm._generate',side_effect=generate) as model:
            reading=await llm.read_and_coach('x/2=3','FULL BOARD MUST NOT BE SENT',[
                {'id':'1','fingerprint':'crop-a','image':'CROP A'},
                {'id':'2','fingerprint':'crop-b','image':'CROP B'}])
        self.assertEqual(images,['CROP A','CROP B'])
        self.assertEqual(peak,1)
        self.assertEqual(model.await_count,2)
        self.assertEqual([row.text for row in reading.lines],['x/2=3','x=6'])

    async def test_legacy_whole_board_multi_statement_ocr_is_not_cached_or_judged(self):
        compound='3(x+2)-4=2x+10\n3x+6-4=2x+10\n2x+4=2x+10'
        ocr=llm.VisionReading(lines=[llm.VisionRow(id='3',text=compound,confidence=1)])
        with patch('llm._generate',new_callable=AsyncMock,return_value=ocr):
            result=await llm.read_and_coach('3(x+2)-4=2x+10','legacy-full-board',[{'id':'3','fingerprint':'legacy-third'}])
        self.assertEqual(result.lines[0].status,'uncertain')
        self.assertEqual(result.lines[0].readingIssue,'multiple_statements')
        self.assertEqual(llm.unverified_ids(result,{'results':[]}),[])
        self.assertEqual(len(llm._ocr_cache),0)


class ModelSlotTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        main._verified_prefixes.clear()

    async def test_supported_typed_math_finishes_while_model_slot_is_held(self):
        slot=asyncio.Semaphore(1)
        request=AnalyzeRequest(problem='2(x-3)=10',lines=[{'id':'1','text':'2x-3=10'}])
        with patch.object(main,'_analysis_slots',slot), patch('llm._generate',new_callable=AsyncMock,side_effect=AssertionError('No provider needed')) as model:
            async with slot:
                result=await asyncio.wait_for(main.analyze(request),timeout=1)
        self.assertEqual(result['lines'][0]['status'],'incorrect')
        self.assertEqual(result['processingMode'],'local')
        model.assert_not_called()

    async def test_unsupported_typed_math_waits_for_model_slot(self):
        slot=asyncio.Semaphore(1)
        request=AnalyzeRequest(problem='Find the mean of 4, 6, 8',lines=[{'id':'1','text':'mean = 6'}])
        judgment=llm.ContextReading(checks=[llm.ContextCheck(id='1',status='correct',confidence=.99)],solved=True)
        with patch.object(main,'_analysis_slots',slot), patch('llm._generate',new_callable=AsyncMock,return_value=judgment) as model:
            async with slot:
                task=asyncio.create_task(main.analyze(request))
                await asyncio.sleep(.05)
                self.assertFalse(task.done())
                model.assert_not_called()
            result=await asyncio.wait_for(task,timeout=1)
        model.assert_awaited_once()
        self.assertEqual(result['processingMode'],'ai')

    async def test_problem_reader_shares_provider_slot(self):
        slot=asyncio.Semaphore(1)
        request=main.ProblemReadRequest(image='data:image/png;base64,aGVsbG8=',revision=46)
        with patch.object(main,'_analysis_slots',slot), patch('llm.read_problem',new_callable=AsyncMock,return_value=llm.ProblemReading(text='x+3=7',confidence=.99)) as reader:
            async with slot:
                task=asyncio.create_task(main.read_problem(request))
                await asyncio.sleep(.05)
                self.assertFalse(task.done())
                reader.assert_not_called()
            result=await asyncio.wait_for(task,timeout=1)
        reader.assert_awaited_once()
        self.assertEqual(result['revision'],46)


class PrefixCacheTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        main._verified_prefixes.clear()
        llm._ocr_cache.clear()

    def request(self, texts, problem='2(x-3)=10', revision=1):
        return AnalyzeRequest(problem=problem,revision=revision,
            lines=[{'id':str(i+1),'text':text,'fingerprint':f'ink-{i+1}'} for i,text in enumerate(texts)])

    async def test_unchanged_correct_prefix_skips_ocr_and_symbolic_reverification(self):
        with patch.object(main,'verify_lines',wraps=main.verify_lines) as verify, \
             patch('llm.read_and_coach',wraps=llm.read_and_coach) as reader, \
             patch('llm._generate',new_callable=AsyncMock,side_effect=AssertionError('Typed algebra must stay local')) as model:
            initial=await main.analyze(self.request(['2(x-3)=10','2x-6=10']))
            repeated=await main.analyze(self.request(['2(x-3)=10','2x-6=10'],revision=2))
            self.assertEqual(verify.call_count,1)
            self.assertEqual(reader.call_count,1)
            extended=await main.analyze(self.request(['2(x-3)=10','2x-6=10','2x=16'],revision=3))
        self.assertEqual([line['id'] for line in verify.call_args.args[1]],['3'])
        self.assertEqual(verify.call_args.kwargs['previous_line'],'2x-6=10')
        self.assertEqual([line['id'] for line in reader.call_args.args[2]],['3'])
        self.assertEqual([row['status'] for row in initial['lines']],['correct']*2)
        self.assertEqual([row['status'] for row in repeated['lines']],['correct']*2)
        self.assertEqual([row['status'] for row in extended['lines']],['correct']*3)
        self.assertEqual(extended['revision'],3)
        model.assert_not_called()

    async def test_earlier_text_or_ink_edit_invalidates_its_suffix(self):
        await main.analyze(self.request(['2(x-3)=10','2x-6=10','2x=16']))
        with patch.object(main,'verify_lines',wraps=main.verify_lines) as verify:
            result=await main.analyze(self.request(['2(x-3)=10','x-3=5','2x=16']))
        self.assertEqual([line['id'] for line in verify.call_args.args[1]],['2','3'])
        self.assertEqual([row['status'] for row in result['lines']],['correct']*3)
        changed=self.request(['2(x-3)=10','x-3=5','2x=16'])
        changed.lines[0].fingerprint='changed-first-ink'
        with patch.object(main,'verify_lines',wraps=main.verify_lines) as verify:
            await main.analyze(changed)
        self.assertEqual([line['id'] for line in verify.call_args.args[1]],['1','2','3'])
        self.assertNotIn('previous_line',verify.call_args.kwargs)

    async def test_problem_change_invalidates_all_verdicts(self):
        await main.analyze(self.request(['2(x-3)=10','2x-6=10']))
        with patch.object(main,'verify_lines',wraps=main.verify_lines) as verify:
            result=await main.analyze(self.request(['2(x-3)=10','2x-6=10'],problem='2(x-4)=8'))
        self.assertEqual([line['id'] for line in verify.call_args.args[1]],['1','2'])
        self.assertTrue(all(row['status']=='correct' for row in result['lines']))

    async def test_accepted_ink_reuses_ocr_and_keeps_current_geometry(self):
        first=AnalyzeRequest(problem='x/2=3',image='test-image',lines=[
            {'id':'ink','fingerprint':'stable','bbox':{'x':0,'y':0,'width':1,'height':.5}}])
        ocr=llm.VisionReading(lines=[llm.VisionRow(id='ink',text='x/2=3',confidence=.99)])
        with patch('llm._generate',new_callable=AsyncMock,return_value=ocr) as model:
            await main.analyze(first)
            expanded=AnalyzeRequest(problem='x/2=3',image='new-composite-image',lines=[
                {'id':'ink','fingerprint':'stable','bbox':{'x':0,'y':0,'width':1,'height':.25}},
                {'id':'answer','text':'x=6','number':3}])
            with patch.object(main,'verify_lines',wraps=main.verify_lines) as verify:
                result=await main.analyze(expanded)
        model.assert_awaited_once()
        self.assertEqual([line['id'] for line in verify.call_args.args[1]],['answer'])
        self.assertEqual(result['lines'][0]['bbox']['height'],.25)
        self.assertEqual(result['lines'][1]['number'],3)
        self.assertTrue(result['solved'])

    async def test_contextual_ai_still_receives_whole_problem_and_prefix(self):
        judgments=[llm.ContextReading(checks=[llm.ContextCheck(id='1',status='correct',confidence=.99)]),
                   llm.ContextReading(checks=[llm.ContextCheck(id='2',status='correct',confidence=.99)],solved=True)]
        with patch('llm._generate',new_callable=AsyncMock,side_effect=judgments) as model:
            await main.analyze(self.request(['sum = 18'],problem='Find the mean of 4, 6, 8'))
            result=await main.analyze(self.request(['sum = 18','mean = 6'],problem='Find the mean of 4, 6, 8'))
        prompt=model.call_args.args[0]
        context=json.loads(prompt.split('\n')[-1])
        self.assertEqual(context['problem'],'Find the mean of 4, 6, 8')
        self.assertEqual([row['id'] for row in context['lines']],['1','2'])
        self.assertEqual(context['checkOnly'],['2'])
        self.assertEqual([row['status'] for row in result['lines']],['correct','correct'])
        self.assertTrue(all(row['verifiedBy']=='ai' for row in result['lines']))

    async def test_uncertain_or_incorrect_rows_never_enter_prefix_cache(self):
        with patch.object(main,'verify_lines',wraps=main.verify_lines) as verify:
            for _ in range(2):
                await main.analyze(self.request(['2x-3=10']))
        self.assertEqual(verify.call_count,2)
        self.assertEqual(len(main._verified_prefixes),0)
        unclear=llm.VisionReading(lines=[llm.VisionRow(id='ink',text='x/?=3',confidence=.4)])
        with patch('llm._generate',new_callable=AsyncMock,return_value=unclear) as model:
            for _ in range(2):
                await main.analyze(AnalyzeRequest(problem='x/2=3',image='test-image',lines=[{'id':'ink','fingerprint':'unclear'}]))
        self.assertEqual(model.await_count,2)
        self.assertEqual(len(main._verified_prefixes),0)

    async def test_prefix_cache_is_bounded(self):
        with patch.object(main,'_PREFIX_CACHE_LIMIT',3):
            for number in range(4):
                await main.analyze(self.request(['x=1'],problem=f'x+{number}={number+1}'))
        self.assertEqual(len(main._verified_prefixes),3)
        self.assertFalse(any(key[0]=='x+0=1' for key in main._verified_prefixes))


class AuthTests(unittest.IsolatedAsyncioTestCase):
    def test_authorization_uses_pkce_exact_callback_and_dynamic_client(self):
        manager = ChatGPTAuth()
        manager.record['accounts'] = []
        manager.record['active'] = None
        with patch.object(manager, 'save'):
            target, cookie = manager.start('new')
        params = parse_qs(urlparse(target).query)
        pending = manager.pending[params['state'][0]]
        expected = base64.urlsafe_b64encode(hashlib.sha256(pending['verifier'].encode()).digest()).rstrip(b'=').decode()
        self.assertEqual(params['client_id'], ['dynamic_agent_client'])
        self.assertEqual(params['redirect_uri'], ['http://127.0.0.1:8000/auth/callback'])
        self.assertEqual(params['code_challenge'], [expected])
        self.assertEqual(cookie, pending['cookie'])
        self.assertIn('chatgpt.tokens.use.direct', params['scope'][0])

    async def test_jwt_validates_signature_audience_and_nonce(self):
        manager = ChatGPTAuth()
        private = rsa.generate_private_key(public_exponent=65537, key_size=2048)
        public = json.loads(jwt.algorithms.RSAAlgorithm.to_jwk(private.public_key()))
        public.update(kid='test-key', alg='RS256', use='sig')
        claims = {'iss':'https://auth.openai.com','aud':'test-client','sub':'test-user','exp':int(time.time())+60,'nonce':'expected'}
        token = jwt.encode(claims,private,algorithm='RS256',headers={'kid':'test-key'})
        with patch.object(manager,'discovery',AsyncMock(return_value={'jwks_uri':'https://auth.openai.com/test-keys'})), patch.object(manager,'_json',AsyncMock(return_value={'keys':[public]})):
            verified = await manager.validate_token(token,'test-client','expected')
            self.assertEqual(verified['sub'],'test-user')
            with self.assertRaises(AuthError):
                await manager.validate_token(token,'wrong-client','expected')
            with self.assertRaises(AuthError):
                await manager.validate_token(token,'test-client','wrong-nonce')

    async def test_oauth_state_is_single_use_and_bound_to_cookie(self):
        manager = ChatGPTAuth()
        with patch.object(manager,'save'):
            target, _cookie = manager.start('new')
        state=parse_qs(urlparse(target).query)['state'][0]
        with self.assertRaises(AuthError):
            await manager.finish({'state':state,'code':'fake'},'wrong-cookie')
        self.assertNotIn(state,manager.pending)


if __name__ == '__main__':
    unittest.main()
