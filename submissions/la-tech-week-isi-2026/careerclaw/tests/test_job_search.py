import json
import unittest
from unittest.mock import MagicMock, patch
import job_search


class TestSearch(unittest.TestCase):
    def setUp(self):
        self.state = (job_search._jobs, job_search._updated, job_search._attempted)
        job_search._jobs = []
        job_search._updated = job_search._attempted = 0
        self.job = dict(title='Python Engineer', company_name='Example',
                        url='https://remotive.com/remote-jobs/software-dev/example',
                        description='<p>Python &amp; SQL</p><script>bad()</script><li>Build APIs</li>',
                        candidate_required_location='Worldwide', job_type='full_time')

    def tearDown(self):
        job_search._jobs, job_search._updated, job_search._attempted = self.state

    def test_description_and_safe_links(self):
        result = job_search.normalize(self.job)
        self.assertEqual(result['text'], 'Python & SQL\nBuild APIs')
        self.assertIsNone(job_search.normalize({**self.job, 'url': 'javascript:alert(1)'}))

    @patch('job_search.urllib.request.urlopen')
    def test_filters_and_shared_cache(self, fetch):
        response = MagicMock()
        response.read.return_value = json.dumps({'jobs': [self.job]}).encode()
        fetch.return_value.__enter__.return_value = response
        self.assertEqual(job_search.search_jobs('python', 'USA')['total'], 1)
        self.assertEqual(job_search.search_jobs('python', job_type='internship')['total'], 0)
        self.assertEqual(job_search.search_jobs('unmatched')['total'], 0)
        self.assertEqual(fetch.call_count, 1)

    @patch('job_search.urllib.request.urlopen', side_effect=OSError('offline'))
    def test_failure_and_retry_limit(self, fetch):
        with self.assertRaisesRegex(ValueError, 'unavailable'):
            job_search.search_jobs('python')
        with self.assertRaisesRegex(ValueError, 'retry'):
            job_search.search_jobs('python')
        self.assertEqual(fetch.call_count, 1)

    def test_empty_query(self):
        with self.assertRaises(ValueError):
            job_search.search_jobs('  ')
