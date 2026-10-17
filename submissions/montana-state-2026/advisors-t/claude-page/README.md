# Claude student page

`campus-advisor-claude-page.html` is the source of the Campus Advisor page hosted on Claude (https://claude.ai/artifact/T2wpv9f4LdzBkizvE2pXkG).

- It only works when it's opened as a Claude artifact: it asks Claude through the artifact runtime, using each student's own Claude account. Opened directly in a browser, it shows the picker but can't answer.
- Everything it needs is inside the one file: the agent prompt, the 6 skills and the 4 university catalogs.
- To run Campus Advisor on your own computer or a server, use the web app in the main folder (`START.bat`).
