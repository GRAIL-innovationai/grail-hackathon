'use strict';

const ENDPOINT = 'https://remotive.com/api/remote-jobs?category=software-dev';
const DAY = 24 * 60 * 60 * 1000;
const TTL = 6 * 60 * 60 * 1000;
const MAX_BYTES = 2 * 1024 * 1024;
const STOP = new Set(['a','an','and','the','for','to','of','in','on','with','jobs','job','remote','role','developer','engineer']);

function plain(value, max) {
  if (typeof value !== 'string') return '';
  return value.replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style\s*>/gi, ' ')
    .replace(/<[^>]*>/g, ' ').replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&amp;/gi, '&').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>')
    .replace(/&quot;|&#34;/gi, '"').replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Math.min(Number(n), 0x10ffff)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(Math.min(parseInt(n, 16), 0x10ffff)))
    .replace(/\s+/g, ' ').trim().slice(0, max);
}

async function readLimited(response) {
  const length = response.headers && response.headers.get && Number(response.headers.get('content-length'));
  if (Number.isFinite(length) && length > MAX_BYTES) throw Object.assign(new Error('Job feed response is too large.'), { code: 'UPSTREAM' });
  if (!response.body || typeof response.body.getReader !== 'function') {
    const value = await response.text();
    if (Buffer.byteLength(value, 'utf8') > MAX_BYTES) throw Object.assign(new Error('Job feed response is too large.'), { code: 'UPSTREAM' });
    return value;
  }
  const reader = response.body.getReader(), chunks = [];
  let total = 0;
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      total += part.value.byteLength;
      if (total > MAX_BYTES) {
        try { await reader.cancel(); } catch (_) {}
        throw Object.assign(new Error('Job feed response is too large.'), { code: 'UPSTREAM' });
      }
      chunks.push(Buffer.from(part.value));
    }
  } finally { reader.releaseLock(); }
  return Buffer.concat(chunks).toString('utf8');
}

function mapJob(raw) {
  if (!raw || !Number.isFinite(Number(raw.id)) || typeof raw.title !== 'string' || typeof raw.company_name !== 'string') return null;
  let url;
  try {
    const parsed = new URL(raw.url);
    if (parsed.protocol !== 'https:' || parsed.hostname.toLowerCase() !== 'remotive.com' || parsed.username || parsed.password) return null;
    url = parsed.href;
  } catch (_) { return null; }
  const jobType = String(raw.job_type || '').toLowerCase();
  const title = String(raw.title).toLowerCase();
  const type = jobType.includes('intern') || /intern/.test(title) ? 'Internship' :
    /junior|entry.level|graduate|associate/.test(title) ? 'Entry-level' :
    /senior|lead|principal|staff/.test(title) ? 'Senior' : 'Full-time';
  const tags = Array.isArray(raw.tags) ? raw.tags : [];
  return {
    id: `remotive-${Number(raw.id)}`, company: plain(raw.company_name, 200), role: plain(raw.title, 200),
    location: plain(raw.candidate_required_location || 'Worldwide', 160), type,
    skills: tags.filter(tag => typeof tag === 'string').slice(0, 10).map(tag => plain(tag, 100)).filter(Boolean),
    description: plain(raw.description, 10000), status: 'Available', resume: '', cover: '', outreach: '',
    url, source: 'Remotive', demo: false, publishedAt: typeof raw.publication_date === 'string' ? raw.publication_date.slice(0, 40) : ''
  };
}

function createOpportunities({ fetchImpl = global.fetch, now = Date.now } = {}) {
  let cache = null;
  let dailyStart = -1;
  let requestsToday = 0;
  async function getFeed() {
    const current = Number(now());
    const day = Math.floor(current / DAY);
    if (day !== dailyStart) { dailyStart = day; requestsToday = 0; }
    if (cache && current - cache.cachedAt < TTL) return cache;
    if (requestsToday >= 4) throw Object.assign(new Error('Remotive daily request limit reached. Try again after the cache refreshes.'), { code: 'QUOTA' });
    if (typeof fetchImpl !== 'function') throw Object.assign(new Error('Remote job search is unavailable.'), { code: 'CONFIG' });
    requestsToday += 1;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    try {
      const response = await fetchImpl(ENDPOINT, { method: 'GET', redirect: 'error', credentials: 'omit',
        headers: { accept: 'application/json' }, signal: controller.signal });
      if (!response.ok) {
        if (response.body && response.body.cancel) { try { const result = response.body.cancel(); if (result && result.catch) result.catch(() => {}); } catch (_) {} }
        throw Object.assign(new Error('Remotive job search could not complete.'), { code: 'UPSTREAM' });
      }
      let payload;
      try { payload = JSON.parse(await readLimited(response)); } catch (error) {
        if (error && error.code) throw error;
        throw Object.assign(new Error('Remotive returned an invalid job feed.'), { code: 'UPSTREAM' });
      }
      if (!payload || !Array.isArray(payload.jobs)) throw Object.assign(new Error('Remotive returned an invalid job feed.'), { code: 'UPSTREAM' });
      cache = { jobs: payload.jobs.map(mapJob).filter(Boolean), cachedAt: current };
      return cache;
    } catch (error) {
      if (error && error.code) throw error;
      if (error && error.name === 'AbortError') throw Object.assign(new Error('Remotive job search timed out.'), { code: 'TIMEOUT' });
      throw Object.assign(new Error('Remotive job search could not complete.'), { code: 'UPSTREAM' });
    } finally { clearTimeout(timer); }
  }
  return {
    async search({ query = '', level = '', location = '' } = {}) {
      if ([query, level, location].some(value => typeof value !== 'string') || query.length > 120 || level.length > 40 || location.length > 120) {
        throw Object.assign(new Error('Search filters are invalid.'), { code: 'INVALID' });
      }
      const feed = await getFeed();
      const terms = query.toLowerCase().split(/[^a-z0-9+#.]+/).filter(term => term && !STOP.has(term));
      const loc = location.trim().toLowerCase();
      const wantedLevel = level.trim().toLowerCase();
      const ranked = feed.jobs.map(job => {
        const title = job.role.toLowerCase(), tags = job.skills.join(' ').toLowerCase();
        const searchable = `${title} ${tags} ${job.description.toLowerCase()}`;
        const hits = terms.filter(term => searchable.includes(term));
        if (terms.length && !hits.length) return null;
        if (wantedLevel) {
          const levelText = `${title} ${job.type.toLowerCase()}`;
          const matches = wantedLevel.includes('intern') ? /intern/.test(levelText) :
            wantedLevel.includes('entry') || wantedLevel.includes('junior') || wantedLevel.includes('graduate') ? /junior|entry|graduate|associate/.test(levelText) :
            wantedLevel.includes('senior') || wantedLevel.includes('lead') ? /senior|lead|principal|staff/.test(levelText) : levelText.includes(wantedLevel);
          if (!matches) return null;
        }
        const restriction = job.location.toLowerCase();
        if (loc && !/worldwide|anywhere/.test(restriction) && !restriction.includes(loc)) return null;
        const score = hits.reduce((n, term) => n + (title.includes(term) ? 4 : tags.includes(term) ? 3 : 1), 0);
        return { job, score };
      }).filter(Boolean);
      ranked.sort((a, b) => b.score - a.score || String(b.job.publishedAt).localeCompare(String(a.job.publishedAt)));
      return { jobs: ranked.slice(0, 30).map(item => item.job), source: 'Remotive',
        notice: 'Remote jobs supplied by Remotive. Listings may be delayed by 24 hours; open each Remotive listing to check current details and location eligibility.', cachedAt: new Date(feed.cachedAt).toISOString() };
    }
  };
}

module.exports = { createOpportunities, mapJob };
