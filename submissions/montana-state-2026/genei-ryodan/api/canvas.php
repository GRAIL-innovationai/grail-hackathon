<?php
/* ============================================================
   Mathub — Canvas calendar feed sync
   Fetches the owner's Canvas iCal feed (Calendar → Calendar Feed),
   maps each event to a Mathub course by the course name in the
   event title, caches the result for an hour in api/data/canvas.json
   and serves it to the site. Only events for the mapped courses are
   exposed; anything else in the feed is dropped.
   ============================================================ */
declare(strict_types=1);

const MH_CANVAS_TTL = 3600;

function mh_setting(string $key, ?string $default = null): ?string {
  $st = mh_db()->prepare('SELECT value FROM settings WHERE key = ?'); $st->execute([$key]); $v = $st->fetchColumn(); return $v === false ? $default : (string)$v;
}
function mh_setting_set(string $key, ?string $value): void {
  if ($value === null || $value === '') mh_db()->prepare('DELETE FROM settings WHERE key = ?')->execute([$key]);
  else mh_db()->prepare('INSERT INTO settings (key, value, updated) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated = excluded.updated')->execute([$key, $value, time()]);
}
function mh_canvas_feed_url(): string {
  $cfg = mh_config(); $u = trim((string)($cfg['canvas_feed'] ?? '')); if ($u !== '') return $u;
  return trim((string)mh_setting('canvas_feed', ''));
}
/** Which Mathub course an event belongs to, from the course name Canvas appends in [brackets]. */
function mh_canvas_course(string $summary, array $cfg): ?string {
  $rules = $cfg['canvas_course_match'] ?? ['calc' => ['M 171', 'M171', 'CALCULUS I'], 'physics' => ['PHSX 220', 'PHSX220', 'PHYSICS I'], 'precalc' => ['M 151', 'M151', 'PRECALC'], 'writ' => ['WRIT 101', 'WRIT101', 'COLLEGE WRITING'], 'csci' => ['CSCI 127', 'CSCI127', 'Joy and Beauty of Data'], 'biob' => ['BIOB 160', 'BIOB160', 'PRINCIPLES OF LIVING SYSTEMS'], 'kin' => ['KIN 322', 'KIN322'], 'psyx' => ['PSYX 340', 'PSYX340', 'PSYCHOLOGICAL DISORDERS']];
  foreach (mh_pack_rows() as $p) if (!isset($rules[$p['id']])) { $c = json_decode((string)$p['canvas'], true); $rules[$p['id']] = is_array($c) && $c ? $c : [$p['code'], str_replace(' ', '', $p['code'])]; }
  $hay = strtoupper(preg_match('/\[([^\]]+)\]\s*$/', $summary, $m) ? $m[1] : $summary);
  foreach ($rules as $course => $needles) foreach ((array)$needles as $n) if ($n !== '' && str_contains($hay, strtoupper($n))) return $course;
  return null;
}
function mh_ics_unfold(string $raw): array {
  $raw = str_replace(["\r\n", "\r"], "\n", $raw); $lines = explode("\n", $raw); $out = [];
  foreach ($lines as $l) { if ($l !== '' && ($l[0] === ' ' || $l[0] === "\t") && $out) $out[count($out) - 1] .= substr($l, 1); else $out[] = $l; }
  return $out;
}
function mh_ics_text(string $s): string { return trim(str_replace(['\\n', '\\N', '\\,', '\;', '\\\\'], ["\n", "\n", ',', ';', '\\'], $s)); }
/** Parses an iCal document into simple events: [uid, title, course, date (Y-m-d local), time (h:mm am/pm or ''), allDay, url, description]. */
function mh_ics_parse(string $raw, array $cfg): array {
  $tz = new DateTimeZone($cfg['timezone'] ?? 'America/Denver'); $events = []; $cur = null;
  foreach (mh_ics_unfold($raw) as $line) {
    if ($line === 'BEGIN:VEVENT') { $cur = []; continue; }
    if ($line === 'END:VEVENT') {
      if ($cur && isset($cur['DTSTART'])) {
        $summary = mh_ics_text($cur['SUMMARY'] ?? ''); $course = mh_canvas_course($summary, $cfg);
        if ($course) {
          $title = trim(preg_replace('/\s*\[[^\]]+\]\s*$/', '', $summary)) ?: $summary;
          [$val, $params] = $cur['DTSTART'];
          if (str_contains($params, 'VALUE=DATE') || preg_match('/^\d{8}$/', $val)) { $date = substr($val, 0, 4) . '-' . substr($val, 4, 2) . '-' . substr($val, 6, 2); $time = ''; $allDay = true; }
          else {
            try { $dt = str_ends_with($val, 'Z') ? new DateTime($val, new DateTimeZone('UTC')) : (preg_match('/TZID=([^;:]+)/', $params, $tm) ? new DateTime($val, new DateTimeZone($tm[1])) : new DateTime($val, $tz)); $dt->setTimezone($tz); $date = $dt->format('Y-m-d'); $time = strtolower($dt->format('g:i a')); $allDay = false; }
            catch (Throwable $e) { $cur = null; continue; }
          }
          $events[] = ['uid' => (string)($cur['UID'][0] ?? md5($summary . $date)), 'title' => $title, 'course' => $course, 'date' => $date, 'time' => $time, 'allDay' => $allDay, 'url' => (string)($cur['URL'][0] ?? ''), 'desc' => mb_substr(mh_ics_text($cur['DESCRIPTION'] ?? ''), 0, 300), 'kind' => str_contains((string)($cur['UID'][0] ?? ''), 'assignment') ? 'assignment' : 'event'];
        }
      }
      $cur = null; continue;
    }
    if ($cur === null) continue;
    $pos = strpos($line, ':'); if ($pos === false) continue;
    $head = substr($line, 0, $pos); $val = substr($line, $pos + 1); $name = strtoupper(explode(';', $head)[0]); $params = strtoupper(substr($head, strlen($name)));
    if ($name === 'SUMMARY' || $name === 'DESCRIPTION') $cur[$name] = $val; else $cur[$name] = [$val, $params];
  }
  usort($events, fn($a, $b) => strcmp($a['date'] . $a['time'], $b['date'] . $b['time']));
  return $events;
}
$GLOBALS['mh_http_error'] = '';
/** $ownerSet: the address comes from config.php / config.local.php (the server owner), not from the admin panel. */
function mh_http_get(string $url, bool $ownerSet = false): ?string {
  $GLOBALS['mh_http_error'] = '';
  // web addresses only: never file:// or another scheme. An address typed in the admin panel must also be on a public host,
  // never the server itself or a private network (server-side request forgery); the server owner's config file is trusted.
  $host = strtolower((string)parse_url($url, PHP_URL_HOST)); $scheme = strtolower((string)parse_url($url, PHP_URL_SCHEME));
  if (!in_array($scheme, ['https', 'http'], true) || $host === '') { $GLOBALS['mh_http_error'] = 'only web (https) addresses are allowed'; return null; }
  if (!$ownerSet) {
    if ($host === 'localhost' || str_ends_with($host, '.local') || str_ends_with($host, '.internal')) { $GLOBALS['mh_http_error'] = 'that address points to this server or a private network'; return null; }
    $ips = filter_var(trim($host, '[]'), FILTER_VALIDATE_IP) ? [trim($host, '[]')] : (gethostbynamel($host) ?: []);
    foreach ($ips as $addr) if (!filter_var($addr, FILTER_VALIDATE_IP, FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE)) { $GLOBALS['mh_http_error'] = 'that address points to this server or a private network'; return null; }
  }
  if (function_exists('curl_init')) {
    $ch = curl_init($url); curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_FOLLOWLOCATION => true, CURLOPT_MAXREDIRS => 4, CURLOPT_TIMEOUT => 20, CURLOPT_CONNECTTIMEOUT => 10, CURLOPT_USERAGENT => 'Mathub/1.0 (+calendar sync)', CURLOPT_PROTOCOLS => CURLPROTO_HTTPS | CURLPROTO_HTTP, CURLOPT_REDIR_PROTOCOLS => CURLPROTO_HTTPS | CURLPROTO_HTTP, CURLOPT_MAXFILESIZE => 8 * 1024 * 1024]);
    $body = curl_exec($ch); $code = (int)curl_getinfo($ch, CURLINFO_RESPONSE_CODE); $err = curl_error($ch); curl_close($ch);
    if ($body !== false && $code >= 200 && $code < 300) return (string)$body;
    $GLOBALS['mh_http_error'] = $err !== '' ? $err : ('HTTP ' . $code);
    return null;
  }
  $ctx = stream_context_create(['http' => ['timeout' => 20, 'follow_location' => 1, 'user_agent' => 'Mathub/1.0 (+calendar sync)']]);
  $body = @file_get_contents($url, false, $ctx); if ($body === false) { $GLOBALS['mh_http_error'] = error_get_last()['message'] ?? 'request failed'; return null; } return $body;
}
/** Returns ['events' => [...], 'fetched' => ts, 'error' => ?string, 'configured' => bool]. */
function mh_canvas_events(bool $force = false): array {
  $url = mh_canvas_feed_url(); $cacheFile = dirname(mh_config()['db_path']) . '/canvas.json';
  if ($url === '') return ['events' => [], 'fetched' => 0, 'error' => null, 'configured' => false];
  $cache = is_file($cacheFile) ? json_decode((string)file_get_contents($cacheFile), true) : null;
  if (!$force && $cache && ($cache['url'] ?? '') === $url && time() - (int)($cache['fetched'] ?? 0) < MH_CANVAS_TTL) return ['events' => $cache['events'], 'fetched' => (int)$cache['fetched'], 'error' => $cache['error'] ?? null, 'configured' => true];
  $raw = mh_http_get($url, trim((string)(mh_config()['canvas_feed'] ?? '')) !== '');
  if ($raw === null || !str_contains($raw, 'BEGIN:VCALENDAR')) {
    $err = 'Could not download the Canvas feed' . ($raw === null ? ' (' . ($GLOBALS['mh_http_error'] ?: 'no response') . ')' : ' (the reply was not a calendar)') . '. Check the URL in the admin panel.';
    if ($cache && ($cache['url'] ?? '') === $url) { $cache['error'] = $err; $cache['fetched'] = time() - MH_CANVAS_TTL + 600; @file_put_contents($cacheFile, json_encode($cache)); return ['events' => $cache['events'], 'fetched' => (int)$cache['fetched'], 'error' => $err, 'configured' => true, 'stale' => true]; }
    return ['events' => [], 'fetched' => 0, 'error' => $err, 'configured' => true];
  }
  $events = mh_ics_parse($raw, mh_config());
  $data = ['url' => $url, 'fetched' => time(), 'events' => $events, 'error' => null];
  @file_put_contents($cacheFile, json_encode($data, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE), LOCK_EX);
  return ['events' => $events, 'fetched' => $data['fetched'], 'error' => null, 'configured' => true];
}
