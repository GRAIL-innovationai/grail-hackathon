'use strict';
const { createHash } = require('node:crypto');
const { isIP } = require('node:net');
const { plain, readLimited } = require('./discovery-sources.cjs');
const error = (code, message) => Object.assign(new Error(message), { code });

function publicUrl(raw) {
  try {
    const url = new URL(raw), host = url.hostname.toLowerCase();
    if (url.protocol !== 'https:' || url.username || url.password || url.port || isIP(host.replace(/^\[|\]$/g, '')) ||
        !host.includes('.') || /(?:^|\.)(?:localhost|local|internal|test|invalid)$/.test(host)) return null;
    url.hash = '';
    return url;
  } catch { return null; }
}

function createGoogleSearch({ apiKey = '', fetchImpl = global.fetch, now = Date.now } = {}) {
  const cache = new Map();
  return { mode: 'google', async search({ queries, location = '', level = '' } = {}) {
    if (!apiKey.trim()) throw error('CONFIG', 'Add SERPER_API_KEY to the local .env file and restart to enable Google search.');
    if (!Array.isArray(queries) || !queries.length || queries.some(q => typeof q !== 'string' || !q.trim() || q.length > 120) ||
        typeof location !== 'string' || location.length > 120 || typeof level !== 'string' || level.length > 40) throw error('INVALID', 'Search plan is invalid.');
    const q = [queries[0].trim(), location.trim(), level.trim()].filter(Boolean).join(' ');
    const time = Number(now()), cached = cache.get(q);
    if (cached && time - cached.cachedAt < 6 * 60 * 60 * 1000) return structuredClone(cached);
    try {
      const response = await fetchImpl('https://google.serper.dev/search', {
        method: 'POST', redirect: 'error', credentials: 'omit', signal: AbortSignal.timeout(10000),
        headers: { 'X-API-KEY': apiKey.trim(), 'content-type': 'application/json' },
        body: JSON.stringify({ q, num: 10, gl: 'us', hl: 'en' })
      });
      if (!response.ok) throw error(response.status === 429 ? 'QUOTA' : response.status === 401 || response.status === 403 ? 'CONFIG' : 'UPSTREAM', 'Google search service is unavailable. Check its key or remaining free credits.');
      const payload = typeof response.body?.getReader === 'function' ? JSON.parse(await readLimited(response)) : await response.json();
      if (!Array.isArray(payload.organic)) throw error('UPSTREAM', 'Google search returned invalid results.');
      const seen = new Set(), jobs = [];
      for (const item of payload.organic.slice(0, 10)) {
        if (!item || typeof item.link !== 'string') continue;
        const url = publicUrl(item.link), title = plain(item.title, 200), snippet = plain(item.snippet, 3000);
        if (!url || !title || !snippet) continue;
        const id = createHash('sha256').update(url.origin + url.pathname).digest('hex');
        if (seen.has(id)) continue;
        seen.add(id);
        jobs.push({ id, company: `Source: ${url.hostname}`.slice(0, 200), role: title, location: 'Verify location on source', type: 'Unverified',
          description: `Google search snippet: ${snippet}`, metadata: title, skills: [], demo: false, searchSnippet: true,
          status: 'Available', resume: '', cover: '', outreach: '', url: url.href, source: 'Google Search via Serper' });
      }
      const result = { jobs, cachedAt: time, source: 'Google Search via Serper', sources: jobs.map(job => ({ url: job.url, retrievedAt: new Date(time).toISOString() })),
        sourceNotice: 'Google result titles and snippets, retrieved through Serper. Verify employer, location, eligibility, and availability on the source page.',
        limitations: ['Search snippets may describe expired roles or job collections. Employer pages have not been independently retrieved or verified.'] };
      if (cache.size >= 20) cache.delete(cache.keys().next().value);
      cache.set(q, result);
      return structuredClone(result);
    } catch (cause) {
      if (['CONFIG', 'QUOTA', 'UPSTREAM'].includes(cause?.code)) throw cause;
      throw error('UPSTREAM', 'Google search could not be completed. No automatic retry was made.');
    }
  } };
}
module.exports = { createGoogleSearch };
