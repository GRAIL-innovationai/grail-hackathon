<?php
/* ============================================================
   Mathub account server — class packs
   A class pack is one JSON file with a whole class in it (syllabus
   facts, calendar, exams, notes, flashcards, question bank). The admin
   uploads it in the admin panel and the class appears for everyone:
   no new code, no redeploy. Packs live in the class_packs table, so the
   database backups carry them. The browser cleans every string in a
   pack before showing it and builds the questions from declarative
   specs (assets/classpacks.js), so a pack is data and never code.
   The previous version is kept for one-click rollback.
   Routes: classpack_list, classpack_get,
           admin_classpacks, admin_classpack_install, admin_classpack_set,
           admin_classpack_rollback, admin_classpack_download, admin_classpack_delete
   ============================================================ */
declare(strict_types=1);

const MH_PACK_MAX_BYTES = 3 * 1024 * 1024;
const MH_PACK_ID_RE = '/^[a-z]{1,6}\d{2,4}[a-z]?$/';

/** The structural checks the server insists on; the admin panel runs the full check (questions included) before upload. Returns an error or ''. */
function mh_pack_check($p): string {
  if (!is_array($p)) return 'That is not a class pack (expected a JSON object).';
  if (($p['format'] ?? '') !== 'mathub-class-pack') return 'This file is not a Mathub class pack ("format" is missing).';
  if (($p['version'] ?? 0) !== 1) return 'This class pack format version is not supported.';
  $id = (string)($p['id'] ?? '');
  if (!preg_match(MH_PACK_ID_RE, $id)) return 'The class id must be letters then a course number, like chmy121.';
  if (isset(MH_BUILTIN_NAMES[$id])) return "\"$id\" is a built-in class and cannot be replaced by a pack.";
  foreach (['code' => 40, 'name' => 120, 'term' => 60] as $k => $max) { $v = $p[$k] ?? ''; if (!is_string($v) || trim($v) === '' || mb_strlen($v) > $max) return "\"$k\" is required (up to $max characters)."; }
  if (isset($p['short']) && (!is_string($p['short']) || mb_strlen($p['short']) > 24)) return '"short" must be a short label.';
  if (!preg_match('/^#[0-9a-f]{6}$/i', (string)($p['color']['light'] ?? ''))) return '"color.light" must be a hex colour like #0F766E.';
  if (!is_array($p['SECTIONS'] ?? null) || !$p['SECTIONS']) return '"SECTIONS" needs at least one topic.';
  if (!is_array($p['UNITS'] ?? null) || !$p['UNITS']) return '"UNITS" needs at least one unit.';
  if (!is_array($p['GRADING']['categories'] ?? null)) return '"GRADING.categories" is required.';
  return '';
}
/** The light part every page needs before the class is opened: what assets/courses-index.js holds for a built-in class. */
function mh_pack_stub(array $p): array {
  $s = [];
  foreach (['id', 'code', 'name', 'short', 'term', 'tagline', 'kind', 'quizNote', 'COURSE', 'EXAMS', 'CALENDAR', 'CALENDAR_NOTE', 'RECURRING', 'SEMESTER', 'VARIANTS', 'UNITS', 'NAV', 'color', 'archetype', 'resources', 'resourcesBlurb', 'guides', 'canvasMatch'] as $k) if (array_key_exists($k, $p)) $s[$k] = $p[$k];
  if (empty($s['short'])) $s['short'] = $p['code'];
  $s['SECTIONS'] = array_values(array_map(fn($x) => ['id' => (string)($x['id'] ?? ''), 'label' => (string)($x['label'] ?? ($x['id'] ?? '')), 'title' => (string)($x['title'] ?? ''), 'unit' => $x['unit'] ?? 1], array_filter($p['SECTIONS'] ?? [], 'is_array')));
  $topics = $p['QUIZ']['topics'] ?? null;
  if (is_array($topics) && $topics) { $s['hasQuiz'] = true; $s['quizTopics'] = []; foreach ($topics as $k => $t) $s['quizTopics'][(string)$k] = ['label' => (string)($t['label'] ?? $k), 'sec' => (string)($t['sec'] ?? $k), 'unit' => $t['unit'] ?? 1]; }
  $s['hasGrading'] = !empty($p['GRADING']['categories']);
  $s['sectionCount'] = count($s['SECTIONS']); $s['flashcardCount'] = is_array($p['FLASHCARDS'] ?? null) ? count($p['FLASHCARDS']) : 0;
  $s['formulaCount'] = 0; foreach ((array)($p['FORMULAS'] ?? []) as $g) if (is_array($g)) $s['formulaCount'] += count((array)($g['items'] ?? []));
  return $s;
}
function mh_pack_canvas(array $p): string { $c = array_values(array_filter((array)($p['canvasMatch'] ?? []), fn($x) => is_string($x) && trim($x) !== '')); return $c ? json_encode(array_slice($c, 0, 8)) : ''; }
function mh_pack_get(string $id): ?array { $st = mh_pack_db()->prepare('SELECT * FROM class_packs WHERE id = ?'); $st->execute([$id]); $r = $st->fetch(); return $r ?: null; }
function mh_pack_id_in(array $in): string { $id = strtolower((string)($in['id'] ?? $_GET['id'] ?? '')); return preg_match(MH_PACK_ID_RE, $id) ? $id : ''; }
/** Open requests per course code, so the admin panel can offer to tell the students who asked. */
function mh_pack_request_counts(): array {
  try { require_once __DIR__ . '/requests.php'; $rows = mh_req_db()->query('SELECT code, COUNT(*) AS n FROM class_requests WHERE status IN (\'new\', \'working\') GROUP BY code')->fetchAll(); } catch (Throwable $e) { return []; }
  $out = []; foreach ($rows as $r) $out[$r['code']] = (int)$r['n']; return $out;
}
/** Marks the requests for this class as added and messages everyone who asked. Returns how many students were told. */
function mh_pack_notify(array $p, string $id): int {
  require_once __DIR__ . '/forum.php'; require_once __DIR__ . '/requests.php';
  $code = mh_req_code((string)$p['code']); if (!$code) return 0;
  return max(0, mh_req_set_status($code, 'added', '', $id));
}
function mh_pack_meta(array $r, array $req): array {
  require_once __DIR__ . '/requests.php'; $code = mh_req_code((string)$r['code']) ?? (string)$r['code'];
  return ['id' => $r['id'], 'code' => $r['code'], 'name' => $r['name'], 'short' => $r['short'], 'version' => (int)$r['version'], 'enabled' => (bool)$r['enabled'], 'size' => (int)$r['size'], 'uploaded_by' => $r['uploaded_by'], 'created' => (int)$r['created'], 'updated' => (int)$r['updated'], 'has_prev' => $r['prev_json'] !== '', 'requests' => $req[$code] ?? 0];
}

/** Writes a checked pack. A new id is inserted as version 1; an existing one is updated and its previous copy kept for rollback.
 *  $publish null keeps the current published state (new classes are published). Returns [the row before the write or null, published]. */
function mh_pack_store(PDO $db, array $p, string $raw, string $by, ?int $publish): array {
  $id = $p['id']; $min = json_encode(json_decode($raw), JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
  $stub = json_encode(mh_pack_stub($p), JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
  $old = mh_pack_get($id); $now = time(); $by = mb_substr($by, 0, 120);
  $enabled = $publish !== null ? $publish : ($old ? (int)$old['enabled'] : 1);
  $short = mb_substr(trim((string)($p['short'] ?? '')) ?: (string)$p['code'], 0, 24);
  if ($old) $db->prepare('UPDATE class_packs SET code = ?, name = ?, short = ?, version = version + 1, prev_json = json, json = ?, stub = ?, canvas = ?, enabled = ?, size = ?, uploaded_by = ?, updated = ? WHERE id = ?')
    ->execute([$p['code'], $p['name'], $short, $min, $stub, mh_pack_canvas($p), $enabled, strlen($min), $by, $now, $id]);
  else $db->prepare('INSERT INTO class_packs (id, code, name, short, version, json, prev_json, stub, canvas, enabled, size, uploaded_by, created, updated) VALUES (?, ?, ?, ?, 1, ?, \'\', ?, ?, ?, ?, ?, ?, ?)')
    ->execute([$id, $p['code'], $p['name'], $short, $min, $stub, mh_pack_canvas($p), $enabled, strlen($min), $by, $now, $now]);
  return [$old, $enabled];
}

/** Class packs shipped in packs/*.mathub.json (called from mh_packs_seed_bundled in lib.php when those files change).
 *  A bundled class seen for the first time is installed and published, unless an admin already uploaded that id (theirs stays).
 *  A newer bundled file updates the class only while it is still the bundled copy. A class an admin deleted is never re-added. */
const MH_PACK_BUNDLED = 'bundled with the site';
function mh_packs_apply_bundled(PDO $db, array $files): void {
  $seen = $db->prepare('SELECT sha FROM class_pack_seeds WHERE id = ?'); $mark = $db->prepare('INSERT OR REPLACE INTO class_pack_seeds (id, sha, seeded) VALUES (?, ?, ?)');
  foreach ($files as $f) {
    $raw = (string)@file_get_contents($f); if ($raw === '' || strlen($raw) > MH_PACK_MAX_BYTES) continue;
    $p = json_decode($raw, true); $err = mh_pack_check($p); if ($err !== '') { error_log('Mathub bundled pack ' . basename($f) . ': ' . $err); continue; }
    $id = $p['id']; $sha = sha1($raw); $seen->execute([$id]); $prev = $seen->fetchColumn(); if ($prev === $sha) continue;
    $row = mh_pack_get($id);
    if ($prev === false ? !$row : ($row && $row['uploaded_by'] === MH_PACK_BUNDLED)) {
      [$old, $enabled] = mh_pack_store($db, $p, $raw, MH_PACK_BUNDLED, null);
      if (!$old && $enabled) { try { require_once __DIR__ . '/social.php'; mh_activity('class', $id, 'New class on Mathub: ' . $p['code'] . ' ' . $p['name'], '#/' . $id); } catch (Throwable $e) {} }
    }
    $mark->execute([$id, $sha, time()]);
  }
}

/** Pack ids of #/teach classes the signed-in person may open: classes they joined, own or help teach. */
/** The classes built in #/teach that the signed-in person may open, as pack id => 'student' (joined it) or 'team' (owner, co-instructor or TA). */
function mh_pack_teach_roles(): array {
  $u = mh_current_user(); if (!$u) return [];
  try { require_once __DIR__ . '/teach.php'; $db = mh_teach_db(); $st = $db->prepare('SELECT c.pack_id, CASE WHEN c.owner_id = ? THEN \'team\' WHEN m.role = \'ta\' THEN \'team\' ELSE \'student\' END AS r FROM teach_classes c LEFT JOIN teach_members m ON m.class_id = c.id AND m.user_id = ? WHERE c.pack_id != \'\' AND (c.owner_id = ? OR m.user_id IS NOT NULL)'); $st->execute([$u['id'], $u['id'], $u['id']]);
    $out = []; foreach ($st->fetchAll() as $r) $out[(string)$r['pack_id']] = $r['r'] === 'student' ? 'student' : 'team'; return $out; }
  catch (Throwable $e) { error_log('Mathub teach visibility: ' . $e->getMessage()); return []; }
}
function mh_pack_teach_visible(): array { return array_keys(mh_pack_teach_roles()); }
function mh_packs_route(string $route, array $in, array $cfg, string $ip): void {
  $db = mh_pack_db();
  $admin = function (): array { $u = mh_require_user(); if (!mh_is_admin($u)) mh_fail('Admins only.', 403); return $u; };
  switch ($route) {

    /* the light stubs of every published pack (admins also get hidden ones, marked hidden) */
    case 'classpack_list': {
      mh_method('GET'); $isAdmin = mh_is_admin(mh_current_user()); $roles = mh_pack_teach_roles();
      $rows = $db->query('SELECT id, version, enabled, stub, uploaded_by FROM class_packs' . ($isAdmin ? '' : ' WHERE enabled = 1') . ' ORDER BY created, id')->fetchAll();
      // a class built in #/teach is listed for the students who joined it; its teaching team (and admins) get it as a preview, kept out of their own class lists
      $out = []; foreach ($rows as $r) { $teach = str_starts_with((string)$r['uploaded_by'], 'teach:'); $role = $roles[$r['id']] ?? '';
        if ($teach && $role === '' && !$isAdmin) continue; $o = json_decode((string)$r['stub']); if (!is_object($o)) continue; $o->id = $r['id']; $o->version = (int)$r['version']; $o->hidden = !(int)$r['enabled']; if ($teach && $role !== 'student') $o->preview = true; $out[] = $o; }
      mh_json(['ok' => true, 'packs' => $out]);
    }

    case 'classpack_get': {
      mh_method('GET'); $id = mh_pack_id_in($in); $r = $id ? mh_pack_get($id) : null;
      if (!$r || (!(int)$r['enabled'] && !mh_is_admin(mh_current_user()))) mh_fail('This class is not on Mathub.', 404);
      if (str_starts_with((string)$r['uploaded_by'], 'teach:') && !mh_is_admin(mh_current_user()) && !in_array($id, mh_pack_teach_visible(), true)) mh_fail('Join this class with the code from your instructor to open it.', 403);
      mh_json(['ok' => true, 'version' => (int)$r['version'], 'pack' => json_decode((string)$r['json'])]);
    }

    /* --- administrators --- */
    case 'admin_classpacks': {
      mh_method('GET'); $admin(); $req = mh_pack_request_counts();
      mh_json(['ok' => true, 'packs' => array_map(fn($r) => mh_pack_meta($r, $req), $db->query('SELECT * FROM class_packs ORDER BY created DESC')->fetchAll()), 'requests' => (object)$req, 'max_mb' => MH_PACK_MAX_BYTES / 1048576]);
    }

    /* the pack arrives as text (json), so {} and [] survive exactly; installing an id that exists replaces it and keeps the old one for rollback */
    case 'admin_classpack_install': {
      mh_method('POST'); $u = $admin();
      $raw = (string)($in['json'] ?? ''); if ($raw === '') mh_fail('Choose a class pack file.');
      if (strlen($raw) > MH_PACK_MAX_BYTES) mh_fail('Class packs can be up to ' . (MH_PACK_MAX_BYTES / 1048576) . ' MB.', 413);
      $p = json_decode($raw, true); if (!is_array($p)) mh_fail('This file is not valid JSON: ' . json_last_error_msg() . '.');
      if ($err = mh_pack_check($p)) mh_fail($err);
      $id = $p['id'];
      if (mh_pack_get($id) && !empty($in['expect_new'])) mh_fail("A class with the id $id is already installed. Upload it as an update instead.", 409, ['exists' => true]);
      [$old, $enabled] = mh_pack_store($db, $p, $raw, (string)$u['email'], array_key_exists('publish', $in) ? (!empty($in['publish']) ? 1 : 0) : null);
      $notified = !empty($in['notify']) && $enabled ? mh_pack_notify($p, $id) : 0;
      if (!$old && $enabled) { try { require_once __DIR__ . '/social.php'; mh_activity('class', $id, 'New class on Mathub: ' . $p['code'] . ' ' . $p['name'], '#/' . $id); } catch (Throwable $e) {} }
      $r = mh_pack_get($id);
      mh_json(['ok' => true, 'created' => !$old, 'notified' => $notified, 'pack' => mh_pack_meta($r, mh_pack_request_counts())]);
    }

    /* hide or publish; publishing can also tell the students who asked */
    case 'admin_classpack_set': {
      mh_method('POST'); $admin(); $id = mh_pack_id_in($in); $r = $id ? mh_pack_get($id) : null; if (!$r) mh_fail('Class pack not found.', 404);
      $on = !empty($in['enabled']) ? 1 : 0;
      $db->prepare('UPDATE class_packs SET enabled = ?, updated = ? WHERE id = ?')->execute([$on, time(), $id]);
      $notified = $on && !empty($in['notify']) ? mh_pack_notify(json_decode((string)$r['json'], true) ?: ['code' => $r['code']], $id) : 0;
      mh_json(['ok' => true, 'notified' => $notified, 'pack' => mh_pack_meta(mh_pack_get($id), mh_pack_request_counts())]);
    }

    case 'admin_classpack_rollback': {
      mh_method('POST'); $admin(); $id = mh_pack_id_in($in); $r = $id ? mh_pack_get($id) : null; if (!$r) mh_fail('Class pack not found.', 404);
      if ($r['prev_json'] === '') mh_fail('There is no earlier version to go back to.');
      $p = json_decode((string)$r['prev_json'], true); if (!is_array($p)) mh_fail('The earlier version is damaged.', 500);
      $db->prepare('UPDATE class_packs SET json = prev_json, prev_json = ?, stub = ?, code = ?, name = ?, short = ?, canvas = ?, size = ?, version = version + 1, updated = ? WHERE id = ?')
        ->execute([$r['json'], json_encode(mh_pack_stub($p), JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE), $p['code'], $p['name'], mb_substr(trim((string)($p['short'] ?? '')) ?: (string)$p['code'], 0, 24), mh_pack_canvas($p), strlen((string)$r['prev_json']), time(), $id]);
      mh_json(['ok' => true, 'pack' => mh_pack_meta(mh_pack_get($id), mh_pack_request_counts())]);
    }

    case 'admin_classpack_download': {
      mh_method('GET'); $admin(); $id = mh_pack_id_in($in); $r = $id ? mh_pack_get($id) : null; if (!$r) mh_fail('Class pack not found.', 404);
      $json = ($_GET['which'] ?? '') === 'prev' && $r['prev_json'] !== '' ? $r['prev_json'] : $r['json'];
      $pretty = json_encode(json_decode((string)$json), JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
      header('Content-Type: application/json; charset=UTF-8'); header('Content-Disposition: attachment; filename="' . $id . '.mathub.json"'); header('Cache-Control: no-store'); header('X-Content-Type-Options: nosniff');
      echo $pretty; exit;
    }

    /* removes the class from the site. Students' saved progress and its discussion posts stay in the database,
       so installing a pack with the same id later brings them back. Confirmed by typing the course code. */
    case 'admin_classpack_delete': {
      mh_method('POST'); $admin(); $id = mh_pack_id_in($in); $r = $id ? mh_pack_get($id) : null; if (!$r) mh_fail('Class pack not found.', 404);
      $norm = fn($s) => strtoupper(preg_replace('/[^a-z0-9]/i', '', (string)$s));
      if ($norm($in['confirm'] ?? '') !== $norm($r['code'])) mh_fail('Type the course code (' . $r['code'] . ') to confirm.');
      $db->prepare('DELETE FROM class_packs WHERE id = ?')->execute([$id]);
      mh_json(['ok' => true]);
    }
  }
  mh_fail('Unknown route.', 404);
}
