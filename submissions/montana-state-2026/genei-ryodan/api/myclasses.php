<?php
/* ============================================================
   Mathub account server — classes students make, sharing them, and the Pro and Max plans
   Routes: myclasses, myclass, myclass_save, myclass_delete, myclass_share, myclass_unshare,
           shared_class (public, by share code), create_status, plan_cancel, admin_plan (administrators)
   - A student's own classes (made from a syllabus or a class file) are kept with their account, so they
     open on the website and on every phone they sign in on. The app keeps its own copy in files on the
     device and syncs; the website keeps a copy in the browser.
   - Share codes: the owner can turn on a link (mathub.space/#/c/CODE) that lets anyone open the class
     and add a copy; turning it off makes the link stop working at once.
   - The plans: Mathub Pro (classes Bo writes from a syllabus, api/ai.php, and making classes) and Mathub Max
     (Pro, plus Bo the AI tutor). App purchases (App Store, Google Play) and web purchases (RevenueCat web
     checkout) belong to the RevenueCat customer "mh_<user id>", with the entitlements "pro" and "max" (a Max
     product unlocks both). The server asks RevenueCat with the secret key in config.local.php and keeps the
     answer for ten minutes. Accounts in plan_grants (config.local.php or Keys & settings) get a plan without
     paying, for testing.
   - Given memberships (admin_plan, from Members in the admin panel): an administrator gives anyone Pro or Max,
     with no end or until a day they pick, and can take it back. Kept in plan_gifts by email (so it also waits for
     an account made later), with who gave it and an optional note only administrators see. The member is told in
     their inbox if the administrator wants. It never charges anything and does not touch a plan they pay for.
   - Cancelling (plan_cancel, from the Your plan page): an App Store or Google Play plan is cancelled in the store,
     so the page sends the student there. A plan bought on the website is cancelled right here when RevenueCat's
     API v2 is set up (revenuecat_v2_key with write access to subscriptions, and revenuecat_project); otherwise, or
     if that fails, the page opens RevenueCat's customer portal for it (the plan's management_url). Either way the
     plan runs to the end of the month paid for. A reason, if the student gives one, is kept in plan_feedback.
   Rows are removed with the account (ON DELETE CASCADE); housekeeping clears any left behind, and given memberships
   of accounts that are gone (or that ended three months ago).
   ============================================================ */

const MH_MYCLASS_MAX = 40;            // classes per account
const MH_MYCLASS_BYTES = 3000000;     // per class, the same limit as the app
const MH_SHARE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

function mh_myclass_db(): PDO {
  static $ready = false; $db = mh_db();
  if (!$ready) {
    $db->exec('CREATE TABLE IF NOT EXISTS my_classes (user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, cid TEXT NOT NULL, code TEXT NOT NULL DEFAULT "", name TEXT NOT NULL DEFAULT "", term TEXT NOT NULL DEFAULT "", pack TEXT NOT NULL, bytes INTEGER NOT NULL DEFAULT 0, free INTEGER NOT NULL DEFAULT 0, share TEXT UNIQUE, created INTEGER NOT NULL, updated INTEGER NOT NULL, PRIMARY KEY (user_id, cid))');
    $db->exec('CREATE TABLE IF NOT EXISTS create_status (user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE, active INTEGER NOT NULL DEFAULT 0, expires INTEGER NOT NULL DEFAULT 0, store TEXT NOT NULL DEFAULT "", manage TEXT NOT NULL DEFAULT "", renews INTEGER NOT NULL DEFAULT 1, checked INTEGER NOT NULL)');
    $cols = array_column($db->query('PRAGMA table_info(create_status)')->fetchAll(), 'name');
    if (!in_array('renews', $cols, true)) $db->exec('ALTER TABLE create_status ADD COLUMN renews INTEGER NOT NULL DEFAULT 1');
    if (!in_array('tier', $cols, true)) $db->exec("ALTER TABLE create_status ADD COLUMN tier TEXT NOT NULL DEFAULT ''");
    $db->exec("CREATE TABLE IF NOT EXISTS plan_feedback (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, plan TEXT NOT NULL DEFAULT '', store TEXT NOT NULL DEFAULT '', reason TEXT NOT NULL DEFAULT '', note TEXT NOT NULL DEFAULT '', at INTEGER NOT NULL)");
    $db->exec("CREATE TABLE IF NOT EXISTS plan_gifts (email TEXT PRIMARY KEY, plan TEXT NOT NULL, until INTEGER NOT NULL DEFAULT 0, note TEXT NOT NULL DEFAULT '', by_id INTEGER, created INTEGER NOT NULL)");
    $ready = true;
  }
  return $db;
}

/** Rows whose account is gone (the cascade normally removes them; this covers databases from before foreign keys were on). */
function mh_myclass_prune(): int {
  $db = mh_myclass_db();
  $n = $db->exec('DELETE FROM my_classes WHERE user_id NOT IN (SELECT id FROM users)');
  $db->exec('DELETE FROM create_status WHERE user_id NOT IN (SELECT id FROM users)');
  $db->exec('DELETE FROM plan_feedback WHERE user_id NOT IN (SELECT id FROM users)');
  $db->exec('DELETE FROM plan_gifts WHERE email NOT IN (SELECT lower(email) FROM users) OR (until > 0 AND until < ' . (time() - 90 * 86400) . ')');   // given to an account that is gone, or ended three months ago
  return (int)$n;
}

function mh_myclass_id($v): string { $c = is_string($v) ? $v : ''; if (!preg_match('/^my\d{4,6}$/', $c)) mh_fail('Unknown class.', 400); return $c; }
function mh_myclass_row(array $r): array {
  return ['id' => $r['cid'], 'code' => $r['code'], 'name' => $r['name'], 'term' => $r['term'], 'bytes' => (int)$r['bytes'], 'free' => (bool)$r['free'], 'share' => $r['share'] ?: null, 'created' => (int)$r['created'], 'updated' => (int)$r['updated']];
}
function mh_share_code(PDO $db): string {
  for ($i = 0; $i < 20; $i++) {
    $c = ''; for ($k = 0; $k < 8; $k++) $c .= MH_SHARE_ALPHABET[random_int(0, strlen(MH_SHARE_ALPHABET) - 1)];
    $st = $db->prepare('SELECT 1 FROM my_classes WHERE share = ?'); $st->execute([$c]); if (!$st->fetchColumn()) return $c;
  }
  mh_fail('Could not make a share link. Try again.', 500);
}

/** RevenueCat's view of one customer, or null when it cannot be reached. */
function mh_rc_subscriber(array $cfg, string $appUserId): ?array {
  $base = (string)($cfg['revenuecat_api'] ?? 'https://api.revenuecat.com/v1/subscribers/');
  $url = $base . rawurlencode($appUserId); $secret = (string)($cfg['revenuecat_secret'] ?? '');
  $headers = ['Authorization: Bearer ' . $secret, 'Accept: application/json', 'Content-Type: application/json'];
  if (function_exists('curl_init')) {
    $ch = curl_init($url); curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 10, CURLOPT_CONNECTTIMEOUT => 5, CURLOPT_HTTPHEADER => $headers]);
    $body = curl_exec($ch); $code = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE); curl_close($ch);
    if ($body === false || $code < 200 || $code >= 300) return null;
  } else {
    $ctx = stream_context_create(['http' => ['timeout' => 10, 'header' => implode("\r\n", $headers), 'ignore_errors' => true]]);
    $body = @file_get_contents($url, false, $ctx); if ($body === false) return null;
    $status = isset($http_response_header[0]) && preg_match('/\s(\d{3})\s/', $http_response_header[0], $m) ? (int)$m[1] : 0; if ($status < 200 || $status >= 300) return null;
  }
  $j = json_decode((string)$body, true); return is_array($j) && isset($j['subscriber']) && is_array($j['subscriber']) ? $j['subscriber'] : null;
}

/** The plan of one account, from RevenueCat: asks at most every ten minutes, or when $refresh (120 times an hour at most), and remembers the answer. */
function mh_create_status(array $u, array $cfg, bool $refresh = false): array {
  $db = mh_myclass_db(); $now = time(); $uid = 'mh_' . $u['id'];
  $st = $db->prepare('SELECT * FROM create_status WHERE user_id = ?'); $st->execute([$u['id']]); $row = $st->fetch() ?: null;
  $secret = trim((string)($cfg['revenuecat_secret'] ?? ''));
  $stale = !$row || (int)$row['checked'] < $now - 600 || $refresh;
  if ($secret !== '' && $stale && ($row === null || mh_rate("create_status:{$u['id']}", 120, 3600))) {
    $sub = mh_rc_subscriber($cfg, $uid);
    if ($sub !== null) {
      $tier = ''; $exp = 0; $store = ''; $renews = false;
      foreach (['max' => (string)($cfg['max_entitlement'] ?? 'max'), 'pro' => (string)($cfg['pro_entitlement'] ?? 'pro')] as $name => $key) {
        $ent = $sub['entitlements'][$key] ?? null; if (!is_array($ent)) continue;
        $e = !empty($ent['expires_date']) ? (int)strtotime((string)$ent['expires_date']) : 0;
        $grace = !empty($ent['grace_period_expires_date']) ? (int)strtotime((string)$ent['grace_period_expires_date']) : 0;
        if (!($e === 0 || max($e, $grace) > $now)) continue;
        $tier = $name; $exp = $e === 0 ? 0 : max($e, $grace);
        $prod = (string)($ent['product_identifier'] ?? ''); $ps = $sub['subscriptions'][$prod] ?? []; $store = (string)($ps['store'] ?? '');
        $renews = empty($ps['unsubscribe_detected_at']) && empty($ps['billing_issues_detected_at']);
        break;
      }
      $db->prepare('INSERT INTO create_status (user_id, active, tier, expires, store, manage, renews, checked) VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET active = excluded.active, tier = excluded.tier, expires = excluded.expires, store = excluded.store, manage = excluded.manage, renews = excluded.renews, checked = excluded.checked')
        ->execute([$u['id'], $tier !== '' ? 1 : 0, $tier, $exp, mb_substr($store, 0, 40), mb_substr((string)($sub['management_url'] ?? ''), 0, 400), $renews ? 1 : 0, $now]);
      $st->execute([$u['id']]); $row = $st->fetch() ?: null;
    }
  }
  $active = $row && (int)$row['active'] === 1 && ((int)$row['expires'] === 0 || (int)$row['expires'] > $now);
  $plan = $active ? ((string)($row['tier'] ?? '') ?: 'pro') : '';
  return ['active' => $active, 'plan' => $plan, 'until' => $row && (int)$row['expires'] ? gmdate('c', (int)$row['expires']) : null, 'store' => $row['store'] ?? '', 'manage_url' => $row['manage'] ?? '', 'renews' => $row ? (int)$row['renews'] === 1 : false, 'checked' => $row ? (int)$row['checked'] : 0];
}

/** Cancels the account's website plan through RevenueCat's API v2, so it does not renew (it runs to the end of the
    month paid for). Needs revenuecat_v2_key and revenuecat_project; true only when RevenueCat confirmed it. */
function mh_rc_cancel_web(array $cfg, string $customer): bool {
  $key = trim((string)($cfg['revenuecat_v2_key'] ?? '')); $proj = trim((string)($cfg['revenuecat_project'] ?? ''));
  if ($key === '' || $proj === '' || !function_exists('curl_init')) return false;
  $base = rtrim((string)($cfg['revenuecat_v2_api'] ?? 'https://api.revenuecat.com/v2'), '/') . '/projects/' . rawurlencode($proj);
  $req = function (string $method, string $url) use ($key): array {
    $ch = curl_init($url); $o = [CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 15, CURLOPT_CONNECTTIMEOUT => 5, CURLOPT_HTTPHEADER => ['Authorization: Bearer ' . $key, 'Accept: application/json', 'Content-Type: application/json']];
    if ($method === 'POST') { $o[CURLOPT_POST] = true; $o[CURLOPT_POSTFIELDS] = '{}'; }
    curl_setopt_array($ch, $o); $b = curl_exec($ch); $c = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE); curl_close($ch);
    return [$c, is_string($b) ? (json_decode($b, true) ?: []) : []];
  };
  [$c, $j] = $req('GET', $base . '/customers/' . rawurlencode($customer) . '/subscriptions');
  if ($c < 200 || $c >= 300) return false;
  $done = false;
  foreach ((array)($j['items'] ?? []) as $sub) {
    if (!is_array($sub) || ($sub['store'] ?? '') !== 'rc_billing' || !in_array($sub['status'] ?? '', ['active', 'trialing', 'in_grace_period'], true)) continue;
    if (($sub['auto_renewal_status'] ?? '') === 'will_not_renew') { $done = true; continue; }
    [$c2] = $req('POST', $base . '/subscriptions/' . rawurlencode((string)($sub['id'] ?? '')) . '/actions/cancel');
    if ($c2 >= 200 && $c2 < 300) $done = true;
  }
  return $done;
}

const MH_PLAN_RANK = ['' => 0, 'pro' => 1, 'max' => 2];

/** A membership an administrator gave this address and that has not ended, or null. */
function mh_plan_gift(string $email): ?array {
  $st = mh_myclass_db()->prepare('SELECT * FROM plan_gifts WHERE email = ? AND (until = 0 OR until > ?)'); $st->execute([strtolower(trim($email)), time()]);
  $g = $st->fetch(); return $g && isset(MH_PLAN_RANK[$g['plan']]) && $g['plan'] !== '' ? $g : null;
}
/** Gives an address Pro or Max (until a time, 0 = no end), or takes it back ($plan ''). */
function mh_plan_gift_set(string $email, string $plan, int $until, string $note, int $by): void {
  $db = mh_myclass_db(); $email = strtolower(trim($email));
  if ($plan === '') { $db->prepare('DELETE FROM plan_gifts WHERE email = ?')->execute([$email]); return; }
  $db->prepare('INSERT INTO plan_gifts (email, plan, until, note, by_id, created) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(email) DO UPDATE SET plan = excluded.plan, until = excluded.until, note = excluded.note, by_id = excluded.by_id, created = excluded.created')
    ->execute([$email, $plan, $until, mb_substr($note, 0, 120), $by ?: null, time()]);
}
/** The tester plan for an address in plan_grants (config.local.php or Keys & settings): 'pro', 'max' or ''. */
function mh_plan_tester(string $email, array $cfg): string {
  $g = is_array($cfg['plan_grants'] ?? null) ? $cfg['plan_grants'] : []; $email = strtolower($email);
  foreach ($g as $k => $v) if (strtolower((string)$k) === $email && in_array($v, ['pro', 'max'], true)) return $v;
  return '';
}
/** The plan given to an account without paying, the higher of a given membership and a tester plan:
    ['plan' => 'max'|'pro'|'', 'until' => end time or 0, 'from' => 'gift'|'tester'|'']. */
function mh_plan_given(array $u, array $cfg): array {
  $email = strtolower((string)($u['email'] ?? '')); $out = ['plan' => '', 'until' => 0, 'from' => ''];
  if ($email === '') return $out;
  $t = mh_plan_tester($email, $cfg); if ($t !== '') $out = ['plan' => $t, 'until' => 0, 'from' => 'tester'];
  $g = mh_plan_gift($email); if ($g && MH_PLAN_RANK[$g['plan']] > MH_PLAN_RANK[$out['plan']]) $out = ['plan' => $g['plan'], 'until' => (int)$g['until'], 'from' => 'gift'];
  return $out;
}
/** 'max', 'pro' or '': the plan given to this account (by an administrator, or for testing). */
function mh_plan_grant(array $u, array $cfg): string { return mh_plan_given($u, $cfg)['plan']; }
/** What each member has, for Members in the admin panel, keyed by user id. Uses the last answer kept from
    RevenueCat (no new calls): the plan paid for, a membership given by an administrator, a tester plan, and the
    plan that counts (the highest). */
function mh_plan_admin_rows(array $users, array $cfg): array {
  if (!$users) return [];
  $db = mh_myclass_db(); $now = time(); $ids = array_map(fn($r) => (int)$r['id'], $users); $emails = array_map(fn($r) => strtolower((string)$r['email']), $users);
  $paid = []; $st = $db->prepare('SELECT user_id, tier, expires, store, renews FROM create_status WHERE active = 1 AND (expires = 0 OR expires > ?) AND user_id IN (' . implode(',', array_fill(0, count($ids), '?')) . ')');
  $st->execute(array_merge([$now], $ids)); foreach ($st->fetchAll() as $r) $paid[(int)$r['user_id']] = $r;
  $gifts = []; $st = $db->prepare('SELECT g.*, u.name AS by_name, u.email AS by_email FROM plan_gifts g LEFT JOIN users u ON u.id = g.by_id WHERE (g.until = 0 OR g.until > ?) AND g.email IN (' . implode(',', array_fill(0, count($emails), '?')) . ')');
  $st->execute(array_merge([$now], $emails)); foreach ($st->fetchAll() as $r) $gifts[$r['email']] = $r;
  $out = [];
  foreach ($users as $r) {
    $id = (int)$r['id']; $e = strtolower((string)$r['email']); $p = $paid[$id] ?? null; $g = $gifts[$e] ?? null;
    $v = ['paid' => $p ? ['plan' => ((string)$p['tier'] ?: 'pro'), 'until' => (int)$p['expires'], 'store' => (string)$p['store'], 'renews' => (int)$p['renews'] === 1] : null,
          'gift' => $g ? ['plan' => (string)$g['plan'], 'until' => (int)$g['until'], 'note' => (string)$g['note'], 'by' => (string)($g['by_name'] ?: explode('@', (string)$g['by_email'])[0]), 'at' => (int)$g['created']] : null,
          'tester' => mh_plan_tester($e, $cfg)];
    $plan = ''; foreach ([$v['paid']['plan'] ?? '', $v['gift']['plan'] ?? '', $v['tester']] as $c) if ((MH_PLAN_RANK[$c] ?? 0) > MH_PLAN_RANK[$plan]) $plan = $c;
    $out[$id] = ['plan' => $plan] + $v;
  }
  return $out;
}
/** The ids of members with Pro or Max now (paid, given or tester), for the "Pro or Max" filter in Members. */
function mh_plan_member_ids(array $cfg): array {
  $db = mh_myclass_db(); $now = time();
  $st = $db->prepare('SELECT user_id FROM create_status WHERE active = 1 AND (expires = 0 OR expires > ?) UNION SELECT u.id FROM users u JOIN plan_gifts g ON g.email = lower(u.email) WHERE g.until = 0 OR g.until > ?');
  $st->execute([$now, $now]); $ids = array_map('intval', $st->fetchAll(PDO::FETCH_COLUMN));
  $t = array_keys(array_filter(is_array($cfg['plan_grants'] ?? null) ? $cfg['plan_grants'] : [], fn($v) => in_array($v, ['pro', 'max'], true)));
  if ($t) { $st = $db->prepare('SELECT id FROM users WHERE lower(email) IN (' . implode(',', array_fill(0, count($t), '?')) . ')'); $st->execute(array_map(fn($e) => strtolower((string)$e), $t)); $ids = array_merge($ids, array_map('intval', $st->fetchAll(PDO::FETCH_COLUMN))); }
  return array_values(array_unique($ids));
}
/** 'max', 'pro' or '' for one account: a grant, or what RevenueCat says. */
function mh_plan(array $u, array $cfg, bool $refresh = false): string {
  $g = mh_plan_grant($u, $cfg); if ($g === 'max') return 'max';
  $p = mh_create_status($u, $cfg, $refresh)['plan']; return $p === 'max' ? 'max' : ($g ?: $p);
}

function mh_myclass_route(string $route, array $in, array $cfg, string $ip): void {
  $db = mh_myclass_db(); $now = time();
  switch ($route) {
    case 'myclasses': {
      mh_method('GET'); $u = mh_require_user();
      $st = $db->prepare('SELECT cid, code, name, term, bytes, free, share, created, updated FROM my_classes WHERE user_id = ? ORDER BY created'); $st->execute([$u['id']]);
      mh_json(['ok' => true, 'classes' => array_map('mh_myclass_row', $st->fetchAll()), 'max' => MH_MYCLASS_MAX]);
    }
    case 'myclass': {
      mh_method('GET'); $u = mh_require_user(); $cid = mh_myclass_id($_GET['id'] ?? '');
      $st = $db->prepare('SELECT * FROM my_classes WHERE user_id = ? AND cid = ?'); $st->execute([$u['id'], $cid]); $r = $st->fetch();
      if (!$r) mh_fail('This class is not in your account.', 404);
      mh_json(['ok' => true, 'class' => mh_myclass_row($r), 'pack' => json_decode((string)$r['pack'], true)]);
    }
    case 'myclass_save': {
      mh_method('POST'); $u = mh_require_user(); mh_rate_or_fail("myclass_save:{$u['id']}", 120, 3600);
      $cid = mh_myclass_id($in['id'] ?? ''); $pack = $in['pack'] ?? null;
      if (!is_array($pack) || ($pack['format'] ?? '') !== 'mathub-class-pack' || ($pack['id'] ?? '') !== $cid) mh_fail('That is not a Mathub class.', 400);
      $code = trim((string)($pack['code'] ?? '')); $name = trim((string)($pack['name'] ?? ''));
      if ($code === '' || $name === '' || mb_strlen($code) > 40 || mb_strlen($name) > 200) mh_fail('The class needs a course code and a name.', 400);
      $json = json_encode($pack, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES); $bytes = strlen((string)$json);
      if ($json === false || $bytes > MH_MYCLASS_BYTES) mh_fail('This class is too large to save (the limit is 3 MB).', 413);
      $st = $db->prepare('SELECT free, created FROM my_classes WHERE user_id = ? AND cid = ?'); $st->execute([$u['id'], $cid]); $old = $st->fetch();
      if (!$old) { $n = $db->prepare('SELECT COUNT(*) FROM my_classes WHERE user_id = ?'); $n->execute([$u['id']]); if ((int)$n->fetchColumn() >= MH_MYCLASS_MAX) mh_fail('Your account already has ' . MH_MYCLASS_MAX . ' classes. Delete one to add another.', 409); }
      $free = !empty($in['free']) || ($old && (int)$old['free'] === 1) ? 1 : 0;
      $db->prepare('INSERT INTO my_classes (user_id, cid, code, name, term, pack, bytes, free, created, updated) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(user_id, cid) DO UPDATE SET code = excluded.code, name = excluded.name, term = excluded.term, pack = excluded.pack, bytes = excluded.bytes, free = excluded.free, updated = excluded.updated')
        ->execute([$u['id'], $cid, mb_substr($code, 0, 40), mb_substr($name, 0, 200), mb_substr(trim((string)($pack['term'] ?? '')), 0, 60), $json, $bytes, $free, $old ? (int)$old['created'] : $now, $now]);
      mh_json(['ok' => true, 'updated' => $now, 'free' => (bool)$free]);
    }
    case 'myclass_delete': {
      mh_method('POST'); $u = mh_require_user(); $cid = mh_myclass_id($in['id'] ?? '');
      $db->prepare('DELETE FROM my_classes WHERE user_id = ? AND cid = ?')->execute([$u['id'], $cid]);
      mh_json(['ok' => true]);
    }
    case 'myclass_share': {
      mh_method('POST'); $u = mh_require_user(); $cid = mh_myclass_id($in['id'] ?? ''); mh_rate_or_fail("myclass_share:{$u['id']}", 60, 3600);
      $st = $db->prepare('SELECT share FROM my_classes WHERE user_id = ? AND cid = ?'); $st->execute([$u['id'], $cid]); $r = $st->fetch();
      if (!$r) mh_fail('Save this class to your account first.', 404);
      $code = $r['share'] ?: mh_share_code($db);
      if (!$r['share']) $db->prepare('UPDATE my_classes SET share = ? WHERE user_id = ? AND cid = ?')->execute([$code, $u['id'], $cid]);
      mh_json(['ok' => true, 'code' => $code]);
    }
    case 'myclass_unshare': {
      mh_method('POST'); $u = mh_require_user(); $cid = mh_myclass_id($in['id'] ?? '');
      $db->prepare('UPDATE my_classes SET share = NULL WHERE user_id = ? AND cid = ?')->execute([$u['id'], $cid]);
      mh_json(['ok' => true]);
    }
    case 'admin_unshare': {   // a moderator stops a reported shared class (the class stays with its owner)
      mh_method('POST'); $u = mh_require_user(); if (!mh_is_mod($u)) mh_fail('Moderators only.', 403);
      $code = strtoupper(preg_replace('/[^A-Za-z0-9]/', '', (string)($in['code'] ?? '')));
      $st = $db->prepare('UPDATE my_classes SET share = NULL WHERE share = ?'); $st->execute([$code]);
      mh_json(['ok' => true, 'stopped' => $st->rowCount()]);
    }
    case 'shared_class': {
      mh_method('GET'); mh_rate_or_fail("shared_class:$ip", 120, 3600);
      $code = strtoupper(preg_replace('/[^A-Za-z0-9]/', '', (string)($_GET['code'] ?? '')));
      if (strlen($code) !== 8) mh_fail('That share code is not right. It has 8 letters and numbers.', 400);
      $st = $db->prepare('SELECT pack, code, name, term, updated FROM my_classes WHERE share = ?'); $st->execute([$code]); $r = $st->fetch();
      if (!$r) mh_fail('This class is not shared any more, or the code is wrong.', 404);
      $pack = json_decode((string)$r['pack'], true); if (!is_array($pack)) mh_fail('This class could not be read.', 500);
      mh_json(['ok' => true, 'code' => $code, 'pack' => $pack, 'updated' => (int)$r['updated']]);
    }
    case 'create_status': {   // the plan of the account signed in, and the web checkout for each plan
      mh_method('GET'); $u = mh_current_user();
      $links = ['pro' => trim((string)($cfg['pro_web_link'] ?? '')), 'max' => trim((string)($cfg['max_web_link'] ?? ''))]; $secret = trim((string)($cfg['revenuecat_secret'] ?? ''));
      $out = ['ok' => true, 'configured' => $secret !== '' && $links['pro'] !== '' && $links['max'] !== '', 'prices' => ['pro' => (string)($cfg['pro_web_price'] ?? '$15'), 'max' => (string)($cfg['max_web_price'] ?? '$50')], 'signed_in' => (bool)$u];
      if (!$u) mh_json($out + ['active' => false, 'plan' => '']);
      $s = mh_create_status($u, $cfg, !empty($_GET['refresh']));
      $given = mh_plan_given($u, $cfg); $grant = $given['plan'];
      if ($grant && MH_PLAN_RANK[$grant] > MH_PLAN_RANK[$s['active'] ? $s['plan'] : '']) {   // given: it never charges; a smaller plan they also pay for stays theirs to manage
        if ($s['active']) { $s['paid'] = $s['plan']; $s['paid_renews'] = $s['renews']; }
        $s['plan'] = $grant; $s['active'] = true; $s['granted'] = true; $s['until'] = $given['until'] ? gmdate('c', $given['until']) : null; $s['renews'] = false;
      }
      $out['customer'] = 'mh_' . $u['id'];
      $out['buy'] = array_map(fn($l) => $l !== '' ? rtrim($l, '/') . '/' . rawurlencode($out['customer']) : '', $links);
      mh_json($out + $s);
    }
    case 'plan_cancel': {   // the student cancels: here when it can be done here, otherwise where it is done; with an optional reason
      mh_method('POST'); $u = mh_require_user(); mh_rate_or_fail("plan_cancel:{$u['id']}", 12, 3600, 'Please wait a little before trying again.');
      $s = mh_create_status($u, $cfg, true); $grant = mh_plan_grant($u, $cfg);
      $reason = in_array($in['reason'] ?? '', ['price', 'use', 'done', 'broken', 'other'], true) ? (string)$in['reason'] : '';
      $note = mb_substr(trim(preg_replace('/\s+/u', ' ', is_string($in['note'] ?? null) ? $in['note'] : '')), 0, 500);
      $plan = $s['active'] ? $s['plan'] : $grant;
      if ($reason !== '' || $note !== '') $db->prepare('INSERT INTO plan_feedback (user_id, plan, store, reason, note, at) VALUES (?, ?, ?, ?, ?, ?)')->execute([$u['id'], $plan, (string)$s['store'], $reason, $note, $now]);
      $out = ['ok' => true, 'plan' => $plan, 'until' => $s['until'], 'store' => (string)$s['store']];
      if (!$s['active']) mh_json($out + ['how' => $grant ? 'granted' : 'none']);
      if (!$s['renews']) mh_json($out + ['how' => 'already', 'url' => (string)$s['manage_url']]);
      $store = (string)$s['store'];
      if (in_array($store, ['app_store', 'mac_app_store'], true)) mh_json($out + ['how' => 'app_store', 'url' => 'https://apps.apple.com/account/subscriptions']);
      if ($store === 'play_store') mh_json($out + ['how' => 'play_store', 'url' => 'https://play.google.com/store/account/subscriptions?package=space.mathub.app']);
      if ($store === 'rc_billing' && mh_rc_cancel_web($cfg, 'mh_' . $u['id'])) {
        $s = mh_create_status($u, $cfg, true); $db->prepare('UPDATE create_status SET renews = 0 WHERE user_id = ?')->execute([$u['id']]);   // RevenueCat may take a moment to show it
        mh_json(['ok' => true, 'how' => 'cancelled', 'plan' => $plan, 'until' => $s['until'] ?: $out['until'], 'store' => $store]);
      }
      mh_json($out + ['how' => 'portal', 'url' => (string)$s['manage_url']]);
    }
    case 'admin_plan': {   // an administrator gives a member Pro or Max (no end, or until a day), or takes it back
      mh_method('POST'); $u = mh_require_user(); if (!mh_is_admin($u)) mh_fail('Administrators only.', 403);
      mh_rate_or_fail("admin_plan:{$u['id']}", 200, 3600, 'That is a lot of changes at once. Wait a little.');
      $plan = (string)($in['plan'] ?? ''); if (!isset(MH_PLAN_RANK[$plan])) mh_fail('Pick Free, Pro or Max.', 400, ['field' => 'plan']);
      $st = $db->prepare('SELECT id, email, name FROM users WHERE id = ?'); $st->execute([(int)($in['user_id'] ?? 0)]); $t = $st->fetch();
      if (!$t) mh_fail('That member was not found.', 404);
      $email = strtolower((string)$t['email']); $until = 0; $day = trim((string)($in['until'] ?? ''));
      if ($plan !== '' && $day !== '') {
        $tz = new DateTimeZone(in_array($cfg['timezone'] ?? '', timezone_identifiers_list(), true) ? (string)$cfg['timezone'] : 'America/Denver');
        $d = DateTime::createFromFormat('!Y-m-d', $day, $tz);
        if (!$d || $d->format('Y-m-d') !== $day) mh_fail('Pick the last day as a date.', 400, ['field' => 'until']);
        $until = $d->setTime(23, 59, 59)->getTimestamp();
        if ($until <= $now) mh_fail('The last day has to be today or later.', 400, ['field' => 'until']);
        if ($until > $now + 5 * 366 * 86400) mh_fail('Pick a last day within five years, or no end date.', 400, ['field' => 'until']);
      }
      $note = trim(preg_replace('/\s+/u', ' ', is_string($in['note'] ?? null) ? $in['note'] : ''));
      $had = mh_plan_gift($email);
      mh_plan_gift_set($email, $plan, $until, $note, (int)$u['id']);
      // a tester plan for this address saved in Keys & settings moves here, so what is picked in Members is what they get
      $files = mh_siteconfig_files(); $saved = mh_siteconfig_saved($files);
      if (is_array($saved['plan_grants'] ?? null)) {
        $g = array_filter($saved['plan_grants'], fn($k) => strtolower((string)$k) !== $email, ARRAY_FILTER_USE_KEY);
        if (count($g) !== count($saved['plan_grants'])) {
          $saved['plan_grants'] = $g; mh_siteconfig_write($files, $saved); $cfg['plan_grants'] = $g;
          $db->exec('CREATE TABLE IF NOT EXISTS config_log (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER REFERENCES users(id) ON DELETE CASCADE, key TEXT NOT NULL, action TEXT NOT NULL DEFAULT "set", at INTEGER NOT NULL)');
          $db->prepare('INSERT INTO config_log (user_id, key, action, at) VALUES (?, ?, ?, ?)')->execute([$u['id'], 'plan_grants', 'set', $now]);
        }
      }
      $told = false;
      if ($plan !== '' && !empty($in['tell']) && (int)$t['id'] !== (int)$u['id'] && (!$had || $had['plan'] !== $plan || (int)$had['until'] !== $until)) {
        $name = $plan === 'max' ? 'Mathub Max' : 'Mathub Pro';
        $when = $until ? 'It is yours until ' . (new DateTime('@' . $until))->setTimezone(new DateTimeZone(in_array($cfg['timezone'] ?? '', timezone_identifiers_list(), true) ? (string)$cfg['timezone'] : 'America/Denver'))->format('F j, Y') . '.' : 'It has no end date.';
        $db->prepare('INSERT INTO notifications (user_id, kind, post_id, comment_id, actor_id, actor, title, snippet, link, created) VALUES (?, "plan", 0, NULL, ?, ?, ?, ?, "#/plan", ?)')
          ->execute([$t['id'], $u['id'], mb_substr(mh_display_name($u) ?: 'Mathub', 0, 60), $name, "$when It never charges you. Open Your plan to see what it includes.", $now]);
        $told = true;
      }
      $row = mh_plan_admin_rows([$t], $cfg)[(int)$t['id']];
      mh_json(['ok' => true, 'user_id' => (int)$t['id'], 'email' => $email, 'plan' => $row, 'told' => $told]);
    }
  }
  mh_fail('Not found.', 404);
}
