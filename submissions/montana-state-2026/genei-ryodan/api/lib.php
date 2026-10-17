<?php
/* ============================================================
   Mathub account server — shared helpers
   SQLite storage, JSON I/O, rate limits, email codes, login tokens.
   ============================================================ */
declare(strict_types=1);

function mh_config(): array {
  static $cfg = null;
  if ($cfg !== null) return $cfg;
  $cfg = require __DIR__ . '/config.php';
  if (is_file(__DIR__ . '/config.local.php')) { $local = require __DIR__ . '/config.local.php'; if (is_array($local)) $cfg = array_merge($cfg, $local); }
  require_once __DIR__ . '/siteconfig.php'; $cfg = array_merge($cfg, mh_siteconfig_saved($cfg));   // keys and settings saved in the admin panel (Keys & settings) win
  return $cfg;
}

function mh_json($data, int $status = 200): void {
  http_response_code($status);
  header('Content-Type: application/json; charset=UTF-8');
  header('Cache-Control: no-store');
  echo json_encode($data, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
  exit;
}
function mh_fail(string $message, int $status = 400, array $extra = []): void {
  mh_json(array_merge(['ok' => false, 'error' => $message], $extra), $status);
}

function mh_input(): array {
  static $in = null;
  if ($in !== null) return $in;
  $raw = file_get_contents('php://input') ?: '';
  $ct = $_SERVER['CONTENT_TYPE'] ?? '';
  if ($raw !== '' && stripos($ct, 'application/json') !== false) { $j = json_decode($raw, true); $in = is_array($j) ? $j : []; }
  elseif ($raw !== '' && ($j = json_decode($raw, true)) !== null && is_array($j)) { $in = $j; }
  else $in = $_POST;
  return $in;
}
function mh_str(array $in, string $k, int $max = 200): string { $v = $in[$k] ?? ''; return is_string($v) ? trim(mb_substr($v, 0, $max)) : ''; }

function mh_db(): PDO {
  static $db = null;
  if ($db) return $db;
  $cfg = mh_config(); $path = $cfg['db_path'];
  $dir = dirname($path); if (!is_dir($dir)) @mkdir($dir, 0755, true);
  try { $db = new PDO('sqlite:' . $path, null, null, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC]); }
  catch (Throwable $e) { mh_fail('The account database cannot be opened. Make sure api/data is writable (permissions 755) on the server.', 500); }
  $db->exec('PRAGMA journal_mode=WAL'); $db->exec('PRAGMA busy_timeout=4000'); $db->exec('PRAGMA foreign_keys=ON');
  $db->exec('CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, email TEXT NOT NULL UNIQUE, name TEXT NOT NULL DEFAULT "", pass_hash TEXT NOT NULL, verified INTEGER NOT NULL DEFAULT 0, created INTEGER NOT NULL, last_login INTEGER)');
  $db->exec('CREATE TABLE IF NOT EXISTS codes (id INTEGER PRIMARY KEY AUTOINCREMENT, email TEXT NOT NULL, kind TEXT NOT NULL, code_hash TEXT NOT NULL, expires INTEGER NOT NULL, attempts INTEGER NOT NULL DEFAULT 0, created INTEGER NOT NULL)');
  $db->exec('CREATE INDEX IF NOT EXISTS codes_email ON codes(email, kind)');
  $db->exec('CREATE TABLE IF NOT EXISTS tokens (hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, expires INTEGER NOT NULL, created INTEGER NOT NULL, ua TEXT NOT NULL DEFAULT "")');
  $db->exec('CREATE TABLE IF NOT EXISTS progress (user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, course TEXT NOT NULL, json TEXT NOT NULL, updated INTEGER NOT NULL, PRIMARY KEY (user_id, course))');
  $db->exec('CREATE TABLE IF NOT EXISTS rate (key TEXT PRIMARY KEY, window_start INTEGER NOT NULL, count INTEGER NOT NULL)');
  // discussions
  $cols = array_column($db->query('PRAGMA table_info(users)')->fetchAll(), 'name');
  if (!in_array('terms_accepted', $cols, true)) $db->exec('ALTER TABLE users ADD COLUMN terms_accepted INTEGER NOT NULL DEFAULT 0');
  $db->exec('CREATE TABLE IF NOT EXISTS posts (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, course TEXT NOT NULL, flair TEXT NOT NULL DEFAULT "question", title TEXT NOT NULL, body TEXT NOT NULL, anon INTEGER NOT NULL DEFAULT 0, created INTEGER NOT NULL, edited INTEGER, score INTEGER NOT NULL DEFAULT 0, ncomments INTEGER NOT NULL DEFAULT 0, pinned INTEGER NOT NULL DEFAULT 0, locked INTEGER NOT NULL DEFAULT 0, removed INTEGER NOT NULL DEFAULT 0, ip TEXT NOT NULL DEFAULT "")');
  $db->exec('CREATE INDEX IF NOT EXISTS posts_course ON posts(course, removed, created)');
  $db->exec('CREATE TABLE IF NOT EXISTS comments (id INTEGER PRIMARY KEY AUTOINCREMENT, post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, parent_id INTEGER, body TEXT NOT NULL, anon INTEGER NOT NULL DEFAULT 0, created INTEGER NOT NULL, edited INTEGER, score INTEGER NOT NULL DEFAULT 0, removed INTEGER NOT NULL DEFAULT 0, ip TEXT NOT NULL DEFAULT "")');
  $db->exec('CREATE INDEX IF NOT EXISTS comments_post ON comments(post_id)');
  $db->exec('CREATE TABLE IF NOT EXISTS votes (user_id INTEGER NOT NULL, kind TEXT NOT NULL, item_id INTEGER NOT NULL, value INTEGER NOT NULL, PRIMARY KEY (user_id, kind, item_id))');
  $db->exec('CREATE TABLE IF NOT EXISTS reports (id INTEGER PRIMARY KEY AUTOINCREMENT, kind TEXT NOT NULL, item_id INTEGER NOT NULL, user_id INTEGER NOT NULL, reason TEXT NOT NULL, created INTEGER NOT NULL, status TEXT NOT NULL DEFAULT "open")');
  $db->exec('CREATE TABLE IF NOT EXISTS bans (user_id INTEGER PRIMARY KEY, until INTEGER NOT NULL, reason TEXT NOT NULL DEFAULT "", created INTEGER NOT NULL)');
  // notifications, site settings (all additive: existing rows are never touched)
  if (!in_array('notify_email', $cols, true)) $db->exec('ALTER TABLE users ADD COLUMN notify_email INTEGER NOT NULL DEFAULT 1');
  $db->exec('CREATE TABLE IF NOT EXISTS notifications (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, kind TEXT NOT NULL, post_id INTEGER NOT NULL, comment_id INTEGER, actor_id INTEGER, actor TEXT NOT NULL DEFAULT "", title TEXT NOT NULL DEFAULT "", snippet TEXT NOT NULL DEFAULT "", created INTEGER NOT NULL, read INTEGER NOT NULL DEFAULT 0)');
  $db->exec('CREATE INDEX IF NOT EXISTS notif_user ON notifications(user_id, read, created)');
  $db->exec('CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated INTEGER NOT NULL)');
  // community features (additive)
  foreach (['show_on_leaderboard' => 1, 'digest_email' => 1] as $col => $def) if (!in_array($col, $cols, true)) $db->exec("ALTER TABLE users ADD COLUMN $col INTEGER NOT NULL DEFAULT $def");
  if (!in_array('digest_sent', $cols, true)) $db->exec('ALTER TABLE users ADD COLUMN digest_sent INTEGER NOT NULL DEFAULT 0');
  // personalization + evening reminders (additive)
  if (!in_array('courses', $cols, true)) $db->exec('ALTER TABLE users ADD COLUMN courses TEXT');
  if (!in_array('sections', $cols, true)) $db->exec('ALTER TABLE users ADD COLUMN sections TEXT');
  if (!in_array('reminder_email', $cols, true)) $db->exec('ALTER TABLE users ADD COLUMN reminder_email INTEGER NOT NULL DEFAULT 0');
  if (!in_array('reminder_sent', $cols, true)) $db->exec('ALTER TABLE users ADD COLUMN reminder_sent INTEGER NOT NULL DEFAULT 0');
  if (!in_array('league', $cols, true)) $db->exec('ALTER TABLE users ADD COLUMN league INTEGER NOT NULL DEFAULT 0');
  if (!in_array('prefs', $cols, true)) $db->exec('ALTER TABLE users ADD COLUMN prefs TEXT');
  $ncols = array_column($db->query('PRAGMA table_info(notifications)')->fetchAll(), 'name'); if (!in_array('link', $ncols, true)) $db->exec('ALTER TABLE notifications ADD COLUMN link TEXT NOT NULL DEFAULT ""');
  if (!in_array('prefs_updated', $cols, true)) $db->exec('ALTER TABLE users ADD COLUMN prefs_updated INTEGER NOT NULL DEFAULT 0');
  if (!in_array('push_sent', $cols, true)) $db->exec('ALTER TABLE users ADD COLUMN push_sent INTEGER NOT NULL DEFAULT 0');
  // the welcome after sign-up (classes and a membership): accounts from before it count as welcomed
  if (!in_array('welcomed', $cols, true)) { $db->exec('ALTER TABLE users ADD COLUMN welcomed INTEGER NOT NULL DEFAULT 0'); $db->exec('UPDATE users SET welcomed = MAX(created, 1)'); }
  if (!in_array('plan_choice', $cols, true)) $db->exec("ALTER TABLE users ADD COLUMN plan_choice TEXT NOT NULL DEFAULT ''");
  $db->exec('CREATE TABLE IF NOT EXISTS issues (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL DEFAULT 0, email TEXT NOT NULL DEFAULT "", course TEXT NOT NULL DEFAULT "", view TEXT NOT NULL DEFAULT "", ref TEXT NOT NULL DEFAULT "", prompt TEXT NOT NULL DEFAULT "", answer TEXT NOT NULL DEFAULT "", reason TEXT NOT NULL DEFAULT "other", comment TEXT NOT NULL DEFAULT "", url TEXT NOT NULL DEFAULT "", build TEXT NOT NULL DEFAULT "", ua TEXT NOT NULL DEFAULT "", created INTEGER NOT NULL, status TEXT NOT NULL DEFAULT "open", resolved_by INTEGER NOT NULL DEFAULT 0, resolved INTEGER NOT NULL DEFAULT 0)');
  $db->exec('CREATE TABLE IF NOT EXISTS push_subs (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, endpoint TEXT NOT NULL UNIQUE, p256dh TEXT NOT NULL, auth TEXT NOT NULL, ua TEXT NOT NULL DEFAULT "", created INTEGER NOT NULL, last_ok INTEGER NOT NULL DEFAULT 0)');
  $db->exec('CREATE TABLE IF NOT EXISTS push_queue (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, title TEXT NOT NULL, body TEXT NOT NULL DEFAULT "", url TEXT NOT NULL DEFAULT "", tag TEXT NOT NULL DEFAULT "", created INTEGER NOT NULL, delivered INTEGER NOT NULL DEFAULT 0)');
  $db->exec('CREATE INDEX IF NOT EXISTS push_queue_user ON push_queue(user_id, delivered)');
  $db->exec('CREATE TABLE IF NOT EXISTS league_history (user_id INTEGER NOT NULL, week INTEGER NOT NULL, league INTEGER NOT NULL, rank INTEGER NOT NULL, xp INTEGER NOT NULL, result TEXT NOT NULL, PRIMARY KEY (user_id, week))');
  $pcols = array_column($db->query('PRAGMA table_info(posts)')->fetchAll(), 'name');
  if (!in_array('accepted_id', $pcols, true)) $db->exec('ALTER TABLE posts ADD COLUMN accepted_id INTEGER');
  $db->exec('CREATE TABLE IF NOT EXISTS challenge_attempts (user_id INTEGER NOT NULL, course TEXT NOT NULL, date TEXT NOT NULL, ok INTEGER NOT NULL, ms INTEGER NOT NULL, points INTEGER NOT NULL, topic TEXT NOT NULL DEFAULT "", created INTEGER NOT NULL, PRIMARY KEY (user_id, course, date))');
  $db->exec('CREATE INDEX IF NOT EXISTS ca_course_date ON challenge_attempts(course, date)');
  $db->exec('CREATE TABLE IF NOT EXISTS badges (user_id INTEGER NOT NULL, code TEXT NOT NULL, earned INTEGER NOT NULL, seen INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (user_id, code))');
  $bcols = array_column($db->query('PRAGMA table_info(badges)')->fetchAll(), 'name');
  if (!in_array('manual', $bcols, true)) $db->exec('ALTER TABLE badges ADD COLUMN manual INTEGER NOT NULL DEFAULT 0');   // 1 = awarded by an administrator (after the CREATE: a new database used to fail here)
  $db->exec('CREATE TABLE IF NOT EXISTS presence (user_id INTEGER PRIMARY KEY, course TEXT NOT NULL DEFAULT "", view TEXT NOT NULL DEFAULT "", post_id INTEGER NOT NULL DEFAULT 0, seen INTEGER NOT NULL)');
  $db->exec('CREATE TABLE IF NOT EXISTS meets (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, course TEXT NOT NULL, title TEXT NOT NULL, place TEXT NOT NULL, start INTEGER NOT NULL, end INTEGER NOT NULL, note TEXT NOT NULL DEFAULT "", cancelled INTEGER NOT NULL DEFAULT 0, created INTEGER NOT NULL)');
  $db->exec('CREATE TABLE IF NOT EXISTS meet_rsvp (meet_id INTEGER NOT NULL, user_id INTEGER NOT NULL, created INTEGER NOT NULL, PRIMARY KEY (meet_id, user_id))');
  $db->exec('CREATE TABLE IF NOT EXISTS polls (id INTEGER PRIMARY KEY AUTOINCREMENT, post_id INTEGER NOT NULL UNIQUE, question TEXT NOT NULL DEFAULT "", options TEXT NOT NULL, multi INTEGER NOT NULL DEFAULT 0, auto_key TEXT UNIQUE, created INTEGER NOT NULL)');
  $db->exec('CREATE TABLE IF NOT EXISTS poll_votes (poll_id INTEGER NOT NULL, user_id INTEGER NOT NULL, opt INTEGER NOT NULL, created INTEGER NOT NULL, PRIMARY KEY (poll_id, user_id, opt))');
  $db->exec('CREATE TABLE IF NOT EXISTS mocks (id INTEGER PRIMARY KEY AUTOINCREMENT, course TEXT NOT NULL, exam_id TEXT NOT NULL, title TEXT NOT NULL, start INTEGER NOT NULL, minutes INTEGER NOT NULL, count INTEGER NOT NULL, seed INTEGER NOT NULL, created_by INTEGER NOT NULL, created INTEGER NOT NULL, cancelled INTEGER NOT NULL DEFAULT 0)');
  $db->exec('CREATE TABLE IF NOT EXISTS mock_reg (mock_id INTEGER NOT NULL, user_id INTEGER NOT NULL, created INTEGER NOT NULL, PRIMARY KEY (mock_id, user_id))');
  $db->exec('CREATE TABLE IF NOT EXISTS mock_results (mock_id INTEGER NOT NULL, user_id INTEGER NOT NULL, score INTEGER NOT NULL, total INTEGER NOT NULL, ms INTEGER NOT NULL, created INTEGER NOT NULL, PRIMARY KEY (mock_id, user_id))');
  $db->exec('CREATE TABLE IF NOT EXISTS contributions (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, course TEXT NOT NULL, kind TEXT NOT NULL, unit INTEGER NOT NULL DEFAULT 0, sec TEXT NOT NULL DEFAULT "", front TEXT NOT NULL, back TEXT NOT NULL, explanation TEXT NOT NULL DEFAULT "", status TEXT NOT NULL DEFAULT "pending", score INTEGER NOT NULL DEFAULT 0, anon INTEGER NOT NULL DEFAULT 0, created INTEGER NOT NULL)');
  $db->exec('CREATE INDEX IF NOT EXISTS contrib_course ON contributions(course, kind, status)');
  $db->exec('CREATE TABLE IF NOT EXISTS activity (id INTEGER PRIMARY KEY AUTOINCREMENT, kind TEXT NOT NULL, course TEXT NOT NULL DEFAULT "", text TEXT NOT NULL, link TEXT NOT NULL DEFAULT "", created INTEGER NOT NULL)');
  $db->exec('CREATE TABLE IF NOT EXISTS roles (email TEXT PRIMARY KEY, role TEXT NOT NULL, updated INTEGER NOT NULL)');
  // growth: calendar feed tokens, invites, planning email, focus together, usage metrics, class goals, announcements
  foreach (['ics_token' => 'TEXT', 'invite_code' => 'TEXT', 'invited_by' => 'INTEGER NOT NULL DEFAULT 0', 'planning_email' => 'INTEGER NOT NULL DEFAULT 0', 'planning_sent' => 'INTEGER NOT NULL DEFAULT 0', 'focus_public' => 'INTEGER NOT NULL DEFAULT 1'] as $col => $type) if (!in_array($col, $cols, true)) $db->exec("ALTER TABLE users ADD COLUMN $col $type");
  $mcols = array_column($db->query('PRAGMA table_info(mocks)')->fetchAll(), 'name'); if (!in_array('official', $mcols, true)) $db->exec('ALTER TABLE mocks ADD COLUMN official INTEGER NOT NULL DEFAULT 0');
  $db->exec('CREATE TABLE IF NOT EXISTS user_days (user_id INTEGER NOT NULL, day TEXT NOT NULL, PRIMARY KEY (user_id, day))');
  $db->exec('CREATE TABLE IF NOT EXISTS metrics (day TEXT NOT NULL, key TEXT NOT NULL, n INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (day, key))');
  $db->exec('CREATE TABLE IF NOT EXISTS focus_live (user_id INTEGER PRIMARY KEY, task TEXT NOT NULL DEFAULT "", course TEXT NOT NULL DEFAULT "", started INTEGER NOT NULL, ends INTEGER NOT NULL, seen INTEGER NOT NULL)');
  $db->exec('CREATE TABLE IF NOT EXISTS weekly_stats (user_id INTEGER NOT NULL, course TEXT NOT NULL, week TEXT NOT NULL, answered INTEGER NOT NULL DEFAULT 0, correct INTEGER NOT NULL DEFAULT 0, cards INTEGER NOT NULL DEFAULT 0, focus INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (user_id, course, week))');
  $db->exec('CREATE TABLE IF NOT EXISTS announcements (id INTEGER PRIMARY KEY AUTOINCREMENT, course TEXT NOT NULL, text TEXT NOT NULL, link TEXT NOT NULL DEFAULT "", user_id INTEGER NOT NULL, created INTEGER NOT NULL, expires INTEGER NOT NULL DEFAULT 0)');
  // blocks: a member hides another member's posts, comments, meetups and notifications from themself (App Store guideline 1.2).
  // anon = 1 when the block was made from an anonymous post: it then hides only that member's anonymous posts, so blocking
  // never reveals who wrote one (their named posts staying visible says nothing about which named member it was)
  $db->exec('CREATE TABLE IF NOT EXISTS member_blocks (user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, blocked_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, anon INTEGER NOT NULL DEFAULT 0, label TEXT NOT NULL DEFAULT "", created INTEGER NOT NULL, PRIMARY KEY (user_id, blocked_id, anon))');
  return $db;
}

function mh_secret(): string {
  static $s = null; if ($s) return $s;
  $f = dirname(mh_config()['db_path']) . '/secret.key';
  if (!is_file($f)) { @file_put_contents($f, bin2hex(random_bytes(32)), LOCK_EX); @chmod($f, 0600); }
  $s = trim((string)@file_get_contents($f));
  if ($s === '') mh_fail('The server cannot write to api/data. Give that folder write permission (755 or 775) and retry.', 500);
  return $s;
}

function mh_client_ip(): string {
  $ip = $_SERVER['REMOTE_ADDR'] ?? '0.0.0.0';
  return substr(preg_replace('/[^0-9a-fA-F:.]/', '', $ip), 0, 45);
}

/** Sliding window counter. Returns true when the action is allowed. */
function mh_rate(string $key, int $limit, int $windowSec): bool {
  $db = mh_db(); $now = time();
  if (random_int(1, 50) === 1) $db->exec('DELETE FROM rate WHERE window_start < ' . ($now - 86400));
  $row = $db->prepare('SELECT window_start, count FROM rate WHERE key = ?'); $row->execute([$key]); $r = $row->fetch();
  if (!$r || $r['window_start'] + $windowSec < $now) { $db->prepare('INSERT OR REPLACE INTO rate (key, window_start, count) VALUES (?, ?, 1)')->execute([$key, $now]); return true; }
  if ((int)$r['count'] >= $limit) return false;
  $db->prepare('UPDATE rate SET count = count + 1 WHERE key = ?')->execute([$key]);
  return true;
}
function mh_rate_or_fail(string $key, int $limit, int $windowSec, string $msg = 'Too many attempts. Please wait a while and try again.'): void {
  if (!mh_rate($key, $limit, $windowSec)) mh_fail($msg, 429);
}

/** Normalizes an email and checks the domain rule. Returns [email|null, error|null]. */
function mh_email_check(string $email): array {
  $email = strtolower(trim($email));
  if ($email === '' || strlen($email) > 254 || !filter_var($email, FILTER_VALIDATE_EMAIL)) return [null, 'Enter a valid email address.'];
  $domain = substr($email, strrpos($email, '@') + 1);
  $ok = in_array($email, array_map('strtolower', mh_config()['extra_allowed_emails'] ?? []), true);
  foreach (mh_config()['allowed_domains'] as $d) { $d = strtolower($d); if ($domain === $d || str_ends_with($domain, '.' . $d)) { $ok = true; break; } }
  if (!$ok) return [null, 'Mathub is for Montana State students: sign up with your @montana.edu address.'];
  return [$email, null];
}

function mh_user_by_email(string $email): ?array {
  $st = mh_db()->prepare('SELECT * FROM users WHERE email = ?'); $st->execute([$email]); $u = $st->fetch(); return $u ?: null;
}
function mh_is_admin(?array $u): bool { return $u ? in_array(strtolower($u['email']), array_map('strtolower', mh_config()['admins'] ?? []), true) : false; }
function mh_is_mod(?array $u): bool { return $u ? (mh_is_admin($u) || in_array(strtolower($u['email']), array_map('strtolower', mh_config()['moderators'] ?? []), true)) : false; }
/** SQL for a notifications query: leaves out what members the reader blocked set off */
const MH_NOTIF_UNBLOCKED = ' AND NOT EXISTS (SELECT 1 FROM member_blocks b WHERE b.user_id = notifications.user_id AND b.blocked_id = notifications.actor_id AND (b.anon = 0 OR notifications.actor = \'Someone\'))';
function mh_user_public(array $u): array {
  $unread = 0; try { $st = mh_db()->prepare('SELECT COUNT(*) FROM notifications WHERE user_id = ? AND read = 0' . MH_NOTIF_UNBLOCKED); $st->execute([$u['id']]); $unread = (int)$st->fetchColumn(); } catch (Throwable $e) {}
  return ['id' => (int)$u['id'], 'email' => $u['email'], 'name' => $u['name'], 'verified' => (bool)$u['verified'], 'created' => (int)$u['created'], 'mod' => mh_is_mod($u), 'admin' => mh_is_admin($u), 'terms' => (int)($u['terms_accepted'] ?? 0) > 0, 'notify_email' => (int)($u['notify_email'] ?? 1) === 1, 'unread' => $unread,
    'show_on_leaderboard' => (int)($u['show_on_leaderboard'] ?? 1) === 1, 'digest_email' => (int)($u['digest_email'] ?? 1) === 1, 'planning_email' => (int)($u['planning_email'] ?? 0) === 1, 'focus_public' => (int)($u['focus_public'] ?? 1) === 1, 'staff' => mh_role($u['email']) !== '', 'role' => mh_role($u['email']),
    'courses' => isset($u['courses']) && $u['courses'] !== null && $u['courses'] !== '' ? (json_decode((string)$u['courses'], true) ?: []) : null, 'sections' => isset($u['sections']) && $u['sections'] ? (json_decode((string)$u['sections'], true) ?: (object)[]) : (object)[], 'reminder_email' => (int)($u['reminder_email'] ?? 0) === 1, 'league' => (int)($u['league'] ?? 0), 'can_request' => mh_can_request($u), 'welcomed' => (int)($u['welcomed'] ?? 1) > 0];
}
/** Professors and TAs (an Instructor or TA role, or a TA in a Mathub Faculty class) and administrators: they request new classes. */
function mh_can_request(array $u): bool {
  if (mh_is_admin($u) || mh_role((string)$u['email']) !== '') return true;
  try { $st = mh_db()->prepare("SELECT 1 FROM teach_members WHERE user_id = ? AND role = 'ta' LIMIT 1"); $st->execute([$u['id']]); return (bool)$st->fetchColumn(); } catch (Throwable $e) { return false; }
}
/** Display name: the chosen name, else the part of the email before the @. */
function mh_display_name(array $row, string $prefix = ''): string {
  $name = trim((string)($row[$prefix . 'name'] ?? '')); if ($name !== '') return mb_substr($name, 0, 40);
  $email = (string)($row[$prefix . 'email'] ?? ''); return $email !== '' ? substr($email, 0, strrpos($email, '@') ?: null) : 'student';
}
/** Staff role for an email: from the roles table (admin panel) or the config 'staff' map. Returns 'Instructor', 'TA', or ''. */
function mh_role(string $email): string {
  static $cache = [];
  $email = strtolower($email); if (isset($cache[$email])) return $cache[$email];
  $cfg = mh_config(); $r = '';
  foreach ($cfg['staff'] ?? [] as $e => $role) if (strtolower((string)$e) === $email) $r = (string)$role;
  if ($r === '') { try { $st = mh_db()->prepare('SELECT role FROM roles WHERE email = ?'); $st->execute([$email]); $v = $st->fetchColumn(); if ($v) $r = (string)$v; } catch (Throwable $e) {} }
  return $cache[$email] = $r;
}

/* ---------- passwords ---------- */
/** NIST SP 800-63B style check: long enough, not a well-known password, not the email name. Returns an error or ''. */
function mh_password_problem(string $pass, string $email = ''): string {
  if (strlen($pass) < 8) return 'Use a password of at least 8 characters.';
  if (strlen($pass) > 200) return 'That password is too long.';
  $p = strtolower($pass);
  static $common = ['password', 'password1', 'password12', 'password123', 'password1234', 'passw0rd', 'p@ssw0rd', 'p@ssword', '12345678', '123456789', '1234567890', '0123456789', '87654321', '11111111', '00000000', '12341234', '11223344', 'qwertyui', 'qwerty12', 'qwerty123', 'qwertyuiop', '1q2w3e4r', '1qaz2wsx', 'zaq12wsx', 'asdfghjk', 'asdfasdf', 'abcd1234', 'abc12345', 'abcdefgh', 'iloveyou', 'iloveyou1', 'sunshine', 'sunshine1', 'princess', 'football', 'football1', 'baseball', 'basketball', 'superman', 'batman123', 'starwars', 'trustno1', 'welcome1', 'welcome123', 'letmein1', 'monkey123', 'dragon123', 'master123', 'shadow123', 'michael1', 'jennifer', 'computer', 'whatever', 'internet', 'changeme', 'mathub123', 'montana1', 'montana123', 'bobcats1', 'gocats123', 'bozeman1', 'student1', 'student123', 'college1', 'school123'];
  if (in_array($p, $common, true) || preg_match('/^(.)\1{7,}$/', $p) || preg_match('/^(0123456789|1234567890|9876543210|abcdefghij)/', $p)) return 'That password is one of the most common ones and easy to guess. Pick something more personal, like three unrelated words.';
  $local = strtolower(explode('@', $email)[0] ?? '');
  if ($local !== '' && strlen($local) >= 4 && str_contains($p, $local)) return 'Your password should not contain your email name.';
  return '';
}
/** Runs a password check even when the account does not exist, so a login takes the same time either way. */
function mh_password_check(?array $u, string $pass): bool {
  static $dummy = null; if ($dummy === null) $dummy = password_hash('mathub-timing-equalizer', PASSWORD_DEFAULT);
  if (!$u) { password_verify($pass, $dummy); return false; }
  return password_verify($pass, (string)$u['pass_hash']);
}

/* ---------- one-time codes ---------- */
function mh_code_hash(string $email, string $kind, string $code): string { return hash_hmac('sha256', "$email|$kind|$code", mh_secret()); }
function mh_code_issue(string $email, string $kind, int $ttlSec = 0): string {
  $db = mh_db(); $code = str_pad((string)random_int(0, 999999), 6, '0', STR_PAD_LEFT);
  $ttl = $ttlSec > 0 ? $ttlSec : (int)(mh_config()['code_ttl_minutes'] ?? 15) * 60;   // longer for an invitation from an administrator
  $db->prepare('DELETE FROM codes WHERE email = ? AND kind = ?')->execute([$email, $kind]);
  $db->prepare('INSERT INTO codes (email, kind, code_hash, expires, created) VALUES (?, ?, ?, ?, ?)')->execute([$email, $kind, mh_code_hash($email, $kind, $code), time() + $ttl, time()]);
  return $code;
}
/** Returns null on success, or an error message. */
function mh_code_consume(string $email, string $kind, string $code): ?string {
  $db = mh_db(); $code = preg_replace('/\D/', '', $code);
  if (strlen($code) !== 6) return 'Enter the 6-digit code from the email.';
  $st = $db->prepare('SELECT * FROM codes WHERE email = ? AND kind = ? ORDER BY id DESC LIMIT 1'); $st->execute([$email, $kind]); $row = $st->fetch();
  if (!$row) return 'No code is pending for that address. Request a new one.';
  if ((int)$row['expires'] < time()) { $db->prepare('DELETE FROM codes WHERE id = ?')->execute([$row['id']]); return 'That code has expired. Request a new one.'; }
  if ((int)$row['attempts'] >= 6) { $db->prepare('DELETE FROM codes WHERE id = ?')->execute([$row['id']]); return 'Too many wrong tries. Request a new code.'; }
  if (!hash_equals($row['code_hash'], mh_code_hash($email, $kind, $code))) { $db->prepare('UPDATE codes SET attempts = attempts + 1 WHERE id = ?')->execute([$row['id']]); return 'That code is not right. Check the email and try again.'; }
  $db->prepare('DELETE FROM codes WHERE id = ?')->execute([$row['id']]);
  return null;
}

/* ---------- login tokens (cookie) ---------- */
const MH_COOKIE = 'mathub_session';
function mh_https(): bool { return (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') || (($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https') || (($_SERVER['SERVER_PORT'] ?? '') == 443); }
function mh_token_issue(int $userId): void {
  $db = mh_db(); $tok = bin2hex(random_bytes(32)); $days = (int)(mh_config()['session_days'] ?? 180); $exp = time() + $days * 86400;
  $db->prepare('INSERT INTO tokens (hash, user_id, expires, created, ua) VALUES (?, ?, ?, ?, ?)')->execute([hash('sha256', $tok), $userId, $exp, time(), substr((string)($_SERVER['HTTP_USER_AGENT'] ?? ''), 0, 200)]);
  if (random_int(1, 20) === 1) $db->exec('DELETE FROM tokens WHERE expires < ' . time());
  setcookie(MH_COOKIE, $tok, ['expires' => $exp, 'path' => '/', 'secure' => mh_https(), 'httponly' => true, 'samesite' => 'Lax']);
  $_COOKIE[MH_COOKIE] = $tok;
}
function mh_token_clear(): void {
  $tok = $_COOKIE[MH_COOKIE] ?? '';
  if ($tok !== '') mh_db()->prepare('DELETE FROM tokens WHERE hash = ?')->execute([hash('sha256', $tok)]);
  setcookie(MH_COOKIE, '', ['expires' => time() - 3600, 'path' => '/', 'secure' => mh_https(), 'httponly' => true, 'samesite' => 'Lax']);
  unset($_COOKIE[MH_COOKIE]);
}
function mh_current_user(): ?array {
  static $u = false; if ($u !== false) return $u;
  $tok = $_COOKIE[MH_COOKIE] ?? ''; if (!preg_match('/^[0-9a-f]{64}$/', $tok)) return $u = null;
  $st = mh_db()->prepare('SELECT u.* FROM tokens t JOIN users u ON u.id = t.user_id WHERE t.hash = ? AND t.expires > ?'); $st->execute([hash('sha256', $tok), time()]);
  $row = $st->fetch(); return $u = ($row && (int)$row['verified'] === 1 ? $row : null);
}
function mh_require_user(): array { $u = mh_current_user(); if (!$u) mh_fail('Please log in.', 401, ['auth' => false]); return $u; }

/* ---------- account self-service: devices, data export ---------- */
/** A readable device name from a user agent: "Chrome on Windows". */
function mh_ua_label(string $ua): string {
  $b = 'Browser'; foreach (['Edg/' => 'Edge', 'OPR/' => 'Opera', 'Firefox/' => 'Firefox', 'CriOS' => 'Chrome', 'Chrome/' => 'Chrome', 'Safari/' => 'Safari'] as $k => $v) if (str_contains($ua, $k)) { $b = $v; break; }
  $o = ''; foreach (['iPhone' => 'iPhone', 'iPad' => 'iPad', 'Android' => 'Android', 'Windows' => 'Windows', 'Mac OS X' => 'Mac', 'CrOS' => 'Chromebook', 'Linux' => 'Linux'] as $k => $v) if (str_contains($ua, $k)) { $o = $v; break; }
  return $o !== '' ? "$b on $o" : $b;
}
/** Everything stored about one account, for "Download my data". Secrets (password hash, login tokens, calendar and push keys, IP addresses) are left out. */
function mh_export_user(array $u): array {
  $db = mh_db(); $out = ['exported' => gmdate('c'), 'site' => mh_config()['site_name'] ?? 'Mathub'];
  $hide = ['pass_hash', 'ics_token', 'ip', 'hash', 'code_hash', 'p256dh', 'auth', 'endpoint', 'invite_code'];
  $acct = $u; foreach ($hide as $k) unset($acct[$k]); $out['account'] = $acct; $out['role'] = mh_role($u['email']);
  $skip = ['users', 'tokens', 'codes', 'rate', 'sqlite_sequence'];
  foreach ($db->query("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")->fetchAll(PDO::FETCH_COLUMN) as $t) {
    if (in_array($t, $skip, true) || !preg_match('/^[a-z_0-9]+$/', $t)) continue;
    $cols = array_column($db->query("PRAGMA table_info($t)")->fetchAll(), 'name'); $who = in_array('user_id', $cols, true) ? 'user_id' : (in_array('owner_id', $cols, true) ? 'owner_id' : ''); if ($who === '') continue;
    $st = $db->prepare("SELECT * FROM $t WHERE $who = ? LIMIT 5000"); $st->execute([$u['id']]); $rows = $st->fetchAll(); if (!$rows) continue;
    foreach ($rows as &$r) { foreach ($hide as $k) unset($r[$k]); if ($t === 'progress' && isset($r['json'])) { $r['data'] = json_decode((string)$r['json'], true); unset($r['json']); } } unset($r);
    $out['tables'][$t] = $rows;
  }
  $st = $db->prepare('SELECT created, expires, ua FROM tokens WHERE user_id = ? AND expires > ?'); $st->execute([$u['id'], time()]);
  $out['signed_in_devices'] = array_map(fn($r) => ['device' => mh_ua_label((string)$r['ua']), 'signed_in' => gmdate('c', (int)$r['created']), 'expires' => gmdate('c', (int)$r['expires'])], $st->fetchAll());
  return $out;
}

/* ---------- request guards ---------- */
function mh_guard_mutation(): void {
  if (($_SERVER['HTTP_X_REQUESTED_WITH'] ?? '') !== 'MatHub') mh_fail('Bad request.', 400);
  if (($_SERVER['HTTP_ORIGIN'] ?? '') === 'capacitor://localhost') return;   // the Mathub iOS app (its pages are served from capacitor://localhost); no website can send this origin
  $site = $_SERVER['HTTP_SEC_FETCH_SITE'] ?? '';
  if ($site !== '' && !in_array($site, ['same-origin', 'same-site', 'none'], true)) mh_fail('Cross-site request blocked.', 403);
  $origin = $_SERVER['HTTP_ORIGIN'] ?? '';
  if ($origin !== '' && $origin !== 'null') { $oh = strtolower((string)parse_url($origin, PHP_URL_HOST)); $host = strtolower(explode(':', $_SERVER['HTTP_HOST'] ?? '')[0]); if ($oh !== $host) mh_fail('Cross-site request blocked.', 403); }
}
function mh_method(string ...$allowed): void {
  if (!in_array($_SERVER['REQUEST_METHOD'] ?? 'GET', $allowed, true)) mh_fail('Method not allowed.', 405);
  if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'GET') mh_guard_mutation();
}

/* ---------- emails ---------- */
function mh_send_code(string $email, string $kind, string $code): void {
  require_once __DIR__ . '/mailer.php';
  $cfg = mh_config(); $site = $cfg['site_name'] ?? 'Mathub'; $ttl = (int)($cfg['code_ttl_minutes'] ?? 15);
  $what = $kind === 'reset' ? 'password reset' : 'sign-up';
  $subject = "$site $what code: $code";
  $text = "Your $site $what code is $code\n\nIt expires in $ttl minutes. If you did not request this, you can ignore this email.\n\n— $site";
  $html = "<div style=\"font-family:Helvetica Neue,Helvetica,Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#131C2E\">"
        . "<p style=\"font-size:15px;margin:0 0 12px\">Your <b>$site</b> $what code is</p>"
        . "<p style=\"font-size:34px;letter-spacing:8px;font-weight:700;margin:0 0 16px;font-family:Consolas,Menlo,monospace\">$code</p>"
        . "<p style=\"font-size:14px;color:#64718A;margin:0\">It expires in $ttl minutes. If you did not request this, you can ignore this email.</p></div>";
  $r = mh_send_mail($cfg, $email, $subject, $text, $html);
  if (!$r['ok']) { error_log('Mathub mail to ' . $email . ': ' . ($r['error'] ?? 'unknown error')); mh_fail('The code could not be emailed right now. Please try again in a few minutes.', 502); }
}

/* ---------- the class list: built-in classes plus class packs uploaded in the admin panel (packs.php) ---------- */
const MH_BUILTIN_NAMES = ['calc' => 'Calc I', 'physics' => 'Physics I', 'precalc' => 'Precalc', 'writ' => 'WRIT 101', 'csci' => 'CSCI 127', 'biob' => 'BIOB 160', 'kin' => 'KIN 322', 'psyx' => 'PSYX 340'];
function mh_pack_db(): PDO {
  static $ready = false; $db = mh_db();
  if (!$ready) { $db->exec('CREATE TABLE IF NOT EXISTS class_packs (id TEXT PRIMARY KEY, code TEXT NOT NULL, name TEXT NOT NULL, short TEXT NOT NULL DEFAULT "", version INTEGER NOT NULL DEFAULT 1, json TEXT NOT NULL, prev_json TEXT NOT NULL DEFAULT "", stub TEXT NOT NULL, canvas TEXT NOT NULL DEFAULT "", enabled INTEGER NOT NULL DEFAULT 1, size INTEGER NOT NULL DEFAULT 0, uploaded_by TEXT NOT NULL DEFAULT "", created INTEGER NOT NULL, updated INTEGER NOT NULL)'); $ready = true; mh_packs_seed_bundled($db); }
  return $db;
}
/** Class packs shipped with the site in packs/*.mathub.json install themselves (packs.php, mh_packs_apply_bundled).
 *  The file list is checked by name, size and date first, so a normal request costs one small query. */
function mh_packs_seed_bundled(PDO $db): void {
  $files = @glob(dirname(__DIR__) . '/packs/*.mathub.json') ?: []; if (!$files) return;
  $sig = implode('|', array_map(fn($f) => basename($f) . ':' . @filesize($f) . ':' . @filemtime($f), $files));
  try {
    $db->exec('CREATE TABLE IF NOT EXISTS class_pack_seeds (id TEXT PRIMARY KEY, sha TEXT NOT NULL, seeded INTEGER NOT NULL)');
    $st = $db->prepare('SELECT sha FROM class_pack_seeds WHERE id = ?'); $st->execute(['*']); if ($st->fetchColumn() === $sig) return;
    require_once __DIR__ . '/packs.php'; mh_packs_apply_bundled($db, $files);
    $db->prepare('INSERT OR REPLACE INTO class_pack_seeds (id, sha, seeded) VALUES (?, ?, ?)')->execute(['*', $sig, time()]);
  } catch (Throwable $e) { error_log('Mathub bundled packs: ' . $e->getMessage()); }
}
/** Every installed pack (hidden ones too), without the pack data: id, code, name, short, version, enabled, canvas. */
function mh_pack_rows(bool $fresh = false): array {
  static $rows = null; if ($rows !== null && !$fresh) return $rows;
  try { $rows = mh_pack_db()->query('SELECT id, code, name, short, version, enabled, canvas FROM class_packs ORDER BY created, id')->fetchAll(); } catch (Throwable $e) { $rows = []; }
  return $rows;
}
/** Class ids the server accepts (progress, discussions, goals…): built-in and uploaded, plus "general" when asked. */
function mh_course_ids(bool $general = false): array { $ids = array_merge(array_keys(MH_BUILTIN_NAMES), array_column(mh_pack_rows(), 'id')); if ($general) $ids[] = 'general'; return $ids; }
function mh_is_course(string $id, bool $general = false): bool { return $id !== '' && in_array($id, mh_course_ids($general), true); }
/** Short names for emails and activity lines. */
function mh_course_names(): array { $n = MH_BUILTIN_NAMES; foreach (mh_pack_rows() as $p) $n[$p['id']] = $p['short'] !== '' ? $p['short'] : $p['code']; return $n; }
