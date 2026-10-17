<?php
/* ============================================================
   Mathub account server — calendar feed, focus together, growth
   analytics, class goals, section leagues, announcements, invites,
   the Sunday planning email.
   Routes: ics, ics_token, ics_token_reset, focus_ping, focus_stop,
           focus_done, focus_room, track, admin_growth, class_goal,
           league_section, ann_list, ann_post, ann_delete,
           mock_official, invite_mine, invite_info
   Helpers used elsewhere: mh_course_index(), mh_user_events(),
           mh_track_day(), mh_metric(), mh_weekly_stats_update(),
           mh_planning_tick(), mh_is_staff(), mh_invite_reward()
   ============================================================ */
declare(strict_types=1);


/* ---------- the class index the app ships, read from the generated file ---------- */
function mh_course_index(): array {
  static $ix = null; if ($ix !== null) return $ix;
  $f = dirname(__DIR__) . '/assets/courses-index.js'; $ix = [];
  if (is_file($f)) { $s = (string)file_get_contents($f); if (preg_match('/const IX = (\{.*\});\s*\n\s*for \(const id in IX\)/s', $s, $m)) { $j = json_decode($m[1], true); if (is_array($j)) $ix = $j; } }
  // classes uploaded in the admin panel; their text can carry formatting tags, which calendar files and emails do not want
  try { foreach (mh_pack_db()->query('SELECT id, stub FROM class_packs WHERE enabled = 1')->fetchAll() as $r) { $st = json_decode((string)$r['stub'], true); if (!is_array($st) || isset($ix[$r['id']])) continue; array_walk_recursive($st, function (&$v) { if (is_string($v) && str_contains($v, '<')) $v = html_entity_decode(strip_tags($v), ENT_QUOTES | ENT_HTML5, 'UTF-8'); }); $ix[$r['id']] = $st; } } catch (Throwable $e) {}
  return $ix;
}
function mh_is_staff(?array $u): bool { return $u ? (mh_is_mod($u) || mh_role($u['email']) !== '') : false; }
function mh_iso_week(int $ts = 0): string { $d = new DateTime('@' . ($ts ?: time())); $d->setTimezone(mh_tz()); return $d->format('o-\WW'); }

/* Deadlines, exams and (optionally) lectures for one user's classes, as flat rows sorted by date. */
function mh_user_events(array $u, bool $lectures = false): array {
  $ix = mh_course_index(); $mine = mh_user_courses($u); $out = [];
  foreach ($mine as $cid) {
    $C = $ix[$cid] ?? null; if (!$C) continue; $short = $C['short'] ?? (mh_course_names()[$cid] ?? $cid);
    foreach ($C['CALENDAR'] ?? [] as $e) { if (!is_array($e) || count($e) < 3) continue; $type = (string)$e[1]; if (!$lectures && in_array($type, ['lecture', 'reading', 'topic'], true)) continue; $out[] = ['course' => $cid, 'short' => $short, 'date' => (string)$e[0], 'type' => $type, 'title' => (string)$e[2], 'time' => isset($e[4]) && is_string($e[4]) ? $e[4] : '']; }
    foreach ($C['EXAMS'] ?? [] as $ex) { if (empty($ex['date'])) continue; $out[] = ['course' => $cid, 'short' => $short, 'date' => (string)$ex['date'], 'type' => 'exam', 'title' => (string)($ex['name'] ?? 'Exam') . (!empty($ex['dateLabel']) ? ' · ' . $ex['dateLabel'] : ''), 'time' => (string)($ex['time'] ?? ''), 'weight' => $ex['weight'] ?? null]; }
  }
  try { require_once __DIR__ . '/canvas.php'; $cv = mh_canvas_events(false); foreach ($cv['events'] ?? [] as $e) { if (!in_array($e['course'] ?? '', $mine, true)) continue; $out[] = ['course' => $e['course'], 'short' => mh_course_names()[$e['course']] ?? $e['course'], 'date' => (string)$e['date'], 'type' => 'canvas', 'title' => (string)($e['title'] ?? 'Canvas'), 'time' => (string)($e['time'] ?? '')]; } } catch (Throwable $e) {}
  usort($out, fn($a, $b) => strcmp($a['date'], $b['date']) ?: strcmp($a['title'], $b['title']));
  return $out;
}

/* ---------- ICS ---------- */
function mh_ics_esc(string $s): string { return str_replace(["\\", ";", ",", "\n"], ["\\\\", "\\;", "\\,", "\\n"], $s); }
function mh_ics_fold(string $line): string { $out = ''; while (strlen($line) > 73) { $out .= substr($line, 0, 73) . "\r\n "; $line = substr($line, 73); } return $out . $line; }
function mh_ics(array $u): string {
  $now = gmdate('Ymd\THis\Z'); $lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Mathub//Class calendar//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'X-WR-CALNAME:Mathub classes', 'X-WR-TIMEZONE:America/Denver', 'X-PUBLISHED-TTL:PT6H', 'REFRESH-INTERVAL;VALUE=DURATION:PT6H'];
  foreach (mh_user_events($u) as $e) {
    if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $e['date'])) continue; $d = str_replace('-', '', $e['date']); $next = date('Ymd', strtotime($e['date'] . ' +1 day'));
    $summary = '[' . $e['short'] . '] ' . $e['title'] . ($e['time'] !== '' ? ' · ' . $e['time'] : ''); $uid = 'mathub-' . $e['course'] . '-' . $d . '-' . substr(md5($e['title']), 0, 8) . '@mathub.space';
    $desc = ucfirst($e['type']) . ' · ' . $e['short'] . ($e['time'] !== '' ? ' · ' . $e['time'] : '') . "\nOpen in Mathub: https://mathub.space/#/" . $e['course'] . '/calendar/' . $e['date'];
    $lines[] = 'BEGIN:VEVENT'; $lines[] = mh_ics_fold('UID:' . $uid); $lines[] = 'DTSTAMP:' . $now; $lines[] = 'DTSTART;VALUE=DATE:' . $d; $lines[] = 'DTEND;VALUE=DATE:' . $next;
    $lines[] = mh_ics_fold('SUMMARY:' . mh_ics_esc($summary)); $lines[] = mh_ics_fold('DESCRIPTION:' . mh_ics_esc($desc)); $lines[] = mh_ics_fold('URL:https://mathub.space/#/' . $e['course'] . '/calendar/' . $e['date']); $lines[] = 'CATEGORIES:' . mh_ics_esc($e['short']);
    if ($e['type'] === 'exam') { $lines[] = 'BEGIN:VALARM'; $lines[] = 'ACTION:DISPLAY'; $lines[] = 'DESCRIPTION:' . mh_ics_esc($summary . ' is in a week'); $lines[] = 'TRIGGER:-P7D'; $lines[] = 'END:VALARM'; }
    $lines[] = 'END:VEVENT';
  }
  $lines[] = 'END:VCALENDAR'; return implode("\r\n", $lines) . "\r\n";
}
function mh_ics_token(array $u, bool $reset = false): string {
  $db = mh_db(); $t = (string)($u['ics_token'] ?? '');
  if ($t === '' || $reset) { $t = bin2hex(random_bytes(12)); $db->prepare('UPDATE users SET ics_token = ? WHERE id = ?')->execute([$t, $u['id']]); }
  return $t;
}

/* ---------- metrics ---------- */
function mh_metric(string $key, int $n = 1, string $day = ''): void {
  if ($n <= 0) return; $day = $day ?: mh_local_date();
  try { mh_db()->prepare('INSERT INTO metrics (day, key, n) VALUES (?, ?, ?) ON CONFLICT(day, key) DO UPDATE SET n = n + excluded.n')->execute([$day, $key, $n]); } catch (Throwable $e) {}
}
function mh_track_day(int $uid): void { if ($uid <= 0) return; try { mh_db()->prepare('INSERT OR IGNORE INTO user_days (user_id, day) VALUES (?, ?)')->execute([$uid, mh_local_date()]); } catch (Throwable $e) {} }
/** Called on every progress save: this week's answered/correct/cards/focus for the class, for class goals. */
function mh_weekly_stats_update(int $uid, string $course, array $data): void {
  $week = mh_iso_week(); $ws = mh_week_start(); $from = mh_local_date($ws); $to = mh_local_date($ws + 6 * 86400); $a = 0; $c = 0; $cards = 0; $focus = 0;
  foreach ($data['history'] ?? [] as $h) { $d = (string)($h['d'] ?? ''); if ($d >= $from && $d <= $to) { $a++; if (!empty($h['ok'])) $c++; } }
  foreach ($data['fcAt'] ?? [] as $ts) { $d = mh_local_date((int)((int)$ts / 1000)); if ($d >= $from && $d <= $to) $cards++; }
  foreach ($data['sessions'] ?? [] as $s) { $d = (string)($s['d'] ?? ''); if ($d >= $from && $d <= $to) $focus += (int)($s['m'] ?? 0); }
  try { mh_db()->prepare('INSERT INTO weekly_stats (user_id, course, week, answered, correct, cards, focus) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(user_id, course, week) DO UPDATE SET answered = excluded.answered, correct = excluded.correct, cards = excluded.cards, focus = excluded.focus')->execute([$uid, $course, $week, $a, $c, $cards, $focus]); } catch (Throwable $e) {}
}
/* ---------- invites ---------- */
function mh_invite_code(array $u): string {
  $db = mh_db(); $c = (string)($u['invite_code'] ?? '');
  if ($c === '') { do { $c = ''; $alpha = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; for ($i = 0; $i < 6; $i++) $c .= $alpha[random_int(0, strlen($alpha) - 1)]; $st = $db->prepare('SELECT 1 FROM users WHERE invite_code = ?'); $st->execute([$c]); } while ($st->fetchColumn()); $db->prepare('UPDATE users SET invite_code = ? WHERE id = ?')->execute([$c, $u['id']]); }
  return $c;
}
/** After a verified sign-up that carried an invite code: badges for both, a note for the inviter. */
function mh_invite_reward(array $newUser): void {
  $inv = (int)($newUser['invited_by'] ?? 0); if (!$inv || $inv === (int)$newUser['id']) return; $db = mh_db(); $now = time();
  try {
    $db->prepare('INSERT OR IGNORE INTO badges (user_id, code, earned) VALUES (?, "invited", ?)')->execute([(int)$newUser['id'], $now]);
    $db->prepare('INSERT OR IGNORE INTO badges (user_id, code, earned) VALUES (?, "recruiter", ?)')->execute([$inv, $now]);
    $db->prepare('INSERT INTO notifications (user_id, kind, post_id, comment_id, actor_id, actor, title, snippet, link, created) VALUES (?, "badge", 0, NULL, ?, ?, ?, ?, ?, ?)')->execute([$inv, (int)$newUser['id'], mh_display_name($newUser), 'joined through your invite link', 'You both earned a badge. Study together on the class board.', '#/people', $now]);
    mh_activity('badge', '', 'A student joined through a classmate\'s invite', '#/people');
  } catch (Throwable $e) {}
}
/* ---------- Sunday planning email ---------- */
function mh_planning_tick(int $max, bool $force = false): int {
  $cfg = mh_config(); $now = new DateTime('now', mh_tz()); if ((!$force && ((int)$now->format('w') !== 0 || (int)$now->format('G') < 15)) || $max <= 0) return 0;
  $db = mh_db(); $ws = mh_week_start(); $st = $db->prepare('SELECT * FROM users WHERE verified = 1 AND planning_email = 1 AND planning_sent < ? AND email NOT LIKE "%@system.local" LIMIT ?'); $st->execute([$ws, $max]); $sent = 0;
  foreach ($st->fetchAll() as $u) {
    $db->prepare('UPDATE users SET planning_sent = ? WHERE id = ?')->execute([time(), $u['id']]);
    $from = mh_local_date(time() + 86400); $to = mh_local_date(time() + 7 * 86400); $ev = array_values(array_filter(mh_user_events($u), fn($e) => $e['date'] >= $from && $e['date'] <= $to));
    $byDay = []; foreach ($ev as $e) $byDay[$e['date']][] = $e; $name = mh_display_name($u);
    $text = "Hi $name,\n\nHere is your week on Mathub.\n\n"; $html = '<div style="font-family:Helvetica Neue,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.55;color:#0F172A;max-width:560px"><p>Hi ' . htmlspecialchars($name) . ',</p><p>Here is your week on Mathub.</p>';
    if ($byDay) { $html .= '<h3 style="margin:18px 0 6px">Due this week</h3>'; foreach ($byDay as $d => $list) { $label = (new DateTime($d, mh_tz()))->format('l, M j'); $text .= "$label\n"; $html .= '<p style="margin:8px 0 2px"><b>' . htmlspecialchars($label) . '</b></p><ul style="margin:0 0 6px 18px;padding:0">'; foreach ($list as $e) { $line = '[' . $e['short'] . '] ' . $e['title'] . ($e['time'] !== '' ? ' · ' . $e['time'] : ''); $text .= "  - $line\n"; $html .= '<li>' . htmlspecialchars($line) . '</li>'; } $html .= '</ul>'; $text .= "\n"; } }
    else { $text .= "Nothing is due in the next seven days in your classes. A good week to get ahead.\n\n"; $html .= '<p>Nothing is due in the next seven days in your classes. A good week to get ahead.</p>'; }
    $first = $ev[0] ?? null; $sugg = $first ? 'Monday, 25 minutes on ' . $first['title'] . ' (' . $first['short'] . ')' : 'Monday, 25 minutes of due flashcards in Today';
    $text .= "Suggested first focus block: $sugg.\nStart it: https://mathub.space/#/focus\n\nYour week in numbers: https://mathub.space/#/recap?w=last\nToday's plan: https://mathub.space/#/today\n\nYou get this on Sundays because you turned on the planning email in Settings. Turn it off there any time.\n";
    $html .= '<p style="margin:16px 0 4px"><b>Suggested first focus block:</b> ' . htmlspecialchars($sugg) . '. <a href="https://mathub.space/#/focus">Start it</a>.</p><p><a href="https://mathub.space/#/recap?w=last" style="display:inline-block;padding:10px 16px;background:#4F46E5;color:#fff;border-radius:10px;text-decoration:none;font-weight:700">See your week in numbers</a> &nbsp; <a href="https://mathub.space/#/today">Today\'s plan</a></p><p style="color:#5A6578;font-size:13px">You get this on Sundays because you turned on the planning email in Settings. Turn it off there any time.</p></div>';
    try { mh_send_mail($cfg, $u['email'], 'Your week on Mathub', $text, $html); $sent++; } catch (Throwable $e) {}
  }
  return $sent;
}

/* ---------- routes ---------- */
function mh_growth_route(string $route, array $in, array $cfg, string $ip): void {
  $db = mh_db(); $now = time(); $me = mh_current_user();
  switch ($route) {
    case 'ics': {
      mh_method('GET'); $t = preg_replace('/[^a-f0-9]/', '', (string)($_GET['t'] ?? '')); if (strlen($t) < 16) mh_fail('Not found.', 404);
      $st = $db->prepare('SELECT * FROM users WHERE ics_token = ? AND verified = 1'); $st->execute([$t]); $u = $st->fetch(); if (!$u) mh_fail('Not found.', 404);
      mh_metric('ics_fetch'); $body = mh_ics($u);
      header('Content-Type: text/calendar; charset=utf-8'); header('Content-Disposition: inline; filename="mathub.ics"'); header('Cache-Control: private, max-age=3600'); echo $body; exit;
    }
    case 'ics_token': { mh_method('GET'); $u = mh_require_user(); mh_json(['ok' => true, 'token' => mh_ics_token($u), 'events' => count(mh_user_events($u))]); }
    case 'ics_token_reset': { mh_method('POST'); $u = mh_require_user(); mh_json(['ok' => true, 'token' => mh_ics_token($u, true)]); }

    /* --- focus together --- */
    case 'focus_ping': {
      mh_method('POST'); $u = mh_require_user(); $public = (int)($u['focus_public'] ?? 1) === 1;
      $ends = (int)($in['ends'] ?? 0); $started = (int)($in['started'] ?? $now); if ($ends < $now || $ends > $now + 4 * 3600) mh_fail('Bad session window.');
      $db->prepare('INSERT INTO focus_live (user_id, task, course, started, ends, seen) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET task = excluded.task, course = excluded.course, started = excluded.started, ends = excluded.ends, seen = excluded.seen')->execute([$u['id'], $public ? mh_str($in, 'task', 80) : '', mh_str($in, 'course', 20), $started, $ends, $now]);
      mh_json(['ok' => true] + mh_focus_room_data($u));
    }
    case 'focus_stop': { mh_method('POST'); $u = mh_require_user(); $db->prepare('DELETE FROM focus_live WHERE user_id = ?')->execute([$u['id']]); mh_json(['ok' => true]); }
    case 'focus_done': { mh_method('POST'); $u = mh_require_user(); $m = max(0, min(240, (int)($in['minutes'] ?? 0))); if ($m) { mh_metric('focus_minutes', $m); mh_metric('focus_sessions'); } $db->prepare('DELETE FROM focus_live WHERE user_id = ?')->execute([$u['id']]); mh_json(['ok' => true]); }
    case 'focus_room': { mh_method('GET'); mh_json(['ok' => true] + mh_focus_room_data($me)); }

    /* --- usage tracking --- */
    case 'track': {
      mh_method('POST'); $ev = is_array($in['events'] ?? null) ? $in['events'] : []; $k = 0;
      foreach ($ev as $key => $n) { if (!is_string($key) || !preg_match('/^[a-z]+:[a-z0-9_-]{1,30}$/', $key) || $k++ > 40) continue; mh_metric($key, max(1, min(500, (int)$n))); }
      if ($me) mh_track_day((int)$me['id']); mh_json(['ok' => true]);
    }
    case 'admin_growth': { mh_method('GET'); $u = mh_require_user(); if (!mh_is_admin($u)) mh_fail('Admins only.', 403); mh_json(['ok' => true] + mh_growth_report()); }

    /* --- class goals and section leagues --- */
    case 'class_goal': {
      mh_method('GET'); $week = mh_iso_week(); $prev = mh_iso_week($now - 7 * 86400); $out = [];
      $users = []; foreach ($db->query('SELECT courses FROM users WHERE verified = 1 AND email NOT LIKE "%@system.local"')->fetchAll() as $r) { $c = $r['courses'] ? json_decode((string)$r['courses'], true) : null; foreach (is_array($c) && $c ? $c : array_keys(mh_course_names()) as $cid) $users[$cid] = ($users[$cid] ?? 0) + 1; }
      $st = $db->prepare('SELECT course, SUM(answered) AS a, SUM(correct) AS c, SUM(cards) AS k, SUM(focus) AS f, COUNT(DISTINCT user_id) AS n FROM weekly_stats WHERE week = ? GROUP BY course'); $st->execute([$week]); $cur = []; foreach ($st->fetchAll() as $r) $cur[$r['course']] = $r;
      $st->execute([$prev]); $pv = []; foreach ($st->fetchAll() as $r) $pv[$r['course']] = $r;
      foreach (array_keys(mh_course_names()) as $cid) { $n = $users[$cid] ?? 0; $goal = max(300, (int)(ceil($n * 120 / 50) * 50)); $out[$cid] = ['answered' => (int)($cur[$cid]['a'] ?? 0), 'correct' => (int)($cur[$cid]['c'] ?? 0), 'cards' => (int)($cur[$cid]['k'] ?? 0), 'focus' => (int)($cur[$cid]['f'] ?? 0), 'active' => (int)($cur[$cid]['n'] ?? 0), 'members' => $n, 'goal' => $goal, 'prev' => (int)($pv[$cid]['a'] ?? 0)]; }
      header('Cache-Control: private, max-age=120'); mh_json(['ok' => true, 'week' => $week, 'courses' => $out]);
    }
    case 'league_section': {
      mh_method('GET'); $u = mh_require_user(); $course = preg_replace('/[^a-z0-9]/', '', (string)($_GET['course'] ?? '')); if (!isset(mh_course_names()[$course])) mh_fail('Unknown class.');
      $mySec = mh_section_of($u, $course); if ($mySec === '') mh_json(['ok' => true, 'none' => true]);
      $ws = mh_week_start(); $rows = mh_league_rows($ws); $ids = []; foreach ($db->query('SELECT id, sections FROM users WHERE verified = 1')->fetchAll() as $r) { if (mh_section_of($r, $course) === $mySec) $ids[(int)$r['id']] = true; }
      $board = array_values(array_filter($rows, fn($r) => isset($ids[$r['id']]))); $localXp = max(0, min(100000, (int)($_GET['xp'] ?? 0)));
      $found = false; foreach ($board as &$r) if ($r['id'] === (int)$u['id']) { $r['xp'] = max($r['xp'], $localXp); $found = true; } unset($r);
      if (!$found) $board[] = ['id' => (int)$u['id'], 'name' => mh_lb_name($u), 'role' => mh_role($u['email']), 'league' => 0, 'xp' => $localXp];
      usort($board, fn($a, $b) => ($b['xp'] <=> $a['xp']) ?: ($a['id'] <=> $b['id'])); $rank = 0; $out = [];
      foreach ($board as $i => $r) { $me2 = $r['id'] === (int)$u['id']; if ($me2) $rank = $i + 1; $out[] = ['rank' => $i + 1, 'name' => $r['name'], 'role' => $r['role'], 'xp' => $r['xp'], 'me' => $me2]; }
      mh_json(['ok' => true, 'section' => $mySec, 'course' => $course, 'board' => array_slice($out, 0, 40), 'members' => count($board), 'me' => ['rank' => $rank]]);
    }

    /* --- course announcements (instructors, TAs, moderators) --- */
    case 'ann_list': {
      mh_method('GET'); $course = preg_replace('/[^a-z0-9]/', '', (string)($_GET['course'] ?? 'all'));
      $st = $db->prepare('SELECT a.*, u.name AS u_name, u.email AS u_email FROM announcements a JOIN users u ON u.id = a.user_id WHERE (a.expires = 0 OR a.expires > ?) AND (a.course = ? OR a.course = "all" OR ? = "all") ORDER BY a.created DESC LIMIT 12'); $st->execute([$now, $course, $course]);
      $rows = array_map(fn($a) => ['id' => (int)$a['id'], 'course' => $a['course'], 'text' => $a['text'], 'link' => $a['link'], 'author' => mh_display_name(['name' => $a['u_name'], 'email' => $a['u_email']]), 'role' => mh_role($a['u_email']), 'created' => (int)$a['created'], 'expires' => (int)$a['expires'], 'mine' => $me && (int)$a['user_id'] === (int)$me['id']], $st->fetchAll());
      header('Cache-Control: private, max-age=60'); mh_json(['ok' => true, 'items' => $rows, 'can_post' => mh_is_staff($me)]);
    }
    case 'ann_post': {
      mh_method('POST'); $u = mh_require_user(); if (!mh_is_staff($u)) mh_fail('Instructors, TAs and moderators only.', 403);
      $course = preg_replace('/[^a-z0-9]/', '', (string)($in['course'] ?? '')); if ($course !== 'all' && !isset(mh_course_names()[$course])) mh_fail('Pick a class.');
      require_once __DIR__ . '/teach.php'; if (!mh_staff_can_course($u, $course)) mh_fail($course === 'all' ? 'Only moderators can post to every class.' : 'You can post announcements only to the classes you teach.', 403);
      $text = mh_str($in, 'text', 300); if (strlen($text) < 3) mh_fail('Write the announcement.'); $link = mh_str($in, 'link', 200); if ($link !== '' && !preg_match('#^(https?://|\#/)#', $link)) mh_fail('Links must start with https:// or #/.');
      $days = max(1, min(60, (int)($in['days'] ?? 7))); mh_rate_or_fail("ann:user:{$u['id']}", 20, 86400);
      $db->prepare('INSERT INTO announcements (course, text, link, user_id, created, expires) VALUES (?, ?, ?, ?, ?, ?)')->execute([$course, $text, $link, $u['id'], $now, $now + $days * 86400]);
      mh_activity('post', $course === 'all' ? '' : $course, ($course === 'all' ? 'Announcement: ' : (mh_course_names()[$course] . ': ')) . mb_substr($text, 0, 90), $course === 'all' ? '#/' : '#/' . $course); mh_json(['ok' => true]);
    }
    case 'ann_delete': {
      mh_method('POST'); $u = mh_require_user(); $id = (int)($in['id'] ?? 0); $st = $db->prepare('SELECT user_id FROM announcements WHERE id = ?'); $st->execute([$id]); $owner = (int)$st->fetchColumn();
      if (!$owner) mh_fail('Not found.', 404); if ($owner !== (int)$u['id'] && !mh_is_mod($u)) mh_fail('Not yours.', 403); $db->prepare('DELETE FROM announcements WHERE id = ?')->execute([$id]); mh_json(['ok' => true]);
    }
    case 'mock_official': {
      mh_method('POST'); $u = mh_require_user(); if (!mh_is_staff($u)) mh_fail('Instructors, TAs and moderators only.', 403);
      $st = $db->prepare('SELECT course FROM mocks WHERE id = ?'); $st->execute([(int)($in['id'] ?? 0)]); $mc = $st->fetchColumn(); if ($mc === false) mh_fail('Mock exam not found.', 404);
      require_once __DIR__ . '/teach.php'; if (!mh_staff_can_course($u, (string)$mc)) mh_fail('You can mark mock exams official only in the classes you teach.', 403);
      $db->prepare('UPDATE mocks SET official = ? WHERE id = ?')->execute([!empty($in['official']) ? 1 : 0, (int)($in['id'] ?? 0)]); mh_json(['ok' => true]);
    }

    /* --- invites --- */
    case 'invite_mine': { mh_method('GET'); $u = mh_require_user(); $st = $db->prepare('SELECT COUNT(*) FROM users WHERE invited_by = ? AND verified = 1'); $st->execute([$u['id']]); mh_json(['ok' => true, 'code' => mh_invite_code($u), 'joined' => (int)$st->fetchColumn()]); }
    case 'invite_info': {
      mh_method('GET'); $code = strtoupper(preg_replace('/[^A-Za-z0-9]/', '', (string)($_GET['ref'] ?? ''))); if (strlen($code) !== 6) mh_fail('Not found.', 404);
      $st = $db->prepare('SELECT name, email, courses FROM users WHERE invite_code = ? AND verified = 1'); $st->execute([$code]); $r = $st->fetch(); if (!$r) mh_fail('Not found.', 404);
      $first = trim(explode(' ', trim((string)$r['name']))[0] ?: explode('@', $r['email'])[0]); $courses = $r['courses'] ? (json_decode((string)$r['courses'], true) ?: []) : [];
      header('Cache-Control: private, max-age=300'); mh_json(['ok' => true, 'name' => $first, 'courses' => array_values(array_filter($courses, fn($c) => isset(mh_course_names()[$c])))]);
    }
  }
  mh_fail('Not found.', 404);
}
function mh_section_of(array $u, string $course): string { $s = !empty($u['sections']) ? json_decode((string)$u['sections'], true) : null; if (!is_array($s) || !isset($s[$course])) return ''; $v = $s[$course]; $sec = is_array($v) ? (string)($v['section'] ?? '') : (string)$v; return strtolower(trim($sec)); }
function mh_focus_room_data(?array $me): array {
  $db = mh_db(); $now = time(); $cut = $now - 150;
  $st = $db->prepare('SELECT f.*, u.name, u.email, u.show_on_leaderboard FROM focus_live f JOIN users u ON u.id = f.user_id WHERE f.seen > ? AND f.ends > ? ORDER BY f.started ASC LIMIT 60'); $st->execute([$cut, $now]);
  $rows = []; foreach ($st->fetchAll() as $r) { $anon = (int)$r['show_on_leaderboard'] !== 1; $rows[] = ['name' => $anon ? 'Anonymous student' : mh_display_name($r), 'task' => $r['task'], 'course' => $r['course'], 'left' => max(0, (int)$r['ends'] - $now), 'total' => max(1, (int)$r['ends'] - (int)$r['started']), 'me' => $me && (int)$r['user_id'] === (int)$me['id']]; }
  $day = mh_local_date(); $st = $db->prepare('SELECT key, n FROM metrics WHERE day = ? AND key IN ("focus_minutes", "focus_sessions")'); $st->execute([$day]); $m = []; foreach ($st->fetchAll() as $r) $m[$r['key']] = (int)$r['n'];
  return ['now' => $rows, 'count' => count($rows), 'today_minutes' => ($m['focus_minutes'] ?? 0) + (int)array_sum(array_map(fn($r) => (int)floor(($r['total'] - $r['left']) / 60), $rows)), 'today_sessions' => ($m['focus_sessions'] ?? 0) + count($rows)];
}
/* ---------- admin growth report ---------- */
function mh_growth_report(): array {
  $db = mh_db(); $tz = mh_tz(); $today = new DateTime('now', $tz); $today->setTime(0, 0);
  // signups per ISO week, last 12 weeks
  $weeks = []; for ($i = 11; $i >= 0; $i--) { $d = clone $today; $d->modify("-$i weeks"); $d->modify('monday this week'); $weeks[$d->format('o-\WW')] = ['week' => $d->format('o-\WW'), 'label' => $d->format('M j'), 'signups' => 0, 'verified' => 0, 'start' => $d->getTimestamp()]; }
  foreach ($db->query('SELECT created, verified FROM users WHERE email NOT LIKE "%@system.local"')->fetchAll() as $r) { $w = (new DateTime('@' . (int)$r['created']))->setTimezone($tz)->format('o-\WW'); if (isset($weeks[$w])) { $weeks[$w]['signups']++; if ((int)$r['verified'] === 1) $weeks[$w]['verified']++; } }
  // daily active users, last 30 days
  $days = []; for ($i = 29; $i >= 0; $i--) { $d = clone $today; $d->modify("-$i days"); $days[$d->format('Y-m-d')] = 0; }
  $st = $db->prepare('SELECT day, COUNT(*) AS n FROM user_days WHERE day >= ? GROUP BY day'); $st->execute([array_key_first($days)]); foreach ($st->fetchAll() as $r) if (isset($days[$r['day']])) $days[$r['day']] = (int)$r['n'];
  $d7 = (clone $today)->modify('-6 days')->format('Y-m-d'); $d30 = (clone $today)->modify('-29 days')->format('Y-m-d');
  $wau = (int)$db->query('SELECT COUNT(DISTINCT user_id) FROM user_days WHERE day >= "' . $d7 . '"')->fetchColumn(); $mau = (int)$db->query('SELECT COUNT(DISTINCT user_id) FROM user_days WHERE day >= "' . $d30 . '"')->fetchColumn();
  // retention cohorts by signup week (last 8): came back after 1, 7 and 30 days
  $cohorts = []; $ud = []; foreach ($db->query('SELECT user_id, day FROM user_days')->fetchAll() as $r) $ud[(int)$r['user_id']][] = $r['day'];
  foreach ($db->query('SELECT id, created FROM users WHERE verified = 1 AND email NOT LIKE "%@system.local"')->fetchAll() as $r) {
    $c = (int)$r['created']; $w = (new DateTime('@' . $c))->setTimezone($tz)->format('o-\WW'); if (!isset($weeks[$w])) continue; $k = $w; $cohorts[$k] = $cohorts[$k] ?? ['week' => $k, 'label' => $weeks[$w]['label'], 'n' => 0, 'd1' => 0, 'd7' => 0, 'd30' => 0, 'age' => 0];
    $cohorts[$k]['n']++; $signupDay = mh_local_date($c); $days1 = date('Y-m-d', strtotime($signupDay . ' +1 day')); $days7 = date('Y-m-d', strtotime($signupDay . ' +7 days')); $days30 = date('Y-m-d', strtotime($signupDay . ' +30 days'));
    $mine = $ud[(int)$r['id']] ?? []; $has = fn($from) => count(array_filter($mine, fn($d) => $d >= $from)) > 0;
    if ($has($days1)) $cohorts[$k]['d1']++; if ($has($days7)) $cohorts[$k]['d7']++; if ($has($days30)) $cohorts[$k]['d30']++;
    $cohorts[$k]['age'] = max($cohorts[$k]['age'], (int)floor((time() - $c) / 86400));
  }
  $cohorts = array_values(array_slice(array_reverse($cohorts), 0, 8));
  // feature usage: this week vs last, top keys
  $wk = mh_local_date(time() - 6 * 86400); $pv = mh_local_date(time() - 13 * 86400);
  $st = $db->prepare('SELECT key, SUM(CASE WHEN day >= ? THEN n ELSE 0 END) AS cur, SUM(CASE WHEN day < ? THEN n ELSE 0 END) AS prev FROM metrics WHERE day >= ? GROUP BY key ORDER BY cur DESC LIMIT 40'); $st->execute([$wk, $wk, $pv]);
  $features = array_map(fn($r) => ['key' => $r['key'], 'cur' => (int)$r['cur'], 'prev' => (int)$r['prev']], $st->fetchAll());
  $totals = ['users' => (int)$db->query('SELECT COUNT(*) FROM users WHERE verified = 1 AND email NOT LIKE "%@system.local"')->fetchColumn(), 'pending' => (int)$db->query('SELECT COUNT(*) FROM users WHERE verified = 0')->fetchColumn(), 'dau' => $days[array_key_last($days)], 'wau' => $wau, 'mau' => $mau, 'invited' => (int)$db->query('SELECT COUNT(*) FROM users WHERE invited_by > 0 AND verified = 1')->fetchColumn()];
  return ['weeks' => array_values($weeks), 'days' => array_map(fn($k, $v) => ['day' => $k, 'n' => $v], array_keys($days), $days), 'cohorts' => $cohorts, 'features' => $features, 'totals' => $totals];
}
