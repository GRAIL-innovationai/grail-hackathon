/* ============================================================
   Blocking members (App Store guideline 1.2): Block under a post or comment hides that member's
   posts, comments and notifications from the blocker at once, files the item for the moderators,
   is listed in Settings with Unblock, and never touches anyone else's view.
   ============================================================ */
const T = require('./lib');
(async () => {
  const { mk, txt, login, api, go, log, check } = await T.start();
  const ALICE = 'alice.a@montana.edu', BOB = 'bob.bmu6j92pq@montana.edu';
  // celebrations (a new league, a badge) would cover the page; they are not what this test is about
  const quiet = () => document.addEventListener('DOMContentLoaded', () => { const st = document.createElement('style'); st.textContent = '.celebrate{display:none!important}'; document.head.appendChild(st); });
  const [ca, a] = await mk(1280, 900); await ca.addInitScript(quiet); await go(a, '#/'); check('Alice signs in', await login(a, ALICE));
  const [cb, b] = await mk(1280, 900); await cb.addInitScript(quiet); await go(b, '#/'); check('Bob signs in', await login(b, BOB));
  // a clean start: nothing blocked from earlier runs
  for (const x of ((await api(a, 'forum_blocks')).json.blocks || [])) await api(a, 'forum_unblock', { id: x.id });

  const stamp = Date.now().toString(36);
  const mine = (await api(a, 'forum_post_create', { title: 'Block test, Alice asks ' + stamp, body: 'How do I study for the exam?', course: 'general', flair: 'question' })).json.post;
  const his = (await api(b, 'forum_post_create', { title: 'Block test, Bob posts ' + stamp, body: 'Something unkind.', course: 'general', flair: 'discussion' })).json.post;
  const hisComment = (await api(b, 'forum_comment_create', { post_id: mine.id, body: 'A rude comment ' + stamp })).json.comment;
  check('the test posts and comment exist', mine && his && hisComment, { mine: !!mine, his: !!his, c: !!hisComment });

  // the Block button sits next to Report, under Bob's comment, and blocks from there
  await a.reload(); await go(a, '#/forum/' + mine.id, 1500);
  const btn = await a.$(`#fc-${hisComment.id} [data-action="block"]`);
  check('Bob\'s comment has a Block button next to Report', !!btn && !!(await a.$(`#fc-${hisComment.id} [data-action="report"]`)));
  check('Alice\'s own post has no Block button', !(await a.$(`#fp-${mine.id} [data-action="block"]`)));
  await btn.click(); await a.waitForTimeout(1500);
  const cText = await txt(a, `#fc-${hisComment.id}`);
  check('the comment is hidden at once, without a reload', /Hidden because you blocked this member/.test(cText) && !cText.includes('rude comment'), cText.slice(0, 120));
  check('a hidden comment has no vote, reply or report buttons', !(await a.$(`#fc-${hisComment.id} > .fa-c-actions [data-action]`)));

  // the server keeps the block for every surface
  const list = (await api(a, 'forum_posts&course=all&sort=new')).json.posts.map(p => p.id);
  check('Bob\'s posts are gone from Alice\'s list', !list.includes(his.id) && list.includes(mine.id));
  const open = await api(a, 'forum_post&id=' + his.id);
  check('opening Bob\'s post says it is blocked', open.status === 403 && open.json.blocked === true, open.json);
  const bobList = (await api(b, 'forum_posts&course=all&sort=new')).json.posts.map(p => p.id);
  check('Bob still sees everything (a block only changes the blocker\'s view)', bobList.includes(his.id) && bobList.includes(mine.id));
  const before = (await api(a, 'notif_list')).json.notifications.length;
  await api(b, 'forum_comment_create', { post_id: mine.id, body: 'Another one ' + stamp });
  const after = (await api(a, 'notif_list')).json;
  check('Bob\'s new comments no longer notify Alice', after.notifications.length === before && !after.notifications.some(n => (n.snippet || '').includes(stamp)), after.notifications.slice(0, 2));
  const self = await api(a, 'forum_block', { kind: 'p', id: mine.id });
  check('nobody can block themself', self.status === 400 || self.json.ok === false, self.json);

  // the moderators hear about it
  const [cm, m] = await mk(1280, 900); await cm.addInitScript(quiet); await go(m, '#/'); await login(m, 'mod.user@montana.edu');
  const reps = (await api(m, 'forum_reports')).json.reports || [];
  check('the blocked comment is in the moderators\' report queue', reps.some(r => r.kind === 'c' && r.item_id === hisComment.id && /Blocked the author/.test(r.reason)), reps.slice(0, 2).map(r => r.reason));

  // Settings lists the block and undoes it
  await go(a, '#/settings', 1800);
  const sec = await txt(a, '#acct-blocks');
  check('Settings lists the blocked member', /Bob|bob/.test(sec) && !!(await a.$('#acct-blocks [data-action="unblock"]')), sec);
  await a.click('#acct-blocks [data-action="unblock"]'); await a.waitForTimeout(1200);
  check('Unblock empties the list', /not blocked anyone/.test(await txt(a, '#acct-blocks')));
  const back = (await api(a, 'forum_posts&course=all&sort=new')).json.posts.map(p => p.id);
  check('after unblocking, Bob\'s posts show again', back.includes(his.id));

  // blocking from an anonymous post never reveals who wrote it: only that member's anonymous posts are hidden
  const anonPost = (await api(b, 'forum_post_create', { title: 'Block test, Bob anonymously ' + stamp, body: 'Mean words.', course: 'general', flair: 'discussion', anon: true })).json.post;
  const ab = await api(a, 'forum_block', { kind: 'p', id: anonPost.id });
  const afterAnon = (await api(a, 'forum_posts&course=all&sort=new')).json.posts.map(p => p.id);
  const ablist = (await api(a, 'forum_blocks')).json.blocks;
  check('blocking an anonymous post hides it but keeps the author\'s named posts (no unmasking)', ab.json.ok && !afterAnon.includes(anonPost.id) && afterAnon.includes(his.id), { anon: afterAnon.includes(anonPost.id), named: afterAnon.includes(his.id) });
  check('the block list says "An anonymous member", never the name', ablist.length === 1 && ablist[0].label === 'An anonymous member' && ablist[0].anon === true && !JSON.stringify(ablist).toLowerCase().includes('bob'), ablist);
  await api(b, 'forum_comment_create', { post_id: mine.id, body: 'Named reply ' + stamp });
  check('their named replies still notify (only anonymous ones are blocked)', (await api(a, 'notif_list')).json.notifications.some(n => (n.snippet || '').includes('Named reply ' + stamp)));
  for (const x of ablist) await api(a, 'forum_unblock', { id: x.id });
  await api(b, 'forum_post_delete', { id: anonPost.id });

  // tidy up: the test posts go away (as their authors) and the reports are dismissed
  await api(a, 'forum_post_delete', { id: mine.id }); await api(b, 'forum_post_delete', { id: his.id });
  for (const r of reps.filter(r => r.item_id === hisComment.id)) await api(m, 'forum_mod', { action: 'resolve', report_id: r.id });
  log('cleaned up');
  await Promise.all([ca.close(), cb.close(), cm.close()]);
  await T.finish();
})();
