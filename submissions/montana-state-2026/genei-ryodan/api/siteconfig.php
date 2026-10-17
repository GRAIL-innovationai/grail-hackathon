<?php
/* ============================================================
   Mathub account server — keys and settings from the admin panel
   Routes: admin_config (what is set), admin_config_save, admin_config_test
   - Administrators change the site's keys (Anthropic, OpenAI, RevenueCat), the email password and the other
     settings in the admin panel (Keys & settings) instead of editing config.local.php on the server.
   - What they save is kept in site-config.json next to the database (api/data, which the web cannot open, and
     which uploads never replace). It sits on top of config.php and config.local.php: a value saved here wins, and
     "Use the file's value" removes it again. Only the fields listed below can be set; the database path cannot.
   - Secrets (keys and passwords) are never sent back to the browser: the panel only learns whether one is set,
     where from, and its last four characters. Saving needs the administrator's own password again, and every
     change (which setting, who, when; never the value) is kept in config_log.
   - Check buttons try the keys: a one-token request to Anthropic, OpenAI's model list, RevenueCat for the
     administrator's own customer, and a test email to the administrator.
   ============================================================ */
declare(strict_types=1);

/** The settings the admin panel may change: key => [group, label, type, help, options]. */
function mh_siteconfig_fields(): array {
  static $f = null; if ($f !== null) return $f;
  $voices = ['cedar', 'marin', 'ash', 'ballad', 'coral', 'sage', 'verse'];
  return $f = [
    'anthropic_key'      => ['ai', 'Anthropic API key', 'secret', 'Bo’s answers and the classes he writes (console.anthropic.com → API keys).'],
    'openai_key'         => ['ai', 'OpenAI API key', 'secret', 'Live calls with Bo, his natural voice, and listening in Firefox (platform.openai.com → API keys).'],
    'ai_model_tutor'     => ['ai', 'Model for Bo’s answers', 'model', ''],
    'ai_model_class'     => ['ai', 'Model for writing classes', 'model', ''],
    'ai_tutor_monthly'   => ['ai', 'Questions to Bo, per student per month', 'int', '', [0, 100000]],
    'ai_tutor_daily'     => ['ai', 'Questions to Bo, per student per day', 'int', '', [1, 10000]],
    'ai_class_monthly'   => ['ai', 'Classes Bo writes, per student per month', 'int', '', [0, 1000]],
    'ai_live_model'      => ['ai', 'Model for live calls', 'model', ''],
    'ai_live_voice'      => ['ai', 'Bo’s voice on calls', 'select', '', $voices],
    'ai_live_monthly'    => ['ai', 'Call minutes, per student per month', 'int', '', [0, 10000]],
    'ai_live_daily'      => ['ai', 'Call minutes, per student per day', 'int', '', [0, 1440]],
    'ai_live_call'       => ['ai', 'Minutes per call', 'int', '', [1, 240]],
    'ai_tts_voice'       => ['ai', 'Bo’s voice in basic voice and Read aloud', 'select', '', ['ash', 'ballad', 'coral', 'sage', 'verse', 'alloy']],
    'ai_voice_monthly'   => ['ai', 'Characters Bo speaks, per student per month', 'int', '', [0, 10000000]],
    'ai_listen_monthly'  => ['ai', 'Seconds Bo listens (Firefox), per student per month', 'int', '', [0, 1000000]],
    'revenuecat_secret'  => ['pay', 'RevenueCat secret API key (v1)', 'secret', 'RevenueCat → Project settings → API keys → Secret API keys. Lets the server see each account’s plan.'],
    'revenuecat_v2_key'  => ['pay', 'RevenueCat secret API key (v2)', 'secret', 'Optional, with write access to subscriptions: Cancel plan then cancels website plans right on Mathub.'],
    'revenuecat_project' => ['pay', 'RevenueCat project id', 'text', 'The proj… id in the RevenueCat dashboard’s address. Needed with the v2 key.'],
    'pro_web_link'       => ['pay', 'Mathub Pro web purchase link', 'url', 'RevenueCat → Web → Web Purchase Links (https://pay.rev.cat/…), without a user id.'],
    'max_web_link'       => ['pay', 'Mathub Max web purchase link', 'url', ''],
    'pro_web_price'      => ['pay', 'Mathub Pro price shown on the website', 'price', ''],
    'max_web_price'      => ['pay', 'Mathub Max price shown on the website', 'price', ''],
    'plan_grants'        => ['pay', 'Tester plans', 'grants', 'One per line: someone@montana.edu = pro (or max), for testing. To give a member a membership, use Membership in Members.'],
    'mail_mode'          => ['mail', 'How email is sent', 'select', 'auto: SMTP when the password is set, otherwise PHP mail(). log: nothing is sent (testing).', ['auto', 'smtp', 'mail', 'log']],
    'mail_from'          => ['mail', 'Sender address', 'email', 'A mailbox that exists on your domain.'],
    'mail_from_name'     => ['mail', 'Sender name', 'text', ''],
    'smtp_host'          => ['mail', 'SMTP server', 'host', 'Hostinger: smtp.hostinger.com (hPanel → Emails → Manage → Configuration).'],
    'smtp_port'          => ['mail', 'SMTP port', 'int', '465 = SSL, 587 = STARTTLS.', [1, 65535]],
    'smtp_user'          => ['mail', 'SMTP user name', 'text', 'Usually the sender address.'],
    'smtp_pass'          => ['mail', 'Email password', 'secret', 'The password of the sender’s mailbox.'],
    'allowed_domains'    => ['access', 'Who may sign up (email domains)', 'domains', 'One per line. Subdomains are included (student.montana.edu counts as montana.edu).'],
    'extra_allowed_emails' => ['access', 'Also allowed to sign up', 'emails', 'One email per line, for people outside those domains.'],
    'moderators'         => ['access', 'Moderators', 'emails', 'One email per line. They handle reports, contributions and mock exams.'],
    'admins'             => ['access', 'Administrators', 'emails', 'One email per line. Everything, this page included. Your own address stays on the list.'],
    'site_name'          => ['site', 'Site name', 'text', ''],
    'site_url'           => ['site', 'Site address', 'url', 'Used in emails. Leave empty to use the address people open.'],
    'timezone'           => ['site', 'Time zone', 'tz', 'For reminders, digests and “today”.'],
    'digest_day'         => ['site', 'Weekly digest day', 'select', '', ['0', '1', '2', '3', '4', '5', '6']],
    'digest_hour'        => ['site', 'Weekly digest hour (0–23)', 'int', '', [0, 23]],
    'reminder_hour'      => ['site', 'Evening reminders hour (0–23)', 'int', '', [0, 23]],
    'cron_key'           => ['site', 'Cron key', 'secret', 'Any long random string; the same one goes in the cron job’s address.'],
    'admin_key'          => ['site', 'Stats key', 'secret', 'Optional: lets api/index.php?r=stats answer with an X-Admin-Key header.'],
    'code_ttl_minutes'   => ['site', 'Email codes last (minutes)', 'int', '', [5, 120]],
    'session_days'       => ['site', 'Stay signed in for (days)', 'int', '', [1, 730]],
  ];
}
const MH_SITECONFIG_GROUPS = ['ai' => 'Bo and the AI', 'pay' => 'Plans and payments', 'mail' => 'Email', 'access' => 'Sign-up and staff', 'site' => 'Site'];

function mh_siteconfig_file(array $base): string { return dirname((string)($base['db_path'] ?? (__DIR__ . '/data/mathub.sqlite'))) . '/site-config.json'; }
/** What the admin panel saved, only the fields it may set. */
function mh_siteconfig_saved(array $base): array {
  $f = mh_siteconfig_file($base); if (!is_file($f)) return [];
  $j = json_decode((string)@file_get_contents($f), true); if (!is_array($j)) return [];
  return array_intersect_key($j, mh_siteconfig_fields());
}
/** config.php and config.local.php, without the admin panel (to show where a value comes from). */
function mh_siteconfig_files(): array {
  $cfg = require __DIR__ . '/config.php';
  if (is_file(__DIR__ . '/config.local.php')) { $local = require __DIR__ . '/config.local.php'; if (is_array($local)) $cfg = array_merge($cfg, $local); }
  return $cfg;
}
function mh_siteconfig_write(array $base, array $saved): void {
  $f = mh_siteconfig_file($base); $dir = dirname($f); if (!is_dir($dir)) @mkdir($dir, 0700, true);
  $tmp = $f . '.' . bin2hex(random_bytes(4)) . '.tmp';
  if (@file_put_contents($tmp, json_encode($saved, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE), LOCK_EX) === false) mh_fail('The settings could not be saved: the data folder is not writable.', 500);
  @chmod($tmp, 0600);
  if (!@rename($tmp, $f)) { @unlink($tmp); mh_fail('The settings could not be saved.', 500); }
}

/** A value from the panel, checked and tidied for its type; throws a message for the person. */
function mh_siteconfig_clean(string $key, array $def, $v) {
  $type = $def[2]; $label = $def[1]; $s = is_scalar($v) ? trim((string)$v) : '';
  $lines = fn() => array_values(array_unique(array_filter(array_map(fn($x) => strtolower(trim($x)), preg_split('/[\s,;]+/', is_array($v) ? implode("\n", array_map('strval', $v)) : $s)), fn($x) => $x !== '')));
  switch ($type) {
    case 'secret': if (preg_match('/[\x00-\x1F\x7F]/', $s) || mb_strlen($s) > 600) throw new RuntimeException("$label: that does not look right."); return $s;
    case 'text': if (mb_strlen($s) > 200 || preg_match('/[\x00-\x1F\x7F]/', $s)) throw new RuntimeException("$label: keep it under 200 characters, on one line."); return $s;
    case 'model': if ($s !== '' && !preg_match('/^[A-Za-z0-9._:-]{2,80}$/', $s)) throw new RuntimeException("$label: a model name has letters, numbers, dots and dashes."); return $s;
    case 'price': if (!preg_match('/^.{1,20}$/u', $s)) throw new RuntimeException("$label: like \$15."); return $s;
    case 'url': if ($s !== '' && (!filter_var($s, FILTER_VALIDATE_URL) || !preg_match('#^https://#i', $s))) throw new RuntimeException("$label: an https:// address."); return $s;
    case 'email': if (!filter_var($s, FILTER_VALIDATE_EMAIL)) throw new RuntimeException("$label: an email address."); return strtolower($s);
    case 'host': if (!preg_match('/^[a-z0-9.-]{3,120}$/i', $s)) throw new RuntimeException("$label: a server name, like smtp.hostinger.com."); return strtolower($s);
    case 'int': { if (!preg_match('/^-?\d+$/', $s)) throw new RuntimeException("$label: a whole number."); $n = (int)$s; [$lo, $hi] = $def[4]; if ($n < $lo || $n > $hi) throw new RuntimeException("$label: between $lo and $hi."); return $n; }
    case 'select': { $opts = array_map('strval', $def[4]); if (!in_array($s, $opts, true)) throw new RuntimeException("$label: pick one of the choices."); return in_array($key, ['digest_day'], true) ? (int)$s : $s; }
    case 'tz': if (!in_array($s, timezone_identifiers_list(), true)) throw new RuntimeException("$label: a time zone like America/Denver."); return $s;
    case 'domains': { $out = $lines(); foreach ($out as $d) if (!preg_match('/^(?=.{3,120}$)[a-z0-9-]+(\.[a-z0-9-]+)+$/', $d)) throw new RuntimeException("$label: “$d” is not a domain."); if (!$out) throw new RuntimeException("$label: at least one domain."); return $out; }
    case 'emails': { $out = $lines(); foreach ($out as $e) if (!filter_var($e, FILTER_VALIDATE_EMAIL)) throw new RuntimeException("$label: “$e” is not an email address."); return $out; }
    case 'grants': {
      $out = []; $src = is_array($v) ? $v : [];
      if (!is_array($v)) foreach (preg_split('/\r?\n/', $s) as $ln) { $ln = trim($ln); if ($ln === '') continue; if (!preg_match('/^([^\s=:,]+)\s*[=:,]\s*(pro|max)$/i', $ln, $m)) throw new RuntimeException("$label: write each line as someone@montana.edu = pro (or max)."); $src[$m[1]] = strtolower($m[2]); }
      foreach ($src as $e => $p) { $e = strtolower(trim((string)$e)); $p = strtolower(trim((string)$p)); if (!filter_var($e, FILTER_VALIDATE_EMAIL) || !in_array($p, ['pro', 'max'], true)) throw new RuntimeException("$label: “$e” needs a valid email and pro or max."); $out[$e] = $p; }
      return $out;
    }
  }
  throw new RuntimeException("$label cannot be changed here.");
}
/** How a value is shown in the panel: secrets only as set or not, and their last four characters. */
function mh_siteconfig_view(string $key, array $def, $v): array {
  $type = $def[2];
  if ($type === 'secret') { $s = (string)($v ?? ''); return ['set' => $s !== '', 'hint' => strlen($s) >= 8 ? '…' . substr($s, -4) : ($s !== '' ? 'set' : '')]; }
  if ($type === 'domains' || $type === 'emails') return ['value' => implode("\n", array_map('strval', is_array($v) ? $v : []))];
  if ($type === 'grants') return ['value' => implode("\n", array_map(fn($e, $p) => "$e = $p", array_keys(is_array($v) ? $v : []), array_values(is_array($v) ? $v : [])))];
  return ['value' => is_scalar($v) ? (string)$v : ''];
}

/** A small HTTPS request for the Check buttons: [status, decoded body or null, error]. */
function mh_siteconfig_http(string $method, string $url, array $headers, ?string $body = null): array {
  if (!function_exists('curl_init')) return [0, null, 'PHP has no curl here.'];
  $ch = curl_init($url); $o = [CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 20, CURLOPT_CONNECTTIMEOUT => 8, CURLOPT_HTTPHEADER => $headers];
  if ($method === 'POST') { $o[CURLOPT_POST] = true; $o[CURLOPT_POSTFIELDS] = $body ?? ''; }
  curl_setopt_array($ch, $o); $raw = curl_exec($ch); $code = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE); $err = curl_error($ch); curl_close($ch);
  return [$code, is_string($raw) ? json_decode($raw, true) : null, $raw === false ? ($err ?: 'no answer') : ''];
}
/** What a provider said went wrong, short. */
function mh_siteconfig_why(int $code, $j, string $err): string {
  if ($code === 0) return 'Could not reach it' . ($err ? ": $err" : '') . '.';
  $m = is_array($j) ? (string)($j['error']['message'] ?? $j['message'] ?? ($j['error'] ?? '')) : '';
  if ($code === 401 || $code === 403) return 'The key was refused (' . $code . ')' . ($m !== '' && is_string($m) ? ': ' . mb_substr($m, 0, 140) : '') . '.';
  return 'It answered ' . $code . ($m !== '' && is_string($m) ? ': ' . mb_substr($m, 0, 140) : '') . '.';
}

function mh_siteconfig_route(string $route, array $in, array $cfg, string $ip): void {
  $u = mh_require_user(); if (!mh_is_admin($u)) mh_fail('Administrators only.', 403);
  $db = mh_db(); $now = time();
  $db->exec('CREATE TABLE IF NOT EXISTS config_log (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER REFERENCES users(id) ON DELETE CASCADE, key TEXT NOT NULL, action TEXT NOT NULL DEFAULT "set", at INTEGER NOT NULL)');
  $F = mh_siteconfig_fields(); $files = mh_siteconfig_files(); $saved = mh_siteconfig_saved($files);
  switch ($route) {
    case 'admin_config': {
      mh_method('GET');
      $groups = [];
      foreach (MH_SITECONFIG_GROUPS as $g => $title) $groups[$g] = ['id' => $g, 'title' => $title, 'fields' => []];
      foreach ($F as $k => $def) {
        $has = array_key_exists($k, $saved); $v = $has ? $saved[$k] : ($files[$k] ?? null);
        $fromFile = !$has && isset($files[$k]) && $files[$k] !== '' && $files[$k] !== [];
        $groups[$def[0]]['fields'][] = ['key' => $k, 'label' => $def[1], 'type' => $def[2], 'help' => $def[3], 'options' => $def[2] === 'select' ? array_map('strval', $def[4]) : null, 'range' => $def[2] === 'int' ? $def[4] : null, 'from' => $has ? 'panel' : ($fromFile ? 'file' : 'none')] + mh_siteconfig_view($k, $def, $v);
      }
      $log = $db->query('SELECT l.key, l.action, l.at, u.email FROM config_log l LEFT JOIN users u ON u.id = l.user_id ORDER BY l.id DESC LIMIT 25')->fetchAll();
      mh_json(['ok' => true, 'groups' => array_values($groups), 'me' => $u['email'], 'writable' => is_writable(dirname(mh_siteconfig_file($files))), 'log' => array_map(fn($r) => ['key' => $r['key'], 'label' => $F[$r['key']][1] ?? $r['key'], 'action' => $r['action'], 'at' => (int)$r['at'], 'by' => (string)($r['email'] ?? '')], $log)]);
    }
    case 'admin_config_save': {
      mh_method('POST');
      mh_rate_or_fail("config_save:{$u['id']}", 40, 900, 'Too many saves at once. Wait a few minutes.');
      $full = $db->prepare('SELECT * FROM users WHERE id = ?'); $full->execute([$u['id']]); $me = $full->fetch();
      if (!mh_password_check($me ?: null, (string)($in['password'] ?? ''))) { mh_rate_or_fail("config_badpass:{$u['id']}", 6, 900, 'Too many wrong passwords. Wait a few minutes.'); mh_fail('That is not your password. Saving keys and settings needs your Mathub password.', 401, ['field' => 'password']); }
      $values = is_array($in['values'] ?? null) ? $in['values'] : []; $clear = is_array($in['clear'] ?? null) ? array_values(array_filter($in['clear'], 'is_string')) : [];
      $next = $saved; $changed = [];
      foreach ($values as $k => $v) {
        $k = (string)$k; if (!isset($F[$k])) mh_fail('Unknown setting: ' . $k, 400);
        if ($F[$k][2] === 'secret' && trim((string)(is_scalar($v) ? $v : '')) === '') continue;   // an empty box keeps the key that is there
        try { $clean = mh_siteconfig_clean($k, $F[$k], $v); } catch (RuntimeException $e) { mh_fail($e->getMessage(), 400, ['field' => $k]); }
        if (!array_key_exists($k, $next) || $next[$k] !== $clean) { $next[$k] = $clean; $changed[$k] = 'set'; }
      }
      foreach ($clear as $k) { if (!isset($F[$k])) continue; if (array_key_exists($k, $next)) { unset($next[$k]); $changed[$k] = 'cleared'; } }
      // never lock yourself out: the administrators that will apply must still include you
      $admins = array_map('strtolower', (array)(array_key_exists('admins', $next) ? $next['admins'] : ($files['admins'] ?? [])));
      if (!in_array(strtolower($u['email']), $admins, true)) mh_fail('Keep your own address in Administrators, or you would lose this page.', 400, ['field' => 'admins']);
      if ($changed) {
        mh_siteconfig_write($files, $next);
        $ins = $db->prepare('INSERT INTO config_log (user_id, key, action, at) VALUES (?, ?, ?, ?)'); foreach ($changed as $k => $a) $ins->execute([$u['id'], $k, $a, $now]);
        $db->exec('DELETE FROM config_log WHERE id NOT IN (SELECT id FROM config_log ORDER BY id DESC LIMIT 500)');
      }
      mh_json(['ok' => true, 'changed' => array_keys($changed)]);
    }
    case 'admin_config_test': {
      mh_method('POST'); mh_rate_or_fail("config_test:{$u['id']}", 30, 3600, 'Too many checks. Wait a little.');
      $what = (string)($in['what'] ?? ''); $c = array_merge($files, $saved);
      if ($what === 'mail') {
        require_once __DIR__ . '/mailer.php';
        $site = (string)($c['site_name'] ?? 'Mathub');
        $r = mh_send_mail($c, $u['email'], "$site test email", "This is a test email from the $site admin panel. If you got it, email works.", '<p>This is a test email from the ' . htmlspecialchars($site) . ' admin panel.</p><p>If you got it, email works.</p>');
        if (!$r['ok']) mh_json(['ok' => true, 'pass' => false, 'message' => 'Sending failed: ' . ($r['error'] ?? 'unknown error')]);
        mh_json(['ok' => true, 'pass' => true, 'message' => (mh_mail_mode($c) === 'log' ? 'Written to the mail log (mail_mode is log), not sent.' : 'Sent to ' . $u['email'] . '. Check the inbox (and spam).')]);
      }
      if ($what === 'ai') {
        $out = [];
        $ak = trim((string)($c['anthropic_key'] ?? ''));
        if ($ak === '') $out[] = ['name' => 'Anthropic', 'pass' => false, 'message' => 'No key set.'];
        else {
          [$code, $j, $err] = mh_siteconfig_http('POST', (string)($c['anthropic_api'] ?? 'https://api.anthropic.com/v1/messages'), ['x-api-key: ' . $ak, 'anthropic-version: 2023-06-01', 'content-type: application/json'], json_encode(['model' => (string)($c['ai_model_tutor'] ?? 'claude-haiku-5-5'), 'max_tokens' => 1, 'messages' => [['role' => 'user', 'content' => 'Hi']]]));
          $out[] = ['name' => 'Anthropic', 'pass' => $code >= 200 && $code < 300, 'message' => $code >= 200 && $code < 300 ? 'The key works with ' . (string)($c['ai_model_tutor'] ?? '') . '.' : mh_siteconfig_why($code, $j, $err)];
        }
        $ok = trim((string)($c['openai_key'] ?? ''));
        if ($ok === '') $out[] = ['name' => 'OpenAI', 'pass' => false, 'message' => 'No key set (calls use basic voice).'];
        else { [$code, $j, $err] = mh_siteconfig_http('GET', rtrim((string)($c['openai_api'] ?? 'https://api.openai.com/v1'), '/') . '/models', ['Authorization: Bearer ' . $ok]); $out[] = ['name' => 'OpenAI', 'pass' => $code >= 200 && $code < 300, 'message' => $code >= 200 && $code < 300 ? 'The key works.' : mh_siteconfig_why($code, $j, $err)]; }
        mh_json(['ok' => true, 'pass' => !in_array(false, array_column($out, 'pass'), true), 'results' => $out]);
      }
      if ($what === 'pay') {
        $out = []; $me = 'mh_' . $u['id'];
        $sk = trim((string)($c['revenuecat_secret'] ?? ''));
        if ($sk === '') $out[] = ['name' => 'RevenueCat (v1)', 'pass' => false, 'message' => 'No secret key set.'];
        else { [$code, $j, $err] = mh_siteconfig_http('GET', (string)($c['revenuecat_api'] ?? 'https://api.revenuecat.com/v1/subscribers/') . rawurlencode($me), ['Authorization: Bearer ' . $sk, 'Accept: application/json']); $out[] = ['name' => 'RevenueCat (v1)', 'pass' => $code >= 200 && $code < 300, 'message' => $code >= 200 && $code < 300 ? 'The key works.' : mh_siteconfig_why($code, $j, $err)]; }
        $v2 = trim((string)($c['revenuecat_v2_key'] ?? '')); $proj = trim((string)($c['revenuecat_project'] ?? ''));
        if ($v2 !== '' || $proj !== '') {
          if ($v2 === '' || $proj === '') $out[] = ['name' => 'RevenueCat (v2)', 'pass' => false, 'message' => 'Set both the v2 key and the project id.'];
          else { [$code, $j, $err] = mh_siteconfig_http('GET', rtrim((string)($c['revenuecat_v2_api'] ?? 'https://api.revenuecat.com/v2'), '/') . '/projects/' . rawurlencode($proj) . '/customers/' . rawurlencode($me) . '/subscriptions', ['Authorization: Bearer ' . $v2, 'Accept: application/json']); $good = ($code >= 200 && $code < 300) || $code === 404; $out[] = ['name' => 'RevenueCat (v2)', 'pass' => $good, 'message' => $good ? 'The key and project work.' : mh_siteconfig_why($code, $j, $err)]; }
        }
        foreach (['pro_web_link' => 'Pro', 'max_web_link' => 'Max'] as $k => $n) if (trim((string)($c[$k] ?? '')) === '') $out[] = ['name' => "$n link", 'pass' => false, 'message' => 'Not set, so the website cannot sell it.'];
        mh_json(['ok' => true, 'pass' => !in_array(false, array_column($out, 'pass'), true), 'results' => $out]);
      }
      mh_fail('Nothing to check.', 400);
    }
  }
  mh_fail('Not found.', 404);
}
