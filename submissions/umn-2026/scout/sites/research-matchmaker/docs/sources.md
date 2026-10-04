# Research Matchmaker v1 source register

Reviewed on **October 3, 2026** (America/Chicago). Every link included below was opened during this review. `checkedAt` records this review date, not the date a professor updated a webpage or a guarantee that a fact will remain current.

The v1 built-in sample collection contains eight exploratory directions and eight faculty profiles at the **University of Minnesota Twin Cities**. The product should ask each student for their university; UMN is the scope of this sample collection, not an assumed school for all students. This collection is a curated starting point, not an exhaustive faculty search or a live job board. Direction descriptions, small activities, skills, and conversation starters are authored educational suggestions. Faculty research summaries and titles are grounded in the official pages below. Suggested fit is an interpretation of thematic overlap, not an endorsement by the professor or an admission assessment.

## Faculty evidence

| Catalog ID | Faculty member | Official source | What was checked |
| --- | --- | --- | --- |
| `loren-terveen` | Loren Terveen | [UMN CS&E profile](https://cse.umn.edu/cs/loren-terveen) | Professor and department head; social computing, HCI, intelligent systems, and ethical research with online communities. |
| `joseph-konstan` | Joseph A. Konstan | [UMN faculty website](https://konstan.umn.edu/) | Distinguished McKnight University Professor; recommender systems, social computing, and HCI. |
| `david-deliema` | David DeLiema | [UMN Educational Psychology profile](https://edpsych.umn.edu/david-deliema) | Associate professor; responses to learning failures, computing education, play, spatial reasoning, and classroom interaction. Listed as an adjacent learning-sciences match, not as a claim that his work is principally predictive analytics. |
| `chad-myers` | Chad L. Myers | [UMN CS&E profile](https://cse.umn.edu/cs/chad-myers) | Professor; computational integration of genomic data and biological networks. |
| `forest-isbell` | Forest Isbell | [UMN College of Biological Sciences profile](https://cbs.umn.edu/directory/forest-isbell) | Professor; biodiversity, ecosystem functioning, plant communities, and environmental change. |
| `david-redish` | A. David Redish | [UMN Medical School profile](https://med.umn.edu/bio/david-redish) | Distinguished McKnight University Professor; decision processes, neural systems, and computational approaches. |
| `volkan-isler` | Volkan Isler | [UMN CS&E profile](https://cse.umn.edu/cs/volkan-isler) | Professor; robotics, agricultural automation, computer vision, and geometric algorithms. |
| `moin-syed` | Moin Syed | [UMN College of Liberal Arts profile](https://cla.umn.edu/about/directory/profile/moin) | Professor; current emphasis on meta-science and research reform, with continuing identity-development work. |

**Availability is `unknown` for every professor.** A faculty biography, grant, publication, or existing student list does not establish an undergraduate opening. No contact address is guessed, and the collection makes no claims about pay, eligibility, supervision capacity, response likelihood, or acceptance. Students should use the official profile to check contact instructions and ask about a suitable next step.

## Open learning resources

These are links to publishers' or institutions' own materials, not copied lessons. Small first steps are orientation activities; they are not prerequisites imposed by the listed professors and do not certify research readiness.

| Direction ID | Resource reviewed | Suggested entry point |
| --- | --- | --- |
| `human-computer-interaction` | [MIT OCW: User Interface Design and Implementation](https://ocw.mit.edu/courses/6-831-user-interface-design-and-implementation-spring-2011/) | Usability and user-centered design materials. The complete course includes more demanding implementation work. |
| `recommender-systems` | [Google: Recommendations — what and why?](https://developers.google.com/machine-learning/recommendation/overview) | The overview, followed by the approach that interests the learner. |
| `learning-analytics` | [SoLAR: What is Learning Analytics?](https://www.solaresearch.org/about/what-is-learning-analytics/) | The definition, examples, and ethical questions about educational data. |
| `bioinformatics` | [EMBL-EBI: Bioinformatics for the terrified](https://www.ebi.ac.uk/training/online/courses/bioinformatics-terrified/) | What bioinformatics is and what public databases contain. Basic life-science knowledge is helpful. |
| `ecology-conservation` | [Data Carpentry: R for Ecologists](https://datacarpentry.github.io/R-ecology-lesson/) | The introductory lesson. Hands-on work requires R/RStudio setup; no previous programming knowledge is assumed. |
| `neuroscience` | [MIT OCW: The Human Brain](https://ocw.mit.edu/courses/9-13-the-human-brain-spring-2019/) | The introductory lecture; then one topic of interest. |
| `robotics` | [Northwestern: Foundations of Robot Motion](https://modernrobotics.northwestern.edu/nu-gm-book-resource/foundations-of-robot-motion/) | The short overview and degrees-of-freedom videos. Advanced chapters require more mathematics. |
| `social-behavioral-science` | [OpenStax Psychology 2e: Psychological Research](https://openstax.org/books/psychology-2e/pages/2-introduction) | Research approaches, interpreting findings, and research ethics. |

The older [UMN Research Methods in Psychology textbook landing page](https://open.lib.umn.edu/psychologyresearchmethods/) stated that the book had been removed from its collection when checked, so it was not included as a learning resource. Search snippets alone were not treated as sufficient verification.

## Updating this collection

1. Before a release, reopen each official faculty page and check affiliation, role, research description, and redirects. Revise or remove a stale profile; do not infer a current appointment from an old news story.
2. Open each learning link and verify that the actual material remains accessible and appropriate for its stated starting level. Replace removed content rather than preserving a working landing-page URL with no usable lesson.
3. Keep source titles and URLs next to each faculty record in `server/catalog.ts`. Update `checkedAt` only for pages actually reviewed. A future partial refresh should use per-source dates instead of changing the shared date for all records.
4. Keep all opportunities `unknown` in this version. Supporting verified openings would require a separate opportunity record with its own explicit posting, date, eligibility, and expiry; do not overload a faculty biography into a vacancy claim.
5. Treat new schools and disciplines as coverage additions requiring source review. Do not silently substitute UMN faculty as local matches for a student at another university.

This static catalog does not perform automatic source refresh or web search. A separate live search can look for faculty at a student’s chosen school, but any such results must carry their own evidence and must not inherit this collection’s review date. No external service receives student profiles when this static collection alone is consulted.
