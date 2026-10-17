<?php
/* ============================================================
   Mathub account server — class requests
   Professors and TAs (mh_can_request: an Instructor or TA role, a TA in a
   Mathub Faculty class, or an administrator) ask for a class Mathub does
   not have yet; students make their own instead (Create a class). They can attach
   its syllabus (PDF or Word, up to 10 MB) or paste the text. Files go
   to data/syllabi, which the web cannot read; only administrators can
   download them, through admin_classreq_file. Requests for the same
   course code are grouped, so the admin panel shows demand, and a
   status change (working on it, added, can't add) reaches everyone
   who asked, in their inbox.
   Routes: classreq_create, classreq_mine, classreq_top, classreq_withdraw,
           admin_classreqs, admin_classreq_update, admin_classreq_file,
           admin_classreq_delete
   ============================================================ */
declare(strict_types=1);

const MH_REQ_MAX_BYTES = 10 * 1024 * 1024;
const MH_REQ_STATUSES = ['new', 'working', 'added', 'declined'];
const MH_REQ_OPEN = ['new', 'working'];

function mh_req_db(): PDO {
  static $ready = false; $db = mh_db();
  if (!$ready) {
    $db->exec('CREATE TABLE IF NOT EXISTS class_requests (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, code TEXT NOT NULL, title TEXT NOT NULL DEFAULT "", term TEXT NOT NULL DEFAULT "", instructor TEXT NOT NULL DEFAULT "", note TEXT NOT NULL DEFAULT "", text TEXT NOT NULL DEFAULT "", file TEXT NOT NULL DEFAULT "", file_name TEXT NOT NULL DEFAULT "", file_size INTEGER NOT NULL DEFAULT 0, file_type TEXT NOT NULL DEFAULT "", status TEXT NOT NULL DEFAULT "new", admin_note TEXT NOT NULL DEFAULT "", course_id TEXT NOT NULL DEFAULT "", created INTEGER NOT NULL, updated INTEGER NOT NULL)');
    $db->exec('CREATE INDEX IF NOT EXISTS class_requests_code ON class_requests (code)');
    $db->exec('CREATE INDEX IF NOT EXISTS class_requests_user ON class_requests (user_id)');
    $ready = true;
  }
  return $db;
}
/** data/syllabi, created with the same web lock as data/backups. */
function mh_req_dir(): string {
  $d = dirname(mh_config()['db_path']) . '/syllabi';
  if (!is_dir($d)) { @mkdir($d, 0755, true); @file_put_contents($d . '/.htaccess', "Require all denied\n"); @file_put_contents($d . '/index.html', ''); }
  return $d;
}
/** "chmy121", "CHMY-121", "m 171q" → "CHMY 121", "M 171Q"; null when it does not look like an MSU course code. */
function mh_req_code(string $raw): ?string {
  $s = strtoupper(preg_replace('/[\s\-_.]+/', ' ', trim($raw)));
  if (!preg_match('/^([A-Z]{1,5}) ?([0-9]{3}[A-Z]{0,3})$/', $s, $m)) return null;
  return $m[1] . ' ' . $m[2];
}
/** Checks an uploaded file and moves it into data/syllabi under a random name. Returns [stored name, original name, size, kind] or null when nothing was sent. */
function mh_req_store_upload(): ?array {
  $f = $_FILES['file'] ?? null; if (!$f || ($f['error'] ?? UPLOAD_ERR_NO_FILE) === UPLOAD_ERR_NO_FILE) return null;
  $err = (int)$f['error'];
  if ($err === UPLOAD_ERR_INI_SIZE || $err === UPLOAD_ERR_FORM_SIZE) mh_fail('That file is larger than the server accepts. Try a smaller PDF, or paste the syllabus text instead.', 413);
  if ($err !== UPLOAD_ERR_OK || !is_uploaded_file($f['tmp_name'])) mh_fail('The upload did not finish. Please try again.');
  $size = (int)filesize($f['tmp_name']); if ($size <= 0) mh_fail('That file is empty.'); if ($size > MH_REQ_MAX_BYTES) mh_fail('Files can be up to 10 MB.', 413);
  $head = (string)file_get_contents($f['tmp_name'], false, null, 0, 8); $name = (string)($f['name'] ?? 'syllabus');
  if (str_starts_with($head, '%PDF-')) $kind = 'pdf';
  elseif (str_starts_with($head, "PK\x03\x04") && preg_match('/\.docx$/i', $name)) $kind = 'docx';
  else mh_fail('Attach the syllabus as a PDF or a Word (.docx) file.', 415);
  $stored = bin2hex(random_bytes(16)) . '.' . $kind;
  if (!@move_uploaded_file($f['tmp_name'], mh_req_dir() . '/' . $stored)) mh_fail('The server could not save the file. Make sure api/data is writable.', 500);
  $clean = trim(preg_replace('/[^\w .()\-]+/u', '_', basename($name))) ?: 'syllabus.' . $kind;
  return [$stored, mb_substr($clean, 0, 120), $size, $kind];
}
function mh_req_file_path(string $stored): ?string {
  if (!preg_match('/^[a-f0-9]{32}\.(pdf|docx)$/', $stored)) return null;
  $p = mh_req_dir() . '/' . $stored; return is_file($p) ? $p : null;
}
function mh_req_remove_file(string $stored): void { if ($p = mh_req_file_path($stored)) @unlink($p); }
function mh_req_public(array $r): array {
  return ['id' => (int)$r['id'], 'code' => $r['code'], 'title' => $r['title'], 'term' => $r['term'], 'instructor' => $r['instructor'], 'note' => $r['note'], 'has_text' => $r['text'] !== '', 'file_name' => $r['file_name'], 'file_size' => (int)$r['file_size'], 'status' => $r['status'], 'admin_note' => $r['admin_note'], 'course_id' => $r['course_id'], 'created' => (int)$r['created'], 'updated' => (int)$r['updated']];
}
function mh_req_notify(int $uid, array $actor, string $kind, string $title, string $snippet, string $link): void {
  mh_db()->prepare('INSERT INTO notifications (user_id, kind, post_id, comment_id, actor_id, actor, title, snippet, link, created) VALUES (?, ?, 0, NULL, ?, ?, ?, ?, ?, ?)')
    ->execute([$uid, $kind, (int)($actor['id'] ?? 0), mb_substr(mh_display_name($actor) ?: 'Mathub', 0, 60), mb_substr($title, 0, 120), mb_substr($snippet, 0, 300), mb_substr($link, 0, 200), time()]);
}
/** The administrators' user rows (from the admins list in config). */
function mh_req_admin_users(): array {
  $emails = array_map('strtolower', mh_config()['admins'] ?? []); if (!$emails) return [];
  $st = mh_db()->prepare('SELECT * FROM users WHERE lower(email) IN (' . implode(',', array_fill(0, count($emails), '?')) . ') AND verified = 1'); $st->execute($emails); return $st->fetchAll();
}

/** Sets the status of every request for a course code and messages each student whose request changed. Returns how many were notified, or -1 when nobody asked for the class. */
function mh_req_set_status(string $code, string $status, string $note = '', string $courseId = ''): int {
  $db = mh_req_db(); $st = $db->prepare('SELECT * FROM class_requests WHERE code = ? AND status <> "withdrawn"'); $st->execute([$code]); $rows = $st->fetchAll(); if (!$rows) return -1;
  $db->prepare('UPDATE class_requests SET status = ?, admin_note = ?, course_id = ?, updated = ? WHERE code = ? AND status <> "withdrawn"')->execute([$status, $note, $status === 'added' ? $courseId : '', time(), $code]);
  $changed = 0;
  foreach ($rows as $r) {
    if ($r['status'] === $status && $r['admin_note'] === $note) continue; $changed++;
    $msg = ['new' => "$code is back in the queue.", 'working' => "We are building $code now.", 'added' => "$code is on Mathub. Open it and add it to your classes.", 'declined' => "We can't add $code right now."][$status] . ($note !== '' ? " $note" : '');
    mh_req_notify((int)$r['user_id'], ['id' => (int)mh_system_user()['id'], 'name' => 'Mathub'], 'classreq', $code, $msg, $status === 'added' ? "#/$courseId" : '#/request');
    if ($status === 'added') { try { require_once __DIR__ . '/push.php'; mh_push_queue((int)$r['user_id'], "$code is on Mathub", 'The class you asked for is ready: notes, practice and the calendar.', "#/$courseId", 'classreq'); } catch (Throwable $e) {} }
  }
  return $changed;
}

function mh_requests_route(string $route, array $in, array $cfg, string $ip): void {
  $db = mh_req_db();
  switch ($route) {

    case 'classreq_create': {
      mh_method('POST'); $u = mh_require_user(); $uid = (int)$u['id'];
      if (!mh_can_request($u)) mh_fail('Class requests come from professors and TAs. You can make any class yourself: Create a class, drop in its syllabus, and Bo writes it.', 403, ['staff_only' => true]);
      if ($b = mh_banned($uid)) mh_fail('Your account is paused until ' . gmdate('M j, Y', (int)$b['until']) . '.', 403, ['banned' => true]);
      mh_rate_or_fail("classreq:user:$uid", 8, 86400, 'That is a lot of requests for one day. Try again tomorrow.');
      mh_rate_or_fail("classreq:ip:$ip", 30, 86400, 'Too many requests from this network today.');
      $code = mh_req_code(mh_str($in, 'code', 20)); if (!$code) mh_fail('Enter the course code the way MSU writes it, for example CHMY 121 or M 172.');
      $title = mh_str($in, 'title', 120); $term = mh_str($in, 'term', 40); $instructor = mh_str($in, 'instructor', 80); $note = mh_str($in, 'note', 600);
      $text = trim(mb_substr((string)($in['text'] ?? ''), 0, 60000));
      $st = $db->prepare('SELECT id FROM class_requests WHERE user_id = ? AND code = ? AND status IN ("new", "working")'); $st->execute([$uid, $code]);
      if ($st->fetchColumn()) mh_fail("You already asked for $code. We will let you know in your inbox when it changes.", 409, ['duplicate' => true]);
      $st = $db->prepare('SELECT COUNT(*) FROM class_requests WHERE user_id = ? AND status IN ("new", "working")'); $st->execute([$uid]);
      if ((int)$st->fetchColumn() >= 10) mh_fail('You have 10 open requests. Withdraw one to ask for another class.');
      $hasFile = isset($_FILES['file']) && ($_FILES['file']['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_NO_FILE;
      if (($hasFile || $text !== '') && empty($in['consent'])) mh_fail('Please confirm the box about the syllabus before sending it.');
      $file = $hasFile ? mh_req_store_upload() : null;
      $st = $db->prepare('SELECT COUNT(*) AS n, SUM(file <> "" OR text <> "") AS s, MAX(status = "added") AS added FROM class_requests WHERE code = ? AND status <> "withdrawn"'); $st->execute([$code]); $before = $st->fetch();
      $now = time();
      $db->prepare('INSERT INTO class_requests (user_id, code, title, term, instructor, note, text, file, file_name, file_size, file_type, status, created, updated) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, "new", ?, ?)')
        ->execute([$uid, $code, $title, $term, $instructor, $note, $text, $file[0] ?? '', $file[1] ?? '', $file[2] ?? 0, $file[3] ?? '', $now, $now]);
      $id = (int)$db->lastInsertId(); $count = (int)$before['n'] + 1;
      // tell the administrators about a new class, or a syllabus for one that had none
      if ((int)$before['n'] === 0 || ((int)$before['s'] === 0 && ($file || $text !== ''))) foreach (mh_req_admin_users() as $a) if ((int)$a['id'] !== $uid)
        mh_req_notify((int)$a['id'], $u, 'classreq_admin', $code . ($title ? " $title" : ''), ((int)$before['n'] === 0 ? 'New class request' : 'Syllabus added') . ($file || $text !== '' ? ' with a syllabus' : '') . ($count > 1 ? " · $count students asking" : ''), '#/admin/classes');
      try { mh_db()->prepare('INSERT INTO metrics (day, key, n) VALUES (?, "classreq", 1) ON CONFLICT(day, key) DO UPDATE SET n = n + 1')->execute([mh_local_date()]); } catch (Throwable $e) {}
      $st = $db->prepare('SELECT * FROM class_requests WHERE id = ?'); $st->execute([$id]);
      mh_json(['ok' => true, 'request' => mh_req_public($st->fetch()), 'count' => $count]);
    }

    case 'classreq_mine': {
      mh_method('GET'); $u = mh_require_user();
      $st = $db->prepare('SELECT r.*, (SELECT COUNT(*) FROM class_requests x WHERE x.code = r.code AND x.status <> "withdrawn") AS askers FROM class_requests r WHERE r.user_id = ? AND r.status <> "withdrawn" ORDER BY r.created DESC LIMIT 50'); $st->execute([(int)$u['id']]);
      mh_json(['ok' => true, 'items' => array_map(fn($r) => mh_req_public($r) + ['askers' => (int)$r['askers']], $st->fetchAll())]);
    }

    /* the most requested classes, without names: lets students add their voice with one click */
    case 'classreq_top': {
      mh_method('GET'); $me = mh_current_user(); $uid = $me ? (int)$me['id'] : 0;
      $rows = $db->query('SELECT code, MAX(title) AS title, COUNT(*) AS n, SUM(file <> "" OR text <> "") AS syllabi, MIN(created) AS first, ' .
        'CASE WHEN SUM(status = "added") > 0 THEN "added" WHEN SUM(status = "working") > 0 THEN "working" WHEN SUM(status = "new") > 0 THEN "new" ELSE "declined" END AS status, MAX(course_id) AS course_id ' .
        'FROM class_requests WHERE status <> "withdrawn" GROUP BY code ORDER BY (status = "declined"), n DESC, first ASC LIMIT 20')->fetchAll();
      $mine = []; if ($uid) { $st = $db->prepare('SELECT code FROM class_requests WHERE user_id = ? AND status <> "withdrawn"'); $st->execute([$uid]); $mine = $st->fetchAll(PDO::FETCH_COLUMN); }
      mh_json(['ok' => true, 'items' => array_map(fn($r) => ['code' => $r['code'], 'title' => (string)$r['title'], 'n' => (int)$r['n'], 'syllabus' => (int)$r['syllabi'] > 0, 'status' => $r['status'], 'course_id' => (string)$r['course_id'], 'mine' => in_array($r['code'], $mine, true)], $rows)]);
    }

    case 'classreq_withdraw': {
      mh_method('POST'); $u = mh_require_user();
      $st = $db->prepare('SELECT * FROM class_requests WHERE id = ? AND user_id = ?'); $st->execute([(int)($in['id'] ?? 0), (int)$u['id']]); $r = $st->fetch();
      if (!$r) mh_fail('Request not found.', 404);
      if ($r['status'] !== 'new') mh_fail('This request is already being worked on, so it can no longer be withdrawn.');
      if ($r['file'] !== '') mh_req_remove_file($r['file']);
      $db->prepare('UPDATE class_requests SET status = "withdrawn", file = "", file_name = "", file_size = 0, text = "", updated = ? WHERE id = ?')->execute([time(), (int)$r['id']]);
      mh_json(['ok' => true]);
    }

    /* --- administrators --- */
    case 'admin_classreqs': {
      mh_method('GET'); $u = mh_require_user(); if (!mh_is_admin($u)) mh_fail('Admins only.', 403);
      $filter = in_array($_GET['status'] ?? 'open', ['open', 'added', 'declined', 'all'], true) ? ($_GET['status'] ?? 'open') : 'open';
      $rows = $db->query('SELECT r.*, u.email, u.name FROM class_requests r LEFT JOIN users u ON u.id = r.user_id WHERE r.status <> "withdrawn" ORDER BY r.created ASC')->fetchAll();
      $groups = [];
      foreach ($rows as $r) {
        $g = &$groups[$r['code']]; if (!$g) $g = ['code' => $r['code'], 'title' => '', 'status' => 'declined', 'course_id' => '', 'admin_note' => '', 'first' => (int)$r['created'], 'last' => 0, 'requests' => []];
        if ($r['title'] !== '' && $g['title'] === '') $g['title'] = $r['title'];
        $g['last'] = max($g['last'], (int)$r['created']); if ($r['course_id'] !== '') $g['course_id'] = $r['course_id']; if ($r['admin_note'] !== '') $g['admin_note'] = $r['admin_note'];
        $rank = ['new' => 2, 'working' => 3, 'added' => 4, 'declined' => 1]; if (($rank[$r['status']] ?? 0) > ($rank[$g['status']] ?? 0)) $g['status'] = $r['status'];
        $g['requests'][] = mh_req_public($r) + ['email' => $r['email'] ?? '', 'name' => $r['name'] ?? '', 'deleted' => $r['email'] === null, 'text' => $r['text']];
        unset($g);
      }
      $list = array_values($groups);
      foreach ($list as &$g) { $g['n'] = count($g['requests']); $g['syllabi'] = count(array_filter($g['requests'], fn($x) => $x['file_name'] !== '' || $x['has_text'])); } unset($g);
      $counts = ['open' => 0, 'added' => 0, 'declined' => 0, 'all' => count($list)]; foreach ($list as $g) $counts[in_array($g['status'], MH_REQ_OPEN, true) ? 'open' : $g['status']]++;
      $list = array_values(array_filter($list, fn($g) => $filter === 'all' || ($filter === 'open' ? in_array($g['status'], MH_REQ_OPEN, true) : $g['status'] === $filter)));
      usort($list, fn($a, $b) => [$b['n'], $a['first']] <=> [$a['n'], $b['first']]);
      mh_json(['ok' => true, 'groups' => $list, 'counts' => $counts, 'max_mb' => MH_REQ_MAX_BYTES / 1048576]);
    }

    case 'admin_classreq_update': {
      mh_method('POST'); $u = mh_require_user(); if (!mh_is_admin($u)) mh_fail('Admins only.', 403);
      $code = mh_req_code(mh_str($in, 'code', 20)); if (!$code) mh_fail('Unknown course code.');
      $status = (string)($in['status'] ?? ''); if (!in_array($status, MH_REQ_STATUSES, true)) mh_fail('Unknown status.');
      $note = mh_str($in, 'note', 400); $courseId = preg_replace('/[^a-z0-9]/', '', strtolower((string)($in['course_id'] ?? '')));
      if ($status === 'added' && $courseId === '') mh_fail('Give the class id on Mathub (for example chmy) so students can open it.');
      $changed = mh_req_set_status($code, $status, $note, $courseId); if ($changed < 0) mh_fail('No requests for that class.', 404);
      mh_json(['ok' => true, 'notified' => $changed]);
    }

    case 'admin_classreq_file': {
      mh_method('GET'); $u = mh_require_user(); if (!mh_is_admin($u)) mh_fail('Admins only.', 403);
      $st = $db->prepare('SELECT * FROM class_requests WHERE id = ?'); $st->execute([(int)($_GET['id'] ?? 0)]); $r = $st->fetch();
      if (!$r) mh_fail('Request not found.', 404);
      if (($_GET['part'] ?? '') === 'text') { if ($r['text'] === '') mh_fail('No pasted text.', 404); header('Content-Type: text/plain; charset=UTF-8'); header('Content-Disposition: attachment; filename="' . str_replace(' ', '-', $r['code']) . '-syllabus.txt"'); header('Cache-Control: no-store'); header('X-Content-Type-Options: nosniff'); echo $r['text']; exit; }
      $path = $r['file'] !== '' ? mh_req_file_path($r['file']) : null; if (!$path) mh_fail('No file for this request.', 404);
      $type = $r['file_type'] === 'pdf' ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
      $name = str_replace(' ', '-', $r['code']) . '-' . preg_replace('/[^\w.\-]+/', '_', $r['file_name']);
      header('Content-Type: ' . $type); header('Content-Disposition: attachment; filename="' . $name . '"'); header('Content-Length: ' . filesize($path)); header('Cache-Control: no-store'); header('X-Content-Type-Options: nosniff');
      readfile($path); exit;
    }

    case 'admin_classreq_delete': {
      mh_method('POST'); $u = mh_require_user(); if (!mh_is_admin($u)) mh_fail('Admins only.', 403);
      $st = $db->prepare('SELECT * FROM class_requests WHERE id = ?'); $st->execute([(int)($in['id'] ?? 0)]); $r = $st->fetch(); if (!$r) mh_fail('Request not found.', 404);
      if ($r['file'] !== '') mh_req_remove_file($r['file']);
      $db->prepare('DELETE FROM class_requests WHERE id = ?')->execute([(int)$r['id']]);
      mh_json(['ok' => true]);
    }
  }
  mh_fail('Not found.', 404);
}
