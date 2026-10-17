<?php
/* ============================================================
   Mathub — discussion board endpoints (posts, comments, votes,
   reports, moderation). Included by index.php for forum_* routes.
   ============================================================ */
declare(strict_types=1);
require_once __DIR__ . '/filter.php';
require_once __DIR__ . '/social.php';

const MH_FLAIRS = ['question', 'discussion', 'resource', 'study-group', 'exam', 'other'];
const MH_PAGE = 25;

function mh_banned(int $userId): ?array {
  $st = mh_db()->prepare('SELECT * FROM bans WHERE user_id = ? AND until > ?'); $st->execute([$userId, time()]); $b = $st->fetch(); return $b ?: null;
}
function mh_can_post(array $u): void {
  if ((int)($u['terms_accepted'] ?? 0) <= 0) mh_fail('Please accept the community rules before posting.', 403, ['terms' => false]);
  if ($b = mh_banned((int)$u['id'])) mh_fail('Your posting access is paused until ' . gmdate('M j, Y', (int)$b['until']) . ($b['reason'] ? ' (' . $b['reason'] . ')' : '') . '.', 403, ['banned' => true]);
}
/** the members this user blocked: 'all' hides everything they post, 'anon' only what they post anonymously.
    Their content is hidden from this user only. */
function mh_blocks(?array $me): array {
  static $cache = []; if (!$me) return ['all' => [], 'anon' => []]; $id = (int)$me['id'];
  if (!isset($cache[$id])) { $out = ['all' => [], 'anon' => []]; $st = mh_db()->prepare('SELECT blocked_id, anon FROM member_blocks WHERE user_id = ?'); $st->execute([$id]); foreach ($st->fetchAll() as $r) $out[(int)$r['anon'] ? 'anon' : 'all'][] = (int)$r['blocked_id']; $cache[$id] = $out; }
  return $cache[$id];
}
function mh_blocked_author(array $bl, int $authorId, bool $anon): bool { return in_array($authorId, $bl['all'], true) || ($anon && in_array($authorId, $bl['anon'], true)); }
function mh_has_blocked(int $userId, int $otherId, bool $anon): bool { $st = mh_db()->prepare('SELECT 1 FROM member_blocks WHERE user_id = ? AND blocked_id = ? AND (anon = 0 OR ? = 1)'); $st->execute([$userId, $otherId, $anon ? 1 : 0]); return (bool)$st->fetchColumn(); }
function mh_hot(int $score, int $created): float { $s = $score === 0 ? 0 : ($score > 0 ? 1 : -1) * log10(max(abs($score), 1)); return $s + ($created - 1600000000) / 45000; }
function mh_post_row(array $p, ?array $me, bool $mod, array $votes = []): array {
  $mine = $me && (int)$p['user_id'] === (int)$me['id']; $removed = (int)$p['removed'];
  $out = ['id' => (int)$p['id'], 'course' => $p['course'], 'flair' => $p['flair'], 'title' => $removed ? ($removed === 2 ? '[removed by a moderator]' : '[deleted]') : $p['title'], 'body' => $removed ? '' : $p['body'],
    'anon' => (int)$p['anon'], 'author' => (int)$p['anon'] ? 'Anonymous' : mh_display_name($p, 'u_'), 'mine' => $mine, 'created' => (int)$p['created'], 'edited' => $p['edited'] ? (int)$p['edited'] : null,
    'score' => (int)$p['score'], 'ncomments' => (int)$p['ncomments'], 'pinned' => (int)$p['pinned'], 'locked' => (int)$p['locked'], 'removed' => $removed, 'vote' => $votes['p' . $p['id']] ?? 0,
    'accepted_id' => $p['accepted_id'] ? (int)$p['accepted_id'] : null, 'author_role' => (int)$p['anon'] ? '' : mh_role($p['u_email']), 'has_poll' => isset($p['has_poll']) ? (int)$p['has_poll'] === 1 : null, 'system' => $p['u_email'] === 'mathub@system.local'];
  if ($mod) { $out['author_real'] = mh_display_name($p, 'u_') . ' <' . $p['u_email'] . '>'; $out['user_id'] = (int)$p['user_id']; if ($removed) { $out['title_real'] = $p['title']; $out['body_real'] = $p['body']; } }
  return $out;
}
function mh_comment_row(array $c, ?array $me, bool $mod, int $postAuthor, array $votes = []): array {
  $mine = $me && (int)$c['user_id'] === (int)$me['id']; $removed = (int)$c['removed'];
  $out = ['id' => (int)$c['id'], 'post_id' => (int)$c['post_id'], 'parent_id' => $c['parent_id'] ? (int)$c['parent_id'] : null, 'body' => $removed ? ($removed === 2 ? '[removed by a moderator]' : '[deleted]') : $c['body'],
    'anon' => (int)$c['anon'], 'author' => (int)$c['anon'] ? 'Anonymous' : mh_display_name($c, 'u_'), 'is_op' => (int)$c['user_id'] === $postAuthor, 'mine' => $mine, 'created' => (int)$c['created'], 'edited' => $c['edited'] ? (int)$c['edited'] : null,
    'score' => (int)$c['score'], 'removed' => $removed, 'vote' => $votes['c' . $c['id']] ?? 0, 'author_role' => (int)$c['anon'] ? '' : mh_role($c['u_email']), 'accepted' => isset($c['p_accepted']) && (int)$c['p_accepted'] === (int)$c['id']];
  if ($mod) { $out['author_real'] = mh_display_name($c, 'u_') . ' <' . $c['u_email'] . '>'; $out['user_id'] = (int)$c['user_id']; if ($removed) $out['body_real'] = $c['body']; }
  return $out;
}
function mh_my_votes(?array $me, string $kind, array $ids): array {
  if (!$me || !$ids) return [];
  $q = implode(',', array_fill(0, count($ids), '?')); $st = mh_db()->prepare("SELECT item_id, value FROM votes WHERE user_id = ? AND kind = ? AND item_id IN ($q)"); $st->execute(array_merge([$me['id'], $kind], $ids));
  $out = []; foreach ($st->fetchAll() as $r) $out[$kind . $r['item_id']] = (int)$r['value']; return $out;
}
function mh_recount(string $kind, int $id): int {
  $db = mh_db(); $st = $db->prepare('SELECT COALESCE(SUM(value), 0) FROM votes WHERE kind = ? AND item_id = ?'); $st->execute([$kind, $id]); $score = (int)$st->fetchColumn();
  $db->prepare(($kind === 'p' ? 'UPDATE posts' : 'UPDATE comments') . ' SET score = ? WHERE id = ?')->execute([$score, $id]); return $score;
}
function mh_get_post(int $id): ?array {
  $st = mh_db()->prepare('SELECT p.*, u.name AS u_name, u.email AS u_email FROM posts p JOIN users u ON u.id = p.user_id WHERE p.id = ?'); $st->execute([$id]); $p = $st->fetch(); return $p ?: null;
}
function mh_get_comment(int $id): ?array {
  $st = mh_db()->prepare('SELECT c.*, u.name AS u_name, u.email AS u_email FROM comments c JOIN users u ON u.id = c.user_id WHERE c.id = ?'); $st->execute([$id]); $c = $st->fetch(); return $c ?: null;
}

/** Tells the post author (new comment) and the parent comment's author (reply). Never notifies the actor. Emails at most once per post per 6 hours when the recipient opted in. */
function mh_notify_reply(array $post, ?array $parent, array $actor, int $commentId, string $body, int $anon): void {
  $db = mh_db(); $now = time(); $actorName = $anon ? 'Someone' : mh_display_name($actor); $snippet = mb_substr(mh_censor($body), 0, 140);
  $targets = [];
  if ((int)$post['user_id'] !== (int)$actor['id']) $targets[(int)$post['user_id']] = 'comment';
  if ($parent && (int)$parent['user_id'] !== (int)$actor['id']) $targets[(int)$parent['user_id']] = 'reply';
  foreach ($targets as $uid => $kind) {
    if (mh_has_blocked($uid, (int)$actor['id'], (bool)$anon)) continue;
    $db->prepare('INSERT INTO notifications (user_id, kind, post_id, comment_id, actor_id, actor, title, snippet, created) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')->execute([$uid, $kind, $post['id'], $commentId, $actor['id'], $actorName, mb_substr($post['title'], 0, 120), $snippet, $now]);
    $st = $db->prepare('SELECT * FROM users WHERE id = ?'); $st->execute([$uid]); $to = $st->fetch();
    if ($to && (int)($to['notify_email'] ?? 1) === 1 && (int)$to['verified'] === 1 && mh_rate("notifmail:{$uid}:{$post['id']}", 1, 6 * 3600)) {
      try {
        require_once __DIR__ . '/mailer.php'; $cfg = mh_config(); $site = $cfg['site_name'] ?? 'Mathub';
        $link = rtrim((string)(($cfg['site_url'] ?? '') ?: ('https://' . ($_SERVER['HTTP_HOST'] ?? 'mathub.space'))), '/') . '/#/forum/' . (int)$post['id'];
        $what = $kind === 'reply' ? 'replied to your comment on' : 'commented on your post';
        $subject = $actorName . ' ' . $what . ' "' . mb_substr($post['title'], 0, 60) . '"';
        $text = $actorName . ' ' . $what . " \"{$post['title']}\":\n\n$snippet\n\nOpen it: $link\n\nYou can turn these emails off in Settings → Account on $site.";
        $html = '<div style="font-family:Helvetica Neue,Helvetica,Arial,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#131C2E"><p style="margin:0 0 10px"><b>' . htmlspecialchars($actorName) . '</b> ' . $what . ' <b>' . htmlspecialchars($post['title']) . '</b></p><blockquote style="margin:0 0 14px;padding:10px 14px;border-left:3px solid #9DB4EA;background:#F6F8FB;border-radius:0 6px 6px 0">' . nl2br(htmlspecialchars($snippet)) . '</blockquote><p><a href="' . htmlspecialchars($link) . '" style="display:inline-block;background:#2B55B8;color:#fff;text-decoration:none;padding:9px 14px;border-radius:8px">Open the discussion</a></p><p style="font-size:12px;color:#64718A">You can turn these emails off in Settings → Account on ' . htmlspecialchars($site) . '.</p></div>';
        mh_send_mail($cfg, $to['email'], $subject, $text, $html);
      } catch (Throwable $e) { /* email is best-effort */ }
    }
  }
}

function mh_forum_route(string $route, array $in, array $cfg, string $ip): void {
  $db = mh_db(); $me = mh_current_user(); $mod = mh_is_mod($me); $now = time();
  switch ($route) {

    case 'terms_accept':
      mh_method('POST'); $u = mh_require_user();
      $db->prepare('UPDATE users SET terms_accepted = ? WHERE id = ?')->execute([$now, $u['id']]); $u['terms_accepted'] = $now;
      mh_json(['ok' => true, 'user' => mh_user_public($u)]);

    case 'forum_posts':
      mh_method('GET');
      $course = (string)($_GET['course'] ?? ''); $sort = (string)($_GET['sort'] ?? 'hot'); $q = trim((string)($_GET['q'] ?? '')); $page = max(0, (int)($_GET['page'] ?? 0));
      $where = ['p.removed = 0']; $args = [];
      $bl = mh_blocks($me); if ($bl['all']) $where[] = 'p.user_id NOT IN (' . implode(',', $bl['all']) . ')'; if ($bl['anon']) $where[] = 'NOT (p.anon = 1 AND p.user_id IN (' . implode(',', $bl['anon']) . '))';
      if ($course !== '' && $course !== 'all') { if (!mh_is_course($course, true)) mh_fail('Unknown class.'); $where[] = 'p.course = ?'; $args[] = $course; }
      $filter = (string)($_GET['filter'] ?? ''); if ($filter === 'unanswered') { $where[] = 'p.ncomments = 0'; $where[] = 'u.email <> "mathub@system.local"'; } elseif ($filter === 'solved') $where[] = 'p.accepted_id IS NOT NULL'; elseif ($filter === 'polls') $where[] = 'EXISTS (SELECT 1 FROM polls pl WHERE pl.post_id = p.id)';
      if ($q !== '') { $where[] = '(p.title LIKE ? OR p.body LIKE ?)'; $like = '%' . str_replace(['%', '_'], ['\\%', '\\_'], mb_substr($q, 0, 80)) . '%'; $args[] = $like; $args[] = $like; }
      $order = $sort === 'new' ? 'p.created DESC' : ($sort === 'top' ? 'p.score DESC, p.created DESC' : 'p.created DESC');
      $limit = $sort === 'hot' ? 400 : MH_PAGE + 1; $offset = $sort === 'hot' ? 0 : $page * MH_PAGE;
      $st = $db->prepare('SELECT p.*, u.name AS u_name, u.email AS u_email, EXISTS (SELECT 1 FROM polls pl WHERE pl.post_id = p.id) AS has_poll FROM posts p JOIN users u ON u.id = p.user_id WHERE ' . implode(' AND ', $where) . " ORDER BY p.pinned DESC, $order LIMIT $limit OFFSET $offset"); $st->execute($args); $rows = $st->fetchAll();
      if ($sort === 'hot') { usort($rows, fn($a, $b) => ($b['pinned'] <=> $a['pinned']) ?: (mh_hot((int)$b['score'], (int)$b['created']) <=> mh_hot((int)$a['score'], (int)$a['created']))); $rows = array_slice($rows, $page * MH_PAGE, MH_PAGE + 1); }
      $more = count($rows) > MH_PAGE; $rows = array_slice($rows, 0, MH_PAGE);
      $votes = mh_my_votes($me, 'p', array_map(fn($r) => (int)$r['id'], $rows));
      $posts = array_map(function ($r) use ($me, $mod, $votes) { $o = mh_post_row($r, $me, $mod, $votes); if (!$me) { $o['body'] = ''; $o['author'] = ''; $o['preview'] = true; } else $o['body'] = mb_substr($o['body'], 0, 400); return $o; }, $rows);
      mh_json(['ok' => true, 'posts' => $posts, 'more' => $more, 'page' => $page, 'guest' => !$me]);

    case 'forum_post':
      mh_method('GET'); $u = mh_require_user();
      $p = mh_get_post((int)($_GET['id'] ?? 0)); if (!$p || ((int)$p['removed'] === 2 && !$mod && (int)$p['user_id'] !== (int)$u['id'])) mh_fail('That post is not available.', 404);
      $bl = mh_blocks($u); if (mh_blocked_author($bl, (int)$p['user_id'], (int)$p['anon'] === 1)) mh_fail('You blocked the member who wrote this post. You can unblock them in Settings, under Blocked members.', 403, ['blocked' => true]);
      $st = $db->prepare('SELECT c.*, u.name AS u_name, u.email AS u_email, ? AS p_accepted FROM comments c JOIN users u ON u.id = c.user_id WHERE c.post_id = ? ORDER BY c.created ASC'); $st->execute([(int)$p['accepted_id'], $p['id']]); $cs = $st->fetchAll();
      $votes = array_merge(mh_my_votes($u, 'p', [(int)$p['id']]), mh_my_votes($u, 'c', array_map(fn($c) => (int)$c['id'], $cs)));
      $b = mh_banned((int)$u['id']);
      mh_json(['ok' => true, 'post' => mh_post_row($p, $u, $mod, $votes), 'comments' => array_map(function ($c) use ($u, $mod, $p, $votes, $bl) { $o = mh_comment_row($c, $u, $mod, (int)$p['user_id'], $votes); if (mh_blocked_author($bl, (int)$c['user_id'], (int)$c['anon'] === 1)) { $o['body'] = ''; $o['author'] = ''; $o['author_role'] = ''; $o['blocked'] = true; } return $o; }, $cs), 'poll' => mh_poll_view((int)$p['id'], (int)$u['id']), 'mod' => $mod, 'banned' => $b ? (int)$b['until'] : 0, 'terms' => (int)$u['terms_accepted'] > 0]);

    case 'forum_post_create':
      mh_method('POST'); $u = mh_require_user(); mh_can_post($u);
      mh_rate_or_fail("post:user:{$u['id']}", 12, 3600, 'You are posting very fast. Take a short break and try again.');
      $course = (string)($in['course'] ?? 'general'); $flair = (string)($in['flair'] ?? 'question');
      if (!mh_is_course($course, true)) mh_fail('Pick a class for the post.'); if (!in_array($flair, MH_FLAIRS, true)) $flair = 'other';
      $title = trim(preg_replace('/\s+/u', ' ', mh_str($in, 'title', 140))); $body = trim(mb_substr((string)($in['body'] ?? ''), 0, 8000));
      if (mb_strlen($title) < 3) mh_fail('Give the post a title (at least 3 characters).'); if ($body === '') mh_fail('Write something in the body.');
      $title = mh_censor($title); $body = mh_censor($body); $anon = !empty($in['anon']) ? 1 : 0;
      $db->prepare('INSERT INTO posts (user_id, course, flair, title, body, anon, created, ip) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')->execute([$u['id'], $course, $flair, $title, $body, $anon, $now, $ip]);
      $id = (int)$db->lastInsertId();
      $db->prepare('INSERT OR REPLACE INTO votes (user_id, kind, item_id, value) VALUES (?, "p", ?, 1)')->execute([$u['id'], $id]); mh_recount('p', $id);
      if (!empty($in['poll']) && is_array($in['poll']) && !empty($in['poll']['options'])) { try { mh_poll_create($id, (array)$in['poll']['options'], (string)($in['poll']['question'] ?? ''), !empty($in['poll']['multi']) ? 1 : 0); } catch (Throwable $e) { $db->prepare('DELETE FROM posts WHERE id = ?')->execute([$id]); if (!($e instanceof RuntimeException) || $e instanceof PDOException) { error_log('Mathub poll: ' . $e->getMessage()); mh_fail('The poll could not be saved. Please try again.', 500); } mh_fail($e->getMessage()); } }
      mh_activity('post', $course, ($flair === 'question' ? 'New question: ' : 'New post: ') . $title, '#/forum/' . $id); mh_award_badges((int)$u['id'], [], $course);
      mh_json(['ok' => true, 'post' => mh_post_row(mh_get_post($id), $u, $mod, ['p' . $id => 1])]);

    case 'forum_post_edit':
      mh_method('POST'); $u = mh_require_user(); mh_can_post($u);
      $p = mh_get_post((int)($in['id'] ?? 0)); if (!$p || (int)$p['user_id'] !== (int)$u['id'] || (int)$p['removed']) mh_fail('You can only edit your own posts.', 403);
      $title = trim(preg_replace('/\s+/u', ' ', mh_str($in, 'title', 140))); $body = trim(mb_substr((string)($in['body'] ?? ''), 0, 8000));
      if (mb_strlen($title) < 3 || $body === '') mh_fail('A title and a body are required.');
      $db->prepare('UPDATE posts SET title = ?, body = ?, edited = ? WHERE id = ?')->execute([mh_censor($title), mh_censor($body), $now, $p['id']]);
      mh_json(['ok' => true, 'post' => mh_post_row(mh_get_post((int)$p['id']), $u, $mod, mh_my_votes($u, 'p', [(int)$p['id']]))]);

    case 'forum_post_delete':
      mh_method('POST'); $u = mh_require_user();
      $p = mh_get_post((int)($in['id'] ?? 0)); if (!$p) mh_fail('Post not found.', 404);
      if ((int)$p['user_id'] === (int)$u['id']) $db->prepare('UPDATE posts SET removed = 1 WHERE id = ?')->execute([$p['id']]);
      elseif ($mod) $db->prepare('UPDATE posts SET removed = 2 WHERE id = ?')->execute([$p['id']]);
      else mh_fail('You can only delete your own posts.', 403);
      mh_json(['ok' => true]);

    case 'forum_comment_create':
      mh_method('POST'); $u = mh_require_user(); mh_can_post($u);
      mh_rate_or_fail("comment:user:{$u['id']}", 80, 3600, 'You are commenting very fast. Take a short break and try again.');
      $p = mh_get_post((int)($in['post_id'] ?? 0)); if (!$p || (int)$p['removed']) mh_fail('That post is not available.', 404);
      if ((int)$p['locked'] && !$mod) mh_fail('This post is locked; no new comments.', 403);
      $parent = (int)($in['parent_id'] ?? 0) ?: null;
      if ($parent) { $pc = mh_get_comment($parent); if (!$pc || (int)$pc['post_id'] !== (int)$p['id']) mh_fail('Reply target not found.', 404); }
      $body = trim(mb_substr((string)($in['body'] ?? ''), 0, 3000)); if ($body === '') mh_fail('Write a comment first.');
      $anon = !empty($in['anon']) ? 1 : 0;
      $db->prepare('INSERT INTO comments (post_id, user_id, parent_id, body, anon, created, ip) VALUES (?, ?, ?, ?, ?, ?, ?)')->execute([$p['id'], $u['id'], $parent, mh_censor($body), $anon, $now, $ip]);
      $id = (int)$db->lastInsertId();
      $db->prepare('INSERT OR REPLACE INTO votes (user_id, kind, item_id, value) VALUES (?, "c", ?, 1)')->execute([$u['id'], $id]); mh_recount('c', $id);
      $db->prepare('UPDATE posts SET ncomments = (SELECT COUNT(*) FROM comments WHERE post_id = ? AND removed = 0) WHERE id = ?')->execute([$p['id'], $p['id']]);
      mh_notify_reply($p, $parent ? mh_get_comment($parent) : null, $u, $id, $body, $anon); mh_award_badges((int)$u['id'], [], $p['course']);
      mh_json(['ok' => true, 'comment' => mh_comment_row(mh_get_comment($id), $u, $mod, (int)$p['user_id'], ['c' . $id => 1])]);

    case 'forum_comment_edit':
      mh_method('POST'); $u = mh_require_user(); mh_can_post($u);
      $c = mh_get_comment((int)($in['id'] ?? 0)); if (!$c || (int)$c['user_id'] !== (int)$u['id'] || (int)$c['removed']) mh_fail('You can only edit your own comments.', 403);
      $body = trim(mb_substr((string)($in['body'] ?? ''), 0, 3000)); if ($body === '') mh_fail('Write a comment first.');
      $db->prepare('UPDATE comments SET body = ?, edited = ? WHERE id = ?')->execute([mh_censor($body), $now, $c['id']]);
      $p = mh_get_post((int)$c['post_id']);
      mh_json(['ok' => true, 'comment' => mh_comment_row(mh_get_comment((int)$c['id']), $u, $mod, (int)$p['user_id'], mh_my_votes($u, 'c', [(int)$c['id']]))]);

    case 'forum_comment_delete':
      mh_method('POST'); $u = mh_require_user();
      $c = mh_get_comment((int)($in['id'] ?? 0)); if (!$c) mh_fail('Comment not found.', 404);
      if ((int)$c['user_id'] === (int)$u['id']) $db->prepare('UPDATE comments SET removed = 1 WHERE id = ?')->execute([$c['id']]);
      elseif ($mod) $db->prepare('UPDATE comments SET removed = 2 WHERE id = ?')->execute([$c['id']]);
      else mh_fail('You can only delete your own comments.', 403);
      $db->prepare('UPDATE posts SET ncomments = (SELECT COUNT(*) FROM comments WHERE post_id = ? AND removed = 0) WHERE id = ?')->execute([$c['post_id'], $c['post_id']]);
      mh_json(['ok' => true]);

    case 'forum_vote':
      mh_method('POST'); $u = mh_require_user();
      mh_rate_or_fail("vote:user:{$u['id']}", 400, 3600);
      $kind = ($in['kind'] ?? '') === 'c' ? 'c' : 'p'; $id = (int)($in['id'] ?? 0); $value = max(-1, min(1, (int)($in['value'] ?? 0)));
      $item = $kind === 'p' ? mh_get_post($id) : mh_get_comment($id); if (!$item || (int)$item['removed']) mh_fail('Not available.', 404);
      if ($value === 0) $db->prepare('DELETE FROM votes WHERE user_id = ? AND kind = ? AND item_id = ?')->execute([$u['id'], $kind, $id]);
      else $db->prepare('INSERT OR REPLACE INTO votes (user_id, kind, item_id, value) VALUES (?, ?, ?, ?)')->execute([$u['id'], $kind, $id, $value]);
      mh_json(['ok' => true, 'score' => mh_recount($kind, $id), 'vote' => $value]);

    case 'forum_report':
      mh_method('POST'); $u = mh_require_user();
      mh_rate_or_fail("report:user:{$u['id']}", 30, 3600);
      $kind = ($in['kind'] ?? '') === 'c' ? 'c' : 'p'; $id = (int)($in['id'] ?? 0); $reason = mh_str($in, 'reason', 300);
      $item = $kind === 'p' ? mh_get_post($id) : mh_get_comment($id); if (!$item) mh_fail('Not available.', 404);
      if ($reason === '') mh_fail('Say briefly what the problem is.');
      $st = $db->prepare('SELECT id FROM reports WHERE kind = ? AND item_id = ? AND user_id = ? AND status = "open"'); $st->execute([$kind, $id, $u['id']]);
      if (!$st->fetch()) $db->prepare('INSERT INTO reports (kind, item_id, user_id, reason, created) VALUES (?, ?, ?, ?, ?)')->execute([$kind, $id, $u['id'], $reason, $now]);
      mh_json(['ok' => true, 'message' => 'Thanks. A moderator will take a look.']);

    case 'forum_block':
      /* blocks the author of a post or comment: their posts, comments, meetups and notifications disappear for this
         member right away, and the item goes to the moderators' report queue (App Store guideline 1.2) */
      mh_method('POST'); $u = mh_require_user();
      mh_rate_or_fail("block:user:{$u['id']}", 40, 3600);
      $kind = ($in['kind'] ?? '') === 'c' ? 'c' : 'p'; $id = (int)($in['id'] ?? 0);
      $item = $kind === 'p' ? mh_get_post($id) : mh_get_comment($id); if (!$item) mh_fail('Not available.', 404);
      $target = (int)$item['user_id'];
      if ($target === (int)$u['id']) mh_fail('That is your own post.');
      if ($item['u_email'] === 'mathub@system.local') mh_fail('Posts from Mathub itself cannot be blocked. Report it instead if something is wrong.');
      $anon = (int)$item['anon'] === 1; $label = $anon ? 'An anonymous member' : mh_display_name($item, 'u_');
      $db->prepare('INSERT OR IGNORE INTO member_blocks (user_id, blocked_id, anon, label, created) VALUES (?, ?, ?, ?, ?)')->execute([$u['id'], $target, $anon ? 1 : 0, mb_substr($label, 0, 80), $now]);
      $db->prepare('UPDATE notifications SET read = 1 WHERE user_id = ? AND actor_id = ?' . ($anon ? ' AND actor = \'Someone\'' : ''))->execute([$u['id'], $target]);
      $reason = mb_substr(trim((string)($in['reason'] ?? '')), 0, 280);
      $st = $db->prepare('SELECT id FROM reports WHERE kind = ? AND item_id = ? AND user_id = ? AND status = "open"'); $st->execute([$kind, $id, $u['id']]);
      if (!$st->fetch()) $db->prepare('INSERT INTO reports (kind, item_id, user_id, reason, created) VALUES (?, ?, ?, ?, ?)')->execute([$kind, $id, $u['id'], 'Blocked the author' . ($reason !== '' ? ': ' . $reason : ''), $now]);
      mh_json(['ok' => true, 'message' => 'Blocked. You will not see their posts, comments or notifications, and the moderators have been told.']);

    case 'forum_blocks':
      mh_method('GET'); $u = mh_require_user();
      $st = $db->prepare('SELECT rowid AS bid, anon, label, created FROM member_blocks WHERE user_id = ? ORDER BY created DESC'); $st->execute([$u['id']]);
      mh_json(['ok' => true, 'blocks' => array_map(fn($r) => ['id' => (int)$r['bid'], 'anon' => (int)$r['anon'] === 1, 'label' => $r['label'], 'created' => (int)$r['created']], $st->fetchAll())]);

    case 'forum_unblock':
      mh_method('POST'); $u = mh_require_user();
      $db->prepare('DELETE FROM member_blocks WHERE rowid = ? AND user_id = ?')->execute([(int)($in['id'] ?? 0), $u['id']]);
      mh_json(['ok' => true]);

    case 'forum_reports':
      mh_method('GET'); $u = mh_require_user(); if (!$mod) mh_fail('Moderators only.', 403);
      $st = $db->query('SELECT r.*, u.email AS reporter FROM reports r JOIN users u ON u.id = r.user_id WHERE r.status = "open" ORDER BY r.created DESC LIMIT 200'); $out = [];
      foreach ($st->fetchAll() as $r) {
        $item = $r['kind'] === 'p' ? mh_get_post((int)$r['item_id']) : mh_get_comment((int)$r['item_id']); if (!$item) continue;
        $out[] = ['id' => (int)$r['id'], 'kind' => $r['kind'], 'item_id' => (int)$r['item_id'], 'post_id' => (int)($r['kind'] === 'p' ? $r['item_id'] : $item['post_id']), 'reason' => $r['reason'], 'reporter' => $r['reporter'], 'created' => (int)$r['created'],
          'snippet' => mb_substr($r['kind'] === 'p' ? $item['title'] . ' — ' . $item['body'] : $item['body'], 0, 200), 'author' => mh_display_name($item, 'u_') . ' <' . $item['u_email'] . '>', 'removed' => (int)$item['removed']];
      }
      $bans = $db->query('SELECT b.*, u.email FROM bans b JOIN users u ON u.id = b.user_id WHERE b.until > ' . $now)->fetchAll();
      mh_json(['ok' => true, 'reports' => $out, 'bans' => array_map(fn($b) => ['user_id' => (int)$b['user_id'], 'email' => $b['email'], 'until' => (int)$b['until'], 'reason' => $b['reason']], $bans)]);

    case 'forum_mod':
      mh_method('POST'); $u = mh_require_user(); $action = (string)($in['action'] ?? ''); $staffOnly = in_array($action, ['pin', 'unpin', 'lock', 'unlock'], true) && mh_role($u['email']) !== '';
      if (!$mod && !$staffOnly) mh_fail('Moderators only.', 403);
      $kind = ($in['kind'] ?? '') === 'c' ? 'c' : 'p'; $id = (int)($in['id'] ?? 0);
      $item = $kind === 'p' ? mh_get_post($id) : mh_get_comment($id);
      if (!$mod && $item && $kind === 'p') { require_once __DIR__ . '/teach.php'; if (!mh_staff_can_course($u, (string)$item['course'])) mh_fail('You can pin and lock posts only on the boards of the classes you teach.', 403); }
      if (in_array($action, ['pin', 'unpin', 'lock', 'unlock'], true)) { if (!$item || $kind !== 'p') mh_fail('Post not found.', 404); $col = in_array($action, ['pin', 'unpin'], true) ? 'pinned' : 'locked'; $db->prepare("UPDATE posts SET $col = ? WHERE id = ?")->execute([in_array($action, ['pin', 'lock'], true) ? 1 : 0, $id]); }
      elseif ($action === 'remove' || $action === 'restore') { if (!$item) mh_fail('Not found.', 404); $db->prepare(($kind === 'p' ? 'UPDATE posts' : 'UPDATE comments') . ' SET removed = ? WHERE id = ?')->execute([$action === 'remove' ? 2 : 0, $id]); if ($kind === 'c') $db->prepare('UPDATE posts SET ncomments = (SELECT COUNT(*) FROM comments WHERE post_id = ? AND removed = 0) WHERE id = ?')->execute([$item['post_id'], $item['post_id']]); }
      elseif ($action === 'ban') { $target = (int)($in['user_id'] ?? 0) ?: ($item ? (int)$item['user_id'] : 0); if (!$target) mh_fail('Who should be banned?'); if ($target === (int)$u['id']) mh_fail('You cannot ban yourself.'); $days = max(1, min(3650, (int)($in['days'] ?? 7))); $db->prepare('INSERT OR REPLACE INTO bans (user_id, until, reason, created) VALUES (?, ?, ?, ?)')->execute([$target, $now + $days * 86400, mh_str($in, 'reason', 200), $now]); }
      elseif ($action === 'unban') { $target = (int)($in['user_id'] ?? 0); $db->prepare('DELETE FROM bans WHERE user_id = ?')->execute([$target]); }
      elseif ($action === 'resolve') { $db->prepare('UPDATE reports SET status = "closed" WHERE id = ?')->execute([(int)($in['report_id'] ?? 0)]); }
      else mh_fail('Unknown moderation action.');
      if (in_array($action, ['remove', 'restore'], true) || ($action === 'ban' && $item)) $db->prepare('UPDATE reports SET status = "closed" WHERE kind = ? AND item_id = ?')->execute([$kind, $id]);
      mh_json(['ok' => true]);

    /* ---------- accepted answers ---------- */
    case 'forum_accept':
      mh_method('POST'); $u = mh_require_user();
      $p = mh_get_post((int)($in['post_id'] ?? 0)); if (!$p) mh_fail('Post not found.', 404);
      if ((int)$p['user_id'] !== (int)$u['id'] && !$mod) mh_fail('Only the person who asked can accept an answer.', 403);
      $cid = (int)($in['comment_id'] ?? 0); $c = mh_get_comment($cid); if (!$c || (int)$c['post_id'] !== (int)$p['id']) mh_fail('Comment not found.', 404);
      $newVal = (int)$p['accepted_id'] === $cid ? null : $cid;
      $db->prepare('UPDATE posts SET accepted_id = ? WHERE id = ?')->execute([$newVal, $p['id']]);
      if ($newVal) { mh_award_badges((int)$c['user_id'], [], $p['course']); mh_activity('solved', $p['course'], 'A question was solved: ' . $p['title'], '#/forum/' . $p['id']); if ((int)$c['user_id'] !== (int)$u['id']) { $db->prepare('INSERT INTO notifications (user_id, kind, post_id, comment_id, actor_id, actor, title, snippet, created) VALUES (?, "accepted", ?, ?, ?, ?, ?, ?, ?)')->execute([$c['user_id'], $p['id'], $cid, $u['id'], mh_display_name($u), mb_substr($p['title'], 0, 120), 'Your answer was accepted', time()]); } }
      mh_json(['ok' => true, 'accepted_id' => $newVal]);

    case 'admin_digest_test':
      mh_method('POST'); $u = mh_require_user(); if (!mh_is_admin($u)) mh_fail('Administrators only.', 403);
      require_once __DIR__ . '/mailer.php'; [$subject, $text, $html] = mh_digest_content($u, mh_digest_context()); $r = mh_send_mail($cfg, $u['email'], $subject, $text, $html);
      if (!$r['ok']) mh_fail('Could not send: ' . ($r['error'] ?? 'unknown error'), 502);
      mh_json(['ok' => true, 'message' => 'Test digest sent to ' . $u['email']]);

    case 'admin_role':
      mh_method('POST'); $u = mh_require_user(); if (!mh_is_admin($u)) mh_fail('Administrators only.', 403);
      $email = strtolower(mh_str($in, 'email', 254)); $role = (string)($in['role'] ?? ''); if (!filter_var($email, FILTER_VALIDATE_EMAIL)) mh_fail('Enter a valid email.'); if (!in_array($role, ['', 'Instructor', 'TA'], true)) mh_fail('Role must be Instructor, TA or empty.');
      if ($role === '') $db->prepare('DELETE FROM roles WHERE email = ?')->execute([$email]); else $db->prepare('INSERT INTO roles (email, role, updated) VALUES (?, ?, ?) ON CONFLICT(email) DO UPDATE SET role = excluded.role, updated = excluded.updated')->execute([$email, $role, time()]);
      mh_json(['ok' => true]);

    case 'admin_user_add':
      // an administrator adds an account for anyone: verified, with a role and a plan if wanted; they either set the
      // password here or the person gets an email with a code (good for 7 days) and a link to choose their own
      mh_method('POST'); $u = mh_require_user(); if (!mh_is_admin($u)) mh_fail('Administrators only.', 403);
      mh_rate_or_fail("admin_user_add:{$u['id']}", 60, 3600, 'That is a lot of new members at once. Wait a little.');
      $email = strtolower(mh_str($in, 'email', 254)); if (!filter_var($email, FILTER_VALIDATE_EMAIL)) mh_fail('Enter a valid email address.', 400, ['field' => 'email']);
      $name = mh_str($in, 'name', 60);
      $role = (string)($in['role'] ?? ''); if (!in_array($role, ['', 'TA', 'Instructor'], true)) mh_fail('Pick student, TA or instructor.', 400, ['field' => 'role']);
      $plan = (string)($in['plan'] ?? ''); if (!in_array($plan, ['', 'pro', 'max'], true)) mh_fail('Pick no plan, Pro or Max.', 400, ['field' => 'plan']);
      $how = ($in['how'] ?? 'invite') === 'password' ? 'password' : 'invite'; $pass = (string)($in['password'] ?? '');
      if ($how === 'password' && ($pe = mh_password_problem($pass, $email)) !== '') mh_fail($pe, 400, ['field' => 'password']);
      $ex = mh_user_by_email($email);
      if ($ex && (int)$ex['verified'] === 1) mh_fail('That address already has an account. Find it in the list below.', 409, ['field' => 'email']);
      $hash = password_hash($how === 'password' ? $pass : bin2hex(random_bytes(24)), PASSWORD_DEFAULT);
      if ($ex) $db->prepare('UPDATE users SET name = ?, pass_hash = ?, verified = 1 WHERE id = ?')->execute([$name !== '' ? $name : (string)$ex['name'], $hash, $ex['id']]);   // a sign-up that never verified
      else $db->prepare('INSERT INTO users (email, name, pass_hash, verified, created) VALUES (?, ?, ?, 1, ?)')->execute([$email, $name, $hash, $now]);
      if ($role !== '') $db->prepare('INSERT INTO roles (email, role, updated) VALUES (?, ?, ?) ON CONFLICT(email) DO UPDATE SET role = excluded.role, updated = excluded.updated')->execute([$email, $role, $now]);
      // a plan is given like Members gives one (no end date); an address outside the sign-up domains may log in, saved like Keys & settings
      if ($plan !== '') { require_once __DIR__ . '/myclasses.php'; mh_plan_gift_set($email, $plan, 0, 'Added with the account', (int)$u['id']); }
      [, $outside] = mh_email_check($email); $changed = [];
      if ($outside) {
        $files = mh_siteconfig_files(); $saved = mh_siteconfig_saved($files);
        $list = array_values(array_map('strtolower', (array)($saved['extra_allowed_emails'] ?? ($files['extra_allowed_emails'] ?? [])))); if (!in_array($email, $list, true)) { $list[] = $email; $saved['extra_allowed_emails'] = $list; $changed[] = 'extra_allowed_emails'; }
        if ($changed) {
          mh_siteconfig_write($files, $saved);
          $db->exec('CREATE TABLE IF NOT EXISTS config_log (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER REFERENCES users(id) ON DELETE CASCADE, key TEXT NOT NULL, action TEXT NOT NULL DEFAULT "set", at INTEGER NOT NULL)');
          foreach ($changed as $k) $db->prepare('INSERT INTO config_log (user_id, key, action, at) VALUES (?, ?, ?, ?)')->execute([$u['id'], $k, 'set', $now]);
        }
      }
      $invited = false;
      if ($how === 'invite') {
        require_once __DIR__ . '/mailer.php';
        $site = (string)($cfg['site_name'] ?? 'Mathub'); $code = mh_code_issue($email, 'reset', 7 * 86400);
        $base = rtrim((string)(($cfg['site_url'] ?? '') ?: ('https://' . preg_replace('/[^A-Za-z0-9.:-]/', '', (string)($_SERVER['HTTP_HOST'] ?? 'mathub.space')))), '/');
        $link = $base . '/#/?setpw=' . rawurlencode($email); $who = mh_display_name($u);
        $text = "$who added you to $site.

Choose your password here: $link
Your code: $code (it works for 7 days).

Then pick your classes and you are in.

— $site";
        $html = '<div style="font-family:Helvetica Neue,Helvetica,Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#131C2E"><p style="font-size:16px;margin:0 0 12px"><b>' . htmlspecialchars($who) . '</b> added you to <b>' . htmlspecialchars($site) . '</b>.</p><p style="margin:0 0 16px"><a href="' . htmlspecialchars($link) . '" style="display:inline-block;padding:12px 18px;border-radius:12px;background:#1A64D6;color:#fff;font-weight:700;text-decoration:none">Choose your password</a></p><p style="font-size:14px;margin:0 0 6px">Your code</p><p style="font-size:32px;letter-spacing:8px;font-weight:700;margin:0 0 16px;font-family:Consolas,Menlo,monospace">' . $code . '</p><p style="font-size:14px;color:#64718A;margin:0">It works for 7 days. Then pick your classes and you are in.</p></div>';
        $r = mh_send_mail($cfg, $email, "$who added you to $site", $text, $html); $invited = (bool)$r['ok'];
      }
      $nu = mh_user_by_email($email);
      mh_json(['ok' => true, 'user' => ['id' => (int)$nu['id'], 'email' => $email, 'name' => (string)$nu['name'], 'role' => $role, 'plan' => $plan], 'invited' => $invited, 'allowed' => (bool)$outside, 'how' => $how]);

    /* ---------- notifications ---------- */
    case 'notif_list':
      mh_method('GET'); $u = mh_require_user();
      $st = $db->prepare('SELECT * FROM notifications WHERE user_id = ?' . MH_NOTIF_UNBLOCKED . ' ORDER BY created DESC, id DESC LIMIT 60'); $st->execute([$u['id']]);
      $rows = array_map(fn($n) => ['id' => (int)$n['id'], 'kind' => $n['kind'], 'post_id' => (int)$n['post_id'], 'comment_id' => $n['comment_id'] ? (int)$n['comment_id'] : null, 'actor' => $n['actor'], 'title' => $n['title'], 'snippet' => $n['snippet'], 'link' => (string)($n['link'] ?? ''), 'created' => (int)$n['created'], 'read' => (int)$n['read'] === 1], $st->fetchAll());
      $st = $db->prepare('SELECT COUNT(*) FROM notifications WHERE user_id = ? AND read = 0' . MH_NOTIF_UNBLOCKED); $st->execute([$u['id']]);
      mh_json(['ok' => true, 'notifications' => $rows, 'unread' => (int)$st->fetchColumn()]);

    case 'notif_read':
      mh_method('POST'); $u = mh_require_user();
      if (!empty($in['all'])) $db->prepare('UPDATE notifications SET read = 1 WHERE user_id = ?')->execute([$u['id']]);
      elseif (!empty($in['id'])) $db->prepare('UPDATE notifications SET read = 1 WHERE user_id = ? AND id = ?')->execute([$u['id'], (int)$in['id']]);
      elseif (!empty($in['post_id'])) $db->prepare('UPDATE notifications SET read = 1 WHERE user_id = ? AND post_id = ?')->execute([$u['id'], (int)$in['post_id']]);
      $st = $db->prepare('SELECT COUNT(*) FROM notifications WHERE user_id = ? AND read = 0' . MH_NOTIF_UNBLOCKED); $st->execute([$u['id']]);
      mh_json(['ok' => true, 'unread' => (int)$st->fetchColumn()]);

    case 'admin_setting':
      mh_method('POST'); $u = mh_require_user(); if (!mh_is_admin($u)) mh_fail('Administrators only.', 403);
      require_once __DIR__ . '/canvas.php';
      $key = (string)($in['key'] ?? ''); if (!in_array($key, ['canvas_feed', 'announcement'], true)) mh_fail('Unknown setting.');
      $value = trim((string)($in['value'] ?? ''));
      if ($key === 'canvas_feed' && $value !== '' && !preg_match('#^https://[a-z0-9.-]+/feeds/calendars/[A-Za-z0-9_.-]+\.ics$#i', $value)) mh_fail('That does not look like a Canvas calendar feed URL (…/feeds/calendars/user_….ics).');
      mh_setting_set($key, $value);
      $out = ['ok' => true];
      if ($key === 'canvas_feed') { $r = mh_canvas_events(true); $out['canvas'] = ['configured' => $r['configured'], 'fetched' => $r['fetched'], 'error' => $r['error'], 'count' => count($r['events'])]; }
      mh_json($out);

    /* ---------- administrator ---------- */
    case 'admin_stats':
      mh_method('GET'); $u = mh_require_user(); if (!mh_is_admin($u)) mh_fail('Administrators only.', 403);
      $n = fn($sql) => (int)$db->query($sql)->fetchColumn();
      mh_json(['ok' => true, 'issues_open' => $n('SELECT COUNT(*) FROM issues WHERE status = "open"'), 'users' => $n('SELECT COUNT(*) FROM users WHERE verified = 1'), 'pending' => $n('SELECT COUNT(*) FROM users WHERE verified = 0'), 'active_7d' => $n('SELECT COUNT(*) FROM users WHERE last_login > ' . ($now - 7 * 86400)),
        'posts' => $n('SELECT COUNT(*) FROM posts WHERE removed = 0'), 'comments' => $n('SELECT COUNT(*) FROM comments WHERE removed = 0'), 'removed' => $n('SELECT COUNT(*) FROM posts WHERE removed > 0') + $n('SELECT COUNT(*) FROM comments WHERE removed > 0'),
        'reports' => $n('SELECT COUNT(*) FROM reports WHERE status = "open"'), 'bans' => $n('SELECT COUNT(*) FROM bans WHERE until > ' . $now), 'moderators' => array_values(array_unique(array_merge($cfg['admins'] ?? [], $cfg['moderators'] ?? []))), 'admins' => $cfg['admins'] ?? [],
        'meets' => $n('SELECT COUNT(*) FROM meets WHERE cancelled = 0 AND end > ' . $now), 'mocks' => $n('SELECT COUNT(*) FROM mocks WHERE cancelled = 0 AND start > ' . $now), 'contrib_pending' => $n('SELECT COUNT(*) FROM contributions WHERE status = "pending"'), 'challenges_today' => $n('SELECT COUNT(*) FROM challenge_attempts WHERE date = "' . mh_local_date() . '"'), 'online' => $n('SELECT COUNT(*) FROM presence WHERE seen > ' . ($now - 150)),
        'roles' => array_map(fn($r) => ['email' => $r['email'], 'role' => $r['role']], $db->query('SELECT email, role FROM roles ORDER BY email')->fetchAll()), 'staff_config' => $cfg['staff'] ?? [], 'digest_window' => mh_digest_window_start(), 'digest_sent_week' => $n('SELECT COUNT(*) FROM users WHERE digest_sent >= ' . mh_week_start()), 'cron_configured' => (string)($cfg['cron_key'] ?? '') !== '',
        'settings' => (function () use ($cfg) { require_once __DIR__ . '/canvas.php'; $r = mh_canvas_events(false); return ['canvas_feed' => mh_canvas_feed_url(), 'canvas_from_config' => trim((string)($cfg['canvas_feed'] ?? '')) !== '', 'canvas' => ['configured' => $r['configured'], 'fetched' => $r['fetched'], 'error' => $r['error'], 'count' => count($r['events'])], 'announcement' => (string)mh_setting('announcement', '')]; })()]);

    case 'admin_users':
      mh_method('GET'); $u = mh_require_user(); if (!mh_is_admin($u)) mh_fail('Administrators only.', 403);
      $q = trim((string)($_GET['q'] ?? '')); $page = max(0, (int)($_GET['page'] ?? 0)); $args = [];
      $where = '1=1'; if ($q !== '') { $where = '(u.email LIKE ? OR u.name LIKE ?)'; $like = '%' . str_replace(['%', '_'], ['\\%', '\\_'], mb_substr($q, 0, 80)) . '%'; $args = [$like, $like]; }
      require_once __DIR__ . '/myclasses.php';
      if (($_GET['show'] ?? '') === 'plan') { $ids = mh_plan_member_ids($cfg); $where .= $ids ? ' AND u.id IN (' . implode(',', $ids) . ')' : ' AND 0'; }   // members with Pro or Max
      $st = $db->prepare("SELECT u.id, u.email, u.name, u.verified, u.created, u.last_login, u.terms_accepted,
          (SELECT COUNT(*) FROM posts p WHERE p.user_id = u.id AND p.removed = 0) AS nposts, (SELECT COUNT(*) FROM comments c WHERE c.user_id = u.id AND c.removed = 0) AS ncomments,
          (SELECT until FROM bans b WHERE b.user_id = u.id AND b.until > $now) AS banned_until, (SELECT COUNT(*) FROM badges bd WHERE bd.user_id = u.id) AS nbadges
        FROM users u WHERE $where ORDER BY u.created DESC LIMIT 51 OFFSET " . ($page * 50)); $st->execute($args); $rows = $st->fetchAll();
      $more = count($rows) > 50; $rows = array_slice($rows, 0, 50); $plans = mh_plan_admin_rows($rows, $cfg);
      mh_json(['ok' => true, 'more' => $more, 'users' => array_map(fn($r) => ['id' => (int)$r['id'], 'email' => $r['email'], 'name' => $r['name'], 'verified' => (int)$r['verified'] === 1, 'created' => (int)$r['created'], 'last_login' => (int)$r['last_login'], 'terms' => (int)$r['terms_accepted'] > 0,
        'posts' => (int)$r['nposts'], 'comments' => (int)$r['ncomments'], 'badges' => (int)$r['nbadges'], 'banned_until' => $r['banned_until'] ? (int)$r['banned_until'] : 0, 'mod' => mh_is_mod(['email' => $r['email']]), 'admin' => mh_is_admin(['email' => $r['email']]), 'plan' => $plans[(int)$r['id']] ?? null], $rows)]);

    case 'admin_badges':
      // Administrators can award or remove any badge for any member (themselves included). Manual awards are never undone by the automatic check.
      mh_method('GET', 'POST'); $u = mh_require_user(); if (!mh_is_admin($u)) mh_fail('Administrators only.', 403);
      $target = (int)($in['user_id'] ?? $_GET['user_id'] ?? 0); $st = $db->prepare('SELECT id, email, name FROM users WHERE id = ?'); $st->execute([$target]); $t = $st->fetch(); if (!$t) mh_fail('User not found.', 404);
      if ($_SERVER['REQUEST_METHOD'] === 'POST') {
        $action = (string)($in['action'] ?? ''); $code = (string)($in['code'] ?? ''); $codes = [];
        if (in_array($action, ['award', 'remove'], true)) { if (!isset(MH_BADGES[$code])) mh_fail('Unknown badge.'); $codes = [$code]; }
        elseif (in_array($action, ['award_all', 'remove_all'], true)) $codes = array_keys(MH_BADGES);
        else mh_fail('Unknown action.');
        $given = [];
        if ($action === 'award' || $action === 'award_all') {
          foreach ($codes as $c) { $st = $db->prepare('INSERT OR IGNORE INTO badges (user_id, code, earned, seen, manual) VALUES (?, ?, ?, 0, 1)'); $st->execute([$target, $c, $now]); if ($st->rowCount() > 0) $given[] = $c; }
          if ($given && (int)$t['id'] !== (int)$u['id']) {
            $what = count($given) === 1 ? 'the “' . MH_BADGES[$given[0]][0] . '” badge' : count($given) . ' badges';
            $db->prepare('INSERT INTO notifications (user_id, kind, post_id, comment_id, actor_id, actor, title, snippet, created) VALUES (?, "badge", 0, NULL, ?, ?, ?, ?, ?)')->execute([$target, $u['id'], mh_display_name($u), $what, 'Open your badge shelf to see it.', $now]);
          }
          if ($given) mh_activity('badge', '', count($given) === 1 ? 'A student earned the “' . MH_BADGES[$given[0]][0] . '” badge' : 'A student was awarded ' . count($given) . ' badges', '#/badges');
        } else {
          $db->prepare('DELETE FROM badges WHERE user_id = ? AND code IN (' . implode(',', array_fill(0, count($codes), '?')) . ')')->execute(array_merge([$target], $codes));
        }
      }
      $st = $db->prepare('SELECT code, earned, manual FROM badges WHERE user_id = ?'); $st->execute([$target]); $have = [];
      foreach ($st->fetchAll() as $b) if (isset(MH_BADGES[$b['code']])) $have[$b['code']] = ['earned' => (int)$b['earned'], 'manual' => (int)$b['manual'] === 1];
      mh_json(['ok' => true, 'user' => ['id' => (int)$t['id'], 'name' => mh_display_name($t), 'email' => $t['email']], 'have' => $have,
        'catalog' => array_map(fn($c, $v) => ['code' => $c, 'name' => $v[0], 'desc' => $v[1], 'icon' => $v[2]], array_keys(MH_BADGES), MH_BADGES)]);

    case 'admin_user':
      mh_method('POST'); $u = mh_require_user(); if (!mh_is_admin($u)) mh_fail('Administrators only.', 403);
      $target = (int)($in['user_id'] ?? 0); $action = (string)($in['action'] ?? '');
      $st = $db->prepare('SELECT * FROM users WHERE id = ?'); $st->execute([$target]); $t = $st->fetch(); if (!$t) mh_fail('User not found.', 404);
      if ($target === (int)$u['id'] && in_array($action, ['delete', 'ban'], true)) mh_fail('You cannot ' . $action . ' your own account here. Use Settings.');
      if (mh_is_admin($t) && $action !== 'unban') mh_fail('Other administrators can only be changed in api/config.php.');
      if ($action === 'delete') { $db->prepare('DELETE FROM users WHERE id = ?')->execute([$target]); $db->prepare('DELETE FROM votes WHERE user_id = ?')->execute([$target]); $db->prepare('DELETE FROM reports WHERE user_id = ?')->execute([$target]); $db->prepare('DELETE FROM bans WHERE user_id = ?')->execute([$target]); }
      elseif ($action === 'ban') { $days = max(1, min(3650, (int)($in['days'] ?? 30))); $db->prepare('INSERT OR REPLACE INTO bans (user_id, until, reason, created) VALUES (?, ?, ?, ?)')->execute([$target, $now + $days * 86400, mh_str($in, 'reason', 200), $now]); }
      elseif ($action === 'unban') { $db->prepare('DELETE FROM bans WHERE user_id = ?')->execute([$target]); }
      elseif ($action === 'verify') { $db->prepare('UPDATE users SET verified = 1 WHERE id = ?')->execute([$target]); }
      elseif ($action === 'logout_all') { $db->prepare('DELETE FROM tokens WHERE user_id = ?')->execute([$target]); }
      else mh_fail('Unknown action.');
      mh_json(['ok' => true]);

    case 'admin_purge':
      mh_method('POST'); $u = mh_require_user(); if (!mh_is_admin($u)) mh_fail('Administrators only.', 403);
      $kind = ($in['kind'] ?? '') === 'c' ? 'c' : 'p'; $id = (int)($in['id'] ?? 0);
      if ($kind === 'p') { if (!mh_get_post($id)) mh_fail('Post not found.', 404); $db->prepare('DELETE FROM votes WHERE kind = "c" AND item_id IN (SELECT id FROM comments WHERE post_id = ?)')->execute([$id]); $db->prepare('DELETE FROM reports WHERE kind = "c" AND item_id IN (SELECT id FROM comments WHERE post_id = ?)')->execute([$id]); $db->prepare('DELETE FROM comments WHERE post_id = ?')->execute([$id]); $db->prepare('DELETE FROM votes WHERE kind = "p" AND item_id = ?')->execute([$id]); $db->prepare('DELETE FROM reports WHERE kind = "p" AND item_id = ?')->execute([$id]); $db->prepare('DELETE FROM posts WHERE id = ?')->execute([$id]); }
      else { $c = mh_get_comment($id); if (!$c) mh_fail('Comment not found.', 404); $db->prepare('UPDATE comments SET parent_id = ? WHERE parent_id = ?')->execute([$c['parent_id'], $id]); $db->prepare('DELETE FROM votes WHERE kind = "c" AND item_id = ?')->execute([$id]); $db->prepare('DELETE FROM reports WHERE kind = "c" AND item_id = ?')->execute([$id]); $db->prepare('DELETE FROM comments WHERE id = ?')->execute([$id]); $db->prepare('UPDATE posts SET ncomments = (SELECT COUNT(*) FROM comments WHERE post_id = ? AND removed = 0) WHERE id = ?')->execute([$c['post_id'], $c['post_id']]); }
      mh_json(['ok' => true]);

    default:
      mh_fail('Not found.', 404);
  }
}
