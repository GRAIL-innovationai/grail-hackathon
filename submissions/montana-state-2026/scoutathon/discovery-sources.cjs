'use strict';

const BOARDS = Object.freeze({ stripe: 'Stripe', cloudflare: 'Cloudflare', figma: 'Figma', gitlab: 'GitLab' });
const TTL = 6 * 60 * 60 * 1000;
const DAY = 24 * 60 * 60 * 1000;
const MAX_BYTES = 8 * 1024 * 1024;

function decodeEntities(value) {
  return value.replace(/&(?:nbsp|#160);/gi, ' ')
    .replace(/&(amp|lt|gt|quot|apos);/gi, (_, name) => ({ amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" })[name.toLowerCase()])
    .replace(/&#(\d+);/g, (_, digits) => entityCode(Number(digits)))
    .replace(/&#x([0-9a-f]+);/gi, (_, digits) => entityCode(parseInt(digits, 16)));
}

function entityCode(code) {
  return Number.isInteger(code) && code > 0 && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff)
    ? String.fromCodePoint(code) : '\ufffd';
}

function plain(value, max) {
  if (typeof value !== 'string') return '';
  let decoded = value;
  for (let i = 0; i < 2; i++) {
    const next = decodeEntities(decoded);
    if (next === decoded) break;
    decoded = next;
  }
  return decoded.replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style\s*>/gi, ' ')
    .replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}

async function readLimited(response) {
  const size = Number(response.headers && response.headers.get && response.headers.get('content-length'));
  if (Number.isFinite(size) && size > MAX_BYTES) throw Object.assign(new Error('Job source response is too large.'), { code: 'UPSTREAM' });
  if (!response.body || typeof response.body.getReader !== 'function') {
    const body = await response.text();
    if (Buffer.byteLength(body, 'utf8') > MAX_BYTES) throw Object.assign(new Error('Job source response is too large.'), { code: 'UPSTREAM' });
    return body;
  }
  const reader = response.body.getReader(), chunks = [];
  let bytes = 0;
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      bytes += part.value.byteLength;
      if (bytes > MAX_BYTES) { try { await reader.cancel(); } catch (_) {} throw Object.assign(new Error('Job source response is too large.'), { code: 'UPSTREAM' }); }
      chunks.push(Buffer.from(part.value));
    }
  } finally { reader.releaseLock(); }
  return Buffer.concat(chunks).toString('utf8');
}

function mapJob(board, raw) {
  if (!raw || !Number.isSafeInteger(Number(raw.id)) || Number(raw.id) < 1 || typeof raw.title !== 'string' || typeof raw.absolute_url !== 'string') return null;
  let url;
  try {
    const parsed = new URL(raw.absolute_url);
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.hash || !validJobUrl(board, parsed, Number(raw.id))) return null;
    url = parsed.href;
  } catch (_) { return null; }
  const description = plain(raw.content, 6000);
  if (!description) return null;
  const type = /\bintern(?:ship)?\b/i.test(raw.title) ? 'Internship' : /junior|entry.level|graduate|associate/i.test(raw.title) ? 'Entry-level' :
    /senior|lead|principal|staff/i.test(raw.title) ? 'Senior' : 'Unspecified';
  const location = plain(raw.location && raw.location.name, 160);
  const metadata = Array.isArray(raw.departments) ? raw.departments.map(item => plain(item && item.name, 100)).filter(Boolean).join(', ').slice(0, 400) : '';
  return { id: `greenhouse-${board}-${Number(raw.id)}`, company: BOARDS[board], role: plain(raw.title, 200),
    location: location || 'Not specified', type, skills: [], description, metadata, status: 'Available', resume: '', cover: '', outreach: '',
    url, source: `Greenhouse · ${BOARDS[board]}`, demo: false };
}

function validJobUrl(board, url, id) {
  const host = url.hostname.toLowerCase(), path = url.pathname;
  if (['boards.greenhouse.io', 'job-boards.greenhouse.io'].includes(host)) {
    return path.startsWith(`/${board}/jobs/`) && new RegExp(`/jobs/${id}$`).test(path);
  }
  if (board === 'stripe') return host === 'stripe.com' && path === '/jobs/search' && url.searchParams.get('gh_jid') === String(id);
  if (board === 'cloudflare') return host === 'careers.cloudflare.com' && path.startsWith('/jobs/') && path.endsWith(String(id));
  if (board === 'figma') return host === 'figma.com' && path.startsWith('/careers/job/') && path.endsWith(String(id));
  if (board === 'gitlab') return host === 'about.gitlab.com' && path.startsWith('/jobs/') && path.endsWith(String(id));
  return false;
}

function createDiscoverySources({ fetchImpl = global.fetch, now = Date.now } = {}) {
  if (process.env.SERPER_API_KEY?.trim()) return require('./google-search.cjs').createGoogleSearch({ apiKey: process.env.SERPER_API_KEY, fetchImpl, now });
  const cache = new Map();
  let day = -1, requests = 0;
  async function fetchBoard(board) {
    const current = Number(now()), utcDay = Math.floor(current / DAY);
    if (utcDay !== day) { day = utcDay; requests = 0; }
    const cached = cache.get(board);
    if (cached && current - cached.cachedAt < TTL) return cached;
    if (requests >= 8) throw Object.assign(new Error('Public job source daily request limit reached.'), { code: 'QUOTA' });
    if (typeof fetchImpl !== 'function') throw Object.assign(new Error('Public job retrieval is unavailable.'), { code: 'CONFIG' });
    requests++;
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 8000);
    try {
      const response = await fetchImpl(`https://boards-api.greenhouse.io/v1/boards/${board}/jobs?content=true`, {
        method: 'GET', redirect: 'error', credentials: 'omit', headers: { accept: 'application/json' }, signal: controller.signal
      });
      if (!response.ok) throw Object.assign(new Error('A public job board could not be retrieved.'), { code: 'UPSTREAM' });
      let payload;
      try { payload = JSON.parse(await readLimited(response)); }
      catch (error) { if (error && error.code) throw error; throw Object.assign(new Error('A public job board returned invalid data.'), { code: 'UPSTREAM' }); }
      if (!payload || !Array.isArray(payload.jobs)) throw Object.assign(new Error('A public job board returned invalid data.'), { code: 'UPSTREAM' });
      const result = { jobs: payload.jobs.map(job => mapJob(board, job)).filter(Boolean), cachedAt: current };
      cache.set(board, result);
      return result;
    } catch (error) {
      if (error && error.code) throw error;
      if (error && error.name === 'AbortError') throw Object.assign(new Error('A public job board timed out.'), { code: 'TIMEOUT' });
      throw Object.assign(new Error('A public job board could not be retrieved.'), { code: 'UPSTREAM' });
    } finally { clearTimeout(timer); }
  }
  return {
    async search({ queries, location = '', level = '', boards } = {}) {
      if (!Array.isArray(boards) || boards.length < 1 || boards.length > 4 || boards.some(board => !Object.hasOwn(BOARDS, board)) ||
          !Array.isArray(queries) || queries.length < 1 || queries.length > 4 || queries.some(query => typeof query !== 'string' || query.length > 120) ||
          typeof location !== 'string' || location.length > 120 || typeof level !== 'string' || level.length > 40) {
        throw Object.assign(new Error('Search plan is invalid.'), { code: 'INVALID' });
      }
      const results = await Promise.allSettled(boards.map(fetchBoard));
      const good = results.filter(result => result.status === 'fulfilled').map(result => result.value);
      const failed = results.filter(result => result.status === 'rejected');
      if (!good.length) throw Object.assign(new Error('Public job sources could not be retrieved.'), { code: 'UPSTREAM' });
      const sources = results.flatMap((result, index) => result.status === 'fulfilled'
        ? [{ board: boards[index], retrievedAt: new Date(result.value.cachedAt).toISOString() }] : []);
      return { jobs: good.flatMap(result => result.jobs), sources, cachedAt: Math.min(...good.map(result => result.cachedAt)), source: 'Public Greenhouse Job Board API',
        sourceNotice: `Public employer Greenhouse boards; latest listing retrieval per board: ${sources.map(item => `${BOARDS[item.board]} ${item.retrievedAt}`).join('; ')}. Follow each listing for current details and application instructions.`,
        limitations: failed.length ? [`${failed.length} selected public job board${failed.length === 1 ? '' : 's'} could not be retrieved.`] : [] };
    }
  };
}

module.exports = { createDiscoverySources, mapJob, readLimited, plain, validJobUrl, BOARDS };
