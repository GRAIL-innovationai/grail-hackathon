<?php
/* ============================================================
   Mathub — community features
   Daily challenge + leaderboards, badges, live presence, study
   sessions (meetups), polls, helper rankings, community mock exams,
   student contributions, activity feed, weekly digest, cron.
   ============================================================ */
declare(strict_types=1);
require_once __DIR__ . '/filter.php';
require_once __DIR__ . '/canvas.php';

const MH_BADGES = [
  'first_post' => ['First post', 'Started a discussion', 'chat'], 'first_answer' => ['First reply', 'Replied to a classmate', 'reply'],
  'helper_5' => ['Helper', '5 accepted answers', 'shield'], 'helper_25' => ['Mentor', '25 accepted answers', 'shield'],
  'upvoted_10' => ['Crowd favorite', 'A post or comment reached +10', 'up'],
  'streak_7' => ['One-week streak', 'Studied 7 days in a row', 'fire'], 'streak_30' => ['One-month streak', 'Studied 30 days in a row', 'fire'],
  'q_100' => ['Century', '100 quiz questions answered', 'list'], 'q_500' => ['Grinder', '500 quiz questions answered', 'list'],
  'unit_master' => ['Unit master', 'Every flashcard in a unit mastered', 'cards'],
  'challenge_7' => ['Daily regular', '7 daily challenges', 'target'], 'challenge_30' => ['Daily legend', '30 daily challenges', 'target'],
  'mock_1' => ['Mock examinee', 'Took a community mock exam', 'flag'], 'contributor' => ['Contributor', 'A submitted problem or card was approved', 'pen'],
  'founder' => ['Founder', 'Joined Mathub in its first weeks', 'bulb'],
  'recruiter' => ['Recruiter', 'Brought a classmate to Mathub', 'users'], 'invited' => ['Invited', 'Joined through a classmate\'s link', 'users']
];

/* ---------- small helpers ---------- */
function mh_tz(): DateTimeZone { return new DateTimeZone(mh_config()['timezone'] ?? 'America/Denver'); }
function mh_local_date(int $ts = 0): string { $d = new DateTime('@' . ($ts ?: time())); $d->setTimezone(mh_tz()); return $d->format('Y-m-d'); }
function mh_week_start(int $ts = 0): int { $d = new DateTime('@' . ($ts ?: time())); $d->setTimezone(mh_tz()); $d->setTime(0, 0); $d->modify('monday this week'); return $d->getTimestamp(); }
function mh_activity(string $kind, string $course, string $text, string $link = ''): void {
  try { $db = mh_db(); $db->prepare('INSERT INTO activity (kind, course, text, link, created) VALUES (?, ?, ?, ?, ?)')->execute([$kind, $course, mb_substr($text, 0, 160), $link, time()]); if (random_int(1, 25) === 1) $db->exec('DELETE FROM activity WHERE id NOT IN (SELECT id FROM activity ORDER BY id DESC LIMIT 400)'); } catch (Throwable $e) {}
}
function mh_lb_name(array $row, string $prefix = ''): string { return (int)($row[$prefix . 'show_on_leaderboard'] ?? 1) === 1 ? mh_display_name($row, $prefix) : 'Anonymous student'; }
function mh_system_user(): array {
  $db = mh_db(); $st = $db->prepare('SELECT * FROM users WHERE email = ?'); $st->execute(['mathub@system.local']); $u = $st->fetch();
  if ($u) return $u;
  $db->prepare('INSERT INTO users (email, name, pass_hash, verified, created, terms_accepted) VALUES (?, ?, ?, 1, ?, ?)')->execute(['mathub@system.local', 'Mathub', password_hash(bin2hex(random_bytes(16)), PASSWORD_DEFAULT), time(), time()]);
  $st->execute(['mathub@system.local']); return $st->fetch();
}
function mh_user_progress(int $uid): array { $st = mh_db()->prepare('SELECT course, json FROM progress WHERE user_id = ?'); $st->execute([$uid]); $out = []; foreach ($st->fetchAll() as $r) { $j = json_decode($r['json'], true); if (is_array($j)) $out[$r['course']] = $j; } return $out; }
function mh_user_courses(array $u): array { $c = isset($u['courses']) && $u['courses'] !== null && $u['courses'] !== '' ? json_decode((string)$u['courses'], true) : null; return is_array($c) && $c ? $c : ['calc', 'physics', 'precalc', 'writ']; }
/** Current streak in days counting back from today (or from yesterday if today has no activity yet). */
function mh_current_streak(array $days): array {
  $set = array_fill_keys($days, true); $today = mh_local_date(); $d = $today; $activeToday = isset($set[$today]);
  if (!$activeToday) $d = date('Y-m-d', strtotime($today . ' -1 day'));
  $n = 0; while (isset($set[$d])) { $n++; $d = date('Y-m-d', strtotime($d . ' -1 day')); }
  return ['streak' => $n, 'active_today' => $activeToday];
}
function mh_week_minutes(array $blobs, int $since): int { $from = mh_local_date($since); $m = 0; foreach ($blobs as $b) foreach ($b['sessions'] ?? [] as $sn) if (($sn['d'] ?? '') >= $from) $m += (int)($sn['m'] ?? 0); return $m; }
function mh_longest_streak(array $days): int {
  if (!$days) return 0; sort($days); $best = 1; $run = 1;
  for ($i = 1; $i < count($days); $i++) { $diff = (strtotime($days[$i]) - strtotime($days[$i - 1])) / 86400; if ($diff === 1.0) { $run++; $best = max($best, $run); } elseif ($diff > 1) $run = 1; }
  return $best;
}

/* ---------- badges ---------- */
function mh_compute_badges(int $uid, array $clientCodes = []): array {
  $db = mh_db(); $have = [];
  $n = function (string $sql, array $args = []) use ($db) { $st = $db->prepare($sql); $st->execute($args); return (int)$st->fetchColumn(); };
  if ($n('SELECT COUNT(*) FROM posts WHERE user_id = ? AND removed = 0', [$uid]) >= 1) $have[] = 'first_post';
  if ($n('SELECT COUNT(*) FROM comments WHERE user_id = ? AND removed = 0', [$uid]) >= 1) $have[] = 'first_answer';
  $acc = $n('SELECT COUNT(*) FROM posts p JOIN comments c ON c.id = p.accepted_id WHERE c.user_id = ? AND c.removed = 0', [$uid]);
  if ($acc >= 5) $have[] = 'helper_5'; if ($acc >= 25) $have[] = 'helper_25';
  if (max($n('SELECT COALESCE(MAX(score),0) FROM posts WHERE user_id = ?', [$uid]), $n('SELECT COALESCE(MAX(score),0) FROM comments WHERE user_id = ?', [$uid])) >= 10) $have[] = 'upvoted_10';
  $days = []; $answered = 0;
  foreach (mh_user_progress($uid) as $blob) { foreach (array_keys($blob['activity'] ?? []) as $d) $days[$d] = true; foreach ($blob['progress'] ?? [] as $t) $answered += (int)($t['a'] ?? 0); }
  $streak = mh_longest_streak(array_keys($days)); if ($streak >= 7) $have[] = 'streak_7'; if ($streak >= 30) $have[] = 'streak_30';
  if ($answered >= 100) $have[] = 'q_100'; if ($answered >= 500) $have[] = 'q_500';
  $ch = $n('SELECT COUNT(*) FROM challenge_attempts WHERE user_id = ?', [$uid]); if ($ch >= 7) $have[] = 'challenge_7'; if ($ch >= 30) $have[] = 'challenge_30';
  if ($n('SELECT COUNT(*) FROM mock_results WHERE user_id = ?', [$uid]) >= 1) $have[] = 'mock_1';
  if ($n('SELECT COUNT(*) FROM contributions WHERE user_id = ? AND status = "approved"', [$uid]) >= 1) $have[] = 'contributor';
  $st = $db->prepare('SELECT created FROM users WHERE id = ?'); $st->execute([$uid]); if ((int)$st->fetchColumn() < strtotime(mh_config()['founder_until'] ?? '2026-10-15')) $have[] = 'founder';
  foreach ($clientCodes as $c) if ($c === 'unit_master') $have[] = 'unit_master';   // the client knows the unit membership of each card
  return array_values(array_unique($have));
}
function mh_award_badges(int $uid, array $clientCodes = [], string $course = ''): array {
  $db = mh_db(); $now = time(); $codes = mh_compute_badges($uid, $clientCodes);
  $st = $db->prepare('SELECT code, earned, seen FROM badges WHERE user_id = ?'); $st->execute([$uid]); $had = []; foreach ($st->fetchAll() as $r) $had[$r['code']] = $r;
  $new = [];
  foreach ($codes as $c) if (!isset($had[$c])) { $db->prepare('INSERT OR IGNORE INTO badges (user_id, code, earned) VALUES (?, ?, ?)')->execute([$uid, $c, $now]); $new[] = $c; $had[$c] = ['code' => $c, 'earned' => $now, 'seen' => 0]; mh_activity('badge', $course, 'A student earned the “' . MH_BADGES[$c][0] . '” badge', '#/badges'); }
  $all = []; foreach ($had as $c => $r) if (isset(MH_BADGES[$c])) $all[] = ['code' => $c, 'name' => MH_BADGES[$c][0], 'desc' => MH_BADGES[$c][1], 'icon' => MH_BADGES[$c][2], 'earned' => (int)$r['earned'], 'seen' => (int)$r['seen'] === 1];
  return ['all' => $all, 'new' => $new];
}

/* ---------- leagues: weekly XP boards; the top of each league moves up on Monday, the bottom moves down ---------- */
const MH_LEAGUES = ['Bronze', 'Silver', 'Gold', 'Sapphire', 'Ruby', 'Emerald', 'Amethyst', 'Pearl', 'Obsidian', 'Diamond'];
const MH_LEAGUE_PROMOTE = 7; const MH_LEAGUE_DEMOTE = 5; const MH_LEAGUE_MIN_DEMOTE = 15;
function mh_week_xp_of(array $blob, string $from, string $to): int { $n = 0; foreach ($blob['xp'] ?? [] as $x) { $d = (string)($x['d'] ?? ''); if ($d >= $from && $d <= $to) $n += (int)($x['n'] ?? 0); } return $n; }
/** Every verified member with their XP for the week starting at $ws. Cached for 90 s because it decodes every progress blob. */
function mh_league_rows(int $ws, bool $fresh = false): array {
  $key = 'league_rows:' . $ws;
  if (!$fresh) { $c = mh_setting($key); if ($c !== null) { $j = json_decode($c, true); if (is_array($j) && (int)($j['at'] ?? 0) > time() - 90) return $j['rows']; } }
  $db = mh_db(); $from = mh_local_date($ws); $to = mh_local_date($ws + 6 * 86400); $rows = [];
  $st = $db->query('SELECT u.id, u.name, u.email, u.show_on_leaderboard, u.league, p.json FROM users u LEFT JOIN progress p ON p.user_id = u.id WHERE u.verified = 1 AND u.email NOT LIKE "%@system.local" ORDER BY u.id');
  foreach ($st->fetchAll() as $r) {
    $id = (int)$r['id']; if (!isset($rows[$id])) $rows[$id] = ['id' => $id, 'name' => mh_lb_name($r), 'role' => mh_role($r['email']), 'league' => (int)$r['league'], 'xp' => 0];
    if ($r['json']) { $j = json_decode($r['json'], true); if (is_array($j)) $rows[$id]['xp'] += mh_week_xp_of($j, $from, $to); }
  }
  $rows = array_values($rows); mh_setting_set($key, json_encode(['at' => time(), 'rows' => $rows])); return $rows;
}
/** Settles the week that just ended (once), then marks the current week as open. */
function mh_league_tick(): void {
  $ws = mh_week_start(); $done = mh_setting('league_week'); if ($done === (string)$ws) return;
  $db = mh_db(); $pws = $ws - 7 * 86400;
  if ($done !== null) {
    $by = []; foreach (mh_league_rows($pws, true) as $r) $by[$r['league']][] = $r;
    foreach ($by as $lg => $members) {
      usort($members, fn($a, $b) => ($b['xp'] <=> $a['xp']) ?: ($a['id'] <=> $b['id'])); $n = count($members);
      foreach ($members as $i => $m) {
        $rank = $i + 1; $result = 'stay'; $new = $lg;
        if ($rank <= MH_LEAGUE_PROMOTE && $m['xp'] > 0 && $lg < count(MH_LEAGUES) - 1) { $result = 'up'; $new = $lg + 1; }
        elseif ($lg > 0 && $n >= MH_LEAGUE_MIN_DEMOTE && $rank > $n - MH_LEAGUE_DEMOTE) { $result = 'down'; $new = $lg - 1; }
        $db->prepare('INSERT OR REPLACE INTO league_history (user_id, week, league, rank, xp, result) VALUES (?, ?, ?, ?, ?, ?)')->execute([$m['id'], $pws, $lg, $rank, $m['xp'], $result]);
        if ($new !== $lg) $db->prepare('UPDATE users SET league = ? WHERE id = ?')->execute([$new, $m['id']]);
      }
    }
    mh_setting_set('league_rows:' . $ws, null);
  }
  mh_setting_set('league_week', (string)$ws);
}

/* ---------- polls ---------- */
function mh_poll_create(int $postId, array $options, string $question = '', int $multi = 0, ?string $autoKey = null): int {
  $opts = array_values(array_filter(array_map(fn($o) => mb_substr(trim(mh_censor((string)$o)), 0, 80), $options), fn($o) => $o !== '')); $opts = array_slice($opts, 0, 8);
  if (count($opts) < 2) throw new RuntimeException('A poll needs at least two options.');
  mh_db()->prepare('INSERT INTO polls (post_id, question, options, multi, auto_key, created) VALUES (?, ?, ?, ?, ?, ?)')->execute([$postId, mb_substr(mh_censor($question), 0, 140), json_encode($opts, JSON_UNESCAPED_UNICODE), $multi ? 1 : 0, $autoKey, time()]);
  return (int)mh_db()->lastInsertId();
}
function mh_poll_view(int $postId, ?int $uid): ?array {
  $db = mh_db(); $st = $db->prepare('SELECT * FROM polls WHERE post_id = ?'); $st->execute([$postId]); $p = $st->fetch(); if (!$p) return null;
  $opts = json_decode($p['options'], true) ?: []; $counts = array_fill(0, count($opts), 0);
  $st = $db->prepare('SELECT opt, COUNT(*) AS n FROM poll_votes WHERE poll_id = ? GROUP BY opt'); $st->execute([$p['id']]); foreach ($st->fetchAll() as $r) if (isset($counts[(int)$r['opt']])) $counts[(int)$r['opt']] = (int)$r['n'];
  $st = $db->prepare('SELECT COUNT(DISTINCT user_id) FROM poll_votes WHERE poll_id = ?'); $st->execute([$p['id']]); $voters = (int)$st->fetchColumn();
  $mine = []; if ($uid) { $st = $db->prepare('SELECT opt FROM poll_votes WHERE poll_id = ? AND user_id = ?'); $st->execute([$p['id'], $uid]); $mine = array_map('intval', array_column($st->fetchAll(), 'opt')); }
  return ['id' => (int)$p['id'], 'question' => $p['question'], 'multi' => (int)$p['multi'] === 1, 'voters' => $voters, 'mine' => $mine, 'options' => array_map(fn($o, $i) => ['text' => $o, 'votes' => $counts[$i]], $opts, array_keys($opts))];
}

/* ---------- housekeeping + weekly digest ---------- */
function mh_housekeeping(bool $full = false): array {
  $db = mh_db(); $did = [];
  if ($full || random_int(1, 10) === 1) { $db->exec('DELETE FROM presence WHERE seen < ' . (time() - 900)); $did[] = 'presence pruned'; }
  if ($full) { try { require_once __DIR__ . '/canvas.php'; $r = mh_canvas_events(false); $did[] = 'canvas: ' . count($r['events']) . ' events'; } catch (Throwable $e) {} }
  $sent = mh_digest_tick($full ? 60 : 2); if ($sent) $did[] = "digest: $sent sent";
  $rem = mh_reminder_tick($full ? 60 : 2); if ($rem) $did[] = "reminders: $rem sent";
  try { mh_league_tick(); } catch (Throwable $e) {}
  try { require_once __DIR__ . '/extras.php'; $b = mh_backup_tick(); if ($b) $did[] = 'backup: ' . $b['name']; } catch (Throwable $e) {}
  if ($full || random_int(1, 20) === 1) { try { require_once __DIR__ . '/myclasses.php'; $n = mh_myclass_prune(); if ($n) $did[] = "classes of deleted accounts: $n removed"; require_once __DIR__ . '/ai.php'; $n = mh_ai_prune(); if ($n) $did[] = "Bo's old chats and drafts: $n removed"; } catch (Throwable $e) {} }
  try { require_once __DIR__ . '/push.php'; $p = mh_push_tick($full ? 60 : 3); if ($p) $did[] = "push: $p sent"; } catch (Throwable $e) {}
  try { require_once __DIR__ . '/growth.php'; $pl = mh_planning_tick($full ? 60 : 2); if ($pl) $did[] = "planning: $pl sent"; if ($full || random_int(1, 20) === 1) { $db->exec('DELETE FROM focus_live WHERE seen < ' . (time() - 600)); $db->exec('DELETE FROM metrics WHERE day < "' . mh_local_date(time() - 120 * 86400) . '"'); } } catch (Throwable $e) {}
  return $did;
}
/** What an evening reminder is about for one user: Canvas events due tomorrow in their classes, a streak at risk, sessions they joined. Shared by the email and the push. */
function mh_reminder_items(array $u, array $events, string $tomorrow): array {
  $db = mh_db(); $names = mh_course_names() + ['general' => 'General'];
  $mine = mh_user_courses($u); $due = array_values(array_filter($events, fn($e) => $e['date'] === $tomorrow && in_array($e['course'], $mine, true)));
  $days = []; foreach (mh_user_progress((int)$u['id']) as $b) foreach (array_keys($b['activity'] ?? []) as $d) $days[$d] = true; $sk = mh_current_streak(array_keys($days));
  $atRisk = !$sk['active_today'] && $sk['streak'] >= 3;
  $s2 = $db->prepare('SELECT m.title, m.place, m.start FROM meets m JOIN meet_rsvp r ON r.meet_id = m.id WHERE r.user_id = ? AND m.cancelled = 0 AND m.start > ? AND m.start < ? ORDER BY m.start'); $s2->execute([$u['id'], time(), time() + 36 * 3600]);
  $meets = array_map(fn($m) => ['title' => $m['title'], 'place' => $m['place'], 'when' => (new DateTime('@' . $m['start']))->setTimezone(mh_tz())->format('D g:i a')], $s2->fetchAll());
  return ['due' => $due, 'atRisk' => $atRisk, 'streak' => $sk['streak'], 'meets' => $meets, 'names' => $names];
}
/* ---------- evening reminders: "tomorrow: … due" + streak at risk ---------- */
function mh_reminder_window_start(): ?int {
  $hour = (int)(mh_config()['reminder_hour'] ?? 18); $now = new DateTime('now', mh_tz());
  if ((int)$now->format('G') < $hour) return null; $w = clone $now; $w->setTime($hour, 0); return $w->getTimestamp();
}
function mh_reminder_tick(int $max): int {
  $ws = mh_reminder_window_start(); if ($ws === null || $max <= 0) return 0;
  $db = mh_db(); $st = $db->prepare('SELECT * FROM users WHERE verified = 1 AND reminder_email = 1 AND reminder_sent < ? AND email NOT LIKE "%@system.local" ORDER BY id LIMIT ?'); $st->execute([$ws, $max]); $users = $st->fetchAll();
  if (!$users) return 0;
  require_once __DIR__ . '/mailer.php'; $cfg = mh_config(); $sent = 0; $site = $cfg['site_name'] ?? 'Mathub';
  $url = rtrim((string)(($cfg['site_url'] ?? '') ?: ('https://' . ($_SERVER['HTTP_HOST'] ?? 'mathub.space'))), '/');
  $tomorrow = mh_local_date(time() + 86400); $names = mh_course_names() + ['general' => 'General'];
  $events = []; try { require_once __DIR__ . '/canvas.php'; $events = mh_canvas_events(false)['events']; } catch (Throwable $e) {}
  foreach ($users as $u) {
    $db->prepare('UPDATE users SET reminder_sent = ? WHERE id = ?')->execute([time(), $u['id']]);
    try {
      $mine = mh_user_courses($u); $due = array_values(array_filter($events, fn($e) => $e['date'] === $tomorrow && in_array($e['course'], $mine, true)));
      $days = []; foreach (mh_user_progress((int)$u['id']) as $b) foreach (array_keys($b['activity'] ?? []) as $d) $days[$d] = true; $sk = mh_current_streak(array_keys($days));
      $atRisk = !$sk['active_today'] && $sk['streak'] >= 3;
      $s2 = $db->prepare('SELECT m.title, m.place, m.start FROM meets m JOIN meet_rsvp r ON r.meet_id = m.id WHERE r.user_id = ? AND m.cancelled = 0 AND m.start > ? AND m.start < ? ORDER BY m.start'); $s2->execute([$u['id'], time(), time() + 36 * 3600]); $meets = $s2->fetchAll();
      if (!$due && !$atRisk && !$meets) continue;
      $lines = []; $h = [];
      if ($due) { $lines[] = 'Due tomorrow:'; $h[] = '<h3 style="margin:0 0 6px;font-size:15px">Due tomorrow</h3><ul style="padding-left:18px;margin:0 0 14px">'; foreach ($due as $e) { $row = ($names[$e['course']] ?? $e['course']) . ': ' . $e['title'] . ($e['time'] ? ' · ' . $e['time'] : ''); $lines[] = '  - ' . $row; $h[] = '<li>' . htmlspecialchars($row) . '</li>'; } $h[] = '</ul>'; }
      if ($meets) { $lines[] = ''; $lines[] = 'Study sessions you joined:'; $h[] = '<h3 style="margin:0 0 6px;font-size:15px">Study sessions you joined</h3><ul style="padding-left:18px;margin:0 0 14px">'; foreach ($meets as $m) { $row = $m['title'] . ' at ' . $m['place'] . ' · ' . (new DateTime('@' . $m['start']))->setTimezone(mh_tz())->format('D g:i a'); $lines[] = '  - ' . $row; $h[] = '<li>' . htmlspecialchars($row) . '</li>'; } $h[] = '</ul>'; }
      if ($atRisk) { $row = "Your {$sk['streak']}-day streak ends at midnight. Answer one quiz question to keep it going."; $lines[] = ''; $lines[] = $row; $h[] = '<p style="padding:10px 12px;background:#FCEEDB;border-radius:8px;margin:0 0 14px"><b>' . htmlspecialchars($row) . '</b></p>'; }
      $subject = $due ? 'Tomorrow: ' . implode(', ', array_map(fn($e) => $e['title'], array_slice($due, 0, 2))) . (count($due) > 2 ? ' +' . (count($due) - 2) . ' more' : '') : ($atRisk ? "Your {$sk['streak']}-day streak ends tonight" : 'Study session tomorrow');
      $text = implode("\n", $lines) . "\n\nOpen $site: $url\nTurn these reminders off in Settings → Account.";
      $html = '<div style="font-family:Helvetica Neue,Helvetica,Arial,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#0F172A">' . implode('', $h) . '<p><a href="' . $url . '" style="display:inline-block;background:#4F46E5;color:#fff;text-decoration:none;padding:9px 14px;border-radius:8px">Open ' . htmlspecialchars($site) . '</a></p><p style="font-size:12px;color:#64748B">Turn these reminders off in Settings → Account.</p></div>';
      $r = mh_send_mail($cfg, $u['email'], $subject, $text, $html); if ($r['ok']) $sent++;
    } catch (Throwable $e) {}
  }
  return $sent;
}
function mh_digest_window_start(): ?int {
  $cfg = mh_config(); $day = (int)($cfg['digest_day'] ?? 0); $hour = (int)($cfg['digest_hour'] ?? 17);
  $now = new DateTime('now', mh_tz()); $dow = (int)$now->format('w'); $h = (int)$now->format('G');
  // Window: from digest_day at digest_hour until the next day at noon.
  if ($dow === $day && $h >= $hour) { $w = clone $now; $w->setTime($hour, 0); return $w->getTimestamp(); }
  if ($dow === ($day + 1) % 7 && $h < 12) { $w = clone $now; $w->modify('-1 day'); $w->setTime($hour, 0); return $w->getTimestamp(); }
  return null;
}
function mh_digest_tick(int $max): int {
  $ws = mh_digest_window_start(); if ($ws === null || $max <= 0) return 0;
  $db = mh_db(); $st = $db->prepare('SELECT * FROM users WHERE verified = 1 AND digest_email = 1 AND digest_sent < ? AND email NOT LIKE "%@system.local" ORDER BY id LIMIT ?'); $st->execute([$ws, $max]); $users = $st->fetchAll();
  if (!$users) return 0;
  require_once __DIR__ . '/mailer.php'; $cfg = mh_config(); $sent = 0;
  $ctx = mh_digest_context();
  foreach ($users as $u) {
    $db->prepare('UPDATE users SET digest_sent = ? WHERE id = ?')->execute([time(), $u['id']]);   // mark first so a failure never loops
    try { [$subject, $text, $html] = mh_digest_content($u, $ctx); $r = mh_send_mail($cfg, $u['email'], $subject, $text, $html); if ($r['ok']) $sent++; } catch (Throwable $e) {}
  }
  return $sent;
}
function mh_digest_context(): array {
  $db = mh_db(); $now = time(); $week = $now - 7 * 86400; $ctx = ['canvas' => [], 'top' => [], 'avg' => null, 'meets' => [], 'mocks' => []];
  try { require_once __DIR__ . '/canvas.php'; $c = mh_canvas_events(false); $from = mh_local_date(); $to = mh_local_date($now + 7 * 86400); $ctx['canvas'] = array_values(array_filter($c['events'], fn($e) => $e['date'] >= $from && $e['date'] <= $to)); } catch (Throwable $e) {}
  $st = $db->prepare('SELECT id, title, course, score, ncomments FROM posts WHERE removed = 0 AND created > ? ORDER BY score DESC, ncomments DESC LIMIT 5'); $st->execute([$week]); $ctx['top'] = $st->fetchAll();
  $key = 'digest_avg:' . mh_week_start(); $cached = mh_setting($key);
  if ($cached !== null) $ctx['avg'] = json_decode($cached, true);
  else { $ctx['avg'] = mh_class_week_stats($week); mh_setting_set($key, json_encode($ctx['avg'])); }
  $st = $db->prepare('SELECT title, place, start, course FROM meets WHERE cancelled = 0 AND start > ? AND start < ? ORDER BY start LIMIT 5'); $st->execute([$now, $now + 7 * 86400]); $ctx['meets'] = $st->fetchAll();
  $st = $db->prepare('SELECT title, start, course FROM mocks WHERE cancelled = 0 AND start > ? AND start < ? ORDER BY start LIMIT 3'); $st->execute([$now, $now + 7 * 86400]); $ctx['mocks'] = $st->fetchAll();
  return $ctx;
}
function mh_digest_content(array $u, array $ctx): array {
  $cfg = mh_config(); $site = $cfg['site_name'] ?? 'Mathub'; $url = rtrim((string)(($cfg['site_url'] ?? '') ?: ('https://' . ($_SERVER['HTTP_HOST'] ?? 'mathub.space'))), '/');
  $names = mh_course_names() + ['general' => 'General'];
  $from = mh_local_date(time() - 7 * 86400); $answered = 0; $correct = 0; $days = [];
  foreach (mh_user_progress((int)$u['id']) as $blob) { foreach ($blob['history'] ?? [] as $h) if (($h['d'] ?? '') >= $from) { $answered++; if (!empty($h['ok'])) $correct++; } foreach (array_keys($blob['activity'] ?? []) as $d) if ($d >= $from) $days[$d] = true; }
  $mine = mh_user_courses($u); $ctx['canvas'] = array_values(array_filter($ctx['canvas'], fn($e) => in_array($e['course'], $mine, true)));
  $mins = mh_week_minutes(mh_user_progress((int)$u['id']), time() - 7 * 86400);
  $db = mh_db(); $st = $db->prepare('SELECT COALESCE(SUM(points),0) FROM challenge_attempts WHERE user_id = ? AND created > ?'); $st->execute([$u['id'], time() - 7 * 86400]); $cpts = (int)$st->fetchColumn();
  $st = $db->prepare('SELECT code FROM badges WHERE user_id = ? AND earned > ?'); $st->execute([$u['id'], time() - 7 * 86400]); $newBadges = array_map(fn($c) => MH_BADGES[$c][0] ?? $c, array_column($st->fetchAll(), 'code'));
  $acc = $answered ? round(100 * $correct / $answered) : null; $avg = $ctx['avg'];
  $lines = []; $h = [];
  $lines[] = "Your week on $site"; $lines[] = '';
  $me = "You answered $answered quiz questions" . ($acc !== null ? " at $acc% accuracy" : '') . ", studied on " . count($days) . " day" . (count($days) === 1 ? '' : 's') . ($mins ? ' for ' . round($mins / 60, 1) . ' h of focused time' : '') . ($cpts ? ", and earned $cpts daily-challenge points" : '') . '.';
  if ($avg && $avg['acc'] !== null && $avg['users'] > 1) $me .= " The class averaged {$avg['acc']}% across {$avg['users']} active students" . (isset($avg['median_hours']) && $avg['median_hours'] !== null ? " and a median of {$avg['median_hours']} h of focus time" : '') . '.';
  if ($newBadges) $me .= ' New badges: ' . implode(', ', $newBadges) . '.';
  $lines[] = $me; $h[] = '<p>' . htmlspecialchars($me) . '</p>';
  if ($ctx['canvas']) { $lines[] = ''; $lines[] = 'Due in the next 7 days (from Canvas):'; $h[] = '<h3 style="margin:18px 0 6px;font-size:15px">Due in the next 7 days</h3><ul style="padding-left:18px;margin:0">'; foreach ($ctx['canvas'] as $e) { $row = ($names[$e['course']] ?? $e['course']) . ': ' . $e['title'] . ' · ' . date('D M j', strtotime($e['date'])) . ($e['time'] ? ' ' . $e['time'] : ''); $lines[] = '  - ' . $row; $h[] = '<li>' . htmlspecialchars($row) . '</li>'; } $h[] = '</ul>'; }
  if ($ctx['top']) { $lines[] = ''; $lines[] = 'Most upvoted this week:'; $h[] = '<h3 style="margin:18px 0 6px;font-size:15px">Most upvoted this week</h3><ul style="padding-left:18px;margin:0">'; foreach ($ctx['top'] as $p) { $row = ($names[$p['course']] ?? $p['course']) . ': ' . $p['title'] . " (+{$p['score']}, {$p['ncomments']} comments)"; $lines[] = '  - ' . $row . " $url/#/forum/{$p['id']}"; $h[] = '<li><a href="' . $url . '/#/forum/' . (int)$p['id'] . '">' . htmlspecialchars($p['title']) . '</a> <span style="color:#64748B">' . htmlspecialchars(($names[$p['course']] ?? $p['course']) . " · +{$p['score']} · {$p['ncomments']} comments") . '</span></li>'; } $h[] = '</ul>'; }
  if ($ctx['meets'] || $ctx['mocks']) { $lines[] = ''; $lines[] = 'Coming up:'; $h[] = '<h3 style="margin:18px 0 6px;font-size:15px">Coming up</h3><ul style="padding-left:18px;margin:0">'; foreach ($ctx['mocks'] as $m) { $row = 'Mock exam: ' . $m['title'] . ' · ' . (new DateTime('@' . $m['start']))->setTimezone(mh_tz())->format('D M j, g:i a'); $lines[] = '  - ' . $row; $h[] = '<li>' . htmlspecialchars($row) . '</li>'; } foreach ($ctx['meets'] as $m) { $row = 'Study session: ' . $m['title'] . ' at ' . $m['place'] . ' · ' . (new DateTime('@' . $m['start']))->setTimezone(mh_tz())->format('D M j, g:i a'); $lines[] = '  - ' . $row; $h[] = '<li>' . htmlspecialchars($row) . '</li>'; } $h[] = '</ul>'; }
  $lines[] = ''; $lines[] = "Open $site: $url"; $lines[] = "Turn these emails off in Settings → Account.";
  $html = '<div style="font-family:Helvetica Neue,Helvetica,Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#0F172A"><h2 style="margin:0 0 12px;font-size:20px">Your week on ' . htmlspecialchars($site) . '</h2>' . implode('', $h) . '<p style="margin-top:20px"><a href="' . $url . '" style="display:inline-block;background:#4F46E5;color:#fff;text-decoration:none;padding:9px 14px;border-radius:8px">Open ' . htmlspecialchars($site) . '</a></p><p style="font-size:12px;color:#64748B">Turn these emails off in Settings → Account.</p></div>';
  return ["Your week on $site" . ($ctx['canvas'] ? ' · ' . count($ctx['canvas']) . ' things due' : ''), implode("\n", $lines), $html];
}

/** Class-wide numbers for the last week: answered, accuracy, active users, median focus hours (per user with any minutes). */
function mh_class_week_stats(int $since): array {
  $db = mh_db(); $a = 0; $c = 0; $users = 0; $from = mh_local_date($since); $minutes = [];
  foreach ($db->query('SELECT user_id, json FROM progress')->fetchAll() as $r) {
    $j = json_decode($r['json'], true); if (!is_array($j)) continue; $n = 0;
    foreach ($j['history'] ?? [] as $h) if (($h['d'] ?? '') >= $from) { $a++; $n++; if (!empty($h['ok'])) $c++; }
    if ($n) $users++;
    foreach ($j['sessions'] ?? [] as $sn) if (($sn['d'] ?? '') >= $from) $minutes[$r['user_id']] = ($minutes[$r['user_id']] ?? 0) + (int)($sn['m'] ?? 0);
  }
  $vals = array_values($minutes); sort($vals); $median = $vals ? round(($vals[intdiv(count($vals) - 1, 2)] + $vals[intdiv(count($vals), 2)]) / 2 / 60, 1) : null;
  return ['answered' => $a, 'acc' => $a ? round(100 * $c / $a) : null, 'users' => $users, 'median_hours' => $median, 'hours_users' => count($vals)];
}

/* ---------- routes ---------- */
function mh_social_route(string $route, array $in, array $cfg, string $ip): void {
  $db = mh_db(); $me = mh_current_user(); $mod = mh_is_mod($me); $admin = mh_is_admin($me); $now = time();
  $course = (string)($in['course'] ?? $_GET['course'] ?? '');
  switch ($route) {

    /* --- daily challenge --- */
    case 'challenge_stats': {
      mh_method('GET'); if (!mh_is_course($course, true)) mh_fail('Unknown class.');
      $date = preg_match('/^\d{4}-\d{2}-\d{2}$/', (string)($_GET['date'] ?? '')) ? $_GET['date'] : mh_local_date();
      $st = $db->prepare('SELECT COUNT(*) AS n, COALESCE(SUM(ok),0) AS ok FROM challenge_attempts WHERE course = ? AND date = ?'); $st->execute([$course, $date]); $agg = $st->fetch();
      $mine = null; if ($me) { $st = $db->prepare('SELECT ok, ms, points FROM challenge_attempts WHERE user_id = ? AND course = ? AND date = ?'); $st->execute([$me['id'], $course, $date]); $r = $st->fetch(); if ($r) $mine = ['ok' => (int)$r['ok'] === 1, 'ms' => (int)$r['ms'], 'points' => (int)$r['points']]; }
      $st = $db->prepare('SELECT u.name, u.email, u.show_on_leaderboard, a.ms, a.points FROM challenge_attempts a JOIN users u ON u.id = a.user_id WHERE a.course = ? AND a.date = ? AND a.ok = 1 ORDER BY a.ms ASC LIMIT 10'); $st->execute([$course, $date]);
      $today = array_map(fn($r) => ['name' => mh_lb_name($r), 'ms' => (int)$r['ms'], 'points' => (int)$r['points']], $st->fetchAll());
      $ws = mh_week_start();
      $st = $db->prepare('SELECT u.id, u.name, u.email, u.show_on_leaderboard, SUM(a.points) AS pts, COUNT(*) AS days FROM challenge_attempts a JOIN users u ON u.id = a.user_id WHERE a.created >= ? ' . ($course !== 'general' ? 'AND a.course = ? ' : '') . 'GROUP BY u.id ORDER BY pts DESC, days DESC LIMIT 10'); $st->execute($course !== 'general' ? [$ws, $course] : [$ws]);
      $week = array_map(fn($r) => ['name' => mh_lb_name($r), 'points' => (int)$r['pts'], 'days' => (int)$r['days'], 'me' => $me && (int)$r['id'] === (int)$me['id']], $st->fetchAll());
      $st = $db->prepare('SELECT u.id, u.name, u.email, u.show_on_leaderboard, SUM(a.points) AS pts, COUNT(*) AS days FROM challenge_attempts a JOIN users u ON u.id = a.user_id WHERE a.created >= ? GROUP BY u.id ORDER BY pts DESC, days DESC LIMIT 10'); $st->execute([$ws]);
      $overall = array_map(fn($r) => ['name' => mh_lb_name($r), 'points' => (int)$r['pts'], 'days' => (int)$r['days'], 'me' => $me && (int)$r['id'] === (int)$me['id']], $st->fetchAll());
      $myWeek = 0; if ($me) { $st = $db->prepare('SELECT COALESCE(SUM(points),0) FROM challenge_attempts WHERE user_id = ? AND created >= ?'); $st->execute([$me['id'], $ws]); $myWeek = (int)$st->fetchColumn(); }
      mh_json(['ok' => true, 'date' => $date, 'attempts' => (int)$agg['n'], 'correct' => (int)$agg['ok'], 'mine' => $mine, 'today' => $today, 'week' => $week, 'overall' => $overall, 'my_week_points' => $myWeek]);
    }
    case 'challenge_submit': {
      mh_method('POST'); $u = mh_require_user(); if (!mh_is_course($course, true)) mh_fail('Unknown class.');
      $date = (string)($in['date'] ?? ''); if (!in_array($date, [mh_local_date(), mh_local_date($now - 86400)], true)) mh_fail('That challenge day is over.');
      $ok = !empty($in['ok']) ? 1 : 0; $ms = max(1000, min(3600000, (int)($in['ms'] ?? 60000)));
      $points = $ok ? 10 + max(0, min(5, (int)round((90 - $ms / 1000) / 15))) : 2;
      $st = $db->prepare('INSERT OR IGNORE INTO challenge_attempts (user_id, course, date, ok, ms, points, topic, created) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'); $st->execute([$u['id'], $course, $date, $ok, $ms, $points, mh_str($in, 'topic', 40), $now]);
      if ($st->rowCount() === 0) mh_fail('You already did today’s challenge.', 409);
      if ($ok) mh_activity('challenge', $course, 'A student solved today’s ' . (['calc' => 'Calc I', 'physics' => 'Physics I', 'precalc' => 'Precalc', 'general' => ''][$course] ?? '') . ' daily challenge', '#/' . $course . '/challenge');
      $b = mh_award_badges((int)$u['id'], [], $course);
      mh_json(['ok' => true, 'points' => $points, 'badges_new' => $b['new']]);
    }

    /* --- badges --- */
    case 'badges': {
      mh_method('GET', 'POST'); $u = mh_require_user();
      $client = array_values(array_filter((array)($in['client'] ?? []), 'is_string'));
      $b = mh_award_badges((int)$u['id'], $client);
      if (!empty($in['seen'])) $db->prepare('UPDATE badges SET seen = 1 WHERE user_id = ?')->execute([$u['id']]);
      mh_json(['ok' => true, 'badges' => $b['all'], 'new' => $b['new'], 'catalog' => array_map(fn($c, $v) => ['code' => $c, 'name' => $v[0], 'desc' => $v[1], 'icon' => $v[2]], array_keys(MH_BADGES), MH_BADGES)]);
    }

    /* --- presence --- */
    case 'presence': {
      mh_method('GET', 'POST');
      if ($_SERVER['REQUEST_METHOD'] === 'POST' && $me) { $db->prepare('INSERT INTO presence (user_id, course, view, post_id, seen) VALUES (?, ?, ?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET course = excluded.course, view = excluded.view, post_id = excluded.post_id, seen = excluded.seen')->execute([$me['id'], mh_str($in, 'course', 20), mh_str($in, 'view', 30), (int)($in['post_id'] ?? 0), $now]); }
      $cut = $now - 150; $st = $db->prepare('SELECT course, COUNT(*) AS n FROM presence WHERE seen > ? GROUP BY course'); $st->execute([$cut]); $by = []; $total = 0; foreach ($st->fetchAll() as $r) { $by[$r['course'] ?: 'home'] = (int)$r['n']; $total += (int)$r['n']; }
      $here = 0; $pid = (int)($in['post_id'] ?? $_GET['post_id'] ?? 0); if ($pid) { $st = $db->prepare('SELECT COUNT(*) FROM presence WHERE seen > ? AND post_id = ?'); $st->execute([$cut, $pid]); $here = (int)$st->fetchColumn(); }
      mh_json(['ok' => true, 'online' => $total, 'by_course' => $by, 'here' => $here]);
    }

    /* --- study sessions --- */
    case 'meet_list': {
      mh_method('GET');
      $st = $db->prepare('SELECT m.*, u.name AS u_name, u.email AS u_email, (SELECT COUNT(*) FROM meet_rsvp r WHERE r.meet_id = m.id) AS going FROM meets m JOIN users u ON u.id = m.user_id WHERE m.cancelled = 0 AND m.end > ? ' . ($me ? 'AND m.user_id NOT IN (SELECT blocked_id FROM member_blocks WHERE anon = 0 AND user_id = ' . (int)$me['id'] . ') ' : '') . ($course && $course !== 'all' ? 'AND m.course = ? ' : '') . 'ORDER BY m.start ASC LIMIT 60'); $st->execute($course && $course !== 'all' ? [$now - 3600, $course] : [$now - 3600]);
      $mine = []; if ($me) { $st2 = $db->prepare('SELECT meet_id FROM meet_rsvp WHERE user_id = ?'); $st2->execute([$me['id']]); $mine = array_map('intval', array_column($st2->fetchAll(), 'meet_id')); }
      mh_json(['ok' => true, 'meets' => array_map(fn($m) => ['id' => (int)$m['id'], 'course' => $m['course'], 'title' => $m['title'], 'place' => $m['place'], 'start' => (int)$m['start'], 'end' => (int)$m['end'], 'note' => $m['note'], 'host' => mh_display_name($m, 'u_'), 'mine' => $me && (int)$m['user_id'] === (int)$me['id'], 'going' => (int)$m['going'], 'im_going' => in_array((int)$m['id'], $mine, true), 'live' => (int)$m['start'] <= $now && (int)$m['end'] >= $now], $st->fetchAll())]);
    }
    case 'meet_create': {
      mh_method('POST'); $u = mh_require_user(); require_once __DIR__ . '/forum.php'; mh_can_post($u);
      mh_rate_or_fail("meet:user:{$u['id']}", 10, 86400);
      if (!mh_is_course($course, true)) mh_fail('Pick a class.');
      $title = mh_censor(mh_str($in, 'title', 80)); $place = mh_censor(mh_str($in, 'place', 80)); $note = mh_censor(mb_substr(trim((string)($in['note'] ?? '')), 0, 300));
      $start = (int)($in['start'] ?? 0); $minutes = max(30, min(480, (int)($in['minutes'] ?? 90)));
      if (mb_strlen($title) < 3 || mb_strlen($place) < 2) mh_fail('Give the session a title and a place.'); if ($start < $now - 1800 || $start > $now + 45 * 86400) mh_fail('Pick a start time in the next 45 days.');
      $db->prepare('INSERT INTO meets (user_id, course, title, place, start, end, note, created) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')->execute([$u['id'], $course, $title, $place, $start, $start + $minutes * 60, $note, $now]); $id = (int)$db->lastInsertId();
      $db->prepare('INSERT OR IGNORE INTO meet_rsvp (meet_id, user_id, created) VALUES (?, ?, ?)')->execute([$id, $u['id'], $now]);
      mh_activity('meet', $course, 'Study session posted: ' . $title . ' at ' . $place . ' · ' . (new DateTime('@' . $start))->setTimezone(mh_tz())->format('D g:i a'), '#/meet');
      mh_json(['ok' => true, 'id' => $id]);
    }
    case 'meet_cancel': {
      mh_method('POST'); $u = mh_require_user(); $st = $db->prepare('SELECT * FROM meets WHERE id = ?'); $st->execute([(int)($in['id'] ?? 0)]); $m = $st->fetch(); if (!$m) mh_fail('Not found.', 404);
      if ((int)$m['user_id'] !== (int)$u['id'] && !$mod) mh_fail('Only the host can cancel this.', 403);
      $db->prepare('UPDATE meets SET cancelled = 1 WHERE id = ?')->execute([$m['id']]); mh_json(['ok' => true]);
    }
    case 'meet_rsvp': {
      mh_method('POST'); $u = mh_require_user(); $id = (int)($in['id'] ?? 0);
      if (!empty($in['going'])) $db->prepare('INSERT OR IGNORE INTO meet_rsvp (meet_id, user_id, created) VALUES (?, ?, ?)')->execute([$id, $u['id'], $now]); else $db->prepare('DELETE FROM meet_rsvp WHERE meet_id = ? AND user_id = ?')->execute([$id, $u['id']]);
      $st = $db->prepare('SELECT COUNT(*) FROM meet_rsvp WHERE meet_id = ?'); $st->execute([$id]); mh_json(['ok' => true, 'going' => (int)$st->fetchColumn()]);
    }

    /* --- polls --- */
    case 'poll_vote': {
      mh_method('POST'); $u = mh_require_user(); $pid = (int)($in['poll_id'] ?? 0); $st = $db->prepare('SELECT * FROM polls WHERE id = ?'); $st->execute([$pid]); $p = $st->fetch(); if (!$p) mh_fail('Poll not found.', 404);
      $n = count(json_decode($p['options'], true) ?: []); $sel = array_values(array_unique(array_filter(array_map('intval', (array)($in['options'] ?? [])), fn($i) => $i >= 0 && $i < $n)));
      if (!$sel) mh_fail('Pick an option.'); if (!(int)$p['multi']) $sel = [$sel[0]];
      $db->prepare('DELETE FROM poll_votes WHERE poll_id = ? AND user_id = ?')->execute([$pid, $u['id']]);
      foreach ($sel as $i) $db->prepare('INSERT OR IGNORE INTO poll_votes (poll_id, user_id, opt, created) VALUES (?, ?, ?, ?)')->execute([$pid, $u['id'], $i, $now]);
      mh_json(['ok' => true, 'poll' => mh_poll_view((int)$p['post_id'], (int)$u['id'])]);
    }
    case 'poll_exam': {
      mh_method('POST'); $u = mh_require_user(); if (!mh_is_course($course, true)) mh_fail('Unknown class.');
      $examId = preg_replace('/[^a-z0-9_-]/i', '', (string)($in['exam_id'] ?? '')); $examName = mh_str($in, 'exam_name', 40); $date = (string)($in['date'] ?? '');
      if ($examId === '' || $examName === '' || !preg_match('/^\d{4}-\d{2}-\d{2}$/', $date) || $date > mh_local_date()) mh_fail('That exam has not happened yet.');
      $key = "exam:$course:$examId"; $st = $db->prepare('SELECT post_id FROM polls WHERE auto_key = ?'); $st->execute([$key]); if ($pid = $st->fetchColumn()) mh_json(['ok' => true, 'post_id' => (int)$pid, 'existing' => true]);
      $sys = mh_system_user(); $title = "How did $examName go? (anonymous poll)"; $body = "Votes are anonymous: nobody can see who picked what, only the totals.\n\nShare what worked and what you would do differently in the comments. If it went badly, remember the grade calculator can show exactly what you need from here.";
      $db->prepare('INSERT INTO posts (user_id, course, flair, title, body, anon, created, ip) VALUES (?, ?, "exam", ?, ?, 0, ?, "")')->execute([$sys['id'], $course, $title, $body, $now]); $postId = (int)$db->lastInsertId();
      try { mh_poll_create($postId, ['90–100% (A range)', '80–89%', '70–79%', '60–69%', 'Below 60%', 'Not sure yet'], "How did $examName go?", 0, $key); } catch (Throwable $e) { $db->prepare('DELETE FROM posts WHERE id = ?')->execute([$postId]); mh_fail('Could not create the poll.'); }
      mh_activity('poll', $course, "New poll: how did $examName go?", '#/forum/' . $postId);
      mh_json(['ok' => true, 'post_id' => $postId, 'existing' => false]);
    }

    /* --- helper rankings --- */
    case 'helpers': {
      mh_method('GET'); $week = $now - 7 * 86400;
      $q = function (int $since) use ($db) {
        $st = $db->prepare('SELECT u.id, u.name, u.email, u.show_on_leaderboard, COUNT(c.id) AS comments, COALESCE(SUM(c.score),0) AS cscore, (SELECT COUNT(*) FROM posts p JOIN comments c2 ON c2.id = p.accepted_id WHERE c2.user_id = u.id AND c2.created > ?) AS accepted FROM comments c JOIN users u ON u.id = c.user_id WHERE c.removed = 0 AND c.created > ? AND u.email NOT LIKE "%@system.local" GROUP BY u.id ORDER BY (accepted * 15 + cscore * 2 + COUNT(c.id)) DESC LIMIT 8'); $st->execute([$since, $since]);
        return array_map(fn($r) => ['name' => mh_lb_name($r), 'role' => mh_role($r['email']), 'points' => (int)$r['accepted'] * 15 + (int)$r['cscore'] * 2 + (int)$r['comments'], 'accepted' => (int)$r['accepted'], 'comments' => (int)$r['comments']], $st->fetchAll());
      };
      mh_json(['ok' => true, 'week' => $q($week), 'all' => $q(0)]);
    }

    /* --- leagues --- */
    case 'league': {
      mh_method('GET'); $u = mh_require_user(); mh_league_tick(); $ws = mh_week_start(); $rows = mh_league_rows($ws);
      $st = $db->prepare('SELECT league FROM users WHERE id = ?'); $st->execute([$u['id']]); $lg = (int)$st->fetchColumn();
      $mine = array_values(array_filter($rows, fn($r) => $r['league'] === $lg)); $localXp = max(0, min(100000, (int)($_GET['xp'] ?? 0)));
      $found = false; foreach ($mine as &$r) if ($r['id'] === (int)$u['id']) { $r['xp'] = max($r['xp'], $localXp); $found = true; } unset($r);
      if (!$found) $mine[] = ['id' => (int)$u['id'], 'name' => mh_lb_name($u), 'role' => mh_role($u['email']), 'league' => $lg, 'xp' => $localXp];
      usort($mine, fn($a, $b) => ($b['xp'] <=> $a['xp']) ?: ($a['id'] <=> $b['id']));
      $board = []; $myRank = 0; foreach ($mine as $i => $r) { $me = $r['id'] === (int)$u['id']; if ($me) $myRank = $i + 1; $board[] = ['rank' => $i + 1, 'id' => $r['id'], 'name' => $r['name'], 'role' => $r['role'], 'xp' => $r['xp'], 'me' => $me]; }
      $n = count($mine); $demote = ($lg > 0 && $n >= MH_LEAGUE_MIN_DEMOTE) ? MH_LEAGUE_DEMOTE : 0; $promote = $lg < count(MH_LEAGUES) - 1 ? MH_LEAGUE_PROMOTE : 0;
      $st = $db->prepare('SELECT week, league, rank, xp, result FROM league_history WHERE user_id = ? ORDER BY week DESC LIMIT 1'); $st->execute([$u['id']]); $last = $st->fetch() ?: null;
      mh_json(['ok' => true, 'league' => $lg, 'tiers' => MH_LEAGUES, 'week_start' => $ws, 'week_end' => $ws + 7 * 86400, 'board' => array_slice($board, 0, 50), 'members' => $n, 'me' => ['rank' => $myRank, 'xp' => $myRank ? $board[$myRank - 1]['xp'] : 0], 'zones' => ['promote' => $promote, 'demote' => $demote],
        'last' => $last ? ['week' => (int)$last['week'], 'league' => (int)$last['league'], 'rank' => (int)$last['rank'], 'xp' => (int)$last['xp'], 'result' => $last['result']] : null]);
    }

    /* --- people directory: every verified member with the badges they have earned --- */
    case 'people': {
      mh_method('GET'); $u = mh_require_user();
      $q = trim((string)($_GET['q'] ?? '')); $sort = (string)($_GET['sort'] ?? 'badges'); $page = max(0, (int)($_GET['page'] ?? 0)); $per = 48; $cut = $now - 150;
      $where = 'u.verified = 1 AND u.email NOT LIKE "%@system.local"'; $args = [];
      if ($q !== '') { $like = '%' . str_replace(['%', '_'], ['\\%', '\\_'], mb_substr($q, 0, 60)) . '%'; $where .= ' AND u.show_on_leaderboard = 1 AND (u.name LIKE ? OR (u.name = "" AND substr(u.email, 1, instr(u.email, "@") - 1) LIKE ?))'; $args = [$like, $like]; }
      $order = ['new' => 'u.created DESC', 'name' => 'u.show_on_leaderboard DESC, LOWER(CASE WHEN u.name <> "" THEN u.name ELSE u.email END) ASC', 'active' => 'online DESC, last_seen DESC, nbadges DESC'][$sort] ?? 'nbadges DESC, accepted DESC, u.created ASC';
      $sql = "SELECT u.id, u.name, u.email, u.created, u.show_on_leaderboard, u.courses,
          (SELECT COUNT(*) FROM badges b WHERE b.user_id = u.id) AS nbadges,
          (SELECT COUNT(*) FROM posts p WHERE p.user_id = u.id AND p.removed = 0) AS nposts,
          (SELECT COUNT(*) FROM comments c WHERE c.user_id = u.id AND c.removed = 0) AS ncomments,
          (SELECT COUNT(*) FROM posts p JOIN comments c2 ON c2.id = p.accepted_id WHERE c2.user_id = u.id AND c2.removed = 0) AS accepted,
          COALESCE((SELECT seen FROM presence pr WHERE pr.user_id = u.id), 0) AS last_seen,
          CASE WHEN COALESCE((SELECT seen FROM presence pr WHERE pr.user_id = u.id), 0) > $cut THEN 1 ELSE 0 END AS online
        FROM users u WHERE $where ORDER BY $order LIMIT " . ($per + 1) . ' OFFSET ' . ($page * $per);
      $st = $db->prepare($sql); $st->execute($args); $rows = $st->fetchAll(); $more = count($rows) > $per; $rows = array_slice($rows, 0, $per);
      $st = $db->prepare("SELECT COUNT(*) FROM users u WHERE $where"); $st->execute($args); $total = (int)$st->fetchColumn();
      $st = $db->prepare('SELECT COUNT(*) FROM presence WHERE seen > ?'); $st->execute([$cut]); $online = (int)$st->fetchColumn();
      $byUser = []; if ($rows) { $ids = array_map(fn($r) => (int)$r['id'], $rows); $st = $db->prepare('SELECT user_id, code, earned FROM badges WHERE user_id IN (' . implode(',', array_fill(0, count($ids), '?')) . ') ORDER BY earned DESC'); $st->execute($ids); foreach ($st->fetchAll() as $b) if (isset(MH_BADGES[$b['code']])) $byUser[(int)$b['user_id']][] = ['code' => $b['code'], 'earned' => (int)$b['earned']]; }
      $people = array_map(function ($r) use ($byUser, $u) {
        $shown = (int)$r['show_on_leaderboard'] === 1; $name = $shown ? mh_display_name($r) : 'Anonymous student';
        return ['id' => (int)$r['id'], 'name' => $name, 'anon' => !$shown, 'role' => mh_role($r['email']), 'mod' => mh_is_mod(['email' => $r['email']]), 'admin' => mh_is_admin(['email' => $r['email']]),
          'online' => (int)$r['online'] === 1, 'joined' => (int)$r['created'], 'courses' => $shown ? mh_user_courses($r) : [], 'badges' => $byUser[(int)$r['id']] ?? [],
          'posts' => (int)$r['nposts'], 'comments' => (int)$r['ncomments'], 'accepted' => (int)$r['accepted'], 'me' => (int)$r['id'] === (int)$u['id']];
      }, $rows);
      mh_json(['ok' => true, 'people' => $people, 'total' => $total, 'online' => $online, 'more' => $more, 'page' => $page, 'catalog' => array_map(fn($c, $v) => ['code' => $c, 'name' => $v[0], 'desc' => $v[1], 'icon' => $v[2]], array_keys(MH_BADGES), MH_BADGES)]);
    }

    /* --- community mock exams --- */
    case 'mock_list': {
      mh_method('GET');
      $st = $db->prepare('SELECT m.*, (SELECT COUNT(*) FROM mock_reg r WHERE r.mock_id = m.id) AS registered, (SELECT COUNT(*) FROM mock_results x WHERE x.mock_id = m.id) AS results FROM mocks m WHERE m.cancelled = 0 AND m.start + m.minutes * 60 > CAST(? AS INTEGER) ' . ($course && $course !== 'all' ? 'AND m.course = ? ' : '') . 'ORDER BY m.start ASC LIMIT 20'); $st->execute($course && $course !== 'all' ? [$now - 14 * 86400, $course] : [$now - 14 * 86400]);
      $out = [];
      foreach ($st->fetchAll() as $m) {
        $end = (int)$m['start'] + (int)$m['minutes'] * 60; $open = $now >= (int)$m['start'] - 60 && $now <= $end + 900; $ended = $now > $end;
        $reg = false; $res = null; if ($me) { $s2 = $db->prepare('SELECT 1 FROM mock_reg WHERE mock_id = ? AND user_id = ?'); $s2->execute([$m['id'], $me['id']]); $reg = (bool)$s2->fetchColumn(); $s3 = $db->prepare('SELECT score, total, ms FROM mock_results WHERE mock_id = ? AND user_id = ?'); $s3->execute([$m['id'], $me['id']]); $r = $s3->fetch(); if ($r) $res = ['score' => (int)$r['score'], 'total' => (int)$r['total'], 'ms' => (int)$r['ms']]; }
        $out[] = ['id' => (int)$m['id'], 'course' => $m['course'], 'exam_id' => $m['exam_id'], 'title' => $m['title'], 'start' => (int)$m['start'], 'minutes' => (int)$m['minutes'], 'count' => (int)$m['count'], 'official' => (int)($m['official'] ?? 0) === 1, 'registered' => (int)$m['registered'], 'results' => (int)$m['results'], 'im_registered' => $reg, 'my_result' => $res, 'open' => $open, 'ended' => $ended, 'seed' => ($open || $ended) ? (int)$m['seed'] : null];
      }
      mh_json(['ok' => true, 'mocks' => $out]);
    }
    case 'mock_create': {
      mh_method('POST'); $u = mh_require_user(); if (!$mod) mh_fail('Moderators only.', 403);
      if (!mh_is_course($course, true) || $course === 'general') mh_fail('Pick a class.');
      $title = mh_str($in, 'title', 80) ?: 'Community mock exam'; $examId = preg_replace('/[^a-z0-9_-]/i', '', (string)($in['exam_id'] ?? '')); $start = (int)($in['start'] ?? 0); $minutes = max(15, min(180, (int)($in['minutes'] ?? 50))); $count = max(5, min(30, (int)($in['count'] ?? 15)));
      if ($examId === '' || $start < $now) mh_fail('Pick an exam and a future start time.');
      $db->prepare('INSERT INTO mocks (course, exam_id, title, start, minutes, count, seed, created_by, created) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')->execute([$course, $examId, $title, $start, $minutes, $count, random_int(1000, 2147483000), $u['id'], $now]); $id = (int)$db->lastInsertId();
      mh_activity('mock', $course, 'Community mock exam scheduled: ' . $title . ' · ' . (new DateTime('@' . $start))->setTimezone(mh_tz())->format('D M j, g:i a'), '#/' . $course . '/mock');
      mh_json(['ok' => true, 'id' => $id]);
    }
    case 'mock_cancel': { mh_method('POST'); $u = mh_require_user(); if (!$mod) mh_fail('Moderators only.', 403); $db->prepare('UPDATE mocks SET cancelled = 1 WHERE id = ?')->execute([(int)($in['id'] ?? 0)]); mh_json(['ok' => true]); }
    case 'mock_register': {
      mh_method('POST'); $u = mh_require_user(); $id = (int)($in['id'] ?? 0);
      if (!empty($in['going'])) $db->prepare('INSERT OR IGNORE INTO mock_reg (mock_id, user_id, created) VALUES (?, ?, ?)')->execute([$id, $u['id'], $now]); else $db->prepare('DELETE FROM mock_reg WHERE mock_id = ? AND user_id = ?')->execute([$id, $u['id']]);
      $st = $db->prepare('SELECT COUNT(*) FROM mock_reg WHERE mock_id = ?'); $st->execute([$id]); mh_json(['ok' => true, 'registered' => (int)$st->fetchColumn()]);
    }
    case 'mock_submit': {
      mh_method('POST'); $u = mh_require_user(); $id = (int)($in['id'] ?? 0); $st = $db->prepare('SELECT * FROM mocks WHERE id = ? AND cancelled = 0'); $st->execute([$id]); $m = $st->fetch(); if (!$m) mh_fail('Mock exam not found.', 404);
      $end = (int)$m['start'] + (int)$m['minutes'] * 60; if ($now < (int)$m['start'] - 60 || $now > $end + 900) mh_fail('This mock exam is not open.', 403);
      $score = max(0, (int)($in['score'] ?? 0)); $total = max(1, (int)($in['total'] ?? $m['count'])); $ms = max(1000, (int)($in['ms'] ?? 0));
      $st = $db->prepare('INSERT OR IGNORE INTO mock_results (mock_id, user_id, score, total, ms, created) VALUES (?, ?, ?, ?, ?, ?)'); $st->execute([$id, $u['id'], min($score, $total), $total, $ms, $now]);
      if ($st->rowCount() === 0) mh_fail('You already submitted this mock exam.', 409);
      $b = mh_award_badges((int)$u['id'], [], $m['course']); mh_json(['ok' => true, 'badges_new' => $b['new']]);
    }
    case 'mock_results': {
      mh_method('GET'); $id = (int)($_GET['id'] ?? 0); $st = $db->prepare('SELECT * FROM mocks WHERE id = ?'); $st->execute([$id]); $m = $st->fetch(); if (!$m) mh_fail('Not found.', 404);
      $ended = $now > (int)$m['start'] + (int)$m['minutes'] * 60;
      $st = $db->prepare('SELECT u.id, u.name, u.email, u.show_on_leaderboard, x.score, x.total, x.ms FROM mock_results x JOIN users u ON u.id = x.user_id WHERE x.mock_id = ? ORDER BY x.score DESC, x.ms ASC LIMIT 100'); $st->execute([$id]); $rows = $st->fetchAll();
      $rank = array_map(fn($r, $i) => ['rank' => $i + 1, 'name' => mh_lb_name($r), 'score' => (int)$r['score'], 'total' => (int)$r['total'], 'ms' => (int)$r['ms'], 'me' => $me && (int)$r['id'] === (int)$me['id']], $rows, array_keys($rows));
      $avg = $rows ? round(100 * array_sum(array_map(fn($r) => $r['score'] / max(1, $r['total']), $rows)) / count($rows)) : null;
      mh_json(['ok' => true, 'ended' => $ended, 'count' => count($rows), 'average' => $avg, 'rankings' => ($ended || $admin) ? $rank : array_values(array_filter($rank, fn($r) => $r['me']))]);
    }

    /* --- student contributions --- */
    case 'contrib_list': {
      mh_method('GET'); $kind = ($_GET['kind'] ?? 'problem') === 'card' ? 'card' : 'problem';
      $st = $db->prepare('SELECT c.*, u.name AS u_name, u.email AS u_email FROM contributions c JOIN users u ON u.id = c.user_id WHERE c.status = "approved" AND c.kind = ? ' . ($course && $course !== 'all' ? 'AND c.course = ? ' : '') . 'ORDER BY c.score DESC, c.created DESC LIMIT 200'); $st->execute($course && $course !== 'all' ? [$kind, $course] : [$kind]);
      $rows = $st->fetchAll(); $votes = []; if ($me && $rows) { $q = implode(',', array_fill(0, count($rows), '?')); $s2 = $db->prepare("SELECT item_id, value FROM votes WHERE user_id = ? AND kind = 's' AND item_id IN ($q)"); $s2->execute(array_merge([$me['id']], array_map(fn($r) => (int)$r['id'], $rows))); foreach ($s2->fetchAll() as $v) $votes[(int)$v['item_id']] = (int)$v['value']; }
      mh_json(['ok' => true, 'items' => array_map(fn($r) => ['id' => (int)$r['id'], 'course' => $r['course'], 'kind' => $r['kind'], 'unit' => (int)$r['unit'], 'sec' => $r['sec'], 'front' => $r['front'], 'back' => $r['back'], 'explanation' => $r['explanation'], 'score' => (int)$r['score'], 'vote' => $votes[(int)$r['id']] ?? 0, 'author' => (int)$r['anon'] ? 'Anonymous' : mh_display_name($r, 'u_'), 'mine' => $me && (int)$r['user_id'] === (int)$me['id'], 'created' => (int)$r['created']], $rows)]);
    }
    case 'contrib_mine': {
      mh_method('GET'); $u = mh_require_user(); $st = $db->prepare('SELECT * FROM contributions WHERE user_id = ? ORDER BY created DESC LIMIT 50'); $st->execute([$u['id']]);
      mh_json(['ok' => true, 'items' => array_map(fn($r) => ['id' => (int)$r['id'], 'course' => $r['course'], 'kind' => $r['kind'], 'unit' => (int)$r['unit'], 'sec' => $r['sec'], 'front' => $r['front'], 'back' => $r['back'], 'status' => $r['status'], 'score' => (int)$r['score'], 'created' => (int)$r['created']], $st->fetchAll())]);
    }
    case 'contrib_create': {
      mh_method('POST'); $u = mh_require_user(); require_once __DIR__ . '/forum.php'; mh_can_post($u);
      mh_rate_or_fail("contrib:user:{$u['id']}", 25, 86400, 'That is a lot of submissions for one day. Try again tomorrow.');
      if (!mh_is_course($course, true) || $course === 'general') mh_fail('Pick a class.');
      $kind = ($in['kind'] ?? 'problem') === 'card' ? 'card' : 'problem'; $front = trim(mb_substr((string)($in['front'] ?? ''), 0, 2000)); $back = trim(mb_substr((string)($in['back'] ?? ''), 0, 2000)); $expl = trim(mb_substr((string)($in['explanation'] ?? ''), 0, 3000));
      if (mb_strlen($front) < 5 || mb_strlen($back) < 1) mh_fail($kind === 'card' ? 'Write both sides of the card.' : 'Write the problem and its answer.');
      $db->prepare('INSERT INTO contributions (user_id, course, kind, unit, sec, front, back, explanation, anon, created) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')->execute([$u['id'], $course, $kind, max(0, min(9, (int)($in['unit'] ?? 0))), mh_str($in, 'sec', 20), mh_censor($front), mh_censor($back), mh_censor($expl), !empty($in['anon']) ? 1 : 0, $now]);
      mh_json(['ok' => true, 'id' => (int)$db->lastInsertId(), 'message' => 'Submitted. A moderator will review it soon.']);
    }
    case 'contrib_vote': {
      mh_method('POST'); $u = mh_require_user(); $id = (int)($in['id'] ?? 0); $value = max(-1, min(1, (int)($in['value'] ?? 0)));
      if ($value === 0) $db->prepare('DELETE FROM votes WHERE user_id = ? AND kind = "s" AND item_id = ?')->execute([$u['id'], $id]); else $db->prepare('INSERT OR REPLACE INTO votes (user_id, kind, item_id, value) VALUES (?, "s", ?, ?)')->execute([$u['id'], $id, $value]);
      $st = $db->prepare('SELECT COALESCE(SUM(value),0) FROM votes WHERE kind = "s" AND item_id = ?'); $st->execute([$id]); $score = (int)$st->fetchColumn(); $db->prepare('UPDATE contributions SET score = ? WHERE id = ?')->execute([$score, $id]);
      mh_json(['ok' => true, 'score' => $score, 'vote' => $value]);
    }
    case 'contrib_queue': {
      mh_method('GET'); $u = mh_require_user(); if (!$mod) mh_fail('Moderators only.', 403);
      $st = $db->query('SELECT c.*, u.name AS u_name, u.email AS u_email FROM contributions c JOIN users u ON u.id = c.user_id WHERE c.status = "pending" ORDER BY c.created ASC LIMIT 100');
      mh_json(['ok' => true, 'items' => array_map(fn($r) => ['id' => (int)$r['id'], 'course' => $r['course'], 'kind' => $r['kind'], 'unit' => (int)$r['unit'], 'sec' => $r['sec'], 'front' => $r['front'], 'back' => $r['back'], 'explanation' => $r['explanation'], 'author' => mh_display_name($r, 'u_') . ' <' . $r['u_email'] . '>', 'created' => (int)$r['created']], $st->fetchAll())]);
    }
    case 'contrib_mod': {
      mh_method('POST'); $u = mh_require_user(); if (!$mod) mh_fail('Moderators only.', 403); $id = (int)($in['id'] ?? 0); $action = (string)($in['action'] ?? '');
      $st = $db->prepare('SELECT * FROM contributions WHERE id = ?'); $st->execute([$id]); $c = $st->fetch(); if (!$c) mh_fail('Not found.', 404);
      if ($action === 'approve') { $db->prepare('UPDATE contributions SET status = "approved" WHERE id = ?')->execute([$id]); mh_award_badges((int)$c['user_id'], [], $c['course']); mh_activity('contrib', $c['course'], 'A student-made ' . ($c['kind'] === 'card' ? 'flashcard' : 'practice problem') . ' was approved', '#/' . $c['course'] . '/contribute'); }
      elseif ($action === 'reject') $db->prepare('UPDATE contributions SET status = "rejected" WHERE id = ?')->execute([$id]);
      elseif ($action === 'delete') { $db->prepare('DELETE FROM contributions WHERE id = ?')->execute([$id]); $db->prepare('DELETE FROM votes WHERE kind = "s" AND item_id = ?')->execute([$id]); }
      else mh_fail('Unknown action.');
      mh_json(['ok' => true]);
    }

    /* --- class-wide weekly stats (public; cached an hour) --- */
    case 'stats_week': {
      mh_method('GET'); $key = 'stats_week:' . intdiv($now, 3600); $cached = mh_setting($key);
      if ($cached === null) { $ws = mh_week_start(); $data = mh_class_week_stats($ws); mh_setting_set($key, json_encode($data)); } else $data = json_decode($cached, true);
      mh_json(['ok' => true, 'week_start' => mh_week_start(), 'stats' => $data]);
    }

    /* --- activity feed --- */
    case 'activity': {
      mh_method('GET');
      if ($me) { $st = $db->prepare("SELECT a.* FROM activity a WHERE NOT EXISTS (SELECT 1 FROM posts p JOIN member_blocks b ON b.blocked_id = p.user_id AND b.user_id = ? AND (b.anon = 0 OR p.anon = 1) WHERE a.link = '#/forum/' || p.id) ORDER BY a.id DESC LIMIT 20"); $st->execute([$me['id']]); }
      else $st = $db->query('SELECT * FROM activity ORDER BY id DESC LIMIT 20');
      mh_json(['ok' => true, 'items' => array_map(fn($r) => ['kind' => $r['kind'], 'course' => $r['course'], 'text' => $r['text'], 'link' => $r['link'], 'created' => (int)$r['created']], $st->fetchAll())]);
    }

    /* --- cron --- */
    case 'cron': {
      mh_method('GET'); $key = (string)($cfg['cron_key'] ?: ($cfg['admin_key'] ?? '')); $given = (string)($_GET['key'] ?? ($_SERVER['HTTP_X_ADMIN_KEY'] ?? ''));
      if ($key === '' || !hash_equals($key, $given)) mh_fail('Not found.', 404);
      mh_json(['ok' => true, 'did' => mh_housekeeping(true), 'digest_window' => mh_digest_window_start()]);
    }

    default:
      mh_fail('Not found.', 404);
  }
}
