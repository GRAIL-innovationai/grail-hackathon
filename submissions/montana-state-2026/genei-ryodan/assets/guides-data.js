/* ============================================================
   Mathub — study-skills guides
   Short, practical guides written for these classes. Each guide is a
   list of blocks: {h} heading, {p} paragraph, {ul}/{ol} lists, {tip}
   callout, {q} quote. Text may use **bold** and [links](#/path).
   Rendered in the app at #/guides/<id> and as static pages under
   learn/guides/ by scripts/build-seo.js.
   ============================================================ */
(function (global) {
  'use strict';
  const G = [];
  const add = (id, title, blurb, minutes, tags, forCourses, body) => G.push({ id, title, blurb, minutes, tags, for: forCourses, body });

  add('math-exam', 'How to study for a math exam: the ten-day plan', 'Rereading notes the night before is the most common plan and the worst one. Here is what works, day by day.', 6, ['exams', 'math', 'planning'], ['calc', 'precalc', 'physics'], [
    { p: 'Math exams test whether you can **do** things under time pressure, not whether the material looks familiar. Familiarity is the trap: after rereading a solved example three times it feels known, and then the blank page on exam day feels like betrayal. Every step below replaces looking with doing.' },
    { h: 'Ten days out: know the map' },
    { ul: ['Open the exam in Mathub (Dashboard → exam prep) and list every section it covers. Write the list on paper. This is the whole enemy; it is smaller than it feels.', 'For each section, rate yourself 1 to 3: could not start, could do with notes, could do cold. Be honest; nobody sees this.', 'Book two blocks a day in your calendar until the exam. Forty-five minutes each is plenty if they actually happen.'] },
    { h: 'Days nine to five: attack the 1s and 2s' },
    { ol: ['Start every block with a five-question [practice set](#/calc/practice) from a weak section, with notes closed. Grade it. Missed questions tell you exactly what to read.', 'Read only the part of the notes that the misses point at. Then do five more questions from the same section.', 'End the block by writing one index card: the formulas from that section and the one mistake you made. That card is your future formula sheet.', 'Flip through your flashcards for the sections covered so far ([Flashcards](#/calc/flashcards) keeps the schedule for you).'] },
    { tip: 'A section moves from a 2 to a 3 when you get five questions in a row right with the book closed. Not before.' },
    { h: 'Days four to two: mix it up' },
    { p: 'Real exams do not tell you which section a problem comes from, so stop practicing by section. Use the exam set (Dashboard → exam prep → practice exam) or a mixed practice run across all covered topics. Time it. The first mixed run is always humbling; that is the point of doing it early.' },
    { ul: ['Keep a "missed" list with the question type and the reason: arithmetic, wrong rule, did not know where to start, ran out of time. Each reason has a different fix.', 'Redo yesterday\'s missed questions before starting new ones.', 'Try one [Blitz](#/calc/blitz) round: ninety seconds of rapid questions trains you to recognize problem types instantly.'] },
    { h: 'The day before' },
    { p: 'One short mixed set in the morning, then stop. Read your index cards once. Sleep at least seven hours; the memory consolidation that turns practice into recall happens while you sleep, and one lost night costs more than any extra hour gains. Pack a calculator, pencils and water the night before.' },
    { h: 'Exam day' },
    { ul: ['Skim the whole exam first. Do the questions you are sure of, then the rest. Points are points.', 'Write something for every question: the setup, the relevant formula, a diagram. Partial credit is real.', 'When stuck, move on and come back. Your brain keeps working on it in the background.', 'Check units and signs in the last five minutes rather than starting a new problem.'] },
    { q: 'You do not rise to the level of your expectations; you fall to the level of your preparation.' }
  ]);

  add('active-recall', 'Active recall and spaced repetition: why rereading feels good and does not work', 'The two most-researched study techniques, explained in five minutes, with how Mathub uses them.', 5, ['study skills', 'memory'], 'all', [
    { p: 'Two findings show up in almost every study of learning since the 1900s. First, **testing yourself** on material beats rereading it, even when the test goes badly. Second, spreading practice over days beats the same hours in one sitting. Together they are called retrieval practice and spaced repetition, and they are the reason Mathub is built around questions rather than pages.' },
    { h: 'Why rereading fails' },
    { p: 'When you reread, the text is right there, so recognizing it is easy, and easy feels like knowing. But an exam asks you to **produce** the idea from a blank page. Producing and recognizing are different skills; you can only train the first one by trying to produce, which is what a practice question, a flashcard or a closed-book summary does.' },
    { h: 'How to use recall' },
    { ul: ['After reading a section, close it and write everything you remember for two minutes. Then check. The gaps are the study list.', 'Turn every worked example into a problem: cover the solution, attempt it, compare.', 'Explain the idea out loud to nobody. If you stall, you found the hole.', 'Use the flag on a Mathub question when a solution is wrong or unclear so it gets fixed for everyone.'] },
    { h: 'Why spacing works' },
    { p: 'Memory strengthens most when you retrieve something just as it is about to fade. Reviewing a card five minutes after learning it does almost nothing; reviewing it tomorrow, then in three days, then in two weeks, locks it in with a fraction of the total time. This is exactly the schedule Mathub flashcards follow: "Got it" pushes a card further out, "Again" brings it back tomorrow, and [Today](#/today) shows what is due.' },
    { tip: 'Ten minutes of due cards every day beats a two-hour flashcard marathon before the exam, and it feels easier.' },
    { h: 'A weekly routine that uses both' },
    { ol: ['Every day: the due cards in Today, plus one lesson.', 'Three times a week: a ten-question practice set on the current section, notes closed.', 'Once a week: a mixed set across everything covered so far, timed.', 'Before an exam: the ten-day plan in [How to study for a math exam](#/guides/math-exam).'] }
  ]);

  add('focus-blocks', 'The 25-minute block: how to actually start', 'Starting is the hard part. A short timer, a single task and a visible finish line get you past it.', 4, ['focus', 'procrastination'], 'all', [
    { p: 'Nobody procrastinates on studying because they are lazy. They procrastinate because the task in their head is "study for calculus", which has no start, no end and no way to know if it is going well. The fix is to make the task tiny and concrete: **one section, one timer, one goal**.' },
    { h: 'The block' },
    { ol: ['Pick one task you can finish in 25 minutes: "ten questions on the chain rule", not "review derivatives".', 'Phone in another room, or face down and silent. Every notification costs you about ten minutes of re-focus.', 'Start the timer in the [Focus room](#/focus) and do nothing else until it rings. If you finish early, do the next five questions.', 'Five-minute break, standing up. Then another block or done for the day. Two real blocks beat four fake hours.'] },
    { h: 'When you cannot start' },
    { ul: ['Make the task even smaller: "open the practice page and do one question". Momentum does the rest.', 'Tell yourself you only have to do five minutes. You are allowed to stop after five; you almost never will.', 'Put the block on the calendar at a fixed time. Decisions made in the moment go to the phone.', 'Study next to someone who is also studying, in the library or at a Mathub study session. Social pressure is a tool.'] },
    { h: 'Longer blocks' },
    { p: 'Once 25-minute blocks are easy, try 50 with a ten-minute break, which suits problem sets that need a warm-up. Ninety minutes is the ceiling for most people; after that quality drops faster than you notice. The Focus room logs every session, and the minutes count toward your streak, quests and XP.' },
    { tip: 'The best study session is the one that happens. A mediocre 25 minutes today beats a perfect three hours you keep planning.' }
  ]);

  add('read-textbook', 'How to read a math or physics section in twenty minutes', 'Textbooks are not novels. Read them out of order, with a pencil, and stop when you have what you need.', 4, ['reading', 'math', 'physics'], ['calc', 'precalc', 'physics'], [
    { p: 'A section of Active Calculus or OpenStax Physics is about ten pages. Read straight through and you will spend an hour and remember the pictures. Read it like this and you will spend twenty minutes and remember the ideas.' },
    { ol: ['**Summary first.** Read the section summary or the Mathub notes page (big ideas, formulas, pitfalls) before the text. Now you know what matters and the text becomes confirmation.', '**Definitions and boxed results.** Copy each one in your own words on one line. If you cannot, that is the sentence to reread.', '**One worked example, actively.** Cover the solution, try the example, uncover line by line. Do this for one example per new idea, not all of them.', '**Skip the proofs the first time** unless the exam covers them. Come back after the practice questions if you are curious.', '**Five questions.** Immediately do five practice questions on the section. Reading without questions is the most common wasted hour in college.'] },
    { h: 'Mark it up' },
    { ul: ['Question marks in the margin at anything unclear; bring those to office hours or the discussion board.', 'A star next to any formula the notes call "key". That is your formula-sheet list.', 'Write the units of every physics quantity in the margin the first time it appears.'] },
    { tip: 'If a section still makes no sense after the questions, watch one short video on it (see Resources) and then reread. Two explanations of the same idea usually click where one does not.' }
  ]);

  add('office-hours', 'Office hours, and how to email a professor', 'The most underused free resource in college, and the two-line email that gets a reply.', 4, ['help', 'communication'], 'all', [
    { p: 'Office hours are time your instructor has already set aside to talk to you one on one. Most weeks nobody shows up. Going once changes how the course feels: the professor becomes a person, your questions get real answers, and when a grade is borderline at the end they remember the student who came.' },
    { h: 'What to bring' },
    { ul: ['A specific question with your attempt: "I set this up as F = ma with these forces and got 12 N, the answer is 8 N, where did I go wrong?" beats "I do not get forces."', 'Your missed practice questions from Mathub. They are a ready-made list.', 'A concept question if you have one: "Why does the chain rule multiply?" Professors love these.'] },
    { h: 'If office hours clash with your schedule' },
    { p: 'Email and ask for another time; nearly everyone says yes. TAs hold their own hours too, and the Math Learning Center and Student Success tutoring (see Resources) run all week without appointments.' },
    { h: 'The email' },
    { p: 'Subject line with the course number. Greeting with their title. One paragraph: who you are, what you need, what you already tried, a specific ask. Sign with your full name and section. Like this:' },
    { q: 'Subject: M171 section 03, question about Exam 2 problem 4\n\nDear Professor Lee,\n\nI am in your M171 section 03. On Exam 2 problem 4 I used the quotient rule and got a different sign from the key. I have attached my work. Could I come by office hours Thursday at 2, or is there a better time?\n\nThank you,\nJordan Smith' },
    { ul: ['No "hey", no text-speak, no demands. Polite and short gets answers.', 'Give them two days. Then a gentle follow-up on the same thread.', 'Ask what you can do, never for a grade change directly. "What would you recommend I focus on?" opens more doors than "can you bump me up?"'] }
  ]);

  add('test-anxiety', 'Beating test anxiety', 'Racing heart, blank mind, the answer that arrives in the parking lot. Three things that actually help, and one that makes it worse.', 5, ['exams', 'wellbeing'], 'all', [
    { p: 'Some nerves before an exam are useful; they sharpen you. The problem is when the nerves take over: you read a question three times and nothing lands. That blankness is not a memory failure. It is your working memory being crowded out by worry, and it responds to specific fixes.' },
    { h: '1. Practice under exam conditions' },
    { p: 'Anxiety feeds on novelty. If the first time you do a timed mixed set with no notes is the exam, everything about it is new. Do timed practice exams in Mathub at least twice before the real one, at a desk, with the same calculator. By exam day the format is boring, and boring is calm.' },
    { h: '2. Write it out first' },
    { p: 'Ten minutes before the exam, write down every worry on paper for five minutes: I might fail, I will forget the identities, everyone else is faster. A large study found students who did this scored measurably higher. Getting the worries onto the page frees the working memory they were occupying.' },
    { h: '3. Breathe on purpose, once' },
    { p: 'When the blankness hits mid-exam: put the pencil down, breathe in for four counts, out for six, three times. Twenty seconds. Then reread the question and write **anything** relevant: the formula, a sketch, the given values with units. Starting to write restarts thinking.' },
    { h: 'What makes it worse' },
    { ul: ['Cramming until 3 a.m. Sleep loss raises anxiety and lowers recall at the same time.', 'Caffeine on an empty stomach right before.', 'Talking to classmates about how hard it will be in the hallway. Put headphones in.', 'Telling yourself you are "bad at math". You have evidence against it: every practice set you finished.'] },
    { h: 'If it is more than exam nerves' },
    { p: 'If anxiety is affecting sleep, classes or life generally, [MSU Counseling & Psychological Services](https://www.montana.edu/counseling/) is free and confidential, and the [Office of Disability Services](https://www.montana.edu/disabilityservices/) can arrange a quieter testing room or extra time. Asking is normal; thousands of Bobcats do it every year.' }
  ]);

  add('sleep-food-move', 'Sleep, food, movement: the boring stuff that raises grades', 'No app replaces seven hours of sleep. What the research says, in one page.', 4, ['wellbeing', 'habits'], 'all', [
    { p: 'Every study technique on this site assumes a brain that is rested and fed. When those go, so does everything else, and the effect is bigger than most students believe.' },
    { h: 'Sleep' },
    { ul: ['Memories from the day are consolidated during sleep. Study, then sleep, then test: that order matters. An all-nighter before an exam typically lowers scores compared with stopping early and sleeping.', 'Seven to nine hours. Consistent wake time matters more than bedtime.', 'Screens off 30 minutes before, or at least the phone out of the bed. If you must scroll, do it with the brightness down.', 'A 20-minute nap between classes works; an hour makes you groggy.'] },
    { h: 'Food and water' },
    { ul: ['Eat before an exam, but not a huge or sugary meal. Protein and something slow (oats, eggs, a sandwich) keep energy level through a two-hour test.', 'Dehydration shows up as headache and poor concentration long before thirst. Carry a bottle.', 'Caffeine helps if you use it normally; it hurts if you triple your usual dose on exam day.'] },
    { h: 'Movement' },
    { p: 'A twenty-minute walk or workout improves attention for the next couple of hours and lowers stress the same day. Campus Recreation is included in your fees. On a study day, move between blocks instead of scrolling; the break restores focus and the scrolling does not.' },
    { tip: 'The best predictor of a good exam is a good night before it. Plan the studying to end early enough to make that possible.' }
  ]);

  add('study-group', 'How to run a study group that works', 'Most study groups are social hour with a textbook nearby. A few rules turn them into the most effective hour of the week.', 4, ['community', 'exams'], 'all', [
    { p: 'Explaining a problem to someone else is the strongest form of retrieval practice there is; you find out instantly whether you understand it. That is why good study groups work. The bad ones fail for predictable reasons: no plan, one person does the work, and everyone leaves feeling productive without having done any problems.' },
    { h: 'Setting it up' },
    { ul: ['Three to five people. Two is a tutoring session; six is a party.', 'Post it as a [study session](#/meet) in Mathub so people from your section can join, and pick a room in the library.', 'Fixed time, weekly, 60 to 90 minutes. Groups that "figure out a time each week" stop meeting by week five.'] },
    { h: 'The format' },
    { ol: ['**Everyone arrives having tried the problems.** No exceptions. The group is for the ones you could not do, not for starting the homework.', 'Go around: each person names the problem that stuck. Sort the list by how many people got stuck.', 'For each problem, someone who got it explains at the whiteboard while the others try to poke holes. If nobody got it, work it together and flag it for office hours.', 'Last fifteen minutes: quiz each other from the flashcards or one Mathub practice set, on paper, in silence, then compare.'] },
    { h: 'Rules that keep it useful' },
    { ul: ['Phones in a pile in the middle.', 'Whoever explains has to do it without looking at their solution.', 'Split up when it turns into chat; reconvene next week. No hard feelings.', 'Rotate who runs the session so nobody becomes the unpaid tutor.'] }
  ]);

  add('webwork', 'Online homework (WeBWorK and Canvas quizzes): a strategy', 'Unlimited attempts are a gift and a trap. How to use online homework to learn rather than to guess.', 4, ['homework', 'math', 'physics'], ['calc', 'precalc', 'physics'], [
    { p: 'Online homework gives instant feedback and often unlimited tries. Used well, that is the fastest learning loop in the course. Used badly, it becomes a guessing game where you get 100% and learn nothing, which shows up at the exam where there is one attempt and no green checkmark.' },
    { h: 'The loop' },
    { ol: ['Do the problem completely on paper before typing anything. Paper is what the exam looks like.', 'Enter the answer. If it is wrong, **do not change a sign and resubmit.** Find the mistake on paper first.', 'After two wrong tries, stop and reread the matching Mathub notes or watch a five-minute video on that topic, then return.', 'When you finally get it, write the problem type and the mistake in a running "missed" list. That list is exam gold.'] },
    { h: 'Entering answers' },
    { ul: ['Read the format hint: exact vs. decimal, radians vs. degrees, units required or not.', 'Use parentheses generously: 1/(2x) is not 1/2x.', 'For "show your work" quizzes, a clear photo of clean handwriting matters. Number the steps.'] },
    { h: 'Timing' },
    { p: 'Start the day it opens, not the night it closes. Problem sets are designed to take several sittings; the last-minute version costs twice the time because you are tired and the help room is closed. Mathub calendars show every due date, and reminders can nudge you the evening before.' },
    { tip: 'A problem you got right on the third try counts as a problem you cannot yet do. Redo it from scratch two days later.' }
  ]);

  add('notes', 'Taking notes you will actually use', 'Notes are for making later study easier, not for transcribing the lecture. The Cornell layout, plus an example bank.', 4, ['notes', 'study skills'], 'all', [
    { p: 'Most lecture notes are never read again, because they are a wall of text that is harder to use than the textbook. Notes earn their keep when they become **questions you can quiz yourself with** and **examples you can redo**.' },
    { h: 'The Cornell layout' },
    { ul: ['Draw a line a third of the way from the left. Right column: notes during lecture. Left column: filled in after class with a question for each chunk of notes ("What is the derivative of ln x and why?").', 'Bottom strip: a two-sentence summary of the lecture, written the same day.', 'Reviewing means covering the right column and answering the left-column questions out loud. That is active recall, built into the page.'] },
    { h: 'In a math or physics lecture' },
    { ul: ['Copy every worked example completely, including the setup words the instructor says out loud ("since the force is perpendicular, work is zero").', 'Mark the moment you got lost with a big "?" and keep writing. Fill the gap from the textbook or Mathub notes that evening.', 'Write formulas with the conditions they need: "only when a is constant" next to the kinematics equations.'] },
    { h: 'The example bank' },
    { p: 'Keep one document per class with the cleanest version of every example type you have met: one limit by factoring, one related-rates problem, one free-body diagram with friction. Before an exam, this bank is worth more than the whole notebook. Mathub notes pages already have one worked example per section, and the scratchpad keeps your own.' },
    { tip: 'Rewriting notes neatly is not studying. Turning them into questions is.' }
  ]);

  add('formula-sheet', 'How to build and use a formula sheet', 'Whether or not the exam allows one, building a formula sheet is one of the best study activities there is.', 3, ['exams', 'formulas'], ['calc', 'precalc', 'physics'], [
    { p: 'The act of deciding what goes on the sheet forces you to review everything and to sort it by importance. Students who build a sheet and then are not allowed to use it still score higher, because the building was the studying.' },
    { h: 'Building it' },
    { ol: ['Start from the Mathub formula sheet for the class and the sections on the exam. Print or copy only those.', 'Next to each formula, add in your own words when it applies and one common mistake.', 'Add one tiny worked example for each formula you tend to misuse: the numbers, not the method.', 'Rewrite it by hand once. Handwriting is slow, and slow is the point.'] },
    { h: 'Using it' },
    { ul: ['During practice, use the sheet and circle every formula you looked up. Those are the ones to memorize; the rest you know.', 'If the exam allows the sheet, practice with the same sheet so you know where things are without searching.', 'If it does not, quiz yourself from the sheet: cover the right side, produce the formula, check.'] },
    { tip: 'Physics: put the units next to every quantity on the sheet. Half of the sanity checks on exam day come from units.' }
  ]);

  add('semester-plan', 'The first-week plan: map every syllabus once', 'One hour in week one saves the two panicked weeks most students have around midterms.', 3, ['planning', 'deadlines'], 'all', [
    { p: 'Every syllabus contains the whole semester: exam dates, weights, drop deadlines, late policies. Almost nobody reads them after week one, which is why the week with three exams comes as a surprise. Map it once.' },
    { ol: ['Add every exam and major due date to a calendar you actually look at. Mathub classes already carry the syllabus calendars; choose your classes in Settings so [Today](#/today) and the landing page show them together.', 'Find the collision weeks: two exams or an exam plus a paper within four days. Put a "start early" reminder two weeks before each.', 'Read the grading table. Know what a homework set is worth versus an exam; it tells you where an extra hour matters most. The grade calculator in each class turns the table into "what do I need on the final".', 'Write down the drop deadline and the withdrawal deadline. Decisions about a class are much easier when you know the date.', 'Note office-hour times for each instructor and TA in one place.'] },
    { h: 'Then, weekly' },
    { p: 'Sunday evening, ten minutes: look at the next seven days on the landing page, pick the two or three things that matter most, and put study blocks for them on the calendar. That short ritual is most of the difference between a calm semester and a frantic one.' }
  ]);

  add('stuck-coding', 'Getting unstuck on a coding problem', 'Errors are not failures; they are the computer telling you exactly where to look. A repeatable routine for CSCI 127.', 5, ['programming', 'debugging'], ['csci'], [
    { p: 'Everyone who codes gets stuck constantly; the difference between beginners and experienced programmers is what they do in the next five minutes. This is the routine.' },
    { h: 'Read the error, all of it' },
    { ul: ['The **last line** of a Python traceback names the error and usually the cause: NameError means a typo or something defined later; TypeError often means a string where a number was expected; IndexError means you asked for an item that is not there.', 'The line above it with "File ... line N" points at your code. Start there, not at the top of the file.', 'Paste the exact message into a search engine in quotes. Someone has hit it before.'] },
    { h: 'Make it smaller' },
    { ol: ['Print the values just before the failing line: `print(i, len(items))`. Guesses about what a variable holds are wrong more often than you expect.', 'Comment out half the code. Does the error persist? Now you know which half.', 'Paste the function into [Python Tutor](https://pythontutor.com/) and step through it. Watching variables change fixes most loop and list bugs in a minute.', 'Write the smallest program that shows the problem. Often, by the time it is small, the bug is obvious.'] },
    { h: 'When it runs but the answer is wrong' },
    { ul: ['Hand-trace the code with a tiny input (a list of three numbers) on paper.', 'Check the boundaries: the first item, the last item, an empty list, zero.', 'Check integer division and off-by-one in ranges: `range(1, n)` stops at n - 1.', 'Use the playground in Mathub to test one function at a time with known inputs.'] },
    { h: 'Ask well' },
    { p: 'On the discussion board or in office hours, share the exact error, the smallest code that causes it, and what you expected instead. That message gets answered in minutes; "my code does not work" does not.' },
    { tip: 'Take a ten-minute walk. Nobody knows why it works, but the bug you could not see for an hour is often obvious when you come back.' }
  ]);

  add('essay-fast', 'Drafting an essay fast', 'The blank page is the enemy. A method that produces a full draft in a sitting, so revision has something to work with.', 4, ['writing'], ['writ'], [
    { p: 'Good essays are rewritten, not written. The goal of the first sitting is a complete, imperfect draft; polish comes later. Most WRIT 101 stress comes from trying to do both at once.' },
    { h: 'Before writing (20 minutes)' },
    { ol: ['Reread the prompt and copy the key verbs: analyze, argue, compare, reflect. The essay has to do those things.', 'One sentence: what you think and why. That is the working thesis. It will change; write it anyway.', 'Three to five bullet points of supporting ideas, each with a piece of evidence (a quote, an example, an experience). Order them.'] },
    { h: 'The draft (one sitting)' },
    { ul: ['Set a timer in the [Focus room](#/focus) and write without stopping to fix anything. Typos, weak words, "[find better example]" in brackets are all fine.', 'Write the body first, one bullet per paragraph. Start each paragraph with the claim, then the evidence, then why it matters.', 'Write the introduction last; now you know what you are introducing.', 'Aim to overshoot the word count by a fifth. Cutting is easier than stretching.'] },
    { h: 'Revision (next day, not the same one)' },
    { ul: ['Read it out loud, or let the read-along reader in Mathub do it. Your ear catches what your eye skips.', 'Paste it into [Hemingway](https://hemingwayapp.com/) and look at the long-sentence and passive-voice highlights. Fix the ones that hurt clarity; keep the ones that are deliberate.', 'Check every paragraph against the thesis. If it does not support the argument, cut it or change the thesis.', 'Citations last: the Mathub citation builder or ZoteroBib formats them in MLA in seconds.', 'Book the [Writing Center](https://www.montana.edu/writingcenter/) for a second pair of eyes on anything that counts for a lot.'] },
    { tip: 'The word counter in Mathub Tools shows reading time and average sentence length. Around 15 to 20 words per sentence reads well for most essays.' }
  ]);

  add('physics-problems', 'How to read a physics problem', 'Units, a diagram and a sanity check catch most mistakes before they cost points. The five-step routine for every problem.', 4, ['physics', 'problem solving'], ['physics'], [
    { p: 'Physics problems are stories with numbers hidden in them. The routine below turns the story into equations reliably, and it is what graders look for when they give partial credit.' },
    { ol: ['**Draw it.** Even a stick figure and an arrow. For forces, a free-body diagram is not optional; it is the solution.', '**List the givens with units, and the unknown.** Convert everything to SI now (km/h to m/s, grams to kilograms). Half of wrong answers are unit mistakes.', '**Choose the principle.** Constant acceleration? Kinematics. Forces? Newton\'s second law. No time in the question? Energy. Collision? Momentum. Say it out loud.', '**Solve symbolically first**, then plug in numbers. Algebra with letters is easier to check and gets full credit even if the arithmetic slips.', '**Sanity check.** Are the units right? Is the sign right? Is the size plausible? A car going 300 m/s or a mass that came out negative is a signal to look again.'] },
    { h: 'Common traps' },
    { ul: ['Mixing up "speed" and "velocity" in signs: pick a positive direction and write it on the diagram.', 'Using g as 9.8 in one place and 10 in another.', 'Forgetting that at the top of a throw the velocity is zero but the acceleration is not.', 'Applying energy conservation when friction is doing work.'] },
    { tip: 'Mathub physics practice questions carry a hint ladder: the first hint is always which principle to use. Try to name it yourself before opening the hint.' }
  ]);

  add('science-exam', 'Studying for a biology, anatomy or psychology exam', 'Exams in these classes ask you to use terms, structures and criteria, not just recite them. A routine that builds both.', 5, ['exams', 'memory', 'science'], ['biob', 'kin', 'psyx'], [
    { p: 'These classes pile up vocabulary fast, and it is tempting to reread slides until they feel familiar. Familiar is not the same as usable: exam questions give you a case, a diagram or a cross and ask you to apply what you know.' },
    { ol: ['**Turn each lecture into questions the same day.** Ten minutes after class, write five questions the professor could ask. That is your [active recall](#/guides/active-recall) deck.', '**Retrieve, do not reread.** Flashcards first, notes only to check. Say the answer before you flip.', '**Draw it.** A Punnett square, a replication fork, a joint with its ligaments, a flowchart for telling two disorders apart. If you can draw it from memory, you know it.', '**Compare in tables.** Mitosis vs meiosis, ACL vs PCL, bipolar I vs II. Exams love the pair that is easy to confuse.', '**Practice application.** Case questions, “which muscle and how,” and genetics problems, worked by hand and checked.', '**Space it.** Short sessions across the week beat one long night, especially for anatomy and criteria.'] },
    { h: 'Class by class' },
    { ul: ['**BIOB 160:** work genetics and pH problems until they are automatic; the Mathub quizzer makes new ones every time. Keep the respiration table (stage, place, products) on one card.', '**KIN 322:** do the movement while you say its plane and axis, learn muscles by action group, and palpate in open lab before each practical.', '**PSYX 340:** for each disorder, one card with the core feature, the time rule, the main explanations and the first-line treatment. Then practice vignettes that make you choose between similar disorders.'] },
    { tip: 'Each class in Mathub has a Formulas & key terms sheet. Copying it by hand, in your own words, is one of the best study sessions you can do the week before an exam.' }
  ]);

  add('bad-grade', 'You got a bad grade. Now what?', 'One bad exam is information, not a verdict. The steps to take in the next week.', 4, ['exams', 'wellbeing', 'planning'], 'all', [
    { p: 'A low grade feels like a judgment about you. It is not. It is a measurement of one exam on one day, and the most useful thing you can do is treat it like data.' },
    { h: 'The first 48 hours' },
    { ul: ['Feel bad for one evening. Then stop; the grade is not going to change by feeling worse.', 'Do not withdraw or email anyone while upset. Sleep first.', 'Get the exam back and go through **every** question, including the ones you got right by luck.'] },
    { h: 'Sort the mistakes' },
    { p: 'Write each lost point into one of four buckets: did not know the material, knew it but made an arithmetic or sign error, misread the question, ran out of time. Each bucket has a different fix, and most students are surprised by how much falls into the last three, which are the easiest to fix.' },
    { ul: ['Did not know: those sections go back to a 1 on your list. The [ten-day plan](#/guides/math-exam) applies.', 'Errors: practice slower, with a units and signs check as the last step of every problem.', 'Misread: underline the question being asked before solving. Answer that question.', 'Time: more timed mixed practice. Speed comes from recognizing problem types, which is what [Blitz](#/calc/blitz) and mixed sets train.'] },
    { h: 'Use the numbers' },
    { p: 'Open the grade calculator in the class dashboard and see what you now need on the remaining work. It is usually less scary than the story in your head. If it is not, and the drop deadline is ahead, that is a real decision to make calmly with an advisor, not a failure.' },
    { h: 'Get help earlier this time' },
    { p: 'Go to office hours with the graded exam. Ask what to focus on. Try the Math Learning Center or Student Success tutoring for one session. Post the questions that still confuse you on the discussion board. The students who recover from a bad first exam are the ones who change something, not the ones who try harder in the same way.' }
  ]);

  global.MATHUB_GUIDES = G;
})(typeof window !== 'undefined' ? window : globalThis);
