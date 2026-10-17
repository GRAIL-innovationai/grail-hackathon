(function (root, factory) {
  const core = typeof module === 'object' && module.exports ? require('./core.js') : root.Core;
  const api = factory(core);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.InterviewProblems = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (Core) {
  'use strict';

  const catalog = Object.freeze([
    { id: 'leetcode-1', leetcodeId: 1, title: 'Two Sum', topic: 'Arrays and hash maps', difficulty: 'Easy', url: 'https://leetcode.com/problems/two-sum/', focus: 'Find two values that meet a target while returning their original positions.' },
    { id: 'leetcode-49', leetcodeId: 49, title: 'Group Anagrams', topic: 'Strings and hash maps', difficulty: 'Medium', url: 'https://leetcode.com/problems/group-anagrams/', focus: 'Group words by a normalized signature without depending on input order.' },
    { id: 'leetcode-347', leetcodeId: 347, title: 'Top K Frequent Elements', topic: 'Hash maps and heaps', difficulty: 'Medium', url: 'https://leetcode.com/problems/top-k-frequent-elements/', focus: 'Count repeated values and return only the most frequent ones.' },
    { id: 'leetcode-20', leetcodeId: 20, title: 'Valid Parentheses', topic: 'Stacks', difficulty: 'Easy', url: 'https://leetcode.com/problems/valid-parentheses/', focus: 'Check whether a sequence of opening and closing brackets is correctly nested.' },
    { id: 'leetcode-155', leetcodeId: 155, title: 'Min Stack', topic: 'Stacks and data structures', difficulty: 'Medium', url: 'https://leetcode.com/problems/min-stack/', focus: 'Design stack operations that can also return the current minimum efficiently.' },
    { id: 'leetcode-56', leetcodeId: 56, title: 'Merge Intervals', topic: 'Sorting and intervals', difficulty: 'Medium', url: 'https://leetcode.com/problems/merge-intervals/', focus: 'Combine ranges that overlap after ordering them by start.' },
    { id: 'leetcode-102', leetcodeId: 102, title: 'Binary Tree Level Order Traversal', topic: 'Trees and breadth-first search', difficulty: 'Medium', url: 'https://leetcode.com/problems/binary-tree-level-order-traversal/', focus: 'Visit tree nodes level by level and group values by depth.' },
    { id: 'leetcode-200', leetcodeId: 200, title: 'Number of Islands', topic: 'Graphs and matrix traversal', difficulty: 'Medium', url: 'https://leetcode.com/problems/number-of-islands/', focus: 'Count connected regions in a grid using a systematic traversal.' },
    { id: 'leetcode-207', leetcodeId: 207, title: 'Course Schedule', topic: 'Graphs and dependency ordering', difficulty: 'Medium', url: 'https://leetcode.com/problems/course-schedule/', focus: 'Determine whether directed prerequisites contain a cycle.' },
    { id: 'leetcode-175', leetcodeId: 175, title: 'Combine Two Tables', topic: 'SQL joins', difficulty: 'Easy', url: 'https://leetcode.com/problems/combine-two-tables/', focus: 'Join related records while retaining rows that have no matching detail.' },
    { id: 'leetcode-176', leetcodeId: 176, title: 'Second Highest Salary', topic: 'SQL aggregation and ranking', difficulty: 'Medium', url: 'https://leetcode.com/problems/second-highest-salary/', focus: 'Select the second distinct value and handle a missing result cleanly.' },
    { id: 'leetcode-183', leetcodeId: 183, title: 'Customers Who Never Order', topic: 'SQL anti-joins', difficulty: 'Easy', url: 'https://leetcode.com/problems/customers-who-never-order/', focus: 'Find records with no related row using a join or existence check.' }
  ].map(Object.freeze));

  const companyReports = Object.freeze([
    { company: 'Google', problemId: 'leetcode-1', url: 'https://leetcode.com/discuss/post/8551877/google-l4-software-engineer-india-aug-20-zgn1/',
      publishedAt: 'Unknown', interviewDate: '2026-08', checkedAt: '2026-10-17', quote: 'The interviewer, from London, came in and asked me: Two Sum.',
      caveat: 'Candidate self-report; not verified by the employer. One report does not establish frequency or predict an interview.' },
    { company: 'Amazon', problemId: 'leetcode-49', url: 'https://leetcode.com/discuss/post/455250/amazon-sde-intern-seattle-dec-2019-offer/',
      publishedAt: 'Unknown', interviewDate: '2019-12', checkedAt: '2026-10-17', quote: 'One coding question which I got immediately.',
      caveat: 'Candidate self-report; not verified by the employer. One report does not establish frequency or predict an interview.' }
  ]);
  const byId = new Map(catalog.map(problem => [problem.id, problem]));
  const patternTerms = {
    'leetcode-1': ['array', 'hash map', 'hashmap', 'lookup', 'complement'],
    'leetcode-49': ['string', 'anagram', 'normalization'],
    'leetcode-347': ['frequency', 'top k', 'heap', 'ranking'],
    'leetcode-20': ['stack', 'parsing', 'bracket'],
    'leetcode-155': ['stack', 'data structure', 'minimum'],
    'leetcode-56': ['interval', 'range', 'scheduling', 'sorting'],
    'leetcode-102': ['tree', 'breadth first', 'bfs', 'hierarchy'],
    'leetcode-200': ['graph', 'grid', 'matrix', 'connected component'],
    'leetcode-207': ['graph', 'dependency', 'cycle', 'topological'],
    'leetcode-175': ['sql', 'database', 'join', 'relational'],
    'leetcode-176': ['sql', 'database', 'salary', 'aggregation', 'ranking'],
    'leetcode-183': ['sql', 'database', 'join', 'anti-join', 'query']
  };

  const text = value => typeof value === 'string' ? value.toLowerCase() : '';
  const hasAttemptEvidence = record => !!record && record.attempt && record.attempt.demo !== true &&
    (typeof record.attempt.solution === 'string' && !!record.attempt.solution.trim() ||
      typeof record.attempt.notes === 'string' && !!record.attempt.notes.trim());
  const linkedPractice = (state, jobId, problemId) => Array.isArray(state && state.practice)
    ? state.practice.find(item => item && item.jobId === jobId && item.problemId === problemId) || null : null;
  const eligibleJob = (state, jobId) => Array.isArray(state && state.jobs)
    ? state.jobs.find(job => job && job.id === jobId && job.status === 'Interview') || null : null;

  function verifiedCompanyReport(job, problem) {
    const report = companyReports.find(item => text(item.company) === text(job.company) && item.problemId === problem.id);
    if (!report || !/^https:\/\/leetcode\.com\/discuss\/post\/\d+\/[\w-]+\/?$/.test(report.url || '') ||
        !(report.publishedAt === 'Unknown' || (/^\d{4}-\d{2}(?:-\d{2})?$/.test(report.publishedAt || '') && Number.isFinite(Date.parse(report.publishedAt)))) ||
        !/^\d{4}-\d{2}$/.test(report.interviewDate || '') || !Number.isFinite(Date.parse(report.interviewDate)) ||
        !/^\d{4}-\d{2}-\d{2}$/.test(report.checkedAt || '') || !Number.isFinite(Date.parse(report.checkedAt)) || typeof report.quote !== 'string' ||
        report.quote.trim().split(/\s+/).length > 25 || !report.quote.trim()) return null;
    return { company: report.company, url: report.url, publishedAt: report.publishedAt, checkedAt: report.checkedAt,
      interviewDate: report.interviewDate, quote: report.quote, caveat: report.caveat };
  }

  function recommendations(state, jobId, recentWeaknesses = []) {
    const job = eligibleJob(state, jobId);
    if (!job || !Array.isArray(job.skills)) return [];
    const jobText = `${job.role} ${job.description} ${job.skills.join(' ')}`.toLowerCase();
    const weaknesses = (Array.isArray(recentWeaknesses) ? recentWeaknesses : []).filter(item => typeof item === 'string').slice(0, 10).map(text);
    return catalog.map((problem, index) => {
      const terms = patternTerms[problem.id];
      const roleTerms = terms.filter(term => jobText.includes(term));
      const weakTerms = terms.filter(term => weaknesses.some(weakness => weakness.includes(term)));
      const report = verifiedCompanyReport(job, problem);
      const practice = linkedPractice(state, jobId, problem.id);
      const completed = !!practice && practice.completed === true && hasAttemptEvidence(practice);
      const score = (roleTerms.length * 3) + (weakTerms.length * 5) + (report ? 100 : 0);
      const reason = report ? `A candidate-reported ${job.company} interview account mentions this problem.` :
        weakTerms.length ? `Practice ${problem.topic.toLowerCase()} to address the recent ${weakTerms[0]} feedback before your ${job.role} interview.` :
        roleTerms.length ? `${problem.topic} practice connects to ${roleTerms[0]} in the ${job.role} listing.` :
        `Build a core ${problem.topic.toLowerCase()} skill for the ${job.role} interview.`;
      return { problem, reason, basis: report ? 'company-reported' : 'role-practice', report,
        practiceId: practice ? practice.id : null, completed, score, index };
    }).sort((a, b) => b.score - a.score || a.index - b.index).slice(0, 5)
      .sort((a, b) => Number(a.completed) - Number(b.completed) || b.score - a.score || a.index - b.index)
      .map(({ score, index, ...item }) => item);
  }

  function startAttempt(state, jobId, problemId) {
    if (!Core || typeof Core.addPractice !== 'function' || !eligibleJob(state, jobId) || !byId.has(problemId)) return { id: null, created: false };
    const existing = linkedPractice(state, jobId, problemId);
    if (existing) return { id: existing.id, created: false };
    const problem = byId.get(problemId);
    if (!Core.addPractice(state, { title: problem.title, topic: problem.topic, difficulty: problem.difficulty })) return { id: null, created: false };
    const item = state.practice[state.practice.length - 1];
    item.jobId = jobId;
    item.problemId = problemId;
    item.completed = false;
    if (typeof Core.validateState === 'function' && !Core.validateState(state)) {
      state.practice.pop();
      return { id: null, created: false };
    }
    return { id: item.id, created: true };
  }

  function setCompleted(state, practiceId, completed = true) {
    if (typeof completed !== 'boolean' || !Array.isArray(state && state.practice)) return false;
    const practice = state.practice.find(item => item && item.id === practiceId);
    if (!practice || !byId.has(practice.problemId) || !eligibleJob(state, practice.jobId)) return false;
    if (completed && !hasAttemptEvidence(practice)) return false;
    practice.completed = completed;
    return true;
  }

  return { catalog, recommendations, startAttempt, setCompleted, companyReports };
});
