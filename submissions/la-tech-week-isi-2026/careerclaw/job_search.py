"""Public remote listings, cached to respect the provider's request limits."""
import json
import threading
import time
import urllib.request
from html.parser import HTMLParser
from urllib.parse import urlparse

_lock = threading.Lock()
_jobs = []
_updated = 0
_attempted = 0


class DescriptionParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.parts = []
        self.hidden = 0

    def handle_starttag(self, tag, attrs):
        if tag in ('script', 'style'):
            self.hidden += 1
        if tag in ('p', 'div', 'li', 'br', 'h2', 'h3'):
            self.parts.append('\n')

    def handle_endtag(self, tag):
        if tag in ('script', 'style'):
            self.hidden = max(0, self.hidden - 1)
        if tag in ('p', 'div', 'li'):
            self.parts.append('\n')

    def handle_data(self, data):
        if not self.hidden:
            self.parts.append(data)


def normalize(job):
    url = str(job.get('url', ''))
    parsed = urlparse(url)
    if parsed.scheme != 'https' or parsed.hostname not in ('remotive.com', 'www.remotive.com'):
        return None
    parser = DescriptionParser()
    parser.feed(str(job.get('description', '')))
    text = '\n'.join(line.strip() for line in ''.join(parser.parts).splitlines() if line.strip())
    if not text or not job.get('title'):
        return None
    return dict(title=str(job['title']), employer=str(job.get('company_name', '')),
                text=text[:30000], url=url, location=str(job.get('candidate_required_location', '')),
                job_type=str(job.get('job_type', '')), salary=str(job.get('salary', '')),
                published=str(job.get('publication_date', '')), source='Remotive')


def search_jobs(query, location='', job_type=''):
    global _jobs, _updated, _attempted
    query = str(query).strip()[:120]
    if not query:
        raise ValueError('Enter a role or keywords to search.')
    with _lock:
        now = time.time()
        if now - _updated > 21600:
            if now - _attempted < 60:
                raise ValueError('Job search is temporarily unavailable. Please retry in a minute.')
            _attempted = now
            try:
                request = urllib.request.Request('https://remotive.com/api/remote-jobs', headers={'User-Agent': 'CareerClaw/1.0'})
                with urllib.request.urlopen(request, timeout=20) as response:
                    raw = response.read(10 * 1024 * 1024 + 1)
                if len(raw) > 10 * 1024 * 1024:
                    raise ValueError('Provider response too large')
                data = json.loads(raw)
                if not isinstance(data.get('jobs'), list):
                    raise ValueError('Invalid provider response')
                _jobs = [item for job in data['jobs'] if isinstance(job, dict) and (item := normalize(job))]
                _updated = now
            except Exception as exc:
                raise ValueError('Remotive is unavailable. Please try again later or add a job manually.') from exc
        terms = query.casefold().split()
        location = str(location).strip().casefold()[:120]
        matches = [job for job in _jobs
                   if all(term in (job['title'] + ' ' + job['text']).casefold() for term in terms)
                   and (not location or location in job['location'].casefold() or job['location'].casefold() == 'worldwide')
                   and (not job_type or job_type == job['job_type'])]
        return {'jobs': matches[:30], 'total': len(matches), 'source': 'Remotive'}
