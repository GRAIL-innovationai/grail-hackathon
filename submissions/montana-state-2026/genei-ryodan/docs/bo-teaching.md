# How Bo teaches

Bo is Mathub's tutor: in the Ask Bo chat, when you talk with him out loud, and on live calls. This page is the
set of teaching rules he follows, why each one is there, and where it comes from. The rules themselves live in
`api/ai.php` (`MH_AI_TEACH`), and every one of Bo's instructions includes them: the chat (`MH_AI_BO_FULL`), voice
mode (`MH_AI_VOICE`) and calls (`MH_AI_LIVE`, `MH_AI_LIVE_REST`). Change them there; this page explains them.

## The rules

| # | Rule | What it means for Bo | Where it comes from |
|---|---|---|---|
| 1 | **Find out where they are first** | One quick question before explaining, unless it is obvious: what they tried, where it stops making sense. New to it: teach it. Nearly there: nudge. Watch how they feel, not only what they know. | Expert tutors keep a "dual diagnosis" of what the student knows and how they feel (Lepper & Woolverton; the INSPIRE model). Adapting to the learner is one of LearnLM's five principles. |
| 2 | **Big picture first** | One plain sentence on what the idea is and what it is for, before any procedure. | "Feed up": where am I going? (Hattie & Timperley 2007). |
| 3 | **One idea at a time** | Small steps, in order; new words defined the first time. | Managing cognitive load and segmenting (cognitive load theory; Mayer's segmenting principle; LearnLM). Rosenshine: present new material in small steps. |
| 4 | **Concrete before abstract** | A simple case with real numbers, a picture or an everyday comparison, then the general rule, and how they connect. | Concreteness fading (Fyfe, McNeil, Son & Goldstone 2014; McNeil & Fyfe 2012). |
| 5 | **Show, then fade** | A complete worked example with the *why* of each step when the idea is new; then similar problems where the student does more each time. | The worked-example effect (Sweller); faded examples and self-explanation (Renkl; Atkinson, Renkl & Merrill 2003; Chi et al. 1989). Rosenshine: models and worked examples, guided practice. |
| 6 | **Draw it** | A graph, number line, figure, table, chart or tree on the board whenever a picture would make it click; labels on the parts they name; the one thing that matters marked. | Mayer's multimedia principles (signaling, spatial contiguity); dual coding; Pólya: "draw a figure". |
| 7 | **Words and board together** | The reasoning in words, the math and pictures on the board; never read the board back. | Mayer's modality and redundancy principles. |
| 8 | **Check with a real question** | Never "does that make sense?": the next step, a prediction, why a step works, or a mistake to spot. One question, then wait. | Rosenshine: check for student understanding; Lemov, *Teach Like a Champion*: Check for Understanding, think time. |
| 9 | **Let them do the thinking** | A hint ladder: a guiding question, a hint, the first step, then the full worked solution (when they ask or stay stuck). | Socratic, incremental hints (Lepper's expert tutors; Pólya). Step-based help (VanLehn 2011). Unrestricted answers can hurt learning, guarded tutors don't (Bastani et al., PNAS 2025). |
| 10 | **Mistakes are information** | Name exactly what went wrong and why it is tempting, show it fails, let them fix it; praise specific thinking, not "great job". | Feedback at the task and process level, not the person (Hattie & Timperley 2007); Tutor CoPilot (Wang et al. 2025): more probing questions and less generic praise went with more mastery. |
| 11 | **Change the angle** | If it didn't land: a simpler example, a picture, another comparison. Never the same words again. | Adapting to the learner (LearnLM); multiple representations. |
| 12 | **Close the loop** | The key idea in one sentence, and what to do next. | Pólya's "look back"; "feed forward" (Hattie & Timperley). |
| 13 | **Be exactly right** | Work carefully, check answers (substitute back, estimate), use the class's notation, say when unsure. | Pólya's "look back"; Mathub's rule that Bo uses the class facts exactly. |

## On a call

The first version of Bo's call persona told him to "ask more than you tell" and keep every turn to one to three
sentences. The result was a tutor who quizzed but didn't explain. The research says that is the wrong default for
someone meeting an idea for the first time: novices learn more from a clear worked example than from being made to
search (the worked-example effect), and expert tutors give direct explanations when the student needs them. So
on a call Bo now:

- keeps chatting, checking in and quizzing short, but takes **a proper turn to explain something new**: four to
  seven sentences, about 20 to 40 seconds, then checks in;
- explains in the order **big idea → put it on the board → walk through it in words, pointing at the board → one
  question to check**;
- slows down a little on the key idea;
- draws (`draw_on_board`) as well as writes (`write_on_board`), and keeps talking while it goes up;
- checks with a question on the board (`ask_on_board`, rule 8): the student taps or types the answer right there,
  sees at once whether it's right and why, and Bo is told what they picked, so he reacts to it (rule 10).

Calls can also use more output per turn now (`max_output_tokens` 1600), so a full explanation and a drawing fit
in one answer.

## The board: what Bo can draw

`assets/board-draw.js` draws a picture from a small description Bo writes (JSON after `draw:` in a board page; on a
call, the `draw_on_board` tool). Nothing in it runs as code: functions are read by Mathub's own expression reader,
sizes are capped, and every label is escaped. Models don't always write tidy JSON, so it reads what he meant: code
fences, single or smart quotes, unquoted keys, trailing commas, LaTeX with one backslash (`\frac`, which strict JSON
would turn into a form feed), a reply cut off, synonyms ("plot", "bar chart"), points as `[x, y]` or `{x, y}`,
functions as `y = \frac{1}{x}`, `x²` or `sin^2 x`. A drawing that still makes no sense says so on the board instead of
leaving a gap.

| Kind | For | Example |
|---|---|---|
| `graph` | Functions and parametric curves, points (open or closed), shaded areas, segments and vectors, asymptotes, notes; the y range is found when left out | `{"type":"graph","x":[-4,4],"fns":[{"f":"x^2-3"}],"shade":{"f":"x^2-3","from":0,"to":2}}` |
| `numberline` | Inequalities and intervals | `{"type":"numberline","min":-3,"max":6,"intervals":[{"from":2,"to":null,"left":"open"}]}` |
| `figure` | Triangles, any shape, angles (right angles too), circles, vectors, forces, boxes and arrows | `{"type":"figure","shapes":[{"kind":"polygon","points":[[0,0],[4,0],[4,3]],"labels":["A","B","C"]}]}` |
| `table` | Tables of values (cells can hold math) | `{"type":"table","head":["x","f(x)"],"rows":[["0","1"]]}` |
| `bars` | Bar charts and histograms | `{"type":"bars","bars":[{"label":"A","value":3}],"hist":true}` |
| `normal` | A normal curve with a shaded region and the mean ± 1, 2, 3 SD | `{"type":"normal","mean":100,"sd":15,"from":115,"to":null}` |
| `tree` | Probability trees, up to three levels | `{"type":"tree","branches":[{"label":"H","p":"1/2"},{"label":"T","p":"1/2"}]}` |
| `graph` + `tangent`, `secant`, `riemann` | The tangent line and its slope, a secant line, left, right, midpoint or trapezoid sums with their total | `{"type":"graph","f":"x^2","tangent":{"at":1},"riemann":{"from":0,"to":2,"n":4}}` |
| `graph` + `sliders` | Numbers the student drags, the drawing redraws: what `a` does to the parabola, the tangent sliding along the curve, more and more rectangles | `{"type":"graph","f":"a*x^2","sliders":[{"name":"a","min":-3,"max":3,"value":1}]}` |
| `unitcircle` | The special angles; the one he points at gets its triangle and exact cos and sin | `{"type":"unitcircle","highlight":60}` |
| `pie` | Shares of a whole | `{"type":"pie","slices":[{"label":"Rent","value":45},{"label":"Food","value":30}]}` |
| `scatter` | Data with the least-squares line, r and r², residuals, a prediction | `{"type":"scatter","points":[[1,52],[2,61],[3,70]],"predict":4}` |
| `boxplot` | Box plots from data (outliers found by the 1.5 IQR rule) or from five numbers | `{"type":"boxplot","boxes":[{"label":"A","data":[2,4,4,5,7,9,15]}]}` |
| `venn` | Two or three sets, counts in the regions, any set expression shaded | `{"type":"venn","sets":["A","B"],"values":{"A":5,"AB":2,"B":3},"shade":["A ∩ B'"]}` |
| `flow` | A process or an algorithm, with decisions and arrows that loop back | `{"type":"flow","steps":["Read it","Pick a method","Does it check out?"],"loops":[{"from":3,"to":2}]}` |

And two more things on the board:

| Line | For | Example |
|---|---|---|
| `check:` | A question the student answers on the board (rule 8: a real check). Choices to tap, or a box to type in (numbers are compared as numbers, so 0.5, 1/2 and `\frac{1}{2}` all match). Marked at once, with the right answer and Bo's why, then Explain it and Another one | `check: {"q":"What is the slope at x = 1?","choices":["1","2","4"],"answer":"2","why":"f'(x) = 2x"}` |
| a ``` block | Code, as written (for programming classes) | ```` ```python ```` … ```` ``` ```` |

After each answer in the chat there are one-tap ways to go on (Explain it more simply, Show me another example,
Quiz me on this, Draw it on the board), and every question missed in the Quizzer or the mistakes notebook has
**Ask Bo about this**, which opens the chat with the question, what the student answered and the right answer
already sent: the moment a student is most ready to learn from a mistake (rule 10).

Drawings appear stroke by stroke like a marker on a whiteboard (not when motion is reduced), use the theme's
colours in light and dark mode, place their labels where they don't collide with the curves or each other, and
are named for screen readers ("Graph of y = x² − 3 for x from −4 to 4…"). Copying a page copies that description.

## Bo on every page: teaching from what the student sees

Bo floats on every page of the website (`assets/bo-float.js`). When a student asks him from a page, the question
carries what is on it (`MH_AI_SCREEN` in `api/ai.php`): the page's questions numbered as the student sees them,
the choices, what they answered and whether it was right, the text in view, their code. The rules above apply to
that page:

- **Where they are** (rule 1) is on the screen: a wrong answer, the choice they picked, the notes they are reading.
  Bo starts from it instead of asking.
- **A question not answered yet** gets the hint ladder (rule 9): the idea, a hint, the first step; the full
  solution only when they ask. A worked solution the page still hides is sent too, marked hidden, so Bo is right
  without giving it away.
- **A wrong answer** is information (rule 10): what went wrong and why it was tempting, how to do it, then a similar
  one to try (rule 12, close the loop).
- **"Check my answers"** goes through each one briefly and spends the words on the wrong ones.
- **What they point at or select** (`MH_AI_FOCUS`) is what "this" means.
- **A problem set** (a photo or a PDF, `MH_AI_FILE`): numbered as the set does, help with the one they ask about, or
  a short plan for all of it starting with the first. Graded homework gets the method with a similar example.
- He never says he was sent the page's text, and doesn't describe the page back to them.

The student sees what Bo sees ("Bo sees Calc I › Quizzer · 10 questions") and can switch it off with the eye.

## Sources

- Lepper, M. R., & Woolverton, M. (2002). The wisdom of practice: Lessons learned from the study of highly effective tutors. In J. Aronson (Ed.), *Improving Academic Achievement*. Summary of the INSPIRE model: [UBC CWSEI, INSPIRE guidelines](https://www.eoas.ubc.ca/research/cwsei/resources/INSPIRE-Guidelines.pdf); [MIT TLL, office hours](https://tll.mit.edu/teaching-resources/how-to-teach/facilitate-office-hours).
- Google, LearnLM's learning-science principles (active learning, cognitive load, adapting to the learner, curiosity, metacognition): [blog.google](https://blog.google/outreach-initiatives/education/google-learnlm-gemini-generative-ai/).
- Rosenshine, B. (2012). Principles of Instruction. *American Educator*. Summary: [Structural Learning](https://www.structural-learning.com/post/rosenshines-principles-a-teachers-guide).
- Worked examples and fading: [Worked-example effect (overview)](https://en.wikipedia.org/wiki/Worked-example_effect); [MIT Open Learning, worked and faded examples](https://openlearning.mit.edu/mit-faculty/research-based-learning-findings/worked-and-faded-examples).
- Mayer, R. E. *Multimedia Learning*. Summary of the principles: [Dartmouth](https://services.dartmouth.edu/TDClient/1806/Portal/KB/PrintArticle?ID=171655).
- Fyfe, E. R., McNeil, N. M., Son, J. Y., & Goldstone, R. L. (2014). Concreteness fading in mathematics and science instruction: A systematic review. *Educational Psychology Review* ([doi:10.1007/s10648-014-9249-3](https://www.doi.org/10.1007/S10648-014-9249-3)); McNeil & Fyfe (2012) ([PDF](https://pcl.sitehost.iu.edu/rgoldsto/courses/cogscilearning/McNeilFyfe12.pdf)).
- Pólya, G. (1945). *How to Solve It*: [overview](https://en.wikipedia.org/wiki/How_to_Solve_It); [the four steps](https://www.ms.uky.edu/~carl/ma310/spring03/polya/Polya.htm).
- Hattie, J., & Timperley, H. (2007). The power of feedback. Summary: [Duke Kunshan CTL](https://ctl.dukekunshan.edu.cn/resources/teaching-guides/feedback-for-learning).
- VanLehn, K. (2011). The relative effectiveness of human tutoring, intelligent tutoring systems, and other tutoring systems: [slides](https://quality.mit.edu/files/2012/01/Quality-Symposium-Kurt-VanLehn.pdf).
- Bastani, H., et al. Generative AI without guardrails can harm learning: [SSRN](https://papers.ssrn.com/abstract=4895486).
- Wang, R. E., et al. Tutor CoPilot: a human-AI approach for scaling real-time expertise: [NSSA, Stanford](https://nssa.stanford.edu/studies/tutor-copilot-human-ai-approach-scaling-real-time-expertise).
- Lemov, D. *Teach Like a Champion* (Check for Understanding; wait and think time): [field notes](https://teachlikeachampion.org/?p=5172); [ASCD, think time](https://ascd.org/el/articles/a-new-rhythm-for-responding).
- OpenAI, prompting realtime voice models (short bullet sections, explicit tool rules): [voice prompting guide](https://developers.openai.com/api/docs/guides/voice-prompting).
