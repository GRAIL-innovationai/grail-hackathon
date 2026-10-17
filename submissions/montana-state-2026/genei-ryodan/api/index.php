<?php
/* ============================================================
   Mathub account server — endpoints
   Called as api/index.php?r=<route>. Responses are JSON.
   Routes: health, me, signup, verify, resend, login, logout, forgot,
           reset, profile, data, data_all, account_delete, stats,
           sessions, logout_others, data_export, client_error, admin_errors
   ============================================================ */
declare(strict_types=1);
require_once __DIR__ . '/lib.php';
error_reporting(E_ALL); ini_set('display_errors', '0');
// Details of an unexpected error go to the server log under a short reference; the visitor only sees the reference.
set_exception_handler(function (Throwable $e) { $ref = bin2hex(random_bytes(4)); error_log("Mathub error $ref: " . $e->getMessage() . ' @ ' . basename($e->getFile()) . ':' . $e->getLine()); mh_fail("Something went wrong on our side (reference $ref). Please try again.", 500, ['ref' => $ref]); });

$route = preg_replace('/[^a-z_]/', '', (string)($_GET['r'] ?? ''));
$ip = mh_client_ip(); $in = mh_input(); $cfg = mh_config();

switch ($route) {

  case 'health':
    mh_method('GET');
    require_once __DIR__ . '/mailer.php';
    $db = mh_db(); mh_secret();
    try { require_once __DIR__ . '/social.php'; mh_housekeeping(); } catch (Throwable $e) { /* never block the site */ }
    mh_json(['ok' => true, 'site' => $cfg['site_name'] ?? 'Mathub', 'domains' => $cfg['allowed_domains'], 'mail' => mh_mail_mode($cfg), 'user' => ($u = mh_current_user()) ? mh_user_public($u) : null]);

  case 'me':
    mh_method('GET');
    $u = mh_current_user();
    mh_json(['ok' => true, 'user' => $u ? mh_user_public($u) : null]);

  case 'signup':
    mh_method('POST');
    mh_rate_or_fail("signup:ip:$ip", 30, 3600);
    [$email, $err] = mh_email_check(mh_str($in, 'email')); if ($err) mh_fail($err);
    $pass = (string)($in['password'] ?? ''); $name = mh_str($in, 'name', 60);
    if (($pe = mh_password_problem($pass, $email)) !== '') mh_fail($pe);
    mh_rate_or_fail("signup:email:$email", 6, 3600, 'Too many sign-up emails for that address. Try again in an hour.');
    $db = mh_db(); $u = mh_user_by_email($email);
    if ($u && (int)$u['verified'] === 1) mh_fail('That address already has an account. Log in instead.', 409, ['exists' => true]);
    $hash = password_hash($pass, PASSWORD_DEFAULT);
    if ($u) $db->prepare('UPDATE users SET pass_hash = ?, name = ?, created = ? WHERE id = ?')->execute([$hash, $name, time(), $u['id']]);
    else $db->prepare('INSERT INTO users (email, name, pass_hash, verified, created) VALUES (?, ?, ?, 0, ?)')->execute([$email, $name, $hash, time()]);
    $ref = strtoupper(preg_replace('/[^A-Za-z0-9]/', '', (string)($in['ref'] ?? ''))); if (strlen($ref) === 6) { $st = $db->prepare('SELECT id FROM users WHERE invite_code = ? AND verified = 1 AND email != ?'); $st->execute([$ref, $email]); $inv = (int)$st->fetchColumn(); if ($inv) $db->prepare('UPDATE users SET invited_by = ? WHERE email = ? AND invited_by = 0')->execute([$inv, $email]); }
    $code = mh_code_issue($email, 'verify'); mh_send_code($email, 'verify', $code);
    mh_json(['ok' => true, 'pending' => true, 'email' => $email]);

  case 'resend':
    mh_method('POST');
    mh_rate_or_fail("resend:ip:$ip", 30, 3600);
    [$email, $err] = mh_email_check(mh_str($in, 'email')); if ($err) mh_fail($err);
    mh_rate_or_fail("signup:email:$email", 6, 3600, 'Too many emails for that address. Try again in an hour.');
    $u = mh_user_by_email($email);
    if (!$u) mh_fail('No sign-up is pending for that address. Sign up first.', 404);
    if ((int)$u['verified'] === 1) mh_fail('That address is already verified. Log in instead.', 409, ['exists' => true]);
    $code = mh_code_issue($email, 'verify'); mh_send_code($email, 'verify', $code);
    mh_json(['ok' => true, 'pending' => true]);

  case 'verify':
    mh_method('POST');
    mh_rate_or_fail("verify:ip:$ip", 60, 900);
    [$email, $err] = mh_email_check(mh_str($in, 'email')); if ($err) mh_fail($err);
    $u = mh_user_by_email($email); if (!$u) mh_fail('No sign-up is pending for that address.', 404);
    if ((int)$u['verified'] === 1) mh_fail('That address is already verified. Log in instead.', 409, ['exists' => true]);
    $e = mh_code_consume($email, 'verify', mh_str($in, 'code', 12)); if ($e) mh_fail($e);
    $db = mh_db(); $db->prepare('UPDATE users SET verified = 1, last_login = ? WHERE id = ?')->execute([time(), $u['id']]);
    try { $fresh = mh_user_by_email($email); if ($fresh && (int)($fresh['invited_by'] ?? 0)) { require_once __DIR__ . '/social.php'; require_once __DIR__ . '/growth.php'; mh_invite_reward($fresh); } } catch (Throwable $e) {}
    $u['verified'] = 1; mh_token_issue((int)$u['id']);
    mh_json(['ok' => true, 'user' => mh_user_public($u)]);

  case 'login':
    mh_method('POST');
    [$email, $err] = mh_email_check(mh_str($in, 'email')); if ($err) mh_fail($err);
    $pass = (string)($in['password'] ?? '');
    mh_rate_or_fail("login:ip:$ip", 80, 3600); mh_rate_or_fail("login:email:$email", 12, 900, 'Too many login attempts. Wait 15 minutes or reset your password.');
    $u = mh_user_by_email($email);
    if (!mh_password_check($u, $pass)) mh_fail('Wrong email or password.', 401);
    if ((int)$u['verified'] !== 1) {
      if (mh_rate("signup:email:$email", 6, 3600)) { $code = mh_code_issue($email, 'verify'); mh_send_code($email, 'verify', $code); }
      mh_json(['ok' => true, 'pending' => true, 'email' => $email, 'message' => 'That address has not been verified yet. We sent a new code.']);
    }
    mh_db()->prepare('UPDATE users SET last_login = ? WHERE id = ?')->execute([time(), $u['id']]);
    mh_token_issue((int)$u['id']);
    mh_json(['ok' => true, 'user' => mh_user_public($u)]);

  case 'logout':
    mh_method('POST');
    mh_token_clear();
    mh_json(['ok' => true]);

  case 'forgot':
    mh_method('POST');
    mh_rate_or_fail("forgot:ip:$ip", 30, 3600);
    [$email, $err] = mh_email_check(mh_str($in, 'email')); if ($err) mh_fail($err);
    mh_rate_or_fail("forgot:email:$email", 5, 3600, 'Too many reset emails for that address. Try again in an hour.');
    $u = mh_user_by_email($email);
    if ($u && (int)$u['verified'] === 1) { $code = mh_code_issue($email, 'reset'); mh_send_code($email, 'reset', $code); }
    // Same answer whether or not the account exists.
    mh_json(['ok' => true, 'message' => 'If that address has an account, a reset code is on its way.']);

  case 'reset':
    mh_method('POST');
    mh_rate_or_fail("reset:ip:$ip", 60, 900);
    [$email, $err] = mh_email_check(mh_str($in, 'email')); if ($err) mh_fail($err);
    $pass = (string)($in['password'] ?? ''); if (($pe = mh_password_problem($pass, $email)) !== '') mh_fail($pe);
    $u = mh_user_by_email($email); if (!$u || (int)$u['verified'] !== 1) mh_fail('That code is not right.', 400);
    $e = mh_code_consume($email, 'reset', mh_str($in, 'code', 12)); if ($e) mh_fail($e);
    $db = mh_db(); $db->prepare('UPDATE users SET pass_hash = ?, last_login = ? WHERE id = ?')->execute([password_hash($pass, PASSWORD_DEFAULT), time(), $u['id']]);
    $db->prepare('DELETE FROM tokens WHERE user_id = ?')->execute([$u['id']]);   // log out every other device
    mh_token_issue((int)$u['id']);
    mh_json(['ok' => true, 'user' => mh_user_public($u)]);

  case 'welcome_done':
    // the end of the welcome after sign-up: the classes they take (at least one) and the membership they picked
    mh_method('POST');
    $u = mh_require_user();
    $c = is_array($in['courses'] ?? null) ? array_values(array_unique(array_filter($in['courses'], fn($x) => is_string($x) && mh_is_course($x)))) : [];
    if (!$c) mh_fail('Pick at least one class.');
    $plan = in_array($in['plan'] ?? '', ['free', 'pro', 'max'], true) ? (string)$in['plan'] : ''; if ($plan === '') mh_fail('Pick a membership: Free, Pro or Max.');
    mh_db()->prepare('UPDATE users SET courses = ?, welcomed = ?, plan_choice = ? WHERE id = ?')->execute([json_encode($c), time(), $plan, $u['id']]);
    $u['courses'] = json_encode($c); $u['welcomed'] = time(); $u['plan_choice'] = $plan;
    mh_json(['ok' => true, 'user' => mh_user_public($u)]);

  case 'profile':
    mh_method('POST');
    $u = mh_require_user(); $name = array_key_exists('name', $in) ? mh_str($in, 'name', 60) : $u['name'];
    $notify = array_key_exists('notify_email', $in) ? (!empty($in['notify_email']) ? 1 : 0) : (int)($u['notify_email'] ?? 1);
    $lb = array_key_exists('show_on_leaderboard', $in) ? (!empty($in['show_on_leaderboard']) ? 1 : 0) : (int)($u['show_on_leaderboard'] ?? 1);
    $dg = array_key_exists('digest_email', $in) ? (!empty($in['digest_email']) ? 1 : 0) : (int)($u['digest_email'] ?? 1);
    $rm = array_key_exists('reminder_email', $in) ? (!empty($in['reminder_email']) ? 1 : 0) : (int)($u['reminder_email'] ?? 0);
    if (array_key_exists('planning_email', $in) || array_key_exists('focus_public', $in)) { $pe = array_key_exists('planning_email', $in) ? (!empty($in['planning_email']) ? 1 : 0) : (int)($u['planning_email'] ?? 0); $fp = array_key_exists('focus_public', $in) ? (!empty($in['focus_public']) ? 1 : 0) : (int)($u['focus_public'] ?? 1); mh_db()->prepare('UPDATE users SET planning_email = ?, focus_public = ? WHERE id = ?')->execute([$pe, $fp, $u['id']]); $u['planning_email'] = $pe; $u['focus_public'] = $fp; }
    $courses = $u['courses'] ?? null; if (array_key_exists('courses', $in)) { $c = is_array($in['courses']) ? array_values(array_unique(array_filter($in['courses'], fn($x) => is_string($x) && mh_is_course($x)))) : []; $courses = json_encode($c); }
    $sections = $u['sections'] ?? null; if (array_key_exists('sections', $in) && is_array($in['sections'])) { $sec = []; foreach ($in['sections'] as $cid => $v) { if (!mh_is_course((string)$cid) || !is_array($v)) continue; $sec[$cid] = ['section' => mb_substr(trim((string)($v['section'] ?? '')), 0, 20), 'examTime' => mb_substr(trim((string)($v['examTime'] ?? '')), 0, 60), 'labDay' => in_array($v['labDay'] ?? '', ['tue', 'thu'], true) ? $v['labDay'] : '']; } $sections = json_encode($sec); }
    mh_db()->prepare('UPDATE users SET name = ?, notify_email = ?, show_on_leaderboard = ?, digest_email = ?, reminder_email = ?, courses = ?, sections = ? WHERE id = ?')->execute([$name, $notify, $lb, $dg, $rm, $courses, $sections, $u['id']]);
    $u['name'] = $name; $u['notify_email'] = $notify; $u['show_on_leaderboard'] = $lb; $u['digest_email'] = $dg; $u['reminder_email'] = $rm; $u['courses'] = $courses; $u['sections'] = $sections;
    mh_json(['ok' => true, 'user' => mh_user_public($u)]);

  case 'canvas':
    mh_method('GET');
    require_once __DIR__ . '/canvas.php';
    $r = mh_canvas_events(!empty($_GET['refresh']) && mh_is_admin(mh_current_user()));
    header('Cache-Control: private, max-age=300');
    mh_json(['ok' => true, 'configured' => $r['configured'], 'fetched' => $r['fetched'], 'error' => $r['error'], 'events' => $r['events'], 'announcement' => (string)mh_setting('announcement', '')]);

  case 'data':
    mh_method('GET', 'POST', 'PUT');
    $u = mh_require_user(); $db = mh_db();
    if ($_SERVER['REQUEST_METHOD'] === 'GET') {
      $course = preg_replace('/[^a-z0-9_-]/', '', (string)($_GET['course'] ?? ''));
      $st = $db->prepare('SELECT json, updated FROM progress WHERE user_id = ? AND course = ?'); $st->execute([$u['id'], $course]); $row = $st->fetch();
      mh_json(['ok' => true, 'course' => $course, 'data' => $row ? json_decode($row['json'], true) : null, 'updated' => $row ? (int)$row['updated'] : 0]);
    }
    mh_rate_or_fail("data:user:{$u['id']}", 1200, 3600);
    $course = preg_replace('/[^a-z0-9_-]/', '', (string)($in['course'] ?? '')); if ($course === '') mh_fail('Missing course.');
    $data = $in['data'] ?? null; if (!is_array($data)) mh_fail('Missing data.');
    $json = json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    if (strlen($json) > (int)($cfg['max_data_bytes'] ?? 600000)) mh_fail('Progress data is too large to save.', 413);
    $updated = isset($in['updated']) && is_numeric($in['updated']) ? (int)$in['updated'] : (int)round(microtime(true) * 1000);
    $st = $db->prepare('SELECT updated FROM progress WHERE user_id = ? AND course = ?'); $st->execute([$u['id'], $course]); $cur = $st->fetchColumn();
    if ($cur !== false && (int)$cur > $updated && empty($in['force'])) mh_json(['ok' => true, 'stale' => true, 'updated' => (int)$cur]);
    $db->prepare('INSERT INTO progress (user_id, course, json, updated) VALUES (?, ?, ?, ?) ON CONFLICT(user_id, course) DO UPDATE SET json = excluded.json, updated = excluded.updated')->execute([$u['id'], $course, $json, $updated]);
    try { require_once __DIR__ . '/social.php'; require_once __DIR__ . '/growth.php'; mh_weekly_stats_update((int)$u['id'], $course, $data); mh_track_day((int)$u['id']); } catch (Throwable $e) {}
    mh_json(['ok' => true, 'updated' => $updated]);

  case 'data_all':
    mh_method('GET');
    $u = mh_require_user();
    $st = mh_db()->prepare('SELECT course, json, updated FROM progress WHERE user_id = ?'); $st->execute([$u['id']]);
    $out = []; foreach ($st->fetchAll() as $r) $out[$r['course']] = ['data' => json_decode($r['json'], true), 'updated' => (int)$r['updated']];
    mh_json(['ok' => true, 'courses' => $out]);

  case 'account_delete':
    mh_method('POST');
    $u = mh_require_user();
    if (!password_verify((string)($in['password'] ?? ''), $u['pass_hash'])) mh_fail('Wrong password.', 401);
    mh_db()->prepare('DELETE FROM users WHERE id = ?')->execute([$u['id']]);
    mh_token_clear();
    mh_json(['ok' => true]);

  /* --- signed-in devices: see them and sign out everywhere else --- */
  case 'sessions':
    mh_method('GET');
    $u = mh_require_user(); $cur = hash('sha256', (string)($_COOKIE[MH_COOKIE] ?? ''));
    $st = mh_db()->prepare('SELECT hash, created, ua FROM tokens WHERE user_id = ? AND expires > ? ORDER BY created DESC LIMIT 50'); $st->execute([$u['id'], time()]);
    mh_json(['ok' => true, 'devices' => array_map(fn($r) => ['device' => mh_ua_label((string)$r['ua']), 'created' => (int)$r['created'], 'current' => hash_equals((string)$r['hash'], $cur)], $st->fetchAll())]);

  case 'logout_others':
    mh_method('POST');
    $u = mh_require_user(); $cur = hash('sha256', (string)($_COOKIE[MH_COOKIE] ?? ''));
    $st = mh_db()->prepare('DELETE FROM tokens WHERE user_id = ? AND hash != ?'); $st->execute([$u['id'], $cur]);
    mh_json(['ok' => true, 'signed_out' => $st->rowCount()]);

  /* --- everything stored about the account, as one JSON file --- */
  case 'data_export':
    mh_method('GET');
    $u = mh_require_user(); mh_rate_or_fail("export:user:{$u['id']}", 10, 3600);
    header('Content-Disposition: attachment; filename="mathub-data-' . gmdate('Y-m-d') . '.json"');
    mh_json(mh_export_user($u));

  /* --- browser errors, so problems are found before students report them; no personal data, capped and rate limited --- */
  case 'client_error':
    mh_method('POST');
    if (!mh_rate("cerr:ip:$ip", 40, 3600)) mh_json(['ok' => true, 'dropped' => true]);
    $msg = mb_substr(trim(preg_replace('/\s+/', ' ', (string)($in['message'] ?? ''))), 0, 300); if ($msg === '') mh_fail('Missing message.');
    $src = mb_substr(preg_replace('#^https?://[^/]+#', '', preg_replace('/[?#].*$/', '', (string)($in['source'] ?? ''))), 0, 160);
    $line = max(0, min(10000000, (int)($in['line'] ?? 0))); $stack = mb_substr(preg_replace('#https?://[^/\s)]+#', '', (string)($in['stack'] ?? '')), 0, 1200);
    $view = mb_substr(preg_replace('/[^a-z0-9\/#_.-]/i', '', preg_replace('/\?.*$/', '', (string)($in['view'] ?? ''))), 0, 80);
    $build = mb_substr(preg_replace('/[^0-9.]/', '', (string)($in['build'] ?? '')), 0, 20); $ua = mh_ua_label((string)($_SERVER['HTTP_USER_AGENT'] ?? ''));
    $db = mh_db(); $db->exec('CREATE TABLE IF NOT EXISTS client_errors (sig TEXT PRIMARY KEY, message TEXT NOT NULL, source TEXT NOT NULL DEFAULT "", line INTEGER NOT NULL DEFAULT 0, stack TEXT NOT NULL DEFAULT "", view TEXT NOT NULL DEFAULT "", build TEXT NOT NULL DEFAULT "", ua TEXT NOT NULL DEFAULT "", count INTEGER NOT NULL DEFAULT 1, first INTEGER NOT NULL, last INTEGER NOT NULL)');
    $sig = substr(sha1($msg . '|' . $src . '|' . $line . '|' . $build), 0, 20); $now = time();
    $db->prepare('INSERT INTO client_errors (sig, message, source, line, stack, view, build, ua, count, first, last) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?) ON CONFLICT(sig) DO UPDATE SET count = count + 1, last = excluded.last, view = excluded.view, ua = excluded.ua')->execute([$sig, $msg, $src, $line, $stack, $view, $build, $ua, $now, $now]);
    if (random_int(1, 40) === 1) $db->exec('DELETE FROM client_errors WHERE last < ' . ($now - 45 * 86400));
    mh_json(['ok' => true]);

  case 'admin_errors':
    mh_method('GET', 'POST');
    $u = mh_require_user(); if (!mh_is_admin($u)) mh_fail('Admins only.', 403);
    $db = mh_db(); $db->exec('CREATE TABLE IF NOT EXISTS client_errors (sig TEXT PRIMARY KEY, message TEXT NOT NULL, source TEXT NOT NULL DEFAULT "", line INTEGER NOT NULL DEFAULT 0, stack TEXT NOT NULL DEFAULT "", view TEXT NOT NULL DEFAULT "", build TEXT NOT NULL DEFAULT "", ua TEXT NOT NULL DEFAULT "", count INTEGER NOT NULL DEFAULT 1, first INTEGER NOT NULL, last INTEGER NOT NULL)');
    if ($_SERVER['REQUEST_METHOD'] === 'POST') { $sig = preg_replace('/[^a-f0-9]/', '', (string)($in['sig'] ?? '')); if ($sig === '') $db->exec('DELETE FROM client_errors'); else $db->prepare('DELETE FROM client_errors WHERE sig = ?')->execute([$sig]); mh_json(['ok' => true]); }
    mh_json(['ok' => true, 'items' => $db->query('SELECT * FROM client_errors ORDER BY last DESC LIMIT 100')->fetchAll()]);

  case 'stats':
    mh_method('GET');
    $key = (string)($cfg['admin_key'] ?? '');
    if ($key === '' || !hash_equals($key, (string)($_SERVER['HTTP_X_ADMIN_KEY'] ?? ''))) mh_fail('Not found.', 404);
    $db = mh_db();
    mh_json(['ok' => true, 'users' => (int)$db->query('SELECT COUNT(*) FROM users WHERE verified = 1')->fetchColumn(), 'pending' => (int)$db->query('SELECT COUNT(*) FROM users WHERE verified = 0')->fetchColumn(),
      'active_7d' => (int)$db->query('SELECT COUNT(*) FROM users WHERE last_login > ' . (time() - 7 * 86400))->fetchColumn(), 'progress_rows' => (int)$db->query('SELECT COUNT(*) FROM progress')->fetchColumn()]);

  default:
    if (in_array($route, ['ics', 'ics_token', 'ics_token_reset', 'focus_ping', 'focus_stop', 'focus_done', 'focus_room', 'track', 'admin_growth', 'class_goal', 'league_section', 'ann_list', 'ann_post', 'ann_delete', 'mock_official', 'invite_mine', 'invite_info'], true)) { require_once __DIR__ . '/social.php'; require_once __DIR__ . '/growth.php'; mh_growth_route($route, $in, $cfg, $ip); }
    if (str_starts_with($route, 'ai_')) { require_once __DIR__ . '/ai.php'; mh_ai_route($route, $in, $cfg, $ip); }   // Bo, the AI tutor, and classes Bo writes (Mathub Max)
    if (str_starts_with($route, 'myclass') || in_array($route, ['shared_class', 'create_status', 'plan_cancel', 'admin_unshare', 'admin_plan'], true)) { require_once __DIR__ . '/myclasses.php'; mh_myclass_route($route, $in, $cfg, $ip); }   // classes students make, sharing them, Mathub Create
    if (str_starts_with($route, 'classpack_') || str_starts_with($route, 'admin_classpack')) { require_once __DIR__ . '/packs.php'; mh_packs_route($route, $in, $cfg, $ip); }
    if (str_starts_with($route, 'classreq_') || str_starts_with($route, 'admin_classreq')) { require_once __DIR__ . '/forum.php'; require_once __DIR__ . '/requests.php'; mh_requests_route($route, $in, $cfg, $ip); }
    if (str_starts_with($route, 'push_')) { require_once __DIR__ . '/social.php'; require_once __DIR__ . '/push.php'; mh_push_route($route, $in, $cfg, $ip); }
    if (str_starts_with($route, 'issue_') || str_starts_with($route, 'admin_issue') || str_starts_with($route, 'admin_backup') || $route === 'prefs') { require_once __DIR__ . '/social.php'; require_once __DIR__ . '/extras.php'; mh_extras_route($route, $in, $cfg, $ip); }
    if (str_starts_with($route, 'teach_') || str_starts_with($route, 'admin_teach')) { require_once __DIR__ . '/teach.php'; mh_teach_route($route, $in, $cfg, $ip); }
    if (str_starts_with($route, 'admin_config')) { require_once __DIR__ . '/siteconfig.php'; mh_siteconfig_route($route, $in, $cfg, $ip); }   // keys and settings from the admin panel
    if (str_starts_with($route, 'forum_') || str_starts_with($route, 'admin_') || str_starts_with($route, 'notif_') || $route === 'terms_accept') { require_once __DIR__ . '/forum.php'; mh_forum_route($route, $in, $cfg, $ip); }
    foreach (['challenge_', 'badges', 'presence', 'meet_', 'poll_', 'mock_', 'contrib_', 'activity', 'cron', 'helpers', 'people', 'league', 'stats_'] as $pre) if (str_starts_with($route, $pre)) { require_once __DIR__ . '/social.php'; mh_social_route($route, $in, $cfg, $ip); }
    mh_fail('Not found.', 404);
}
