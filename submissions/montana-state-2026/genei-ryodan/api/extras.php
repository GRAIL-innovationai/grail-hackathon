<?php
/* ============================================================
   Mathub account server — problem reports, backups, preferences
   Routes: issue_report, admin_issues, admin_issue, admin_backups,
           admin_backup_now, admin_backup_download, prefs
   mh_backup_tick() runs from housekeeping once a day and keeps the
   last 14 copies of the database in data/backups (denied to the web).
   ============================================================ */
declare(strict_types=1);

function mh_backup_dir(): string { $d = dirname(mh_config()['db_path']) . '/backups'; if (!is_dir($d)) { @mkdir($d, 0755, true); @file_put_contents($d . '/.htaccess', "Require all denied\n"); @file_put_contents($d . '/index.html', ''); } return $d; }
function mh_backup_list(): array {
  $out = []; foreach (glob(mh_backup_dir() . '/mathub-*.sqlite') ?: [] as $f) $out[] = ['name' => basename($f), 'size' => filesize($f), 'mtime' => filemtime($f)];
  usort($out, fn($a, $b) => $b['mtime'] <=> $a['mtime']); return $out;
}
/** Copies the live database with SQLite's own VACUUM INTO (consistent even while in use), falling back to a checkpoint + file copy. */
function mh_backup_make(string $why = 'auto'): array {
  $db = mh_db(); $dir = mh_backup_dir(); $name = 'mathub-' . (new DateTime('now', mh_tz()))->format('Ymd-Hi') . ($why === 'manual' ? '-manual' : '') . '.sqlite'; $path = "$dir/$name";
  if (is_file($path)) @unlink($path);
  try { $db->exec("VACUUM INTO '" . str_replace("'", "''", $path) . "'"); }
  catch (Throwable $e) { $db->exec('PRAGMA wal_checkpoint(TRUNCATE)'); if (!@copy(mh_config()['db_path'], $path)) throw new RuntimeException('Could not write the backup file.'); }
  $keep = 14; $list = mh_backup_list(); foreach (array_slice($list, $keep) as $old) if (strpos($old['name'], '-manual') === false) @unlink("$dir/{$old['name']}");
  return ['name' => $name, 'size' => filesize($path)];
}
function mh_backup_tick(): ?array {
  $list = mh_backup_list(); if ($list && time() - $list[0]['mtime'] < 20 * 3600) return null;
  try { return mh_backup_make('auto'); } catch (Throwable $e) { return null; }
}

function mh_extras_route(string $route, array $in, array $cfg, string $ip): void {
  $db = mh_db();
  switch ($route) {
    /* --- problem reports --- */
    case 'issue_report': {
      mh_method('POST'); $u = mh_current_user(); mh_rate_or_fail("issue:ip:$ip", 20, 3600, 'That is a lot of reports at once. Try again in an hour.');
      $course = preg_replace('/[^a-z0-9]/', '', (string)($in['course'] ?? '')); $reason = in_array($in['reason'] ?? '', ['wrong', 'typo', 'unclear', 'bug', 'link', 'resource', 'other'], true) ? $in['reason'] : 'other';
      $ref = mh_str($in, 'ref', 120); $prompt = mh_str($in, 'prompt', 400); $comment = mh_str($in, 'comment', 800); $answer = mh_str($in, 'answer', 200); $view = mh_str($in, 'view', 60); $url = mh_str($in, 'url', 200); $build = mh_str($in, 'build', 30);
      if ($comment === '' && $prompt === '' && $ref === '') mh_fail('Tell us what the problem is.');
      $st = $db->prepare('SELECT COUNT(*) FROM issues WHERE prompt = ? AND prompt != "" AND status = "open"'); $st->execute([$prompt]); $dupes = (int)$st->fetchColumn();
      $db->prepare('INSERT INTO issues (user_id, email, course, view, ref, prompt, answer, reason, comment, url, build, ua, created, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, "open")')
        ->execute([$u ? (int)$u['id'] : 0, $u ? $u['email'] : '', $course, $view, $ref, $prompt, $answer, $reason, $comment, $url, $build, mb_substr((string)($_SERVER['HTTP_USER_AGENT'] ?? ''), 0, 160), time()]);
      mh_json(['ok' => true, 'count' => $dupes + 1]);
    }
    case 'admin_issues': {
      mh_method('GET'); $u = mh_require_user(); if (!mh_is_mod($u)) mh_fail('Staff only.', 403);
      $status = ($_GET['status'] ?? 'open') === 'all' ? 'all' : (($_GET['status'] ?? 'open') === 'resolved' ? 'resolved' : 'open'); $page = max(1, (int)($_GET['page'] ?? 1)); $per = 30;
      $where = $status === 'all' ? '1=1' : 'status = ' . $db->quote($status);
      $rows = $db->query("SELECT * FROM issues WHERE $where ORDER BY id DESC LIMIT $per OFFSET " . (($page - 1) * $per))->fetchAll();
      $open = (int)$db->query('SELECT COUNT(*) FROM issues WHERE status = "open"')->fetchColumn(); $total = (int)$db->query("SELECT COUNT(*) FROM issues WHERE $where")->fetchColumn();
      mh_json(['ok' => true, 'items' => $rows, 'open' => $open, 'total' => $total, 'page' => $page, 'more' => $page * $per < $total]);
    }
    case 'admin_issue': {
      mh_method('POST'); $u = mh_require_user(); if (!mh_is_mod($u)) mh_fail('Staff only.', 403);
      $id = (int)($in['id'] ?? 0); $action = (string)($in['action'] ?? '');
      if ($action === 'delete') { if (!mh_is_admin($u)) mh_fail('Admins only.', 403); $db->prepare('DELETE FROM issues WHERE id = ?')->execute([$id]); }
      elseif ($action === 'resolve' || $action === 'reopen') { $db->prepare('UPDATE issues SET status = ?, resolved_by = ?, resolved = ? WHERE id = ?')->execute([$action === 'resolve' ? 'resolved' : 'open', $action === 'resolve' ? (int)$u['id'] : 0, $action === 'resolve' ? time() : 0, $id]);
        if ($action === 'resolve') { $st = $db->prepare('SELECT user_id, course, ref FROM issues WHERE id = ?'); $st->execute([$id]); $r = $st->fetch(); $note = mh_str($in, 'note', 300);
          if ($r && (int)$r['user_id'] > 0) { $db->prepare('INSERT INTO notifications (user_id, kind, post_id, comment_id, actor_id, actor, title, snippet, link, created) VALUES (?, "issue", 0, NULL, ?, ?, ?, ?, ?, ?)')->execute([(int)$r['user_id'], (int)$u['id'], mh_display_name($u), $r['ref'] !== '' ? $r['ref'] : ($r['course'] ? 'a ' . $r['course'] . ' page' : 'a page'), $note !== '' ? $note : 'Thank you for flagging it!', $r['course'] ? '#/' . $r['course'] : '#/', time()]); } }
      } else mh_fail('Unknown action.');
      mh_json(['ok' => true]);
    }
    /* --- backups --- */
    case 'admin_backups': { mh_method('GET'); $u = mh_require_user(); if (!mh_is_admin($u)) mh_fail('Admins only.', 403); mh_json(['ok' => true, 'items' => mh_backup_list(), 'db_size' => @filesize($cfg['db_path']) ?: 0]); }
    case 'admin_backup_now': { mh_method('POST'); $u = mh_require_user(); if (!mh_is_admin($u)) mh_fail('Admins only.', 403); try { mh_json(['ok' => true, 'backup' => mh_backup_make('manual')]); } catch (Throwable $e) { mh_fail('Backup failed: ' . $e->getMessage(), 500); } }
    case 'admin_backup_download': {
      mh_method('GET'); $u = mh_require_user(); if (!mh_is_admin($u)) mh_fail('Admins only.', 403);
      $name = basename((string)($_GET['file'] ?? '')); if (!preg_match('/^mathub-[0-9]{8}-[0-9]{4}(-manual)?\.sqlite$/', $name)) mh_fail('Unknown backup.', 404);
      $path = mh_backup_dir() . '/' . $name; if (!is_file($path)) mh_fail('Unknown backup.', 404);
      header('Content-Type: application/octet-stream'); header('Content-Disposition: attachment; filename="' . $name . '"'); header('Content-Length: ' . filesize($path)); header('Cache-Control: no-store'); readfile($path); exit;
    }
    /* --- preferences that follow the account --- */
    case 'prefs': {
      mh_method('GET', 'PUT', 'POST'); $u = mh_require_user();
      if ($_SERVER['REQUEST_METHOD'] === 'GET') mh_json(['ok' => true, 'prefs' => $u['prefs'] ? (json_decode((string)$u['prefs'], true) ?: (object)[]) : (object)[], 'updated' => (int)($u['prefs_updated'] ?? 0)]);
      $prefs = is_array($in['prefs'] ?? null) ? $in['prefs'] : []; $updated = (int)($in['updated'] ?? time()); $stored = (int)($u['prefs_updated'] ?? 0);
      $json = json_encode($prefs); if (strlen($json) > 60000) mh_fail('Preferences are too large.');
      if ($updated >= $stored) { $db->prepare('UPDATE users SET prefs = ?, prefs_updated = ? WHERE id = ?')->execute([$json, $updated, $u['id']]); mh_json(['ok' => true, 'prefs' => $prefs, 'updated' => $updated]); }
      mh_json(['ok' => true, 'stale' => true, 'prefs' => json_decode((string)$u['prefs'], true) ?: (object)[], 'updated' => $stored]);
    }
  }
  mh_fail('Not found.', 404);
}
