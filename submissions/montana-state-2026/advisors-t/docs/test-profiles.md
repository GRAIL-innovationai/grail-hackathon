# Beta test profiles

Paste each message into the agent as the student's first message. Check the expected behavior.

| # | Student message | Language | Expected behavior |
|---|---|---|---|
| 1 | "I love video games and I'm good at math. I'd like to make my own game someday." | English | Top match: Computer Science B.S. (High). Data Science and Mechanical Engineering tie for 2nd on score; Data Science must be flagged "Limited data". Mentions CSCI 127 as first check. Next step names Shaniah Lilliana Blanchard as the advisor. |
| 2 | "Me gusta armar cosas y arreglar carros con mi papá. La física me parece interesante." | Spanish | Reply in Spanish. Top match: Mechanical Engineering B.S. Explains "credit", "capstone" in Spanish. Cites EMEC 100. |
| 3 | "I want to study business and maybe run a company, but I'm scared of math." | English | Top match: Business Management. Explains math is moderate (College Algebra and Intro Statistics). Does not push high-math majors, or flags the math concern kindly. |
| 4 | "No sé qué me gusta, la verdad." | Spanish | No recommendations yet. Asks at most 2 follow-up questions in Spanish. |
| 5 | "Can you tell me about the Nursing major?" | English | Says Nursing is not in the beta dataset and suggests the official MSU catalog. Does not invent details. |
| 6 | Example transcript (fictional) + "Quiero estudiar Computer Science. ¿Con qué clases empiezo?" | Spanish | Starting plan for CS B.S.: CSCI 127, M 171Q, CSCI 132 among the first. Mentions the precalculus grade and math placement. Says the high-school programming course may be similar but only an advisor decides transfer. Cites the CS source. |
| 7 | "Can you help me write an email to my advisor Shaniah? I want to meet to talk about which classes to take first. I'm thinking about Computer Science." | English | Drafts right away in English. Uses the full name from `advisors` (Shaniah Lilliana Blanchard) in the To line and greeting "Dear Shaniah," or "Dear Shaniah Blanchard," (no Ms.). Specific subject. 120-180 word body with a 20-30 min meeting request. [Your name], [Advisor's email], availability as placeholders. To line uses shaniah.blanchard@montana.edu. Mentions 361 Barnard Hall / (406) 994-4794 before sending. Copy button shows. |
| 8 | "Quiero escribirle a un profesor de Computer Science porque me interesa investigar inteligencia artificial." | Spanish | Asks for the professor's name (and what the student knows about their work), max 2 questions, in Spanish. Does not invent professors or research. |
| 9 | "I love video games and I'm good at math." then "Yes, help me get ready for the career fair." | English | Says the Engineering & Computer Science Networking Reception (Sept 29, 2026) already happened; points to the spring 2027 fair (date not announced) and HireABobcat. 70-90 word pitch with [Your name], no invented experience, ends with a question for the recruiter. One delivery tip. |
| 10 | "Eu gosto de programar e quero estudar Computer Science." | Portuguese (BR) | Replies in Brazilian Portuguese. Explains *major* as "curso" and *credit* as "crédito". Ends by asking once if the student is international. |
| 11 | (after 10) "Sim, sou do Brasil." | Portuguese (BR) | Explains 1 credit ≈ 45 hours/semester, 12 credits = full time, ~15/semester to finish in 4 years, A-F and 4.0 GPA; compares with *carga horária*; says MSU decides transfer credit. No visa content. |
| 12 | "我喜欢数学，想当工程师。" | Chinese (Simplified) | Replies in Simplified Chinese. Mechanical Engineering appears with 机械工程 explanation; uses 学分, 先修课程, 毕业综合项目. |
| 13 | "Je ne sais pas si je dois choisir Business ou Data Science." | French | Replies in French; *majeure* for major; flags Data Science as limited data. |
| 14 | Pick **Montana Tech**, then "I like computers and rocks." | English | Recommends only Montana Tech majors (e.g. Computer Science, Mining Engineering) with mtech.edu sources. Names Cullen Gilbreath as the first-year advisor for those majors. |
| 15 | Pick **MSU Billings**, then "I want to study computer science." | English | Says computer science isn't in its dataset (MSU Billings has no CS bachelor's; the Information Systems minor and City College programs are outside the dataset). Offers the closest fits honestly. |
| 16 | Pick **University of Montana**, then "Help me email my Psychology advisor. My last name is Garcia." | English | Uses Rachel Towery (last names G-Z), rachel.towery@mso.umt.edu. No invented office or phone. |
| 17 | Pick **MSU**, then ask about Montana Tech's Petroleum Engineering. | English | Says it's set up for Montana State University and the student can change university on the page. |

## Pass criteria
- Correct language in every reply.
- Every recommendation cites a source URL and date from `catalog.json`.
- No invented facts (check course codes against the catalog).
- Profile 4 gets questions, not matches.
- Profile 5 gets an honest "not available" answer.
- Profile 6 never promises transfer credit or placement.
- Profiles 7-8: no invented names, emails, office hours or research areas; the email body is in English.
- Profiles 10-13: reply in the student's language with natural terms from the multilingual table.
- The international question is asked at most once per conversation and never replaces the answer.
- Profile 9: no invented events, dates, employers or student experience.
- Profiles 14-17: answers use only the chosen university's catalog.
