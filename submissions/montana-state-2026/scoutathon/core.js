(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.Core = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const STORAGE_KEY = 'career-demo.v1';
  const STATUSES = ['Available', 'Saved', 'Preparing', 'Applied', 'Interview', 'Offer', 'Accepted', 'Rejected'];
  const LIMITS = {
    profile: { name: 120, location: 160, target: 200, skills: 2000, resumeName: 240, resumeText: 20000 },
    job: { id: 100, company: 200, role: 200, location: 160, type: 100, description: 12000, resume: 12000, cover: 12000, outreach: 12000 },
    project: { id: 100, name: 200, url: 2048, notes: 5000 },
    practice: { id: 100, title: 240, topic: 160, difficulty: 20, date: 40 },
    task: { id: 100, title: 300 }
  };

  const SAMPLE_ATTEMPTS = {
    'practice-1': { title: 'Two Sum', language: 'JavaScript', solution: 'function twoSum(nums, target) {\n  const seen = new Map();\n  for (let i = 0; i < nums.length; i++) {\n    const complement = target - nums[i];\n    if (seen.has(complement)) return [seen.get(complement), i];\n    seen.set(nums[i], i);\n  }\n  return [];\n}', notes: 'Example approach: store each value with its index so the complement lookup stays constant time on average.', outcome: 'Demo example: solved with a one-pass hash map.', demo: true },
    'practice-2': { title: 'Valid Parentheses', language: 'Python', solution: 'def is_valid(text):\n    pairs = {\")\": \"(\", \"]\": \"[\", \"}\": \"{\"}\n    stack = []\n    for char in text:\n        if char in \"([{\":\n            stack.append(char)\n        elif not stack or stack.pop() != pairs.get(char):\n            return False\n    return not stack', notes: 'Example approach: push opening brackets, then match each closing bracket against the latest opener.', outcome: 'Demo example: stack approach recorded for review.', demo: true },
    'practice-3': { title: 'Merge Intervals', language: 'TypeScript', solution: 'function mergeIntervals(intervals: number[][]): number[][] {\n  const sorted = [...intervals].sort((a, b) => a[0] - b[0]);\n  const merged: number[][] = [];\n  for (const interval of sorted) {\n    const last = merged[merged.length - 1];\n    if (!last || interval[0] > last[1]) merged.push([...interval]);\n    else last[1] = Math.max(last[1], interval[1]);\n  }\n  return merged;\n}', notes: 'Example approach: sort by start, then extend the last merged range whenever the next range overlaps.', outcome: 'Demo example: sorted merge approach recorded for review.', demo: true }
  };

  function copySampleAttempt(item) {
    const sample = item && SAMPLE_ATTEMPTS[item.id];
    return sample && item.title === sample.title ? { language: sample.language, solution: sample.solution, notes: sample.notes, outcome: sample.outcome, demo: true } : null;
  }

  // Retained only to recognize untouched records from earlier demos.
  function legacySeed() {
    return {
      profile: {
        name: 'Alex Morgan', location: 'Bozeman, MT', target: 'Summer software engineering internship',
        skills: 'JavaScript, React, Node.js, Python, SQL, Git', resumeName: 'Alex-Morgan-Resume.pdf',
        resumeText: 'Alex Morgan — Computer Science student in Bozeman, Montana. Builds accessible web apps with JavaScript and React, and has experience with Node.js, Python, SQL, and Git.'
      },
      jobs: [
        { id: 'job-1', company: 'Northstar Labs', role: 'Frontend Engineering Intern', location: 'Remote', type: 'Internship', skills: ['JavaScript', 'React', 'Accessibility'], description: 'Build clear, accessible interfaces for research tools.', status: 'Available', resume: '', cover: '', outreach: '' },
        { id: 'job-2', company: 'Pinecone Systems', role: 'Software Engineering Intern', location: 'Bozeman, MT', type: 'Internship', skills: ['Python', 'SQL', 'Git'], description: 'Help improve internal data tools and developer workflows.', status: 'Available', resume: '', cover: '', outreach: '' },
        { id: 'job-3', company: 'Brightpath', role: 'Web Developer Intern', location: 'Remote', type: 'Internship', skills: ['React', 'CSS', 'TypeScript'], description: 'Support a small product team building education software.', status: 'Saved', resume: '', cover: '', outreach: '' },
        { id: 'job-4', company: 'Summit Civic Tech', role: 'Junior Software Intern', location: 'Bozeman, MT', type: 'Internship', skills: ['JavaScript', 'Node.js', 'APIs'], description: 'Prepare an application for a public service technology team.', status: 'Preparing', resume: '', cover: '', outreach: '' },
        { id: 'job-5', company: 'Fieldnote', role: 'Product Engineering Intern', location: 'Remote', type: 'Internship', skills: ['React', 'JavaScript', 'Testing'], description: 'Contribute UI improvements and product fixes.', status: 'Applied', resume: 'Alex-Morgan-Resume.pdf', cover: 'Drafted', outreach: 'Application submitted' },
        { id: 'job-6', company: 'Granite Analytics', role: 'Data Engineering Intern', location: 'Hybrid · Bozeman, MT', type: 'Internship', skills: ['Python', 'SQL', 'Data'], description: 'Interview with a team building tools for local organizations.', status: 'Interview', resume: 'Alex-Morgan-Resume.pdf', cover: 'Submitted', outreach: 'Interview scheduled' }
      ],
      projects: [
        { id: 'project-1', name: 'Campus Events Board', url: 'https://github.com/example/campus-events', notes: 'A small React project for finding student events.' },
        { id: 'project-2', name: 'Study Buddy API', url: 'https://example.com/study-buddy', notes: 'A sample API project using Node.js and SQL.' }
      ],
      practice: [
        { id: 'practice-1', title: 'Two Sum', topic: 'Arrays and hash maps', difficulty: 'Easy', date: '2026-10-14T18:00:00.000Z', attempt: copySampleAttempt({ id: 'practice-1', title: 'Two Sum' }) },
        { id: 'practice-2', title: 'Valid Parentheses', topic: 'Stacks', difficulty: 'Easy', date: '2026-10-15T18:00:00.000Z', attempt: copySampleAttempt({ id: 'practice-2', title: 'Valid Parentheses' }) },
        { id: 'practice-3', title: 'Merge Intervals', topic: 'Sorting', difficulty: 'Medium', date: '2026-10-16T18:00:00.000Z', attempt: copySampleAttempt({ id: 'practice-3', title: 'Merge Intervals' }) }
      ],
      tasks: [
        { id: 'task-1', title: 'Update resume bullets', done: false },
        { id: 'task-2', title: 'Review React fundamentals', done: true },
        { id: 'task-3', title: 'Ask a mentor for feedback', done: false }
      ]
    };
  }

  const REFERENCE_JOBS = [
    { company: 'Circleback', role: 'Software Engineering Intern (Summer 2027)', location: 'San Francisco, CA', skills: ['React', 'Electron', 'React Native', 'APIs'], description: 'Build features across database models, APIs, and web, desktop, and mobile interfaces. Work on meeting notes, search, and automations. The posting describes a screen and two online technical interviews.', url: 'https://jobs.ashbyhq.com/circleback/2bb6be67-d1a8-42f7-bb1b-64ee36bf613f' },
    { company: 'Primer', role: 'Spring/Summer 2027 Engineering Intern', location: 'San Francisco, CA · On-site', skills: ['TypeScript', 'Node.js', 'React', 'GraphQL', 'Postgres'], description: 'Build full-stack features for PrimerOS, used by schools. January, May, or June start; preferred commitment of four to eight months. Full-time, in-office internship five days per week.', url: 'https://jobs.ashbyhq.com/primer/edd1667b-6323-444a-adc1-40bae5b9a3b0' },
    { company: 'Pylon', role: 'Software Engineer, Intern', location: 'San Francisco, CA · On-site', skills: ['React', 'Go', 'GraphQL', 'AWS'], description: 'Build AI-enabled customer support product features in summer 2027. The posting seeks students graduating December 2026 through summer 2028; relevant projects and familiarity with its stack are bonuses.', url: 'https://jobs.ashbyhq.com/pylon-labs/fcea8b52-81f1-4b0c-b575-d7b180faec4d' },
    { company: 'Harvey', role: 'Software Engineering Intern (Summer 2027)', location: 'San Francisco, CA', skills: ['Python', 'TypeScript', 'JavaScript', 'Java', 'Go'], description: 'Work on application-layer and generative AI products during a 12- or 16-week internship. Requires previous internship experience and graduation December 2027 or later. The employer describes AI-assisted coding interviews.', url: 'https://jobs.ashbyhq.com/harvey/3a34578d-d42e-45bb-ac5c-0c3357e8cbb7' },
    { company: 'Harvey', role: 'Software Engineering Intern (Summer 2027)', location: 'New York, NY', skills: ['Python', 'TypeScript', 'JavaScript', 'Java', 'Go'], description: 'New York summer cohort working on AI products across frontend, backend, infrastructure, and applied AI teams. Previous internship experience required; graduation December 2027 or later. Languages listed are alternatives, not all mandatory.', url: 'https://jobs.ashbyhq.com/harvey/06d64648-b84b-48ae-94a2-d9c06dfdcb5d' },
    { company: 'Harvey', role: 'Software Engineering Intern (Winter 2027)', location: 'Toronto, Canada', skills: ['Python', 'TypeScript', 'JavaScript', 'Java', 'Go'], description: 'Toronto winter cohort contributing to AI products over 12 or 16 weeks. Requires previous internship experience, graduation December 2027 or later, and availability to work from the Toronto office.', url: 'https://jobs.ashbyhq.com/harvey/d40e15aa-2351-4be8-ac8f-1faf60bfcdbf' }
  ];
  const PRACTICE_LINKS = {
    'Two Sum': 'https://leetcode.com/problems/two-sum/',
    'Valid Parentheses': 'https://leetcode.com/problems/valid-parentheses/',
    'Merge Intervals': 'https://leetcode.com/problems/merge-intervals/'
  };
  function practiceUrl(title) { return Object.hasOwn(PRACTICE_LINKS, title) ? PRACTICE_LINKS[title] : ''; }

  function seed() {
    const state = legacySeed();
    state.jobs = REFERENCE_JOBS.map((job, index) => ({
      ...job, skills: [...job.skills], id: `job-${index + 1}`, type: 'Internship',
      status: state.jobs[index].status, resume: '', cover: '', outreach: '',
      demo: false, demoActivity: true, source: 'Employer posting · curated snapshot',
      sourceUrl: job.url, checkedAt: '2026-10-17', publishedAt: ''
    }));
    state.projects = [
      { id: 'project-1', name: 'freeCodeCamp (reference)', url: 'https://github.com/freeCodeCamp/freeCodeCamp', notes: 'External open-source learning platform and curriculum. Explore its contribution guide; this is not your portfolio work.', reference: true },
      { id: 'project-2', name: 'Express (reference)', url: 'https://github.com/expressjs/express', notes: 'External Node.js web framework. Study routing and tests; this is not your portfolio work.', reference: true }
    ];
    return state;
  }

  function refreshReferenceContent(state) {
    if (!validateState(state)) return false;
    const old = legacySeed(), next = seed();
    let changed = false;
    for (const field of ['jobs', 'projects']) {
      state[field] = state[field].map(item => {
        const previous = old[field].find(entry => entry.id === item.id);
        // A modified record, including materials or application stage, belongs to the user.
        if (!previous || JSON.stringify(previous) !== JSON.stringify(item)) return item;
        changed = true;
        return next[field].find(entry => entry.id === item.id);
      });
    }
    return changed;
  }

  function escape(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, character => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[character]);
  }

  function isRecord(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
  }

  function boundedString(value, max, nonempty) {
    return typeof value === 'string' && value.length <= max && (!nonempty || value.trim().length > 0);
  }

  function validDate(value) {
    return typeof value === 'string' && /^\d{4}-\d\d-\d\dT/.test(value) && Number.isFinite(Date.parse(value));
  }

  function validateState(data) {
    try {
      if (!isRecord(data) || !isRecord(data.profile)) return false;
      const p = data.profile;
      if (Object.hasOwn(p, 'background') && !boundedString(p.background, 6000, false)) return false;
      if (!Object.entries(LIMITS.profile).every(([key, max]) => boundedString(p[key], max, key === 'name'))) return false;
      if (!Array.isArray(data.jobs) || data.jobs.length > 500 || !Array.isArray(data.projects) || data.projects.length > 500 ||
          !Array.isArray(data.practice) || data.practice.length > 2000 || !Array.isArray(data.tasks) || data.tasks.length > 1000) return false;

      const uniqueRecords = (items, schema, check) => {
        const ids = new Set();
        return items.every(item => {
          if (!isRecord(item) || !boundedString(item.id, schema.id, true) || ids.has(item.id)) return false;
          ids.add(item.id);
          return Object.entries(schema).every(([key, max]) => boundedString(item[key], max, key === 'id')) && check(item);
        });
      };

      return uniqueRecords(data.jobs, LIMITS.job, job =>
        STATUSES.includes(job.status) && Array.isArray(job.skills) && job.skills.length <= 50 &&
        job.skills.every(skill => boundedString(skill, 100, true))) &&
        uniqueRecords(data.projects, LIMITS.project, () => true) &&
        uniqueRecords(data.practice, LIMITS.practice, item => validDate(item.date) && ['Easy', 'Medium', 'Hard'].includes(item.difficulty) &&
          (!Object.hasOwn(item, 'attempt') || validAttempt(item.attempt)) && validPracticeBinding(item)) &&
        uniqueRecords(data.tasks, LIMITS.task, item => typeof item.done === 'boolean');
    } catch (_) {
      return false;
    }
  }

  function validAttempt(attempt) {
    return isRecord(attempt) && Object.keys(attempt).every(key => ['language', 'solution', 'notes', 'outcome', 'demo'].includes(key)) &&
      boundedString(attempt.language, 60, false) && boundedString(attempt.solution, 12000, false) &&
      boundedString(attempt.notes, 2000, false) && boundedString(attempt.outcome, 500, false) &&
      typeof attempt.demo === 'boolean' && Boolean(attempt.language.trim() || attempt.solution.trim() || attempt.notes.trim() || attempt.outcome.trim());
  }

  function validPracticeBinding(item) {
    if (!['jobId', 'problemId', 'completed'].some(key => Object.hasOwn(item, key))) return true;
    return boundedString(item.jobId, 100, true) && boundedString(item.problemId, 100, true) &&
      typeof item.completed === 'boolean' && (!item.completed || (validAttempt(item.attempt) && !item.attempt.demo &&
        Boolean(item.attempt.solution.trim() || item.attempt.notes.trim())));
  }

  // Add examples to known seeded records in older workspaces without replacing saved user attempts.
  function attachSampleAttempts(state) {
    if (!validateState(state)) return false;
    let changed = false;
    for (const item of state.practice) {
      if (Object.hasOwn(item, 'attempt')) continue;
      const sample = copySampleAttempt(item);
      if (sample) { item.attempt = sample; changed = true; }
    }
    return changed;
  }

  function load(storage) {
    try {
      if (!storage || typeof storage.getItem !== 'function') return seed();
      const raw = storage.getItem(STORAGE_KEY);
      if (raw == null) return seed();
      const data = JSON.parse(raw);
      return validateState(data) ? data : seed();
    } catch (_) {
      return seed();
    }
  }

  function save(storage, state) {
    try {
      if (!storage || typeof storage.setItem !== 'function' || !validateState(state)) return false;
      storage.setItem(STORAGE_KEY, JSON.stringify(state));
      return true;
    } catch (_) {
      return false;
    }
  }

  function removeJob(state, id) {
    if (!validateState(state)) return false;
    const index = state.jobs.findIndex(job => job.id === id);
    if (index < 0) return false;
    const job = state.jobs[index];
    if (seed().jobs.some(reference => reference.id === job.id && reference.url === job.url)) {
      Object.assign(job, { status: 'Available', resume: '', cover: '', outreach: '', demoActivity: false });
      return true;
    }
    state.jobs.splice(index, 1);
    return true;
  }

  function transition(state, id, status) {
    if (!validateState(state) || !STATUSES.includes(status)) return false;
    const job = state.jobs.find(item => item.id === id);
    if (!job) return false;
    job.status = status;
    return true;
  }

  function match(job, profile) {
    const required = job && Array.isArray(job.skills) ? job.skills : [];
    const profileSkills = profile && typeof profile.skills === 'string'
      ? profile.skills.split(/[,;\n|]+/).map(skill => skill.trim().toLocaleLowerCase()).filter(Boolean)
      : [];
    const matched = [];
    const missing = [];
    for (const skill of required) {
      if (typeof skill !== 'string' || !skill.trim()) continue;
      (profileSkills.includes(skill.trim().toLocaleLowerCase()) ? matched : missing).push(skill);
    }
    const label = !required.length || !matched.length ? 'Explore fit'
      : matched.length / required.length >= 2 / 3 ? 'Strong alignment' : 'Some alignment';
    return { matched, missing, label };
  }

  function safeRepoUrl(raw) {
    if (typeof raw !== 'string' || !/^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/?$/i.test(raw)) return null;
    try {
      const url = new URL(raw);
      if (url.protocol !== 'https:' || url.hostname.toLowerCase() !== 'github.com' || url.username || url.password || url.port || url.search || url.hash) return null;
      return url.href;
    } catch (_) {
      return null;
    }
  }

  function addTask(state, title) {
    if (!validateState(state) || !boundedString(title, LIMITS.task.title, true) || state.tasks.length >= 1000) return false;
    const ids = new Set(state.tasks.map(item => item.id));
    let id;
    do { id = `task-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`; } while (ids.has(id));
    state.tasks.unshift({ id, title: title.trim(), done: false });
    return true;
  }

  function addPractice(state, input) {
    const hasAttempt = isRecord(input) && (Object.hasOwn(input, 'attempt') || ['language', 'solution', 'notes', 'outcome'].some(key => Object.hasOwn(input, key)));
    const suppliedAttempt = isRecord(input) && Object.hasOwn(input, 'attempt') ? input.attempt : input;
    const attempt = hasAttempt && isRecord(suppliedAttempt) ? {
      language: suppliedAttempt.language || '', solution: suppliedAttempt.solution || '', notes: suppliedAttempt.notes || '',
      outcome: suppliedAttempt.outcome || '', demo: false
    } : null;
    if (!validateState(state) || !isRecord(input) ||
        !boundedString(input.title, LIMITS.practice.title, true) ||
        !boundedString(input.topic, LIMITS.practice.topic, true) ||
        !['Easy', 'Medium', 'Hard'].includes(input.difficulty) || state.practice.length >= 2000 ||
        (hasAttempt && (!attempt || !validAttempt(attempt) || (Object.hasOwn(input, 'attempt') && input.attempt.demo === true)))) return false;
    const ids = new Set(state.practice.map(item => item.id));
    let id;
    do { id = `practice-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`; } while (ids.has(id));
    const item = { id, title: input.title.trim(), topic: input.topic.trim(), difficulty: input.difficulty, date: new Date().toISOString() };
    if (hasAttempt) item.attempt = attempt;
    state.practice.push(item);
    return true;
  }

  function savePracticeAttempt(state, id, input) {
    if (!validateState(state) || !isRecord(input) || typeof id !== 'string' ||
        !boundedString(input.language, 60, false) || !boundedString(input.solution, 12000, false) ||
        !boundedString(input.notes, 2000, false) || !boundedString(input.outcome, 500, false) ||
        !(input.language.trim() || input.solution.trim() || input.notes.trim() || input.outcome.trim())) return false;
    const item = state.practice.find(entry => entry.id === id);
    if (!item) return false;
    item.attempt = { language: input.language.trim(), solution: input.solution, notes: input.notes.trim(), outcome: input.outcome.trim(), demo: false };
    if (item.completed === true && !item.attempt.solution.trim() && !item.attempt.notes.trim()) item.completed = false;
    return true;
  }

  return { STORAGE_KEY, STATUSES, seed, escape, validateState, load, save, removeJob, transition, match, safeRepoUrl, addTask, addPractice, savePracticeAttempt, attachSampleAttempts, refreshReferenceContent, practiceUrl };
});
