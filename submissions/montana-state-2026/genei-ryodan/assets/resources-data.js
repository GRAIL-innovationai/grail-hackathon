/* ============================================================
   Mathub — resources
   Curated links for every class, for Montana State and for studying
   in general. Each item: g (group), t (title), u (url), d (one line),
   k (kind: video, practice, tool, reading, reference, msu, community,
   app, wellbeing), tags, and top (shown first). "in" links point into
   Mathub itself. Add an item and it appears in the app and on the
   static resources page (node scripts/build-seo.js).
   ============================================================ */
(function (global) {
  'use strict';
  const KINDS = { video: 'Videos', practice: 'Practice', tool: 'Tools', reading: 'Free books & notes', reference: 'Reference', msu: 'Montana State', community: 'Community', app: 'Apps', wellbeing: 'Wellbeing' };
  const GROUPS = [
    { id: 'general', title: 'Every class', blurb: 'The tools and habits that raise grades in any class: retrieval practice, spaced review, focus, and the sites everyone ends up using.' },
    { id: 'msu', title: 'At Montana State', blurb: 'Free help on campus that most students never use: tutoring, the Writing Center, the library, counseling and accommodations.' },
    { id: 'calc', title: 'Calculus I · M171', blurb: 'Active Calculus is the class text; these fill the gaps with videos, worked problems and answer checkers.' },
    { id: 'physics', title: 'Physics I · PHSX 220', blurb: 'Free textbook, simulations you can push around, and the video channels that explain problems the way a good TA would.' },
    { id: 'precalc', title: 'Precalculus · M151Q', blurb: 'Algebra and trig refreshers, unit-circle drills, and graphing tools for functions.' },
    { id: 'writ', title: 'College Writing · WRIT 101', blurb: 'Citation guides, editing tools, pronunciation help and the campus Writing Center.' },
    { id: 'csci', title: 'Joy and Beauty of Data · CSCI 127', blurb: 'Python from the official docs down to visual debuggers, practice sites and the libraries the class uses.' },
    { id: 'biob', title: 'Principles of Living Systems · BIOB 160', blurb: 'A free textbook that follows the same chapters, animations for the molecular parts, and genetics practice.' },
    { id: 'kin', title: 'Kinesiology · KIN 322', blurb: 'Free anatomy references, region-by-region videos and quizzes, and the spinal cord injury standards.' },
    { id: 'psyx', title: 'Psychological Disorders · PSYX 340', blurb: 'Reliable information on each disorder, research and citation help for your papers, and where to get support.' },
    { id: 'wellbeing', title: 'Sleep, stress, help', blurb: 'The unglamorous things that matter more than any study hack. If you are struggling, the people below want to hear from you.' }
  ];
  const I = [];
  const add = (g, t, u, d, k, tags = [], top = false) => I.push({ g, t, u, d, k, tags, top });

  /* ---------- every class ---------- */
  add('general', 'Today in Mathub', '#/today', 'Your daily plan: due flashcards, one lesson, the challenge and deadlines, across every class.', 'tool', ['mathub'], true);
  add('general', 'Focus room', '#/focus', 'A 25, 50 or 90-minute timer with a task, sounds and a session log that feeds your streak and XP.', 'tool', ['mathub', 'focus'], true);
  add('general', 'Study skills guides', '#/guides', 'Short, practical guides written for these classes: how to study for a math exam, active recall, office hours, test anxiety.', 'reading', ['mathub', 'guides'], true);
  add('general', 'Khan Academy', 'https://www.khanacademy.org/', 'Free video lessons and practice for every math and science topic in these classes, with mastery tracking.', 'video', ['math', 'physics', 'free'], true);
  add('general', 'Wolfram|Alpha', 'https://www.wolframalpha.com/', 'Type any math or physics question and get the answer with steps (steps need the paid tier; answers are free). Use it to check, not to skip the work.', 'tool', ['math', 'physics', 'checker'], true);
  add('general', 'Desmos graphing calculator', 'https://www.desmos.com/calculator', 'The fastest way to see a function, a derivative, a limit or a data set. Sliders make parameters come alive.', 'tool', ['math', 'graphs'], true);
  add('general', 'Desmos scientific calculator', 'https://www.desmos.com/scientific', 'A clean scientific calculator in the browser (also in Mathub Tools).', 'tool', ['calculator']);
  add('general', 'GeoGebra', 'https://www.geogebra.org/', 'Interactive geometry, graphing, 3D and calculus applets; thousands of ready-made demos for unit circle, derivatives and vectors.', 'tool', ['math', 'graphs']);
  add('general', 'Symbolab', 'https://www.symbolab.com/', 'Step-by-step solutions for algebra, calculus and trig. Good for checking a derivative or integral after you have tried it.', 'tool', ['math', 'checker']);
  add('general', 'OpenStax', 'https://openstax.org/', 'Peer-reviewed, completely free college textbooks: University Physics, Precalculus, Calculus, Statistics and more.', 'reading', ['free', 'textbook'], true);
  add('general', 'LibreTexts', 'https://libretexts.org/', 'A huge open library of textbooks and worked examples in math, physics, chemistry and computer science.', 'reading', ['free', 'textbook']);
  add('general', 'MIT OpenCourseWare', 'https://ocw.mit.edu/', 'Full MIT courses with lecture videos, problem sets and exams with solutions. Single-variable calculus and classical mechanics map closely to M171 and PHSX 220.', 'video', ['lectures', 'free']);
  add('general', 'Anki', 'https://apps.ankiweb.net/', 'The classic spaced-repetition flashcard app (free on desktop and Android). Mathub flashcards use the same idea; Anki is for building your own decks in any class.', 'app', ['flashcards', 'spaced repetition']);
  add('general', 'Quizlet', 'https://quizlet.com/', 'Shared flashcard sets for almost any textbook chapter; search your class name plus the chapter.', 'app', ['flashcards']);
  add('general', 'Retrieval Practice', 'https://www.retrievalpractice.org/', 'The research behind why testing yourself beats rereading, with free guides for students.', 'reading', ['study skills']);
  add('general', 'Learning How to Learn (free course)', 'https://www.coursera.org/learn/learning-how-to-learn', 'The most-taken online course ever: focused vs. diffuse thinking, chunking, procrastination and memory, in short videos.', 'video', ['study skills']);
  add('general', 'Cornell note-taking system', 'https://lsc.cornell.edu/how-to-study/taking-notes/cornell-note-taking-system/', 'The two-column notes method that turns lecture notes into a self-quiz. Cornell explains it in one page.', 'reading', ['notes', 'study skills']);
  add('general', 'Pomofocus', 'https://pomofocus.io/', 'A minimal Pomodoro timer with tasks, if you want one outside Mathub.', 'app', ['focus']);
  add('general', 'Forest', 'https://www.forestapp.cc/', 'Plant a tree that dies if you leave the app: the phone-blocking focus timer that actually works for a lot of people.', 'app', ['focus', 'phone']);
  add('general', 'Lofi Girl', 'https://www.youtube.com/@LofiGirl', 'Endless study music streams. Mathub focus sounds and your own MP3s live in the sound bubble.', 'video', ['music', 'focus']);
  add('general', 'Google Scholar', 'https://scholar.google.com/', 'Search academic papers and books; the "cite" button gives you MLA and APA formats instantly.', 'tool', ['research', 'citations']);
  add('general', 'Zotero', 'https://www.zotero.org/', 'Free reference manager: save sources with one click and generate a bibliography in any style.', 'app', ['research', 'citations']);
  add('general', 'ZoteroBib', 'https://zbib.org/', 'Paste a URL, ISBN or DOI and get a formatted citation, no account needed.', 'tool', ['citations'], true);
  add('general', 'Purdue OWL', 'https://owl.purdue.edu/owl/purdue_owl.html', 'The reference for MLA and APA formatting, grammar and every kind of academic writing.', 'reference', ['writing', 'citations'], true);
  add('general', 'Crash Course', 'https://www.youtube.com/@crashcourse', 'Fast, funny overviews of physics, computer science, statistics and study skills.', 'video', ['overview']);
  add('general', 'Stack Exchange: Mathematics', 'https://math.stackexchange.com/', 'Ask a precise math question and get a careful answer; search first, most questions have been asked.', 'community', ['math', 'q&a']);
  add('general', 'Physics Stack Exchange', 'https://physics.stackexchange.com/', 'Conceptual physics questions answered by people who teach it.', 'community', ['physics', 'q&a']);
  add('general', 'Mathub discussions', '#/forum', 'Your classmates, this semester, these exact assignments. Ask, answer, form a study group.', 'community', ['mathub'], true);
  add('general', 'Mathub tools', '#/tools', 'Scientific calculator, unit converter, citation builder, word counter and significant figures, all offline.', 'tool', ['mathub'], true);

  /* ---------- Montana State ---------- */
  add('msu', 'Office of Student Success', 'https://www.montana.edu/success/', 'Free tutoring, academic coaching, study-skills workshops and the people to talk to when a semester goes sideways.', 'msu', ['tutoring', 'coaching'], true);
  add('msu', 'Free tutoring (Smarty Cats)', 'https://www.montana.edu/success/tutoring/', 'Drop-in and appointment tutoring for math, physics, writing and more, run through Student Success. Check the current schedule and rooms.', 'msu', ['tutoring'], true);
  add('msu', 'Math Learning Center', 'https://www.montana.edu/math/undergraduate/mlc.html', 'The Math department help room for M151Q and M171: instructors and TAs on duty, no appointment. Confirm hours on the page.', 'msu', ['math', 'tutoring'], true);
  add('msu', 'Writing Center', 'https://www.montana.edu/writingcenter/', 'One-on-one help with any paper at any stage, in person or online. Book early before WRIT 101 deadlines.', 'msu', ['writing'], true);
  add('msu', 'MSU Library', 'https://www.lib.montana.edu/', 'Study rooms you can reserve, research help chat, textbooks on reserve, and quiet floors.', 'msu', ['library', 'study space'], true);
  add('msu', 'Counseling & Psychological Services', 'https://www.montana.edu/counseling/', 'Free, confidential counseling for students, plus workshops on stress and test anxiety. Same-day options exist.', 'msu', ['mental health'], true);
  add('msu', 'Office of Disability Services', 'https://www.montana.edu/disabilityservices/', 'Accommodations such as extended exam time, note-taking support and quiet testing rooms. Register early in the semester.', 'msu', ['accommodations']);
  add('msu', 'Registrar and academic calendar', 'https://www.montana.edu/registrar/', 'Add/drop and withdrawal deadlines, finals schedule, registration dates. Mathub calendars mirror the class ones, but this is the source.', 'msu', ['deadlines']);
  add('msu', 'MyInfo', 'https://myinfo.montana.edu/', 'Grades, registration, transcripts, financial aid and your class schedule.', 'msu', ['grades', 'registration']);
  add('msu', 'Student Health Partners', 'https://www.montana.edu/health/', 'Medical care, dental and wellness on campus; sick notes and flu shots live here too.', 'msu', ['health']);
  add('msu', 'Financial Aid', 'https://www.montana.edu/finaid/', 'Scholarships, emergency funds and questions about aid.', 'msu', ['money']);
  add('msu', 'MSU Bookstore', 'https://www.msubookstore.org/', 'Textbook rentals and buybacks; compare with the free OpenStax and Active Calculus editions first.', 'msu', ['textbooks']);
  add('msu', 'Campus Recreation', 'https://www.montana.edu/recreation/', 'The fitness center, climbing wall and intramurals. A workout the day before an exam beats a fourth hour of cramming.', 'msu', ['fitness']);
  add('msu', 'Streamline bus', 'https://streamlinebus.com/', 'Free buses around Bozeman with live tracking.', 'msu', ['transport']);

  /* ---------- Calculus I ---------- */
  add('calc', 'Active Calculus (the class text)', 'https://activecalculus.org/single/', 'The free, interactive textbook M171 follows, with preview activities and WeBWorK-style exercises per section.', 'reading', ['textbook', 'free'], true);
  add('calc', "Paul's Online Math Notes: Calculus I", 'https://tutorial.math.lamar.edu/Classes/CalcI/CalcI.aspx', 'The clearest written explanations on the internet, with worked examples and practice problems that have solutions.', 'reading', ['notes', 'worked examples'], true);
  add('calc', "Paul's calculus cheat sheet (PDF)", 'https://tutorial.math.lamar.edu/pdf/calculus_cheat_sheet_all.pdf', 'Four pages of every rule and identity you will use this semester.', 'reference', ['formulas', 'pdf'], true);
  add('calc', 'Khan Academy: Calculus 1', 'https://www.khanacademy.org/math/calculus-1', 'Limits, derivatives, applications and integrals with exercises that give instant feedback.', 'video', ['lessons', 'practice'], true);
  add('calc', 'Professor Leonard', 'https://www.youtube.com/@ProfessorLeonard', 'Full-length calculus lectures that are slower and clearer than most in-person lectures. Watch at 1.5x.', 'video', ['lectures'], true);
  add('calc', '3Blue1Brown: Essence of Calculus', 'https://www.youtube.com/playlist?list=PLZHQObOWTQDMsr9K-rj53DwVRMYO3t5Yr', 'Twelve short videos that make derivatives, the chain rule and integrals feel obvious. Watch before each unit.', 'video', ['intuition'], true);
  add('calc', 'The Organic Chemistry Tutor', 'https://www.youtube.com/@TheOrganicChemistryTutor', 'Dozens of worked problems per topic, exactly the kind that show up on exams.', 'video', ['worked examples']);
  add('calc', 'PatrickJMT', 'https://www.youtube.com/@patrickjmt', 'Short, focused problem walkthroughs; search the channel for the exact technique.', 'video', ['worked examples']);
  add('calc', 'blackpenredpen', 'https://www.youtube.com/@blackpenredpen', 'Tricky limits, integrals and derivatives solved with real enthusiasm.', 'video', ['problems']);
  add('calc', 'MIT 18.01 Single Variable Calculus', 'https://ocw.mit.edu/courses/18-01sc-single-variable-calculus-fall-2010/', 'Complete course with problem sets and exams (with solutions) for extra exam practice.', 'practice', ['exams', 'problem sets']);
  add('calc', 'Derivative Calculator', 'https://www.derivative-calculator.net/', 'Shows the steps of a derivative, including which rule was used where. Check your homework, then close it.', 'tool', ['checker']);
  add('calc', 'Integral Calculator', 'https://www.integral-calculator.com/', 'Same idea for integrals, with the substitution or parts steps spelled out.', 'tool', ['checker']);
  add('calc', 'Desmos: derivative explorer', 'https://www.desmos.com/calculator', 'Type f(x) and then d/dx f(x) to watch the derivative graph track the slope. Great for the units 1 and 2 concept questions.', 'tool', ['graphs']);
  add('calc', 'Mathub grapher and labs', '#/calc/grapher', 'Secant-to-tangent, Riemann sums, area functions and more, built for this class.', 'tool', ['mathub']);
  add('calc', 'Mathub endless practice', '#/calc/practice', 'Procedural questions per topic with worked solutions and hint ladders.', 'practice', ['mathub'], true);

  /* ---------- Physics I ---------- */
  add('physics', 'OpenStax University Physics Volume 1', 'https://openstax.org/details/books/university-physics-volume-1', 'The free textbook for the mechanics half of the course: read the summary and try the end-of-chapter problems (answers to odds are included).', 'reading', ['textbook', 'free'], true);
  add('physics', 'PhET simulations', 'https://phet.colorado.edu/en/simulations/filter?subjects=physics', 'Drag-and-play simulations for projectiles, forces, energy, momentum and pendulums. Ten minutes with one beats an hour of rereading.', 'tool', ['simulations'], true);
  add('physics', 'Khan Academy: Physics', 'https://www.khanacademy.org/science/physics', 'Kinematics through rotation with practice questions.', 'video', ['lessons', 'practice'], true);
  add('physics', 'Flipping Physics', 'https://www.youtube.com/@FlippingPhysics', 'Every AP/intro mechanics topic as a short, careful lesson, with the common mistakes called out.', 'video', ['lessons'], true);
  add('physics', 'Michel van Biezen', 'https://www.youtube.com/@MichelvanBiezen', 'Thousands of worked physics problems organized by topic; find the one that looks like your homework.', 'video', ['worked examples'], true);
  add('physics', 'MIT 8.01 Classical Mechanics', 'https://ocw.mit.edu/courses/8-01sc-classical-mechanics-fall-2016/', 'Problem sets, worked solutions and exams from MIT for extra practice with a bit more depth.', 'practice', ['problem sets', 'exams']);
  add('physics', 'HyperPhysics', 'http://hyperphysics.phy-astr.gsu.edu/hbase/index.html', 'A concept map of all of physics: click a topic, get the formulas and the connections on one page.', 'reference', ['formulas', 'concepts']);
  add('physics', 'The Physics Classroom', 'https://www.physicsclassroom.com/', 'Tutorials and interactive exercises written for first-year physics, strong on free-body diagrams.', 'reading', ['tutorials']);
  add('physics', 'Isaac Physics', 'https://isaacphysics.org/', 'Free problem sets with hints that scale up in difficulty; excellent for exam-style numerical questions.', 'practice', ['problems']);
  add('physics', 'Crash Course Physics', 'https://www.youtube.com/playlist?list=PL8dPuuaLjXtN0ge7yDk_UA0ldZJdhwkoV', 'Ten-minute overviews for each unit before you dive into problems.', 'video', ['overview']);
  add('physics', 'Wolfram|Alpha unit conversions', 'https://www.wolframalpha.com/', 'Type "72 km/h in m/s" or "0.5 hp in watts". Mathub Tools has a converter that works offline.', 'tool', ['units']);
  add('physics', 'Mathub motion lab and solvers', '#/physics/motion', 'Projectiles, motion graphs and the equation solvers built for PHSX 220.', 'tool', ['mathub'], true);
  add('physics', 'Mathub endless practice', '#/physics/practice', 'Numerical and conceptual questions per topic with full solutions.', 'practice', ['mathub'], true);

  /* ---------- Precalculus ---------- */
  add('precalc', 'Khan Academy: Precalculus', 'https://www.khanacademy.org/math/precalculus', 'Functions, exponentials, logs, trig and vectors with instant-feedback practice.', 'video', ['lessons', 'practice'], true);
  add('precalc', "Paul's Online Notes: Algebra and Trig", 'https://tutorial.math.lamar.edu/Classes/Alg/Alg.aspx', 'Written explanations with worked examples for every algebra topic that trips people up in calculus.', 'reading', ['notes'], true);
  add('precalc', "Paul's trig cheat sheet (PDF)", 'https://tutorial.math.lamar.edu/pdf/trig_cheat_sheet.pdf', 'Unit circle, identities, formulas: two pages to print and keep.', 'reference', ['formulas', 'pdf'], true);
  add('precalc', 'OpenStax Precalculus 2e', 'https://openstax.org/details/books/precalculus-2e', 'A full free textbook with practice problems and answers.', 'reading', ['textbook', 'free']);
  add('precalc', 'Professor Leonard: Precalculus', 'https://www.youtube.com/@ProfessorLeonard', 'Long, patient lectures on functions and trig.', 'video', ['lectures']);
  add('precalc', 'Mathispower4u', 'https://www.youtube.com/@Mathispower4u', 'Thousands of five-minute examples, one problem type each. Search "Mathispower4u" plus the topic.', 'video', ['worked examples'], true);
  add('precalc', 'Purplemath', 'https://www.purplemath.com/', 'Plain-language algebra lessons for when a textbook explanation is not landing.', 'reading', ['lessons']);
  add('precalc', 'Math is Fun', 'https://www.mathsisfun.com/', 'Friendly explanations with interactive diagrams for functions, logs and trig.', 'reading', ['lessons']);
  add('precalc', 'Desmos', 'https://www.desmos.com/calculator', 'Graph transformations, inverse functions and trig graphs with sliders.', 'tool', ['graphs'], true);
  add('precalc', 'GeoGebra unit circle', 'https://www.geogebra.org/search/unit%20circle', 'Interactive unit circles to drill angles, radians and the six trig values.', 'tool', ['unit circle']);
  add('precalc', 'Mathub unit circle and explorer', '#/precalc/unitcircle', 'Drill the unit circle and explore function families built for M151Q.', 'tool', ['mathub'], true);
  add('precalc', 'Mathub endless practice', '#/precalc/practice', 'Questions per topic with worked solutions.', 'practice', ['mathub'], true);

  /* ---------- College Writing ---------- */
  add('writ', 'MSU Writing Center', 'https://www.montana.edu/writingcenter/', 'Free tutors for every stage of a WRIT 101 project, from brainstorming to a final polish. Book before deadline weeks fill up.', 'msu', ['tutoring'], true);
  add('writ', 'Purdue OWL: MLA formatting', 'https://owl.purdue.edu/owl/research_and_citation/mla_style/mla_formatting_and_style_guide/mla_formatting_and_style_guide.html', 'Headers, in-text citations and the Works Cited page, with examples for every source type.', 'reference', ['mla', 'citations'], true);
  add('writ', 'Purdue OWL: APA style', 'https://owl.purdue.edu/owl/research_and_citation/apa_style/apa_formatting_and_style_guide/general_format.html', 'The same for APA 7, used by many other MSU classes.', 'reference', ['apa', 'citations']);
  add('writ', 'ZoteroBib', 'https://zbib.org/', 'Paste a link or ISBN and get the MLA or APA citation. Mathub Tools has a citation builder too.', 'tool', ['citations'], true);
  add('writ', 'Hemingway Editor', 'https://hemingwayapp.com/', 'Highlights long sentences, passive voice and adverbs. Run a draft through it once, then decide what to keep.', 'tool', ['editing'], true);
  add('writ', 'Grammarly', 'https://www.grammarly.com/', 'Grammar and clarity checks in the browser and in Docs; the free tier catches most slips.', 'tool', ['editing']);
  add('writ', 'LanguageTool', 'https://languagetool.org/', 'An open-source grammar checker, good for writers whose first language is not English.', 'tool', ['editing']);
  add('writ', 'UNC Writing Center handouts', 'https://writingcenter.unc.edu/tips-and-tools/', 'Two-page handouts on thesis statements, introductions, transitions, revising and every essay genre.', 'reading', ['handouts'], true);
  add('writ', 'Harvard: Strategies for essay writing', 'https://writingcenter.fas.harvard.edu/pages/strategies-essay-writing', 'How to outline, argue and conclude, from a college writing program.', 'reading', ['essays']);
  add('writ', 'Merriam-Webster', 'https://www.merriam-webster.com/', 'Definitions with audio pronunciations and usage notes.', 'reference', ['dictionary']);
  add('writ', 'Thesaurus.com', 'https://www.thesaurus.com/', 'Find the precise word; check it in the dictionary before using it.', 'reference', ['words']);
  add('writ', 'YouGlish', 'https://youglish.com/', 'Hear any English word pronounced in real YouTube clips, in American or British accents. Pairs with the Phonetics Lab.', 'tool', ['pronunciation'], true);
  add('writ', 'Forvo', 'https://forvo.com/', 'Native speakers pronouncing words in hundreds of languages.', 'tool', ['pronunciation']);
  add('writ', 'Project Gutenberg', 'https://www.gutenberg.org/', 'Seventy thousand free classic books to read for pleasure or to pull examples from.', 'reading', ['books']);
  add('writ', 'Mathub Phonetics Lab', '#/writ/phonetics', 'Practice sounds, minimal pairs, IPA symbols and transcription with instant feedback.', 'tool', ['mathub', 'pronunciation'], true);
  add('writ', 'Mathub read-along readings', '#/writ/readings', 'The class readings read aloud with highlighting, at your speed.', 'tool', ['mathub'], true);

  /* ---------- CSCI 127 ---------- */
  add('csci', 'Python documentation', 'https://docs.python.org/3/', 'The official reference. The Tutorial section is genuinely readable; the Library Reference is where you look things up.', 'reference', ['docs'], true);
  add('csci', 'The Python Tutorial', 'https://docs.python.org/3/tutorial/', 'Chapters 3 to 9 cover everything CSCI 127 does, in the same order.', 'reading', ['docs', 'tutorial'], true);
  add('csci', 'Python Tutor', 'https://pythontutor.com/', 'Paste code and step through it line by line, watching variables and the call stack. The single best tool for understanding loops, functions and lists.', 'tool', ['visualizer', 'debugging'], true);
  add('csci', 'Mathub code playground', '#/csci/playground', 'Run Python in the browser with input(), turtle drawings and matplotlib charts, right next to the notes.', 'tool', ['mathub'], true);
  add('csci', 'W3Schools Python', 'https://www.w3schools.com/python/', 'Short pages with a "Try it yourself" editor for every language feature.', 'reading', ['tutorial', 'reference'], true);
  add('csci', 'Automate the Boring Stuff with Python', 'https://automatetheboringstuff.com/', 'A free book that teaches Python by doing useful things: files, spreadsheets, web pages.', 'reading', ['book', 'free'], true);
  add('csci', 'Think Python (2nd edition)', 'https://greenteapress.com/wp/think-python-2e/', 'A free, careful introduction to programming with Python, with exercises.', 'reading', ['book', 'free']);
  add('csci', 'Real Python', 'https://realpython.com/', 'In-depth tutorials on specific topics (f-strings, list comprehensions, classes) when the short version is not enough.', 'reading', ['tutorials']);
  add('csci', 'Corey Schafer', 'https://www.youtube.com/@coreyms', 'The best Python video tutorials for beginners: clear, well-paced, with real examples.', 'video', ['tutorials'], true);
  add('csci', "Harvard CS50's Introduction to Programming with Python", 'https://cs50.harvard.edu/python/', 'Free course with lectures and graded problem sets that line up with CSCI 127 topics.', 'video', ['course', 'practice']);
  add('csci', 'Exercism: Python track', 'https://exercism.org/tracks/python', 'Free practice exercises with mentoring, from hello world up.', 'practice', ['exercises'], true);
  add('csci', 'Codewars', 'https://www.codewars.com/', 'Short coding challenges ranked by difficulty; the 8 kyu and 7 kyu ones fit this class.', 'practice', ['challenges']);
  add('csci', 'Python turtle documentation', 'https://docs.python.org/3/library/turtle.html', 'Every turtle command with examples, for the drawing assignments.', 'reference', ['turtle']);
  add('csci', 'NumPy: the absolute basics', 'https://numpy.org/doc/stable/user/absolute_beginners.html', 'Arrays, indexing and vectorized math, explained for first-timers.', 'reference', ['numpy']);
  add('csci', 'Matplotlib quick start', 'https://matplotlib.org/stable/users/explain/quick_start.html', 'The figure/axes model and the plot types the class uses.', 'reference', ['matplotlib']);
  add('csci', '10 minutes to pandas', 'https://pandas.pydata.org/docs/user_guide/10min.html', 'DataFrames, selecting, filtering and grouping in one page.', 'reference', ['pandas']);
  add('csci', 'PEP 8 style guide', 'https://peps.python.org/pep-0008/', 'How Python code is supposed to look; graders notice.', 'reference', ['style']);
  add('csci', 'Thonny', 'https://thonny.org/', 'A beginner-friendly Python editor with a built-in debugger that shows variables as you step.', 'app', ['editor', 'debugger']);
  add('csci', 'VS Code', 'https://code.visualstudio.com/', 'The editor most people move to; install the Python extension.', 'app', ['editor']);
  add('csci', 'Replit', 'https://replit.com/', 'Code in the browser from any device, with files and packages.', 'app', ['online editor']);
  add('csci', 'Stack Overflow', 'https://stackoverflow.com/', 'Search the exact error message in quotes. Read the accepted answer and the top comment.', 'community', ['q&a', 'errors']);
  add('csci', 'regex101', 'https://regex101.com/', 'Test regular expressions with a live explanation of each part.', 'tool', ['regex']);

  /* ---------- BIOB 160 ---------- */
  add('biob', 'Mathub BIOB 160 quizzer', '#/biob/practice', 'Punnett squares, pH, respiration counts, codons and PCR questions generated fresh, with worked answers.', 'tool', ['mathub', 'practice'], true);
  add('biob', 'OpenStax Biology 2e', 'https://openstax.org/details/books/biology-2e', 'A free, full introductory biology textbook that covers the same chapters as Campbell.', 'reading', ['book', 'free'], true);
  add('biob', 'Khan Academy: Biology', 'https://www.khanacademy.org/science/biology', 'Videos and practice on chemistry of life, cells, energy and genetics.', 'video', ['videos', 'practice'], true);
  add('biob', 'Amoeba Sisters', 'https://www.youtube.com/@AmoebaSisters', 'Short, clear cartoon videos on mitosis, meiosis, Punnett squares, protein synthesis and more.', 'video', ['videos'], true);
  add('biob', 'Bozeman Science', 'https://www.youtube.com/@bozemanscience', 'Paul Andersen, a Bozeman teacher, walks through every intro biology topic on a whiteboard.', 'video', ['videos']);
  add('biob', 'HHMI BioInteractive', 'https://www.biointeractive.org/', 'Free animations and data activities on DNA replication, gene expression and evolution.', 'video', ['animations', 'data']);
  add('biob', 'Learn.Genetics (University of Utah)', 'https://learn.genetics.utah.edu/', 'Interactive pages on DNA, inheritance and cell biology, including a virtual lab for PCR and gels.', 'tool', ['interactive', 'genetics']);
  add('biob', 'PhET: Gene Expression Essentials', 'https://phet.colorado.edu/en/simulations/gene-expression-essentials', 'Build a protein from a gene: transcription and translation you can control.', 'tool', ['simulation']);

  /* ---------- KIN 322 ---------- */
  add('kin', 'Mathub KIN 322 quizzer', '#/kin/practice', 'Planes and axes, levers and torque, ROM norms, knee tests and gait timing, with worked answers.', 'tool', ['mathub', 'practice'], true);
  add('kin', 'OpenStax Anatomy & Physiology 2e', 'https://openstax.org/details/books/anatomy-and-physiology-2e', 'A free textbook; chapters 7–11 cover the skeleton, joints and muscles.', 'reading', ['book', 'free'], true);
  add('kin', 'TeachMeAnatomy', 'https://teachmeanatomy.info/', 'Clear pages for every joint, muscle and nerve, with clinical notes; organized by region like this class.', 'reference', ['anatomy'], true);
  add('kin', 'Kenhub', 'https://www.kenhub.com/', 'Anatomy articles, videos and quizzes; many are free, some need an account.', 'practice', ['anatomy', 'quizzes']);
  add('kin', 'AnatomyZone', 'https://www.youtube.com/@AnatomyZone', '3D anatomy videos that rotate each joint and muscle group.', 'video', ['videos', '3D']);
  add('kin', 'Physiopedia', 'https://www.physio-pedia.com/', 'Reference pages on special tests, injuries and gait, written by physical therapists.', 'reference', ['clinical', 'tests']);
  add('kin', 'American Spinal Injury Association', 'https://asia-spinalinjury.org/', 'Home of the International Standards (ISNCSCI) exam used to classify spinal cord injuries.', 'reference', ['spinal cord injury']);

  /* ---------- PSYX 340 ---------- */
  add('psyx', 'Mathub PSYX 340 quizzer', '#/psyx/practice', 'Criteria, durations, severity counts and case questions for every disorder, with explanations.', 'tool', ['mathub', 'practice'], true);
  add('psyx', 'OpenStax Psychology 2e: psychological disorders', 'https://openstax.org/books/psychology-2e/pages/15-introduction', 'A free, shorter second explanation of the major disorders (chapter 15) and therapy (chapter 16).', 'reading', ['book', 'free'], true);
  add('psyx', 'NIMH health topics', 'https://www.nimh.nih.gov/health/topics', 'The National Institute of Mental Health’s overviews of each disorder, with current research and statistics.', 'reference', ['disorders', 'statistics'], true);
  add('psyx', 'APA Dictionary of Psychology', 'https://dictionary.apa.org/', 'Precise definitions for the terms that show up on exams.', 'reference', ['terms']);
  add('psyx', 'APA Style', 'https://apastyle.apa.org/', 'The official APA 7 guide for formatting and citing your reflection and term papers.', 'reference', ['citations', 'papers']);
  add('psyx', 'MSU Library', 'https://www.lib.montana.edu/', 'Search PsycInfo and PsycArticles for peer-reviewed sources, as the syllabus asks.', 'msu', ['research']);
  add('psyx', 'NAMI', 'https://www.nami.org/', 'The National Alliance on Mental Illness: plain-language guides written with people who live with these conditions.', 'reading', ['lived experience']);
  add('psyx', 'SAMHSA National Helpline', 'https://www.samhsa.gov/find-help/national-helpline', 'Free, confidential treatment referral for mental health and substance use, 24/7: 1-800-662-4357.', 'wellbeing', ['help', 'substance use']);

  /* ---------- wellbeing ---------- */
  add('wellbeing', '988 Suicide & Crisis Lifeline', 'https://988lifeline.org/', 'Call or text 988 any time, in the US, for yourself or a friend. Free and confidential.', 'wellbeing', ['crisis'], true);
  add('wellbeing', 'Crisis Text Line', 'https://www.crisistextline.org/', 'Text HOME to 741741 to reach a trained counselor.', 'wellbeing', ['crisis']);
  add('wellbeing', 'MSU Counseling & Psychological Services', 'https://www.montana.edu/counseling/', 'Free counseling on campus, including same-day and group options.', 'msu', ['mental health'], true);
  add('wellbeing', 'Sleep Foundation: students', 'https://www.sleepfoundation.org/', 'Why the all-nighter is the worst possible exam strategy, and what to do instead.', 'reading', ['sleep']);
  add('wellbeing', 'Headspace', 'https://www.headspace.com/', 'Guided meditation and focus music; the basics are free.', 'app', ['meditation']);
  add('wellbeing', 'Insight Timer', 'https://insighttimer.com/', 'Thousands of free guided meditations, including short ones for before an exam.', 'app', ['meditation']);
  add('wellbeing', 'Mathub focus sounds', '#/focus', 'Rain, cafe, brown noise and piano in the sound bubble, with a timer.', 'tool', ['mathub', 'focus']);
  add('wellbeing', 'Beating test anxiety (guide)', '#/guides/test-anxiety', 'A short Mathub guide with the three things that actually lower exam-day panic.', 'reading', ['mathub', 'guides'], true);

  global.MATHUB_RESOURCES = { KINDS, GROUPS, ITEMS: I };
})(typeof window !== 'undefined' ? window : globalThis);
