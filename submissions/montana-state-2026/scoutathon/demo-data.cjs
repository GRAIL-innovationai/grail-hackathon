'use strict';
const Core = require('./core.js');

function createDemoOpportunities() {
  return {
    async search({ query = '', level = 'all', location = '' } = {}) {
      if (typeof query !== 'string' || query.length > 200 || typeof location !== 'string' || location.length > 120 || !['all', 'internship', 'entry', 'senior'].includes(level)) {
        const error = new Error('Search filters are invalid.'); error.code = 'INVALID'; throw error;
      }
      const roles = Core.seed().jobs;
      const words = query.toLowerCase().split(/\W+/).filter(word => word.length > 2 && !['the', 'and', 'for', 'summer', 'looking', 'position'].includes(word));
      const filtered = roles.filter(job => {
        const content = `${job.role} ${job.description} ${job.skills.join(' ')}`.toLowerCase();
        const match = !words.length || words.some(word => content.includes(word));
        const levelMatch = level === 'all' || (level === 'internship' ? /intern/i.test(job.role) : level === 'entry' ? /entry|junior/i.test(job.role) && !/intern/i.test(job.role) : /senior/i.test(job.role));
        const locationMatch = !location.trim() || /remote/i.test(job.location) || job.location.toLowerCase().includes(location.toLowerCase());
        return match && levelMatch && locationMatch;
      });
      return {
        jobs: filtered.map(job => ({ ...job, id: `curated-${job.id}`, status: 'Available', resume: '', cover: '', outreach: '', demoActivity: false })),
        source: 'Curated employer postings', notice: 'Employer-board snapshots checked October 17, 2026. This catalog is not a live feed; open the employer link to confirm availability and eligibility.', cachedAt: '2026-10-17'
      };
    }
  };
}

function createDemoResearch() {
  return {
    async company(job) {
      const reference = Core.seed().jobs.find(item => item.company === job.company && item.role === job.role && item.url === job.url);
      return {
        notice: reference ? 'Employer posting summary checked October 17, 2026. Practice questions are generated exercises, not reported employer questions.' : 'No verified company brief is available for this role.',
        limitations: 'Curated snapshot only; confirm details with the employer. No recruiter messages, company news, or private interview reports were retrieved.',
        sources: reference ? [{ title: `${reference.company} · ${reference.role}`, url: reference.url, excerpt: reference.description }] : []
      };
    }
  };
}

module.exports = { createDemoOpportunities, createDemoResearch };
