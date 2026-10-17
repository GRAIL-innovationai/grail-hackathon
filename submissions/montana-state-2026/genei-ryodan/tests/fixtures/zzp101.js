/* A small sample class pack used by the tests (and a template for real ones).
   ZZP 101 is not a real course. It exercises every part of the format: two section variants,
   exams with dates per section, every question type, formulas in TeX, and a few hostile strings
   that the cleaner must neutralise. Build it with: node scripts/make-pack.js tests/fixtures/zzp101.js --out tests/fixtures */
const days = (from, to, dows) => { const out = []; for (let d = new Date(from + 'T12:00:00Z'); d <= new Date(to + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + 1)) if (dows.includes(d.getUTCDay())) out.push(d.toISOString().slice(0, 10)); return out; };
const HOLIDAYS = ['2026-09-07', '2026-11-11', '2026-11-25', '2026-11-26', '2026-11-27'];
const TOPICS = [['intro', 'Data and sampling'], ['describe', 'Describing data'], ['prob', 'Probability'], ['normal', 'Normal distributions'], ['inference', 'Confidence intervals'], ['tests', 'Hypothesis tests']];
const lectures = sec => days('2026-08-24', '2026-12-11', sec === '1' ? [1, 3, 5] : [2, 4]).filter(d => !HOLIDAYS.includes(d)).map((d, i, all) => { const t = TOPICS[Math.min(TOPICS.length - 1, Math.floor(i * TOPICS.length / all.length))]; return [d, 'lecture', t[1], t[0], sec]; });

module.exports = {
  format: 'mathub-class-pack', version: 1,
  id: 'zzp101', code: 'ZZP 101', name: 'Sample Statistics', short: 'ZZP 101', term: 'Fall 2026', kind: 'math',
  tagline: 'A sample class pack: data, probability and inference',
  quizNote: 'Type numbers like 0.25 or 1/4. Answers within 0.5% count.',
  formulasNote: 'The formula sheet for the sample class.', filterExample: 'mean, z-score',
  color: { light: '#0F766E', dark: '#5EEAD4' },
  archetype: { name: 'Oracle', icon: 'orb', line: 'Sees the pattern in the noise.' },
  canvasMatch: ['ZZP 101', 'ZZP101'],
  guides: ['math-exam'],
  resources: [
    { t: 'OpenStax Introductory Statistics', u: 'https://openstax.org/details/books/introductory-statistics-2e', d: 'A free textbook that covers every topic.', k: 'reading', tags: ['textbook'], top: true },
    { t: 'Bad link', u: 'javascript:alert(1)', d: 'This one is unsafe and must not become a link.', k: 'tool' }
  ],
  COURSE: {
    code: 'ZZP 101', name: 'Sample Statistics', term: 'Fall 2026', school: 'Montana State University', credits: 3,
    instructor: 'Dr. Sample', instructorEmail: 'sample@montana.edu', officeHours: 'Mon 2–3 pm', lectures: 'Section 1 MWF 9:00 · Section 2 TR 10:50',
    classDays: 'MWF or TR', weeklyHours: 9, canvas: 'https://montana.instructure.com/', site: 'https://montana.instructure.com/',
    textbook: { title: 'OpenStax Introductory Statistics 2e (free)', url: 'https://openstax.org/details/books/introductory-statistics-2e' },
    links: [{ eyebrow: 'Course site', title: 'Canvas', url: 'https://montana.instructure.com/', desc: 'Homework and announcements.' }],
    helpCenter: { name: 'Math & Stat Center', where: 'Romney 220', hours: 'Mon–Thu 9–6' },
    deadlines: [{ name: 'Homework', rule: 'Due Fridays at 11:59 pm.' }, { name: 'Quizzes', rule: 'In class on exam review days.' }]
  },
  GRADING: {
    categories: [{ id: 'hw', name: 'Homework', weight: 25 }, { id: 'exam1', name: 'Exam 1', weight: 20 }, { id: 'exam2', name: 'Exam 2', weight: 20 }, { id: 'final', name: 'Final exam', weight: 35 }],
    finalId: 'final', note: 'The lowest homework is dropped.',
    scale: [{ letter: 'A', min: 93 }, { letter: 'A-', min: 90 }, { letter: 'B+', min: 87 }, { letter: 'B', min: 83 }, { letter: 'B-', min: 80 }, { letter: 'C+', min: 77 }, { letter: 'C', min: 73 }, { letter: 'C-', min: 70 }, { letter: 'D', min: 60 }, { letter: 'F', min: 0 }]
  },
  VARIANTS: { label: 'Your section', default: '1', hint: 'Puts your lecture days and exam dates on the calendar.', saved: 'Section saved.', options: [{ id: '1', label: 'Section 1 · MWF 9:00' }, { id: '2', label: 'Section 2 · TR 10:50' }] },
  EXAMS: [
    { id: 'exam1', n: 1, name: 'Exam 1', date: '2026-10-02', dates: { 1: '2026-10-02', 2: '2026-10-01' }, dateLabel: 'Fri Oct 2, in class', dateLabels: { 1: 'Fri Oct 2, in class', 2: 'Thu Oct 1, in class' }, covers: 'data, describing data and probability', sections: ['intro', 'describe', 'prob'], units: [1], weight: 20, format: 'Multiple choice and short answer, one page of notes allowed.' },
    { id: 'exam2', n: 2, name: 'Exam 2', date: '2026-11-06', covers: 'normal distributions and confidence intervals', sections: ['normal', 'inference'], units: [2], weight: 20 },
    { id: 'final', n: 3, name: 'Final exam', date: '2026-12-15', covers: 'everything, weighted toward hypothesis tests', sections: ['intro', 'describe', 'prob', 'normal', 'inference', 'tests'], units: [1, 2, 3], weight: 35 }
  ],
  CALENDAR: [].concat(lectures('1'), lectures('2'),
    HOLIDAYS.map(d => [d, 'holiday', 'No class']),
    [['2026-09-30', 'review', 'Exam 1 review'], ['2026-10-02', 'exam', 'Exam 1', '', '1'], ['2026-10-01', 'exam', 'Exam 1', '', '2'], ['2026-11-06', 'exam', 'Exam 2'], ['2026-12-15', 'exam', 'Final exam'], ['2026-09-02', 'admin', 'Last day to add']]
  ).sort((a, b) => a[0].localeCompare(b[0])),
  CALENDAR_NOTE: 'Pick your section in Settings to see your lecture days.',
  SEMESTER: { start: '2026-08-24', end: '2026-12-18' },
  RECURRING: [{ dows: [5], time: '11:59 pm', title: 'Homework due', from: '2026-08-28', skipHolidays: true }],
  UNITS: [{ n: 1, title: 'Data and chance', sections: ['intro', 'describe', 'prob'], exam: 'exam1' }, { n: 2, title: 'The normal model', sections: ['normal', 'inference'], exam: 'exam2' }, { n: 3, title: 'Testing claims', sections: ['tests'], exam: 'final' }],
  SECTIONS: [
    { id: 'intro', label: '1.1', title: 'Data and sampling', unit: 1, link: 'https://openstax.org/books/introductory-statistics-2e/pages/1-introduction', linkLabel: 'OpenStax chapter 1',
      ideas: ['A <b>population</b> is everyone you want to know about; a <b>sample</b> is who you measured.', 'Random sampling avoids <b>bias</b>: every member has a known chance of being chosen.', 'Hostile markup is removed: <script>window.__pwned = 1</script><img src=x onerror="window.__pwned = 2">this sentence stays.'],
      formulas: [], example: { p: 'A survey asks students leaving the gym how often they exercise. What is wrong?', s: 'It is a <b>convenience sample</b> that over-represents people who exercise.' }, pitfalls: ['Calling a large sample unbiased: size does not fix bias.'], tip: 'Ask who could not have been chosen.' },
    { id: 'describe', label: '1.2', title: 'Describing data', unit: 1, ideas: ['The <b>mean</b> is the balance point; the <b>median</b> is the middle value and resists outliers.', 'Standard deviation measures the typical distance from the mean.'], formulas: [{ n: 'Mean', t: '\\bar x = \\frac{1}{n}\\sum x_i' }] },
    { id: 'prob', label: '1.3', title: 'Probability', unit: 1, ideas: ['For independent events, <i>P</i>(A and B) = <i>P</i>(A)·<i>P</i>(B).', 'Complements: <i>P</i>(not A) = 1 − <i>P</i>(A).'] },
    { id: 'normal', label: '2.1', title: 'Normal distributions', unit: 2, ideas: ['About 68%, 95% and 99.7% of values fall within 1, 2 and 3 standard deviations of the mean.', 'A z-score counts standard deviations from the mean: z = (x − μ)/σ.'] },
    { id: 'inference', label: '2.2', title: 'Confidence intervals', unit: 2, ideas: ['An interval is estimate ± margin of error.', 'A 95% interval comes from a method that captures the truth 95% of the time.'] },
    { id: 'tests', label: '3.1', title: 'Hypothesis tests', unit: 3, ideas: ['The p-value is the chance of data this extreme if the null hypothesis were true.', 'Reject the null when p < α.'] }
  ],
  FORMULAS: [
    { group: 'Describing data', items: [{ n: 'Mean', t: '\\bar x = \\frac{1}{n}\\sum_{i=1}^{n} x_i' }, { n: 'z-score', t: 'z = \\frac{x - \\mu}{\\sigma}' }, { n: 'Reject when', t: 'p < \\alpha' }] },
    { group: 'Key terms', items: [{ n: 'Median', d: 'The middle value of the sorted data.' }, { n: 'Bias', d: 'A systematic error in <b>how</b> data are collected.' }, { n: 'p-value', d: 'P(data this extreme | H<sub>0</sub> true).' }] }
  ],
  FLASHCARDS: [
    { id: 'z-pop', unit: 1, sec: 'intro', f: 'Population vs sample?', b: 'Everyone of interest vs the people actually measured.' },
    { id: 'z-median', unit: 1, sec: 'describe', f: 'Which centre resists outliers?', b: 'The median.' },
    { id: 'z-indep', unit: 1, sec: 'prob', f: 'P(A and B) for independent events?', b: 'P(A)·P(B)' },
    { id: 'z-6895', unit: 2, sec: 'normal', f: 'The 68–95–99.7 rule?', b: 'Share of values within 1, 2 and 3 SDs of the mean.' },
    { id: 'z-ci', unit: 2, sec: 'inference', f: 'What does 95% confidence mean?', b: 'The method captures the true value 95% of the time.' },
    { id: 'z-pval', unit: 3, sec: 'tests', f: 'What is a p-value?', b: 'The chance of data this extreme if H<sub>0</sub> is true. <a href="javascript:alert(1)">bad link</a>' }
  ],
  PRACTICE: { exam1: { title: 'Exam 1 practice', subtitle: 'Try each, then reveal.', problems: [{ n: 1, sec: 'describe', tags: ['mean'], q: 'Find the mean of 2, 4, 9.', s: '15 / 3 = 5.' }, { n: 2, sec: 'prob', tags: ['independence'], q: 'Two fair coins: P(two heads)?', s: '1/2 · 1/2 = 1/4.' }] } },
  CHECKLISTS: { exam1: ['Tell a population from a sample', 'Compute a mean and a median', 'Multiply probabilities for independent events'] },
  INFO: [{ icon: 'info', title: 'Course facts', html: '<ul class="list-plain small"><li><b>Credits:</b> 3</li><li><b>Instructor:</b> Dr. Sample</li></ul>' }, { icon: 'nope', title: 'Policies', html: '<p>Late work loses 10% a day.</p>' }],
  QUIZ: {
    hint: 'Name the idea the question is testing first.',
    topics: { intro: { unit: 1, sec: 'intro', label: 'Data & sampling' }, describe: { unit: 1, sec: 'describe', label: 'Describing data' }, prob: { unit: 1, sec: 'prob', label: 'Probability' }, normal: { unit: 2, sec: 'normal', label: 'Normal model' }, inference: { unit: 2, sec: 'inference', label: 'Intervals' }, tests: { unit: 3, sec: 'tests', label: 'Tests' } },
    ladders: { prob: ['Are the events independent?', 'Multiply for "and", add for "or" when they cannot both happen.', 'Check the answer is between 0 and 1.'] },
    questions: [
      { type: 'bank', topic: 'intro', items: [
        ['Students leaving a gym are surveyed about exercise. This is a', 'convenience sample', ['simple random sample', 'census', 'stratified sample'], 'They were easy to reach, not randomly chosen.'],
        ['A larger sample fixes bias.', 'False', ['True'], 'Size reduces random error, not bias.'],
        ['Every member of the population has an equal chance of selection in a', 'simple random sample', ['convenience sample', 'voluntary response sample', 'quota sample'], 'That is the definition.']
      ] },
      { type: 'table', topic: 'describe', columns: ['Measure', 'Kind', 'Resists outliers'], rows: [['Mean', 'centre', 'no'], ['Median', 'centre', 'yes'], ['Standard deviation', 'spread', 'no'], ['IQR', 'spread', 'yes'], ['Range', 'spread', 'no']],
        asks: [{ prompt: 'Is the {{Measure}} a measure of centre or of spread?', answer: 'Kind', options: 2 }, { prompt: 'Which of these is a measure of {{Kind}}?', answer: 'Measure', explain: 'The {{Measure}} is a measure of {{Kind}}.' }] },
      { type: 'calc', topic: 'describe', vars: { a: { min: 1, max: 20 }, b: { min: 1, max: 20 }, c: { min: 1, max: 20 } }, let: { s: 'a + b + c' }, where: 's % 3 == 0', prompt: 'Find the mean of {{a}}, {{b}} and {{c}}.', answer: 's / 3', explain: '({{a}} + {{b}} + {{c}}) / 3 = {{s}} / 3 = {{answer}}.' },
      { type: 'calc', topic: 'prob', vars: { p: { min: 0.1, max: 0.9, step: 0.1 }, q: { min: 0.1, max: 0.9, step: 0.1 } }, prompt: 'Independent events A and B have P(A) = {{p}} and P(B) = {{q}}. Find P(A and B).', answer: 'round(p * q, 4)', explain: 'Multiply: {{p}} × {{q}} = {{answer}}.', tol: 0.001 },
      { type: 'calc-mc', topic: 'normal', vars: { mu: [50, 60, 70, 100], sd: [5, 10, 15], k: [-2, -1, 1, 2] }, let: { x: 'mu + k * sd' }, prompt: 'Scores have mean {{mu}} and standard deviation {{sd}}. What is the z-score of {{x}}?', answer: 'k', distractors: ['-k', 'k * 2', 'x / sd', 'k + 1'], format: 'z = {}', explain: 'z = ({{x}} − {{mu}}) / {{sd}} = {{answer}}.' },
      { type: 'calc-mc', topic: 'normal', vars: { band: [{ k: 1, pct: 68 }, { k: 2, pct: 95 }, { k: 3, pct: 99.7 }] }, prompt: 'About what share of a normal distribution lies within {{k}} standard deviation{{= k == 1 ? "" : "s"}} of the mean?', answer: 'pct', distractors: ['pct == 68 ? 95 : 68', 'pct == 99.7 ? 95 : 99.7', '50'], format: '{}%', explain: 'The 68–95–99.7 rule.' },
      { type: 'mc', topic: 'inference', prompt: 'A 95% confidence interval means', answer: 'the method captures the true value 95% of the time', distractors: ['there is a 95% chance the sample mean is inside', '95% of the data are inside', 'the true value moves 95% of the time'], explain: 'The confidence is in the method.' },
      { type: 'calc', topic: 'inference', vars: { m: [10, 20, 50], e: [1, 2, 5] }, prompt: 'An estimate is {{m}} with margin of error {{e}}. What is the upper end of the interval?', answer: 'm + e', explain: '{{m}} + {{e}} = {{answer}}.' },
      { type: 'bank', topic: 'tests', items: [['When p < α you', 'reject the null hypothesis', ['accept the null hypothesis', 'prove the alternative', 'change α'], 'Small p-values are evidence against the null.'], ['A p-value is the probability that the null is true.', 'False', ['True'], 'It is computed assuming the null is true.']] }
    ]
  }
};
