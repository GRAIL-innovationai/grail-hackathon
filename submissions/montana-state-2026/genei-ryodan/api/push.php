<?php
/* ============================================================
   Mathub account server — web push
   Sends "empty" pushes signed with VAPID (no payload encryption
   needed); the service worker then fetches the pending notifications
   for the logged-in user with push_pending and shows them. Keys are
   generated once into data/vapid.json. Routes: push_key, push_subscribe,
   push_unsubscribe, push_pending, push_test. mh_push_tick() runs from
   housekeeping in the evening reminder window.
   ============================================================ */
declare(strict_types=1);

function mh_b64u(string $bin): string { return rtrim(strtr(base64_encode($bin), '+/', '-_'), '='); }
function mh_b64u_dec(string $s): string { return base64_decode(strtr($s, '-_', '+/') . str_repeat('=', (4 - strlen($s) % 4) % 4)) ?: ''; }

/** Loads or creates the VAPID key pair. Returns ['pem' => private key PEM, 'pub' => base64url raw public key]. */
function mh_vapid(): array {
  static $v = null; if ($v) return $v;
  $path = dirname(mh_config()['db_path']) . '/vapid.json';
  if (is_file($path)) { $j = json_decode((string)file_get_contents($path), true); if (is_array($j) && !empty($j['pem']) && !empty($j['pub'])) return $v = $j; }
  if (!function_exists('openssl_pkey_new')) throw new RuntimeException('OpenSSL is not available, push notifications need it.');
  $key = openssl_pkey_new(['curve_name' => 'prime256v1', 'private_key_type' => OPENSSL_KEYTYPE_EC]); if (!$key) throw new RuntimeException('Could not create the push key.');
  openssl_pkey_export($key, $pem); $d = openssl_pkey_get_details($key);
  if (empty($d['ec']['x']) || empty($d['ec']['y'])) throw new RuntimeException('Could not read the push key.');
  $pub = mh_b64u("\x04" . str_pad($d['ec']['x'], 32, "\x00", STR_PAD_LEFT) . str_pad($d['ec']['y'], 32, "\x00", STR_PAD_LEFT));
  $v = ['pem' => $pem, 'pub' => $pub, 'created' => time()];
  file_put_contents($path, json_encode($v), LOCK_EX); @chmod($path, 0600);
  return $v;
}
/** ECDSA signatures come back DER-encoded; JWTs want the raw 64-byte r||s form. */
function mh_der_to_raw(string $der): string {
  $off = 2; if ((ord($der[1]) & 0x80) !== 0) $off = 2 + (ord($der[1]) & 0x7f);
  $parts = [];
  for ($i = 0; $i < 2; $i++) { if (ord($der[$off]) !== 0x02) throw new RuntimeException('Bad signature.'); $len = ord($der[$off + 1]); $off += 2; $val = ltrim(substr($der, $off, $len), "\x00"); $off += $len; $parts[] = str_pad($val, 32, "\x00", STR_PAD_LEFT); }
  return $parts[0] . $parts[1];
}
function mh_vapid_jwt(string $aud): string {
  $v = mh_vapid(); $cfg = mh_config();
  $h = mh_b64u(json_encode(['typ' => 'JWT', 'alg' => 'ES256'])); $c = mh_b64u(json_encode(['aud' => $aud, 'exp' => time() + 12 * 3600, 'sub' => 'mailto:' . ($cfg['mail_from'] ?? 'info@mathub.space')]));
  $key = openssl_pkey_get_private($v['pem']); $sig = ''; if (!openssl_sign("$h.$c", $sig, $key, OPENSSL_ALGO_SHA256)) throw new RuntimeException('Could not sign.');
  return "$h.$c." . mh_b64u(mh_der_to_raw($sig));
}
/** Sends an empty push to one subscription. Returns the HTTP status (0 when the request itself failed). */
function mh_push_send(array $sub, int $ttl = 86400): int {
  $endpoint = (string)$sub['endpoint']; $u = parse_url($endpoint); if (empty($u['scheme']) || empty($u['host'])) return 0;
  $aud = $u['scheme'] . '://' . $u['host']; $jwt = mh_vapid_jwt($aud); $pub = mh_vapid()['pub'];
  $headers = ['Authorization: vapid t=' . $jwt . ', k=' . $pub, 'TTL: ' . $ttl, 'Urgency: normal', 'Content-Length: 0'];
  if (function_exists('curl_init')) {
    $ch = curl_init($endpoint); curl_setopt_array($ch, [CURLOPT_POST => true, CURLOPT_POSTFIELDS => '', CURLOPT_HTTPHEADER => $headers, CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 12, CURLOPT_CONNECTTIMEOUT => 6]);
    curl_exec($ch); $code = (int)curl_getinfo($ch, CURLINFO_RESPONSE_CODE); curl_close($ch); return $code;
  }
  $ctx = stream_context_create(['http' => ['method' => 'POST', 'header' => implode("\r\n", $headers), 'content' => '', 'timeout' => 12, 'ignore_errors' => true]]);
  @file_get_contents($endpoint, false, $ctx); $line = $http_response_header[0] ?? ''; return (int)(preg_match('/\s(\d{3})\s/', $line, $m) ? $m[1] : 0);
}
function mh_push_queue(int $uid, string $title, string $body, string $url = '', string $tag = ''): void {
  mh_db()->prepare('INSERT INTO push_queue (user_id, title, body, url, tag, created, delivered) VALUES (?, ?, ?, ?, ?, ?, 0)')->execute([$uid, mb_substr($title, 0, 120), mb_substr($body, 0, 400), mb_substr($url, 0, 300), mb_substr($tag, 0, 60), time()]);
}
/** Pushes every subscription of a user; drops subscriptions the push service says are gone. Returns how many pushes were accepted. */
function mh_push_user(int $uid): int {
  $db = mh_db(); $st = $db->prepare('SELECT * FROM push_subs WHERE user_id = ?'); $st->execute([$uid]); $ok = 0;
  foreach ($st->fetchAll() as $s) {
    try { $code = mh_push_send($s); } catch (Throwable $e) { $code = 0; }
    if ($code === 404 || $code === 410) { $db->prepare('DELETE FROM push_subs WHERE id = ?')->execute([$s['id']]); continue; }
    if ($code >= 200 && $code < 300) { $ok++; $db->prepare('UPDATE push_subs SET last_ok = ? WHERE id = ?')->execute([time(), $s['id']]); }
  }
  return $ok;
}
/** Evening tick: the same items as the reminder email (due tomorrow, streak at risk, sessions), for users with a subscription. */
function mh_push_tick(int $max): int {
  if (!function_exists('mh_reminder_window_start') || !function_exists('mh_reminder_items')) return 0;
  $ws = mh_reminder_window_start(); if ($ws === null || $max <= 0) return 0;
  $db = mh_db(); $st = $db->prepare('SELECT u.* FROM users u WHERE u.verified = 1 AND u.push_sent < ? AND EXISTS (SELECT 1 FROM push_subs p WHERE p.user_id = u.id) ORDER BY u.id LIMIT ?'); $st->execute([$ws, $max]); $users = $st->fetchAll();
  if (!$users) return 0;
  $tomorrow = mh_local_date(time() + 86400); $events = []; try { require_once __DIR__ . '/canvas.php'; $events = mh_canvas_events(false)['events']; } catch (Throwable $e) {}
  $sent = 0;
  foreach ($users as $u) {
    $db->prepare('UPDATE users SET push_sent = ? WHERE id = ?')->execute([time(), $u['id']]);
    try {
      $it = mh_reminder_items($u, $events, $tomorrow); $uid = (int)$u['id'];
      if ($it['due']) { $titles = array_map(fn($e) => $e['title'], $it['due']); mh_push_queue($uid, 'Due tomorrow: ' . implode(', ', array_slice($titles, 0, 2)) . (count($titles) > 2 ? ' +' . (count($titles) - 2) . ' more' : ''), implode(' · ', array_map(fn($e) => ($it['names'][$e['course']] ?? $e['course']) . ': ' . $e['title'] . ($e['time'] ? ' ' . $e['time'] : ''), array_slice($it['due'], 0, 4))), '#/today', 'due'); }
      if ($it['atRisk']) mh_push_queue($uid, "Your {$it['streak']}-day streak ends at midnight", 'One quiz question or one flashcard keeps it alive. Open Today and take two minutes.', '#/today', 'streak');
      foreach ($it['meets'] as $m) mh_push_queue($uid, 'Study session: ' . $m['title'], $m['place'] . ' · ' . $m['when'], '#/meet', 'meet');
      if ($it['due'] || $it['atRisk'] || $it['meets']) { if (mh_push_user($uid) > 0) $sent++; }
    } catch (Throwable $e) {}
  }
  return $sent;
}

function mh_push_route(string $route, array $in, array $cfg, string $ip): void {
  $db = mh_db();
  switch ($route) {
    case 'push_key': { mh_method('GET'); try { mh_json(['ok' => true, 'key' => mh_vapid()['pub']]); } catch (Throwable $e) { error_log('Mathub push key: ' . $e->getMessage()); mh_fail('Push notifications are not available on this server right now.', 500); } }
    case 'push_subscribe': {
      mh_method('POST'); $u = mh_require_user(); mh_rate_or_fail("push:sub:$ip", 30, 3600);
      $endpoint = (string)($in['endpoint'] ?? ''); $keys = is_array($in['keys'] ?? null) ? $in['keys'] : []; $p256 = (string)($keys['p256dh'] ?? ''); $auth = (string)($keys['auth'] ?? '');
      if (!preg_match('#^https://#', $endpoint) || strlen($endpoint) > 1000 || $p256 === '' || $auth === '') mh_fail('That subscription looks incomplete.');
      $db->prepare('INSERT INTO push_subs (user_id, endpoint, p256dh, auth, ua, created, last_ok) VALUES (?, ?, ?, ?, ?, ?, 0) ON CONFLICT(endpoint) DO UPDATE SET user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth, ua = excluded.ua')->execute([(int)$u['id'], $endpoint, $p256, $auth, mb_substr((string)($_SERVER['HTTP_USER_AGENT'] ?? ''), 0, 200), time()]);
      $st = $db->prepare('SELECT COUNT(*) FROM push_subs WHERE user_id = ?'); $st->execute([$u['id']]);
      mh_json(['ok' => true, 'devices' => (int)$st->fetchColumn()]);
    }
    case 'push_unsubscribe': {
      mh_method('POST'); $u = mh_require_user(); $endpoint = (string)($in['endpoint'] ?? '');
      if ($endpoint === '') $db->prepare('DELETE FROM push_subs WHERE user_id = ?')->execute([$u['id']]); else $db->prepare('DELETE FROM push_subs WHERE user_id = ? AND endpoint = ?')->execute([$u['id'], $endpoint]);
      mh_json(['ok' => true]);
    }
    case 'push_pending': {
      mh_method('GET'); $u = mh_current_user(); if (!$u) mh_json(['ok' => true, 'items' => []]);
      $st = $db->prepare('SELECT id, title, body, url, tag FROM push_queue WHERE user_id = ? AND delivered = 0 AND created > ? ORDER BY id LIMIT 5'); $st->execute([$u['id'], time() - 2 * 86400]); $rows = $st->fetchAll();
      if ($rows) { $ids = implode(',', array_map('intval', array_column($rows, 'id'))); $db->exec("UPDATE push_queue SET delivered = " . time() . " WHERE id IN ($ids)"); }
      $db->exec('DELETE FROM push_queue WHERE created < ' . (time() - 14 * 86400));
      mh_json(['ok' => true, 'items' => array_map(fn($r) => ['title' => $r['title'], 'body' => $r['body'], 'url' => $r['url'] ?: '#/', 'tag' => $r['tag']], $rows)]);
    }
    case 'push_test': {
      mh_method('POST'); $u = mh_require_user(); mh_rate_or_fail('push:test:' . $u['id'], 5, 86400, 'Five test notifications a day is plenty.');
      mh_push_queue((int)$u['id'], 'Mathub notifications work', 'This is your test. Reminders arrive the evening before something is due, and when a streak is at risk.', '#/today', 'test');
      $n = mh_push_user((int)$u['id']);
      mh_json(['ok' => true, 'sent' => $n, 'note' => $n ? 'Sent to ' . $n . ' device' . ($n === 1 ? '' : 's') . '.' : 'No device accepted the push. Turn notifications on in this browser first.']);
    }
    case 'push_status': {
      mh_method('GET'); $u = mh_require_user(); $st = $db->prepare('SELECT COUNT(*) FROM push_subs WHERE user_id = ?'); $st->execute([$u['id']]);
      mh_json(['ok' => true, 'devices' => (int)$st->fetchColumn(), 'available' => function_exists('openssl_pkey_new')]);
    }
  }
  mh_fail('Not found.', 404);
}
