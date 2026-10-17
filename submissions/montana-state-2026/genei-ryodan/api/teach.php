<?php
/* ============================================================
   Mathub account server — the professors' section (#/teach)
   Instructors build a syllabus in a form, publish it, and the class
   becomes a Mathub class for their students: calendar, exam
   countdowns, grade calculator with their weights, syllabus page and
   a class board. Around it: a join code, a roster, announcements,
   practice assignments drawn from Mathub's question banks,
   attendance check-in, and class insights.

   Who can do what
   - Anyone signed in can write syllabi: drafts, the live preview and
     the printable page are private to their author.
   - Faculty status is confirmed by an administrator (a request from
     #/teach, approved in the admin panel); administrators count as
     confirmed. Only a confirmed owner's class can be published, joined
     by students, or use the roster, announcements, assignments,
     attendance and insights.
   - A class belongs to the person who made it. Co-instructors and
     TAs the owner adds can edit it too. Nobody else can.
   - The class is the instructor's tool, not one of their own classes:
     it never joins the teaching team's class list on the student
     site (they can open it there as a preview).
   - Students join with the class code. They see the class, its
     announcements and assignments. Their instructor sees their name,
     email, assignment results and check-ins for this class only, never
     the rest of their Mathub activity.
   - Every string an instructor types is stored as plain text. The
     published class is built here, on the server, from that text, so
     no instructor can inject markup into a student's page.

   Routes: teach_me, teach_request, teach_class_create, teach_class_get,
           teach_class_save, teach_class_publish, teach_class_unpublish,
           teach_class_delete, teach_class_code, teach_join_info,
           teach_join, teach_leave, teach_hub, teach_roster,
           teach_member_remove, teach_staff_add, teach_post,
           teach_post_delete, teach_assignment_save,
           teach_assignment_delete, teach_submit, teach_results,
           teach_att_open, teach_att_close, teach_checkin,
           teach_insights, admin_teach_requests, admin_teach_decide
   ============================================================ */
declare(strict_types=1);

const MH_TEACH_CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';   // no 0/O, 1/I/L
const MH_TEACH_CAL_TYPES = ['lecture', 'lab', 'exam', 'review', 'holiday', 'due', 'other'];
const MH_TEACH_MAX_SYLLABUS = 200000;

function mh_teach_db(): PDO {
  static $ready = false; $db = mh_db();
  if ($ready) return $db;
  $db->exec('CREATE TABLE IF NOT EXISTS teach_requests (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, name TEXT NOT NULL, title TEXT NOT NULL DEFAULT \'\', department TEXT NOT NULL DEFAULT \'\', courses TEXT NOT NULL DEFAULT \'\', message TEXT NOT NULL DEFAULT \'\', status TEXT NOT NULL DEFAULT \'new\', created INTEGER NOT NULL, decided INTEGER NOT NULL DEFAULT 0, decided_by INTEGER NOT NULL DEFAULT 0)');
  $db->exec('CREATE TABLE IF NOT EXISTS teach_classes (id INTEGER PRIMARY KEY AUTOINCREMENT, owner_id INTEGER NOT NULL, code TEXT NOT NULL, title TEXT NOT NULL, term TEXT NOT NULL DEFAULT \'\', section TEXT NOT NULL DEFAULT \'\', join_code TEXT NOT NULL UNIQUE, link_course TEXT NOT NULL DEFAULT \'\', pack_id TEXT NOT NULL DEFAULT \'\', status TEXT NOT NULL DEFAULT \'draft\', syllabus TEXT NOT NULL, published TEXT NOT NULL DEFAULT \'\', published_at INTEGER NOT NULL DEFAULT 0, version INTEGER NOT NULL DEFAULT 0, created INTEGER NOT NULL, updated INTEGER NOT NULL)');
  $db->exec('CREATE TABLE IF NOT EXISTS teach_members (class_id INTEGER NOT NULL REFERENCES teach_classes(id) ON DELETE CASCADE, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, role TEXT NOT NULL DEFAULT \'student\', joined INTEGER NOT NULL, PRIMARY KEY (class_id, user_id))');
  $db->exec('CREATE INDEX IF NOT EXISTS teach_members_user ON teach_members(user_id)');
  $db->exec('CREATE TABLE IF NOT EXISTS teach_posts (id INTEGER PRIMARY KEY AUTOINCREMENT, class_id INTEGER NOT NULL REFERENCES teach_classes(id) ON DELETE CASCADE, user_id INTEGER NOT NULL, title TEXT NOT NULL, body TEXT NOT NULL DEFAULT \'\', pinned INTEGER NOT NULL DEFAULT 0, created INTEGER NOT NULL)');
  $db->exec('CREATE TABLE IF NOT EXISTS teach_assignments (id INTEGER PRIMARY KEY AUTOINCREMENT, class_id INTEGER NOT NULL REFERENCES teach_classes(id) ON DELETE CASCADE, title TEXT NOT NULL, course TEXT NOT NULL, topics TEXT NOT NULL, count INTEGER NOT NULL, minutes INTEGER NOT NULL DEFAULT 0, due INTEGER NOT NULL DEFAULT 0, note TEXT NOT NULL DEFAULT \'\', seed INTEGER NOT NULL, created_by INTEGER NOT NULL, created INTEGER NOT NULL)');
  $db->exec('CREATE TABLE IF NOT EXISTS teach_submissions (assignment_id INTEGER NOT NULL REFERENCES teach_assignments(id) ON DELETE CASCADE, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, score INTEGER NOT NULL, total INTEGER NOT NULL, best INTEGER NOT NULL, seconds INTEGER NOT NULL DEFAULT 0, attempts INTEGER NOT NULL DEFAULT 1, topics TEXT NOT NULL DEFAULT \'\', created INTEGER NOT NULL, updated INTEGER NOT NULL, PRIMARY KEY (assignment_id, user_id))');
  $db->exec('CREATE TABLE IF NOT EXISTS teach_attendance (id INTEGER PRIMARY KEY AUTOINCREMENT, class_id INTEGER NOT NULL REFERENCES teach_classes(id) ON DELETE CASCADE, label TEXT NOT NULL DEFAULT \'\', code TEXT NOT NULL, opens INTEGER NOT NULL, closes INTEGER NOT NULL, created_by INTEGER NOT NULL)');
  $db->exec('CREATE TABLE IF NOT EXISTS teach_checkins (session_id INTEGER NOT NULL REFERENCES teach_attendance(id) ON DELETE CASCADE, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, created INTEGER NOT NULL, PRIMARY KEY (session_id, user_id))');
  $rcols = array_column($db->query('PRAGMA table_info(roles)')->fetchAll(), 'name');
  if (!in_array('scope', $rcols, true)) $db->exec('ALTER TABLE roles ADD COLUMN scope TEXT NOT NULL DEFAULT \'\'');   // "" = every class (granted by hand), "teach" = only the instructor's own classes
  $ready = true; return $db;
}

/* ---------- who is who ---------- */
function mh_teach_is_instructor(?array $u): bool { return $u ? (mh_is_admin($u) || mh_role((string)$u['email']) === 'Instructor') : false; }
function mh_teach_class(int $id): ?array { if ($id <= 0) return null; $st = mh_teach_db()->prepare('SELECT * FROM teach_classes WHERE id = ?'); $st->execute([$id]); $r = $st->fetch(); return $r ?: null; }
/** 'owner', 'staff' (co-instructor or TA), 'admin', 'student' or ''. */
function mh_teach_access(?array $u, array $c): string {
  if (!$u) return '';
  if ((int)$c['owner_id'] === (int)$u['id']) return 'owner';
  $st = mh_teach_db()->prepare('SELECT role FROM teach_members WHERE class_id = ? AND user_id = ?'); $st->execute([$c['id'], $u['id']]); $role = (string)$st->fetchColumn();
  if ($role === 'ta') return 'staff';
  if (mh_is_admin($u)) return 'admin';
  return $role === 'student' ? 'student' : '';
}
function mh_teach_staff_or_fail(array $u, array $c): string { $a = mh_teach_access($u, $c); if (!in_array($a, ['owner', 'staff', 'admin'], true)) mh_fail('Only this class\'s instructors can do that.', 403); return $a; }
/** Is the class owner's faculty status confirmed? Only then can the class reach students. */
function mh_teach_verified(array $c): bool {
  static $memo = []; $oid = (int)$c['owner_id']; if (array_key_exists($oid, $memo)) return $memo[$oid];
  $st = mh_db()->prepare('SELECT * FROM users WHERE id = ?'); $st->execute([$oid]); $o = $st->fetch();
  return $memo[$oid] = $o ? mh_teach_is_instructor($o) : false;
}
/** The teaching team of a confirmed class (or an administrator): publishing, roster, announcements, assignments, attendance, insights. */
function mh_teach_tools_or_fail(array $u, array $c): string {
  $a = mh_teach_staff_or_fail($u, $c);
  if ($a !== 'admin' && !mh_teach_verified($c)) mh_fail('Publishing and class tools turn on once your faculty status is confirmed.', 403, ['verify' => true]);
  return $a;
}
function mh_teach_class_or_fail(array $in): array { $c = mh_teach_class((int)($in['id'] ?? $_GET['id'] ?? 0)); if (!$c) mh_fail('Class not found.', 404); return $c; }
/** Pack ids of the classes this user teaches (owner or staff): the classes a "teach"-scoped instructor may post announcements to. */
function mh_teach_pack_ids_for(array $u): array {
  $st = mh_teach_db()->prepare('SELECT c.pack_id FROM teach_classes c LEFT JOIN teach_members m ON m.class_id = c.id AND m.user_id = ? AND m.role = \'ta\' WHERE c.pack_id != \'\' AND (c.owner_id = ? OR m.user_id IS NOT NULL)'); $st->execute([$u['id'], $u['id']]);
  return array_values(array_filter($st->fetchAll(PDO::FETCH_COLUMN)));
}
/** May this staff member act on this class id (announcements, official mocks)? Moderators and hand-granted staff: any class. Instructors from #/teach: their own classes. */
function mh_staff_can_course(array $u, string $course): bool {
  if (mh_is_mod($u)) return true;
  if (mh_role((string)$u['email']) === '') return false;
  $st = mh_teach_db()->prepare('SELECT scope FROM roles WHERE email = ?'); $st->execute([strtolower((string)$u['email'])]); $scope = $st->fetchColumn();
  if ($scope === false || $scope === '') return $course !== 'all';   // granted by hand (config or admin panel): any class, but only moderators post to everyone
  return in_array($course, mh_teach_pack_ids_for($u), true);
}

/* ---------- text in, text out ---------- */
/** Plain text: tags and control characters removed, line breaks kept, trimmed and capped. */
function mh_teach_text($v, int $max = 2000): string {
  if (!is_string($v) && !is_numeric($v)) return '';
  $s = strip_tags(str_replace(["\r\n", "\r"], "\n", (string)$v));
  $s = preg_replace('/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/u', '', $s) ?? ''; $s = preg_replace("/\n{3,}/", "\n\n", $s) ?? '';
  return trim(mb_substr($s, 0, $max));
}
function mh_teach_line($v, int $max = 200): string { return trim(preg_replace('/\s+/u', ' ', mh_teach_text($v, $max)) ?? ''); }
function mh_teach_url($v): string { $u = trim((string)(is_string($v) ? $v : '')); if ($u === '') return ''; if (!preg_match('#^https?://[^\s<>"\']+$#i', $u) || strlen($u) > 400) return ''; return $u; }
function mh_teach_date($v): string { $d = (string)(is_string($v) ? $v : ''); if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $d)) return ''; [$y, $m, $dd] = array_map('intval', explode('-', $d)); return checkdate($m, $dd, $y) && $y >= 2020 && $y <= 2100 ? $d : ''; }
function mh_teach_time($v): string { $t = (string)(is_string($v) ? $v : ''); return preg_match('/^([01]\d|2[0-3]):[0-5]\d$/', $t) ? $t : ''; }
function mh_teach_email($v): string { $e = strtolower(trim((string)(is_string($v) ? $v : ''))); return $e !== '' && strlen($e) <= 254 && filter_var($e, FILTER_VALIDATE_EMAIL) ? $e : ''; }
function mh_teach_list($v, int $max): array { return is_array($v) ? array_slice(array_values(array_filter($v, 'is_array')), 0, $max) : []; }
function mh_teach_h(string $s): string { return htmlspecialchars($s, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8'); }
/** A plain-text paragraph as HTML: escaped, blank lines become paragraphs, single line breaks become <br>, web addresses become links. */
function mh_teach_paras(string $s): string {
  if ($s === '') return '';
  $out = [];
  foreach (preg_split("/\n{2,}/", $s) as $p) {
    $h = mh_teach_h($p);
    $h = preg_replace('#(https?://[^\s<]+[^\s<.,;:)\]])#', '<a href="$1">$1</a>', $h) ?? $h;
    $out[] = '<p class="small">' . str_replace("\n", '<br>', $h) . '</p>';
  }
  return implode('', $out);
}

/* ---------- the starter syllabus ---------- */
const MH_TEACH_STARTER = [
  'accommodations' => 'If you have a disability and need accommodations in this course, contact the Office of Disability Services (137 Romney Hall, https://www.montana.edu/drv/disability/student.htm) as early as you can, then talk with me so we can put them in place. Accommodations are not retroactive.',
  'integrity' => 'You are expected to follow Montana State University\'s Student Conduct Code (https://www.montana.edu/policy/student_conduct/). Submit your own work, cite your sources and ask me when you are unsure what is allowed. Suspected violations are handled under the Code.',
  'wellbeing' => 'If you are struggling, help is free and confidential: Counseling & Psychological Services (https://www.montana.edu/counseling/) for students, and the 988 Suicide & Crisis Lifeline (call or text 988) at any hour. Please also tell me if something outside class is getting in the way; we can usually work something out.',
];
const MH_TEACH_AI = [
  'none' => 'Generative AI tools (ChatGPT, Claude, Gemini, Copilot and similar) may not be used for any graded work in this course. Using them counts as unauthorized assistance under the Student Conduct Code.',
  'disclose' => 'You may use generative AI tools to brainstorm, explain concepts or check your understanding, but the work you hand in must be your own. If you use AI on an assignment, say how in a short note at the end. Never submit AI-written answers as your own.',
  'open' => 'You may use generative AI tools in this course as you would a tutor or a reference. You are responsible for everything you submit, including any errors the tool makes, and you must be able to explain your work without it.',
];
function mh_teach_starter(array $u, array $c): array {
  return [
    'course' => ['code' => $c['code'], 'title' => $c['title'], 'term' => $c['term'], 'section' => $c['section'], 'credits' => '', 'modality' => 'In person', 'meets' => [['days' => '', 'start' => '', 'end' => '', 'room' => '', 'kind' => 'Lecture']], 'prereqs' => '', 'description' => '', 'outcomes' => [], 'canvas' => ''],
    'people' => [['role' => 'Instructor', 'name' => (string)($u['name'] ?: ''), 'email' => (string)$u['email'], 'office' => '', 'hours' => '', 'pronouns' => '']],
    'materials' => [],
    'grading' => ['categories' => [['name' => 'Homework', 'weight' => 20, 'note' => ''], ['name' => 'Quizzes', 'weight' => 10, 'note' => ''], ['name' => 'Midterm exams', 'weight' => 40, 'note' => ''], ['name' => 'Final exam', 'weight' => 30, 'note' => '']],
      'scale' => [['letter' => 'A', 'min' => 93], ['letter' => 'A-', 'min' => 90], ['letter' => 'B+', 'min' => 87], ['letter' => 'B', 'min' => 83], ['letter' => 'B-', 'min' => 80], ['letter' => 'C+', 'min' => 77], ['letter' => 'C', 'min' => 73], ['letter' => 'C-', 'min' => 70], ['letter' => 'D+', 'min' => 67], ['letter' => 'D', 'min' => 63], ['letter' => 'D-', 'min' => 60], ['letter' => 'F', 'min' => 0]], 'notes' => ''],
    'exams' => [],
    'schedule' => ['start' => '', 'end' => '', 'rows' => []],
    'policies' => ['attendance' => '', 'late' => '', 'ai' => 'disclose', 'aiText' => MH_TEACH_AI['disclose'], 'integrity' => MH_TEACH_STARTER['integrity'], 'accommodations' => MH_TEACH_STARTER['accommodations'], 'wellbeing' => MH_TEACH_STARTER['wellbeing'], 'communication' => '', 'other' => []],
  ];
}

/** Every field of a syllabus checked and cleaned. Unknown keys are dropped. */
function mh_teach_clean_syllabus($in): array {
  $in = is_array($in) ? $in : []; $c = is_array($in['course'] ?? null) ? $in['course'] : [];
  $out = ['course' => [
    'code' => mh_teach_line($c['code'] ?? '', 24), 'title' => mh_teach_line($c['title'] ?? '', 120), 'term' => mh_teach_line($c['term'] ?? '', 40), 'section' => mh_teach_line($c['section'] ?? '', 20),
    'credits' => mh_teach_line($c['credits'] ?? '', 10), 'modality' => mh_teach_line($c['modality'] ?? '', 40), 'prereqs' => mh_teach_text($c['prereqs'] ?? '', 400),
    'description' => mh_teach_text($c['description'] ?? '', 4000), 'canvas' => mh_teach_url($c['canvas'] ?? ''),
    'outcomes' => array_values(array_filter(array_map(fn($x) => mh_teach_line($x, 300), is_array($c['outcomes'] ?? null) ? array_slice($c['outcomes'], 0, 20) : []), fn($x) => $x !== '')),
    'meets' => array_map(fn($m) => ['days' => mh_teach_line($m['days'] ?? '', 20), 'start' => mh_teach_time($m['start'] ?? ''), 'end' => mh_teach_time($m['end'] ?? ''), 'room' => mh_teach_line($m['room'] ?? '', 60), 'kind' => mh_teach_line($m['kind'] ?? '', 30)], mh_teach_list($c['meets'] ?? null, 6)),
  ]];
  $out['people'] = array_map(fn($p) => ['role' => in_array($p['role'] ?? '', ['Instructor', 'Co-instructor', 'TA', 'Grader', 'Learning assistant'], true) ? $p['role'] : 'TA', 'name' => mh_teach_line($p['name'] ?? '', 80), 'email' => mh_teach_email($p['email'] ?? ''), 'office' => mh_teach_line($p['office'] ?? '', 80), 'hours' => mh_teach_text($p['hours'] ?? '', 300), 'pronouns' => mh_teach_line($p['pronouns'] ?? '', 30)], mh_teach_list($in['people'] ?? null, 12));
  $out['materials'] = array_map(fn($m) => ['title' => mh_teach_line($m['title'] ?? '', 160), 'url' => mh_teach_url($m['url'] ?? ''), 'required' => !empty($m['required']), 'note' => mh_teach_line($m['note'] ?? '', 200)], mh_teach_list($in['materials'] ?? null, 20));
  $g = is_array($in['grading'] ?? null) ? $in['grading'] : [];
  $out['grading'] = [
    'categories' => array_map(fn($x) => ['name' => mh_teach_line($x['name'] ?? '', 60), 'weight' => max(0, min(100, round((float)($x['weight'] ?? 0), 2))), 'note' => mh_teach_line($x['note'] ?? '', 160)], mh_teach_list($g['categories'] ?? null, 16)),
    'scale' => array_map(fn($x) => ['letter' => mh_teach_line($x['letter'] ?? '', 4), 'min' => max(0, min(100, round((float)($x['min'] ?? 0), 2)))], mh_teach_list($g['scale'] ?? null, 16)),
    'notes' => mh_teach_text($g['notes'] ?? '', 1500),
  ];
  $out['exams'] = array_map(fn($e) => ['name' => mh_teach_line($e['name'] ?? '', 60), 'date' => mh_teach_date($e['date'] ?? ''), 'time' => mh_teach_time($e['time'] ?? ''), 'place' => mh_teach_line($e['place'] ?? '', 80), 'covers' => mh_teach_text($e['covers'] ?? '', 400)], mh_teach_list($in['exams'] ?? null, 10));
  $s = is_array($in['schedule'] ?? null) ? $in['schedule'] : [];
  $rows = array_map(fn($r) => ['date' => mh_teach_date($r['date'] ?? ''), 'type' => in_array($r['type'] ?? '', MH_TEACH_CAL_TYPES, true) ? $r['type'] : 'lecture', 'title' => mh_teach_line($r['title'] ?? '', 140), 'notes' => mh_teach_text($r['notes'] ?? '', 400)], mh_teach_list($s['rows'] ?? null, 220));
  $rows = array_values(array_filter($rows, fn($r) => $r['date'] !== '')); usort($rows, fn($a, $b) => strcmp($a['date'], $b['date']));
  $out['schedule'] = ['start' => mh_teach_date($s['start'] ?? ''), 'end' => mh_teach_date($s['end'] ?? ''), 'rows' => $rows];
  $p = is_array($in['policies'] ?? null) ? $in['policies'] : [];
  $out['policies'] = ['ai' => in_array($p['ai'] ?? '', ['none', 'disclose', 'open', 'custom'], true) ? $p['ai'] : 'disclose'];
  foreach (['attendance', 'late', 'aiText', 'integrity', 'accommodations', 'wellbeing', 'communication'] as $k) $out['policies'][$k] = mh_teach_text($p[$k] ?? '', 3000);
  $out['policies']['other'] = array_values(array_filter(array_map(fn($x) => ['title' => mh_teach_line($x['title'] ?? '', 80), 'text' => mh_teach_text($x['text'] ?? '', 3000)], mh_teach_list($p['other'] ?? null, 8)), fn($x) => $x['title'] !== '' || $x['text'] !== ''));
  return $out;
}

/** What a reviewer would flag before the syllabus goes out: [['error'|'warn'|'tip', message, section]]. Errors block publishing.
    The section is the editor page that fixes it (course, people, about, materials, schedule, exams, grading, policies). */
function mh_teach_lint(array $s): array {
  $L = []; $sec = 'course';
  $E = function (string $m) use (&$L, &$sec) { $L[] = ['error', $m, $sec]; }; $W = function (string $m) use (&$L, &$sec) { $L[] = ['warn', $m, $sec]; }; $T = function (string $m) use (&$L, &$sec) { $L[] = ['tip', $m, $sec]; };
  $c = $s['course'];
  if ($c['code'] === '') $E('Add the course code (for example M 171).');
  if ($c['title'] === '') $E('Add the course title.');
  if ($c['term'] === '') $E('Add the term (for example Fall 2026).');
  $sec = 'people'; $people = array_values(array_filter($s['people'], fn($p) => $p['name'] !== ''));
  if (!$people) $E('Add at least one instructor with a name.');
  elseif (!array_filter($people, fn($p) => $p['email'] !== '')) $W('Give students an email address to reach you.');
  if ($people && !array_filter($people, fn($p) => $p['hours'] !== '')) $W('Add office hours (when and where students can find you).');
  $sec = 'course'; if (!array_filter($c['meets'], fn($m) => $m['days'] !== '' || $m['room'] !== '')) $W('Add when and where the class meets.');
  $sec = 'about'; if ($c['description'] === '') $W('Add a course description.');
  if (!$c['outcomes']) $T('List a few learning outcomes: what students will be able to do by the end.');
  $sec = 'grading'; $cats = array_values(array_filter($s['grading']['categories'], fn($x) => $x['name'] !== ''));
  if (!$cats) $E('Add at least one grading category.');
  else { $sum = array_sum(array_column($cats, 'weight')); if (abs($sum - 100) > 0.01) $E('Grading weights add up to ' . rtrim(rtrim(number_format($sum, 2), '0'), '.') . '%, not 100%.'); }
  if (!$s['grading']['scale']) $E('Add the letter-grade scale.');
  else { $mins = array_column($s['grading']['scale'], 'min'); $sorted = $mins; rsort($sorted); if ($mins !== $sorted) $W('List the letter grades from highest to lowest cut-off.'); }
  $sec = 'exams'; foreach ($s['exams'] as $i => $e) { if ($e['name'] === '') $E('Exam ' . ($i + 1) . ' needs a name.'); if ($e['date'] === '') $W(($e['name'] ?: 'Exam ' . ($i + 1)) . ' has no date yet; students will not see a countdown for it.'); }
  $sec = 'schedule'; if (!$s['schedule']['rows']) $W('The schedule is empty. Use "Fill in class meetings" on the Schedule page to start from your meeting days.');
  $sec = 'policies'; $p = $s['policies'];
  if ($p['accommodations'] === '') $E('Keep an accommodations statement (students with disabilities need to know who to contact).');
  if ($p['integrity'] === '') $W('Add an academic integrity statement.');
  if ($p['aiText'] === '') $W('Say whether students may use AI tools.');
  if ($p['late'] === '') $T('Say how late work is handled.');
  if ($p['attendance'] === '') $T('Say what you expect about attendance.');
  $sec = 'materials'; if (!$s['materials']) $T('List the textbook or materials, even if they are all on Canvas.');
  return $L;
}

/* ---------- publishing: syllabus -> class pack ---------- */
const MH_TEACH_COLORS = ['#1D4ED8', '#047857', '#B91C1C', '#7C3AED', '#B45309', '#0E7490', '#BE185D', '#4D7C0F', '#9333EA', '#C2410C'];
function mh_teach_fmt_date(string $d, bool $weekday = true): string { $t = strtotime($d . ' 12:00:00 UTC'); return $t ? gmdate($weekday ? 'D M j' : 'M j', $t) : $d; }
function mh_teach_fmt_time(string $t): string { if ($t === '') return ''; [$h, $m] = array_map('intval', explode(':', $t)); $ap = $h >= 12 ? 'pm' : 'am'; $h12 = $h % 12 ?: 12; return $h12 . ($m ? ':' . str_pad((string)$m, 2, '0', STR_PAD_LEFT) : '') . ' ' . $ap; }
/** A pack id for the class: the course code (m171), else the code plus a letter (m171b), else tc + class number. Never another class's id. */
function mh_teach_pack_id(array $c): string {
  if ($c['pack_id'] !== '') return $c['pack_id'];
  $taken = array_flip(mh_course_ids()); $base = strtolower(preg_replace('/[^A-Za-z0-9]/', '', (string)$c['code']));
  $ok = fn(string $id) => preg_match(MH_PACK_ID_RE, $id) && !isset($taken[$id]) && !isset(MH_BUILTIN_NAMES[$id]);
  if (preg_match('/^[a-z]{1,6}\d{2,4}$/', $base)) { if ($ok($base)) return $base; foreach (range('b', 'z') as $l) if ($ok($base . $l)) return $base . $l; }
  elseif (preg_match('/^[a-z]{1,6}\d{2,4}[a-z]$/', $base) && $ok($base)) return $base;
  for ($n = (int)$c['id']; $n < (int)$c['id'] + 9000; $n++) { $id = 'tc' . str_pad((string)($n % 10000), 4, '0', STR_PAD_LEFT); if ($ok($id)) return $id; }
  mh_fail('Could not find a free class id. Please contact the site administrator.', 500);
}
function mh_teach_owner_name(array $c): string { $st = mh_db()->prepare('SELECT name, email FROM users WHERE id = ?'); $st->execute([$c['owner_id']]); $r = $st->fetch(); return $r ? mh_display_name($r) : 'Instructor'; }

function mh_teach_pack(array $c, array $s, string $pid): array {
  $co = $s['course']; $code = $co['code'] ?: $c['code']; $title = $co['title'] ?: $c['title']; $term = $co['term'] ?: ($c['term'] ?: 'This term');
  $people = array_values(array_filter($s['people'], fn($p) => $p['name'] !== '')); $lead = $people[0] ?? null;
  $rows = $s['schedule']['rows']; $exams = array_values(array_filter($s['exams'], fn($e) => $e['name'] !== ''));
  // weeks become the topics: "Week 3 · Derivatives" with that week's meetings, readings and due dates as its notes
  $weekOf = fn(string $d) => gmdate('Y-m-d', strtotime($d . ' 12:00:00 UTC') - ((int)gmdate('N', strtotime($d . ' 12:00:00 UTC')) - 1) * 86400);
  $weeks = []; foreach ($rows as $r) $weeks[$weekOf($r['date'])][] = $r;
  foreach ($exams as $e) if ($e['date'] !== '' && !isset($weeks[$weekOf($e['date'])])) $weeks[$weekOf($e['date'])] = [];
  ksort($weeks);
  $examDates = array_values(array_filter(array_column($exams, 'date'))); sort($examDates);
  $unitOf = function (string $d) use ($examDates): int { $u = 1; foreach ($examDates as $ed) if ($d > $ed) $u++; return $u; };
  $SECTIONS = []; $secOfWeek = []; $i = 0;
  foreach ($weeks as $monday => $list) {
    $i++; $id = 'w' . $i; $secOfWeek[$monday] = $id;
    $topics = array_values(array_unique(array_filter(array_map(fn($r) => in_array($r['type'], ['lecture', 'lab', 'review'], true) ? $r['title'] : '', $list))));
    $ideas = array_map(function ($r) { $kind = ['lecture' => 'Class', 'lab' => 'Lab', 'exam' => 'Exam', 'review' => 'Review', 'holiday' => 'No class', 'due' => 'Due', 'other' => 'Note'][$r['type']] ?? 'Class';
      return '<b>' . mh_teach_h(mh_teach_fmt_date($r['date'])) . ' · ' . $kind . ':</b> ' . mh_teach_h($r['title']) . ($r['notes'] !== '' ? ' <span class="muted">' . str_replace("\n", '<br>', mh_teach_h($r['notes'])) . '</span>' : ''); }, $list);
    foreach ($exams as $e) if ($e['date'] !== '' && $weekOf($e['date']) === $monday && !array_filter($list, fn($r) => $r['type'] === 'exam' && $r['date'] === $e['date'])) $ideas[] = '<b>' . mh_teach_h(mh_teach_fmt_date($e['date'])) . ' · Exam:</b> ' . mh_teach_h($e['name']);
    $SECTIONS[] = ['id' => $id, 'label' => 'Week ' . $i, 'title' => $topics ? mb_substr(implode(' · ', array_slice($topics, 0, 3)), 0, 110) : 'Week of ' . mh_teach_fmt_date($monday, false), 'unit' => $unitOf($monday), 'ideas' => $ideas ?: ['Nothing scheduled this week yet.']];
  }
  if (!$SECTIONS) $SECTIONS[] = ['id' => 'w1', 'label' => 'Week 1', 'title' => 'Schedule coming soon', 'unit' => 1, 'ideas' => ['Your instructor has not posted the weekly schedule yet.']];
  $nUnits = max(array_column($SECTIONS, 'unit')); $UNITS = [];
  for ($u = 1; $u <= $nUnits; $u++) $UNITS[] = ['n' => $u, 'title' => $u <= count($examDates) ? 'Up to ' . ($exams[array_search($examDates[$u - 1], array_column($exams, 'date'))]['name'] ?? 'the exam') : ($examDates ? 'After the last exam' : 'The term'), 'sections' => array_values(array_column(array_filter($SECTIONS, fn($x) => $x['unit'] === $u), 'id'))];
  $UNITS = array_values(array_filter($UNITS, fn($x) => $x['sections']));
  if (!$UNITS) $UNITS = [['n' => 1, 'title' => 'The term', 'sections' => array_column($SECTIONS, 'id')]];
  $validUnits = array_column($UNITS, 'n'); foreach ($SECTIONS as &$sec) if (!in_array($sec['unit'], $validUnits, true)) $sec['unit'] = $validUnits[0]; unset($sec);
  $EXAMS = []; $k = 0;
  foreach ($exams as $e) { if ($e['date'] === '') continue; $k++; $u = $unitOf($e['date']); if (!in_array($u, $validUnits, true)) $u = end($validUnits);
    $label = mh_teach_fmt_date($e['date']) . ($e['time'] !== '' ? ', ' . mh_teach_fmt_time($e['time']) : '') . ($e['place'] !== '' ? ', ' . $e['place'] : '');
    $EXAMS[] = ['id' => 'e' . $k, 'n' => $k, 'name' => $e['name'], 'date' => $e['date'], 'dateLabel' => $label, 'covers' => $e['covers'] !== '' ? $e['covers'] : 'See the syllabus.', 'sections' => array_values(array_column(array_filter($SECTIONS, fn($x) => $x['unit'] === $u), 'id')), 'units' => [$u]]; }
  $CAL = []; $map = ['lecture' => 'lecture', 'lab' => 'lab', 'exam' => 'exam', 'review' => 'review', 'holiday' => 'holiday', 'due' => 'admin', 'other' => 'admin'];
  foreach ($rows as $r) { $t = $r['title'] !== '' ? $r['title'] : ucfirst($r['type']); if ($r['type'] === 'due') $t = 'Due: ' . $t; $CAL[] = [$r['date'], $map[$r['type']], mb_substr($t, 0, 160), $secOfWeek[$weekOf($r['date'])] ?? ''];
    $CAL[count($CAL) - 1] = array_values(array_filter($CAL[count($CAL) - 1], fn($v) => $v !== '')); }
  foreach ($EXAMS as $e) if (!array_filter($CAL, fn($x) => $x[0] === $e['date'] && $x[1] === 'exam')) $CAL[] = [$e['date'], 'exam', $e['name'] . ($e['dateLabel'] ? ' (' . $e['dateLabel'] . ')' : '')];
  usort($CAL, fn($a, $b) => strcmp($a[0], $b[0]));
  // grading
  $cats = array_values(array_filter($s['grading']['categories'], fn($x) => $x['name'] !== '')); $GR = ['categories' => [], 'scale' => []];
  foreach ($cats as $j => $x) $GR['categories'][] = ['id' => 'g' . ($j + 1), 'name' => $x['name'], 'weight' => $x['weight']];
  foreach ($s['grading']['scale'] as $x) if ($x['letter'] !== '') $GR['scale'][] = ['letter' => $x['letter'], 'min' => $x['min']];
  usort($GR['scale'], fn($a, $b) => $b['min'] <=> $a['min']);
  if ($s['grading']['notes'] !== '') $GR['note'] = mb_substr($s['grading']['notes'], 0, 600);
  // syllabus page panels (escaped here; the browser cleans them again)
  $li = fn(array $items) => '<ul class="list-plain small">' . implode('', array_map(fn($x) => '<li>' . $x . '</li>', $items)) . '</ul>';
  $meets = array_values(array_filter($co['meets'], fn($m) => $m['days'] !== '' || $m['room'] !== ''));
  $facts = ['<b>Course:</b> ' . mh_teach_h($code . ' ' . $title) . ($co['section'] !== '' ? ', section ' . mh_teach_h($co['section']) : '') . ' · ' . mh_teach_h($term)];
  if ($co['credits'] !== '') $facts[] = '<b>Credits:</b> ' . mh_teach_h($co['credits']);
  if ($co['modality'] !== '') $facts[] = '<b>Format:</b> ' . mh_teach_h($co['modality']);
  foreach ($meets as $m) $facts[] = '<b>' . mh_teach_h($m['kind'] ?: 'Meets') . ':</b> ' . mh_teach_h(trim($m['days'] . ' ' . ($m['start'] !== '' ? mh_teach_fmt_time($m['start']) . ($m['end'] !== '' ? '–' . mh_teach_fmt_time($m['end']) : '') : ''))) . ($m['room'] !== '' ? ', ' . mh_teach_h($m['room']) : '');
  if ($co['prereqs'] !== '') $facts[] = '<b>Prerequisites:</b> ' . mh_teach_h($co['prereqs']);
  if ($co['canvas'] !== '') $facts[] = '<b>Canvas:</b> <a href="' . mh_teach_h($co['canvas']) . '">course page</a>';
  $INFO = [['icon' => 'info', 'title' => 'Course facts', 'html' => $li($facts)]];
  if ($people) $INFO[] = ['icon' => 'users', 'title' => count($people) > 1 ? 'Instructors and office hours' : 'Instructor and office hours', 'html' => $li(array_map(fn($p) => '<b>' . mh_teach_h($p['name']) . '</b>' . ($p['pronouns'] !== '' ? ' (' . mh_teach_h($p['pronouns']) . ')' : '') . ', ' . mh_teach_h($p['role']) . ($p['email'] !== '' ? ' · <a href="mailto:' . mh_teach_h($p['email']) . '">' . mh_teach_h($p['email']) . '</a>' : '') . ($p['office'] !== '' ? ' · ' . mh_teach_h($p['office']) : '') . ($p['hours'] !== '' ? '<br><span class="muted">Office hours: ' . str_replace("\n", '<br>', mh_teach_h($p['hours'])) . '</span>' : ''), $people))];
  if ($co['description'] !== '' || $co['outcomes']) $INFO[] = ['icon' => 'book', 'title' => 'About the course', 'span2' => true, 'html' => mh_teach_paras($co['description']) . ($co['outcomes'] ? '<p class="small"><b>By the end of the course you will be able to:</b></p>' . $li(array_map('mh_teach_h', $co['outcomes'])) : '')];
  if ($s['materials']) $INFO[] = ['icon' => 'scroll', 'title' => 'Materials', 'html' => $li(array_map(fn($m) => ($m['url'] !== '' ? '<a href="' . mh_teach_h($m['url']) . '">' . mh_teach_h($m['title'] ?: $m['url']) . '</a>' : '<b>' . mh_teach_h($m['title']) . '</b>') . ($m['required'] ? ' <span class="muted">(required)</span>' : ' <span class="muted">(optional)</span>') . ($m['note'] !== '' ? ' · ' . mh_teach_h($m['note']) : ''), $s['materials']))];
  if ($GR['categories']) $INFO[] = ['icon' => 'calc', 'title' => 'Grading', 'html' => '<div class="table-wrap"><table class="table compact"><thead><tr><th>Category</th><th class="num">Share</th></tr></thead><tbody>' . implode('', array_map(fn($x) => '<tr><td>' . mh_teach_h($x['name']) . ($x['note'] !== '' ? ' <span class="muted small">' . mh_teach_h($x['note']) . '</span>' : '') . '</td><td class="num">' . mh_teach_h(rtrim(rtrim(number_format($x['weight'], 2), '0'), '.')) . '%</td></tr>', $cats)) . '</tbody></table></div>'
    . ($GR['scale'] ? '<p class="small mt-1"><b>Letter grades:</b> ' . implode(', ', array_map(fn($x) => mh_teach_h($x['letter']) . ' ≥ ' . mh_teach_h(rtrim(rtrim(number_format($x['min'], 2), '0'), '.')) . '%', $GR['scale'])) . '</p>' : '') . mh_teach_paras($s['grading']['notes'])];
  if ($exams) $INFO[] = ['icon' => 'flag', 'title' => 'Exams', 'html' => $li(array_map(fn($e) => '<b>' . mh_teach_h($e['name']) . ':</b> ' . ($e['date'] !== '' ? mh_teach_h(mh_teach_fmt_date($e['date']) . ($e['time'] !== '' ? ', ' . mh_teach_fmt_time($e['time']) : '') . ($e['place'] !== '' ? ', ' . $e['place'] : '')) : 'date to be announced') . ($e['covers'] !== '' ? '<br><span class="muted">' . mh_teach_h($e['covers']) . '</span>' : ''), $exams))];
  $p = $s['policies']; $pol = [];
  foreach ([['attendance', 'Attendance'], ['late', 'Late work'], ['communication', 'Communication']] as [$k, $t]) if ($p[$k] !== '') $pol[] = ['clock', $t, $p[$k]];
  if ($p['aiText'] !== '') $pol[] = ['shield', 'AI tools', $p['aiText']];
  if ($p['integrity'] !== '') $pol[] = ['shield', 'Academic integrity', $p['integrity']];
  if ($p['accommodations'] !== '') $pol[] = ['heart', 'Accommodations', $p['accommodations']];
  if ($p['wellbeing'] !== '') $pol[] = ['heart', 'Wellbeing and support', $p['wellbeing']];
  foreach ($p['other'] as $o) $pol[] = ['list', $o['title'] ?: 'Policy', $o['text']];
  foreach ($pol as [$ic, $t, $txt]) $INFO[] = ['icon' => in_array($ic, ['clock', 'shield', 'list'], true) ? $ic : 'info', 'title' => $t, 'html' => mh_teach_paras($txt)];
  $resources = array_values(array_map(fn($m) => ['t' => mb_substr($m['title'] ?: 'Course material', 0, 100), 'u' => $m['url'], 'd' => $m['note'] !== '' ? $m['note'] : ($m['required'] ? 'Required' : 'Optional')], array_filter($s['materials'], fn($m) => $m['url'] !== '')));
  if ($co['canvas'] !== '') array_unshift($resources, ['t' => 'Canvas course page', 'u' => $co['canvas'], 'd' => 'Assignments, grades and files']);
  $color = MH_TEACH_COLORS[crc32(strtolower($code)) % count(MH_TEACH_COLORS)];
  $all = array_merge(array_column($rows, 'date'), array_filter(array_column($exams, 'date'))); sort($all);
  $start = $s['schedule']['start'] ?: ($all[0] ?? ''); $end = $s['schedule']['end'] ?: (end($all) ?: '');
  $instructor = $lead ? $lead['name'] : mh_teach_owner_name($c);
  $tag = trim($instructor . ($co['section'] !== '' ? ' · Section ' . $co['section'] : '') . ($meets ? ' · ' . trim($meets[0]['days'] . ' ' . mh_teach_fmt_time($meets[0]['start'])) : ''), ' ·');
  $pack = ['format' => 'mathub-class-pack', 'version' => 1, 'id' => $pid, 'code' => mb_substr($code, 0, 40), 'name' => mb_substr($title, 0, 120), 'short' => mb_substr($code, 0, 14), 'term' => mb_substr($term, 0, 60), 'tagline' => mb_substr($tag, 0, 140),
    'color' => ['light' => $color], 'archetype' => ['name' => 'Scholar', 'icon' => 'scroll'],
    'COURSE' => ['code' => $code, 'name' => $title, 'term' => $term, 'school' => 'Montana State University', 'instructor' => $instructor, 'instructorEmail' => $lead['email'] ?? '', 'textbook' => $s['materials'] && $s['materials'][0]['url'] !== '' ? ['title' => $s['materials'][0]['title'] ?: 'Course materials', 'url' => $s['materials'][0]['url']] : ['title' => 'Course materials on Canvas', 'url' => $co['canvas'] ?: 'https://montana.instructure.com/'], 'links' => array_map(fn($r) => ['title' => $r['t'], 'url' => $r['u']], $resources)],
    'GRADING' => $GR, 'EXAMS' => $EXAMS, 'CALENDAR' => $CAL, 'CALENDAR_NOTE' => 'From ' . $instructor . '\'s syllabus. Changes are announced on the class hub (#/class/' . (int)$c['id'] . ').', 'UNITS' => $UNITS, 'SECTIONS' => $SECTIONS, 'INFO' => $INFO,
    'NAV' => [['label' => 'Class', 'items' => array_values(array_filter([['dashboard', 'Class home', 'home'], ['course', 'Syllabus', 'file'], ['calendar', 'Schedule', 'calendar'], ['notes', 'Week by week', 'book'], $EXAMS ? ['exam', 'Exam prep', 'flag'] : null, ['grades', 'Grade calculator', 'calc'], ['planner', 'Study planner', 'path']]))], ['label' => 'Community', 'items' => [['forum', 'Class board', 'chat']]], ['label' => 'More', 'items' => [['settings', 'Settings', 'gear']]]],
    'resources' => array_slice($resources, 0, 12), 'canvasMatch' => array_values(array_unique([$code, str_replace(' ', '', $code)]))];
  if ($start !== '' && $end !== '') $pack['SEMESTER'] = ['start' => $start, 'end' => $end];
  return $pack;
}

/* ---------- small helpers ---------- */
function mh_teach_new_code(): string {
  $db = mh_teach_db(); $chars = MH_TEACH_CODE_CHARS; $n = strlen($chars);
  for ($t = 0; $t < 40; $t++) { $code = ''; for ($i = 0; $i < 6; $i++) $code .= $chars[random_int(0, $n - 1)]; $st = $db->prepare('SELECT 1 FROM teach_classes WHERE join_code = ?'); $st->execute([$code]); if (!$st->fetchColumn()) return $code; }
  mh_fail('Could not make a class code. Try again.', 500);
}
function mh_teach_summary(array $c, string $access): array {
  $db = mh_teach_db(); $st = $db->prepare('SELECT COUNT(*) FROM teach_members WHERE class_id = ? AND role = \'student\''); $st->execute([$c['id']]); $n = (int)$st->fetchColumn();
  // the instructor as students know them: the first named person on the (published, else draft) syllabus, else the account name
  $syl = json_decode((string)($c['published'] !== '' ? $c['published'] : $c['syllabus']), true); $named = '';
  foreach ((array)($syl['people'] ?? []) as $p) if (is_array($p) && trim((string)($p['name'] ?? '')) !== '') { $named = (string)$p['name']; break; }
  return ['id' => (int)$c['id'], 'code' => $c['code'], 'title' => $c['title'], 'term' => $c['term'], 'section' => $c['section'], 'status' => $c['status'], 'pack_id' => $c['pack_id'], 'link_course' => $c['link_course'], 'join_code' => in_array($access, ['owner', 'staff', 'admin'], true) ? $c['join_code'] : null, 'students' => $n, 'access' => $access, 'instructor' => $named !== '' ? $named : mh_teach_owner_name($c), 'published_at' => (int)$c['published_at'], 'updated' => (int)$c['updated'], 'version' => (int)$c['version'], 'verified' => mh_teach_verified($c)];
}
/** Adds a class id to a student's own class list (users.courses), so the class shows on their start page right away. */
function mh_teach_add_course(int $uid, string $pid): void {
  if ($pid === '') return; $db = mh_db(); $st = $db->prepare('SELECT courses FROM users WHERE id = ?'); $st->execute([$uid]); $raw = $st->fetchColumn();
  $list = $raw ? (json_decode((string)$raw, true) ?: []) : []; if (in_array($pid, $list, true)) return; $list[] = $pid;
  $db->prepare('UPDATE users SET courses = ? WHERE id = ?')->execute([json_encode(array_values($list)), $uid]);
}
/** Takes a class id back out of someone's class list: the teaching team works on a class in #/teach, not among their own classes. */
function mh_teach_drop_course(int $uid, string $pid): void {
  if ($pid === '') return; $db = mh_db(); $st = $db->prepare('SELECT courses FROM users WHERE id = ?'); $st->execute([$uid]); $raw = $st->fetchColumn();
  $list = $raw ? (json_decode((string)$raw, true) ?: []) : []; if (!in_array($pid, $list, true)) return;
  $db->prepare('UPDATE users SET courses = ? WHERE id = ?')->execute([json_encode(array_values(array_filter($list, fn($x) => $x !== $pid))), $uid]);
}
/** Inbox notification (and a push, when the student has notifications on) for every member of a class except the author. */
function mh_teach_notify_members(array $c, array $actor, string $kind, string $title, string $snippet, string $link): int {
  $db = mh_teach_db(); $st = $db->prepare('SELECT user_id FROM teach_members WHERE class_id = ? AND user_id != ?'); $st->execute([$c['id'], $actor['id']]); $ids = $st->fetchAll(PDO::FETCH_COLUMN);
  $ins = $db->prepare('INSERT INTO notifications (user_id, kind, post_id, comment_id, actor_id, actor, title, snippet, link, created) VALUES (?, ?, 0, NULL, ?, ?, ?, ?, ?, ?)');
  $hasPush = false; try { require_once __DIR__ . '/push.php'; $hasPush = function_exists('mh_push_queue'); } catch (Throwable $e) {}
  foreach ($ids as $uid) {
    $ins->execute([(int)$uid, $kind, (int)$actor['id'], mb_substr(mh_display_name($actor), 0, 60), mb_substr($title, 0, 120), mb_substr($snippet, 0, 300), mb_substr($link, 0, 200), time()]);
    if ($hasPush) { try { mh_push_queue((int)$uid, mb_substr($c['code'] . ': ' . $title, 0, 120), mb_substr($snippet, 0, 200), $link, 'class' . $c['id']); } catch (Throwable $e) {} }
  }
  return count($ids);
}
function mh_teach_assignment_public(array $a): array { return ['id' => (int)$a['id'], 'title' => $a['title'], 'course' => $a['course'], 'topics' => json_decode((string)$a['topics'], true) ?: [], 'count' => (int)$a['count'], 'minutes' => (int)$a['minutes'], 'due' => (int)$a['due'], 'note' => $a['note'], 'seed' => (int)$a['seed'], 'created' => (int)$a['created']]; }

/* ============================================================
   Routes
   ============================================================ */
function mh_teach_route(string $route, array $in, array $cfg, string $ip): void {
  $db = mh_teach_db(); $now = time();
  switch ($route) {

    /* everything the #/teach and #/class pages need about the signed-in person */
    case 'teach_me': {
      mh_method('GET'); $u = mh_require_user();
      $st = $db->prepare('SELECT * FROM teach_requests WHERE user_id = ? ORDER BY id DESC LIMIT 1'); $st->execute([$u['id']]); $req = $st->fetch() ?: null;
      $st = $db->prepare('SELECT c.*, CASE WHEN c.owner_id = ? THEN \'owner\' ELSE \'staff\' END AS acc FROM teach_classes c LEFT JOIN teach_members m ON m.class_id = c.id AND m.user_id = ? AND m.role = \'ta\' WHERE c.owner_id = ? OR m.user_id IS NOT NULL ORDER BY c.updated DESC'); $st->execute([$u['id'], $u['id'], $u['id']]);
      $teaching = array_map(fn($c) => mh_teach_summary($c, $c['acc']), $st->fetchAll());
      $st = $db->prepare('SELECT c.* FROM teach_members m JOIN teach_classes c ON c.id = m.class_id WHERE m.user_id = ? AND m.role = \'student\' ORDER BY m.joined DESC'); $st->execute([$u['id']]);
      $enrolled = array_map(fn($c) => mh_teach_summary($c, 'student'), $st->fetchAll());
      mh_json(['ok' => true, 'instructor' => mh_teach_is_instructor($u), 'request' => $req ? ['status' => $req['status'], 'created' => (int)$req['created']] : null, 'teaching' => $teaching, 'enrolled' => $enrolled, 'ai_presets' => MH_TEACH_AI]);
    }

    /* ask for instructor access; an administrator approves it */
    case 'teach_request': {
      mh_method('POST'); $u = mh_require_user(); if (mh_teach_is_instructor($u)) mh_fail('You already have instructor access.');
      mh_rate_or_fail("teachreq:user:{$u['id']}", 3, 86400, 'You already asked recently. An administrator will get back to you.');
      $name = mh_teach_line($in['name'] ?? '', 80); $title = mh_teach_line($in['title'] ?? '', 80); $dept = mh_teach_line($in['department'] ?? '', 120); $courses = mh_teach_line($in['courses'] ?? '', 200); $msg = mh_teach_text($in['message'] ?? '', 800);
      if (mb_strlen($name) < 3) mh_fail('Add your name as students know it.'); if ($dept === '') mh_fail('Add your department.'); if ($courses === '') mh_fail('Add the course or courses you teach.');
      $st = $db->prepare('SELECT id FROM teach_requests WHERE user_id = ? AND status = \'new\''); $st->execute([$u['id']]); if ($st->fetchColumn()) mh_fail('Your request is already waiting for an administrator.');
      $db->prepare('INSERT INTO teach_requests (user_id, name, title, department, courses, message, created) VALUES (?, ?, ?, ?, ?, ?, ?)')->execute([$u['id'], $name, $title, $dept, $courses, $msg, $now]);
      try { require_once __DIR__ . '/requests.php'; foreach (mh_req_admin_users() as $a) mh_req_notify((int)$a['id'], $u, 'teach_admin', $name . ' (' . $dept . ')', 'Asked for instructor access: ' . $courses, '#/admin/teach'); } catch (Throwable $e) { error_log('Mathub teach request notify: ' . $e->getMessage()); }
      mh_json(['ok' => true]);
    }

    /* --- administrators: instructor access --- */
    case 'admin_teach_requests': {
      mh_method('GET'); $u = mh_require_user(); if (!mh_is_admin($u)) mh_fail('Admins only.', 403);
      $rows = $db->query('SELECT r.*, u.email FROM teach_requests r JOIN users u ON u.id = r.user_id ORDER BY CASE r.status WHEN \'new\' THEN 0 ELSE 1 END, r.created DESC LIMIT 200')->fetchAll();
      $instructors = $db->query('SELECT r.email, r.scope, u.name, u.id FROM roles r LEFT JOIN users u ON lower(u.email) = r.email WHERE r.role = \'Instructor\' ORDER BY r.email')->fetchAll();
      $classes = $db->query('SELECT c.*, (SELECT COUNT(*) FROM teach_members m WHERE m.class_id = c.id AND m.role = \'student\') AS n FROM teach_classes c ORDER BY c.updated DESC LIMIT 200')->fetchAll();
      mh_json(['ok' => true, 'requests' => array_map(fn($r) => ['id' => (int)$r['id'], 'email' => $r['email'], 'name' => $r['name'], 'title' => $r['title'], 'department' => $r['department'], 'courses' => $r['courses'], 'message' => $r['message'], 'status' => $r['status'], 'created' => (int)$r['created']], $rows),
        'instructors' => array_map(fn($r) => ['email' => $r['email'], 'name' => (string)$r['name'], 'scope' => $r['scope']], $instructors),
        'classes' => array_map(fn($c) => ['id' => (int)$c['id'], 'code' => $c['code'], 'title' => $c['title'], 'term' => $c['term'], 'status' => $c['status'], 'pack_id' => $c['pack_id'], 'students' => (int)$c['n'], 'instructor' => mh_teach_owner_name($c)], $classes)]);
    }
    case 'admin_teach_decide': {
      mh_method('POST'); $u = mh_require_user(); if (!mh_is_admin($u)) mh_fail('Admins only.', 403);
      $decision = (string)($in['decision'] ?? '');
      if ($decision === 'revoke') { $email = mh_teach_email($in['email'] ?? ''); if ($email === '') mh_fail('Which instructor?'); $db->prepare('DELETE FROM roles WHERE email = ? AND role = \'Instructor\'')->execute([$email]); mh_json(['ok' => true]); }
      $st = $db->prepare('SELECT r.*, u.email, u.name AS uname FROM teach_requests r JOIN users u ON u.id = r.user_id WHERE r.id = ?'); $st->execute([(int)($in['id'] ?? 0)]); $r = $st->fetch(); if (!$r) mh_fail('Request not found.', 404);
      if (!in_array($decision, ['approve', 'decline'], true)) mh_fail('Approve or decline?');
      $db->prepare('UPDATE teach_requests SET status = ?, decided = ?, decided_by = ? WHERE id = ?')->execute([$decision === 'approve' ? 'approved' : 'declined', $now, $u['id'], $r['id']]);
      if ($decision === 'approve') {
        $db->prepare('INSERT INTO roles (email, role, updated, scope) VALUES (?, \'Instructor\', ?, \'teach\') ON CONFLICT(email) DO UPDATE SET role = \'Instructor\', updated = excluded.updated, scope = CASE WHEN roles.scope = \'\' AND roles.role = \'Instructor\' THEN \'\' ELSE \'teach\' END')->execute([strtolower($r['email']), $now]);
        if (trim((string)$r['uname']) === '') $db->prepare('UPDATE users SET name = ? WHERE id = ?')->execute([$r['name'], $r['user_id']]);
      }
      try { require_once __DIR__ . '/requests.php'; mh_req_notify((int)$r['user_id'], $u, 'teach', $decision === 'approve' ? 'Instructor access approved' : 'Instructor access', $decision === 'approve' ? 'You can now build syllabi and run your classes on Mathub.' : 'Your request was not approved. Reply to the site administrator if this is a mistake.', '#/teach'); } catch (Throwable $e) {}
      mh_json(['ok' => true]);
    }

    /* --- classes --- */
    case 'teach_class_create': {
      mh_method('POST'); $u = mh_require_user();
      mh_rate_or_fail("teachnew:user:{$u['id']}", 30, 86400);
      if (!mh_teach_is_instructor($u)) { $st = $db->prepare('SELECT COUNT(*) FROM teach_classes WHERE owner_id = ?'); $st->execute([$u['id']]); if ((int)$st->fetchColumn() >= 15) mh_fail('That is 15 drafts. Confirm your faculty status to make more, or delete one you no longer need.', 403); }
      $code = mh_teach_line($in['code'] ?? '', 24); $title = mh_teach_line($in['title'] ?? '', 120); $term = mh_teach_line($in['term'] ?? '', 40); $section = mh_teach_line($in['section'] ?? '', 20);
      if (!preg_match('/^[A-Za-z]{1,6}\s?\d{2,4}[A-Za-z]?$/', $code)) mh_fail('Enter the course code like M 171 or WRIT 101.'); if ($title === '') mh_fail('Add the course title.');
      $code = strtoupper(preg_replace('/^([A-Za-z]+)\s?/', '$1 ', $code));
      $c = ['id' => 0, 'code' => $code, 'title' => $title, 'term' => $term, 'section' => $section];
      $syl = mh_teach_starter($u, $c); $from = (string)($in['from'] ?? 'blank');
      if (str_starts_with($from, 'copy:')) { $src = mh_teach_class((int)substr($from, 5)); if (!$src || !in_array(mh_teach_access($u, $src), ['owner', 'staff', 'admin'], true)) mh_fail('You can only copy your own classes.', 403);
        $syl = json_decode((string)$src['syllabus'], true) ?: $syl; $syl['course']['code'] = $code; $syl['course']['title'] = $title; $syl['course']['term'] = $term; $syl['course']['section'] = $section; $syl['schedule'] = ['start' => '', 'end' => '', 'rows' => []]; foreach ($syl['exams'] as &$e) $e['date'] = ''; unset($e); }
      $link = preg_replace('/[^a-z0-9]/', '', (string)($in['link_course'] ?? '')); if ($link !== '' && !mh_is_course($link)) $link = '';
      $db->prepare('INSERT INTO teach_classes (owner_id, code, title, term, section, join_code, link_course, syllabus, created, updated) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
        ->execute([$u['id'], $code, $title, $term, $section, mh_teach_new_code(), $link, json_encode(mh_teach_clean_syllabus($syl), JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES), $now, $now]);
      mh_json(['ok' => true, 'id' => (int)$db->lastInsertId()]);
    }
    case 'teach_class_get': {
      mh_method('GET'); $u = mh_require_user(); $c = mh_teach_class_or_fail($in); $acc = mh_teach_staff_or_fail($u, $c);
      $syl = json_decode((string)$c['syllabus'], true) ?: mh_teach_starter($u, $c);
      $st = $db->prepare('SELECT u.id, u.name, u.email, m.role FROM teach_members m JOIN users u ON u.id = m.user_id WHERE m.class_id = ? AND m.role = \'ta\''); $st->execute([$c['id']]);
      mh_json(['ok' => true, 'class' => mh_teach_summary($c, $acc), 'me_instructor' => mh_teach_is_instructor($u), 'syllabus' => $syl, 'lint' => mh_teach_lint(mh_teach_clean_syllabus($syl)), 'starter' => MH_TEACH_STARTER, 'ai_presets' => MH_TEACH_AI, 'staff' => array_map(fn($r) => ['id' => (int)$r['id'], 'name' => mh_display_name($r), 'email' => $r['email']], $st->fetchAll()), 'owner' => mh_teach_owner_name($c), 'dirty' => $c['published'] !== '' && $c['published'] !== $c['syllabus']]);
    }
    case 'teach_class_save': {
      mh_method('POST'); $u = mh_require_user(); $c = mh_teach_class_or_fail($in); mh_teach_staff_or_fail($u, $c);
      mh_rate_or_fail("teachsave:user:{$u['id']}", 600, 3600);
      $syl = mh_teach_clean_syllabus($in['syllabus'] ?? []); $json = json_encode($syl, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
      if (strlen($json) > MH_TEACH_MAX_SYLLABUS) mh_fail('This syllabus is too long to save. Shorten the schedule notes or policies.', 413);
      $code = $syl['course']['code'] ?: $c['code']; $title = $syl['course']['title'] ?: $c['title'];
      $link = array_key_exists('link_course', $in) ? preg_replace('/[^a-z0-9]/', '', (string)$in['link_course']) : $c['link_course']; if ($link !== '' && !mh_is_course($link)) $link = '';
      $db->prepare('UPDATE teach_classes SET syllabus = ?, code = ?, title = ?, term = ?, section = ?, link_course = ?, updated = ? WHERE id = ?')->execute([$json, $code, $title, $syl['course']['term'], $syl['course']['section'], $link, $now, $c['id']]);
      mh_json(['ok' => true, 'lint' => mh_teach_lint($syl), 'dirty' => $c['published'] !== '' && $c['published'] !== $json, 'saved' => $now]);
    }
    case 'teach_class_publish': {
      mh_method('POST'); $u = mh_require_user(); $c = mh_teach_class_or_fail($in); mh_teach_tools_or_fail($u, $c);
      mh_rate_or_fail("teachpub:user:{$u['id']}", 60, 3600);
      $syl = mh_teach_clean_syllabus(json_decode((string)$c['syllabus'], true) ?: []);
      $errs = array_values(array_map(fn($x) => $x[1], array_filter(mh_teach_lint($syl), fn($x) => $x[0] === 'error'))); if ($errs) mh_fail('Fix these first: ' . implode(' ', $errs), 400, ['problems' => $errs]);
      require_once __DIR__ . '/packs.php';
      $pid = mh_teach_pack_id($c); $pack = mh_teach_pack($c, $syl, $pid); $err = mh_pack_check($pack); if ($err !== '') { error_log("Mathub teach publish {$c['id']}: $err"); mh_fail('The class could not be built: ' . $err, 500); }
      $raw = json_encode($pack, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES); if (strlen($raw) > MH_PACK_MAX_BYTES) mh_fail('This class is too large to publish.', 413);
      $first = $c['status'] !== 'published';
      mh_pack_store(mh_pack_db(), $pack, $raw, 'teach:' . $c['id'] . ' ' . mb_substr(mh_display_name($u), 0, 60), 1);
      $json = json_encode($syl, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
      $db->prepare('UPDATE teach_classes SET pack_id = ?, status = \'published\', published = ?, published_at = ?, version = version + 1, updated = ? WHERE id = ?')->execute([$pid, $json, $now, $now, $c['id']]);
      $st = $db->prepare('SELECT user_id FROM teach_members WHERE class_id = ? AND role = \'student\''); $st->execute([$c['id']]); foreach ($st->fetchAll(PDO::FETCH_COLUMN) as $uid) mh_teach_add_course((int)$uid, $pid);
      $st = $db->prepare('SELECT user_id FROM teach_members WHERE class_id = ? AND role = \'ta\''); $st->execute([$c['id']]); foreach (array_merge([(int)$c['owner_id']], $st->fetchAll(PDO::FETCH_COLUMN)) as $uid) mh_teach_drop_course((int)$uid, $pid);
      $told = 0; $note = mh_teach_line($in['note'] ?? '', 200);
      if (!$first) $told = mh_teach_notify_members(array_merge($c, ['pack_id' => $pid]), $u, 'class', 'Syllabus updated', $note !== '' ? $note : 'The syllabus and schedule were updated.', '#/' . $pid . '/course');
      mh_json(['ok' => true, 'pack_id' => $pid, 'first' => $first, 'told' => $told]);
    }
    case 'teach_class_unpublish': {
      mh_method('POST'); $u = mh_require_user(); $c = mh_teach_class_or_fail($in); mh_teach_staff_or_fail($u, $c);
      if ($c['pack_id'] !== '') { require_once __DIR__ . '/packs.php'; mh_pack_db()->prepare('UPDATE class_packs SET enabled = 0, updated = ? WHERE id = ?')->execute([$now, $c['pack_id']]); }
      $db->prepare('UPDATE teach_classes SET status = \'draft\', updated = ? WHERE id = ?')->execute([$now, $c['id']]); mh_json(['ok' => true]);
    }
    case 'teach_class_delete': {
      mh_method('POST'); $u = mh_require_user(); $c = mh_teach_class_or_fail($in); $acc = mh_teach_access($u, $c); if (!in_array($acc, ['owner', 'admin'], true)) mh_fail('Only the class owner can delete it.', 403);
      if (strtoupper(trim((string)($in['confirm'] ?? ''))) !== strtoupper($c['code'])) mh_fail('Type the course code to confirm.');
      if ($c['pack_id'] !== '') { require_once __DIR__ . '/packs.php'; mh_pack_db()->prepare('DELETE FROM class_packs WHERE id = ? AND uploaded_by LIKE ?')->execute([$c['pack_id'], 'teach:' . $c['id'] . ' %']); }
      $db->prepare('DELETE FROM teach_classes WHERE id = ?')->execute([$c['id']]);   // members, posts, assignments, results and check-ins go with it (ON DELETE CASCADE); student accounts are untouched
      mh_json(['ok' => true]);
    }
    case 'teach_class_code': {
      mh_method('POST'); $u = mh_require_user(); $c = mh_teach_class_or_fail($in); mh_teach_staff_or_fail($u, $c);
      $code = mh_teach_new_code(); $db->prepare('UPDATE teach_classes SET join_code = ?, updated = ? WHERE id = ?')->execute([$code, $now, $c['id']]); mh_json(['ok' => true, 'join_code' => $code]);
    }

    /* --- joining --- */
    case 'teach_join_info': {
      mh_method('GET'); mh_rate_or_fail("teachinfo:ip:$ip", 120, 3600);
      $code = strtoupper(preg_replace('/[^A-Za-z0-9]/', '', (string)($_GET['code'] ?? ''))); if (strlen($code) !== 6) mh_fail('Class codes have 6 letters and numbers.', 404);
      $st = $db->prepare('SELECT * FROM teach_classes WHERE join_code = ?'); $st->execute([$code]); $c = $st->fetch(); if (!$c) mh_fail('No class has that code. Check it with your instructor.', 404);
      $me = mh_current_user(); $acc = $me ? mh_teach_access($me, $c) : '';
      $out = mh_teach_summary($c, $acc); $out['join_code'] = $code; $out['open'] = $out['verified'];
      $out['syllabus'] = $c['published'] !== '' ? json_decode((string)$c['published'], true) : null;
      header('Cache-Control: private, max-age=60'); mh_json(['ok' => true, 'class' => $out]);
    }
    case 'teach_join': {
      mh_method('POST'); $u = mh_require_user(); mh_rate_or_fail("teachjoin:user:{$u['id']}", 30, 3600, 'Too many tries. Check the code with your instructor and try again later.');
      $code = strtoupper(preg_replace('/[^A-Za-z0-9]/', '', (string)($in['code'] ?? ''))); $st = $db->prepare('SELECT * FROM teach_classes WHERE join_code = ?'); $st->execute([$code]); $c = $st->fetch();
      if (!$c) mh_fail('No class has that code. Check it with your instructor.', 404);
      $acc = mh_teach_access($u, $c); if (in_array($acc, ['owner', 'staff'], true)) mh_fail('You teach this class.');
      if ($acc !== 'student' && !mh_teach_verified($c)) mh_fail('This class is not open to students yet. Check with your instructor.', 403);
      if ($acc !== 'student') { $db->prepare('INSERT OR IGNORE INTO teach_members (class_id, user_id, role, joined) VALUES (?, ?, \'student\', ?)')->execute([$c['id'], $u['id'], $now]); }
      mh_teach_add_course((int)$u['id'], (string)$c['pack_id']);
      mh_json(['ok' => true, 'id' => (int)$c['id'], 'pack_id' => $c['pack_id']]);
    }
    case 'teach_leave': {
      mh_method('POST'); $u = mh_require_user(); $c = mh_teach_class_or_fail($in);
      $db->prepare('DELETE FROM teach_members WHERE class_id = ? AND user_id = ? AND role = \'student\'')->execute([$c['id'], $u['id']]); mh_json(['ok' => true]);
    }

    /* --- the class hub: what a member (or staff) sees --- */
    case 'teach_hub': {
      mh_method('GET'); $u = mh_require_user(); $c = mh_teach_class_or_fail($in); $acc = mh_teach_access($u, $c); if ($acc === '') mh_fail('Join this class with its code first.', 403);
      $staff = in_array($acc, ['owner', 'staff', 'admin'], true);
      $st = $db->prepare('SELECT p.*, u.name, u.email FROM teach_posts p JOIN users u ON u.id = p.user_id WHERE p.class_id = ? ORDER BY p.pinned DESC, p.created DESC LIMIT 40'); $st->execute([$c['id']]);
      $posts = array_map(fn($p) => ['id' => (int)$p['id'], 'title' => $p['title'], 'body' => $p['body'], 'pinned' => (bool)$p['pinned'], 'created' => (int)$p['created'], 'author' => mh_display_name($p)], $st->fetchAll());
      $st = $db->prepare('SELECT * FROM teach_assignments WHERE class_id = ? ORDER BY CASE WHEN due = 0 THEN 1 ELSE 0 END, due, created DESC'); $st->execute([$c['id']]); $asg = [];
      $mine = $db->prepare('SELECT score, total, best, attempts, updated FROM teach_submissions WHERE assignment_id = ? AND user_id = ?');
      $cnt = $db->prepare('SELECT COUNT(*) FROM teach_submissions WHERE assignment_id = ?');
      foreach ($st->fetchAll() as $a) { $o = mh_teach_assignment_public($a); $mine->execute([$a['id'], $u['id']]); $m = $mine->fetch(); $o['mine'] = $m ? ['score' => (int)$m['score'], 'total' => (int)$m['total'], 'best' => (int)$m['best'], 'attempts' => (int)$m['attempts'], 'updated' => (int)$m['updated']] : null; if ($staff) { $cnt->execute([$a['id']]); $o['submitted'] = (int)$cnt->fetchColumn(); } $asg[] = $o; }
      $att = null; $st = $db->prepare('SELECT id, label, closes FROM teach_attendance WHERE class_id = ? AND opens <= ? AND closes > ? ORDER BY id DESC LIMIT 1'); $st->execute([$c['id'], $now, $now]); $open = $st->fetch();
      if ($open) { $chk = $db->prepare('SELECT 1 FROM teach_checkins WHERE session_id = ? AND user_id = ?'); $chk->execute([$open['id'], $u['id']]); $att = ['id' => (int)$open['id'], 'label' => $open['label'], 'closes' => (int)$open['closes'], 'done' => (bool)$chk->fetchColumn()]; }
      $syl = $c['published'] !== '' ? json_decode((string)$c['published'], true) : null;
      mh_json(['ok' => true, 'class' => mh_teach_summary($c, $acc), 'posts' => $posts, 'assignments' => $asg, 'attendance' => $att, 'syllabus' => $syl, 'staff' => $staff]);
    }

    /* --- roster --- */
    case 'teach_roster': {
      mh_method('GET'); $u = mh_require_user(); $c = mh_teach_class_or_fail($in); mh_teach_tools_or_fail($u, $c);
      $st = $db->prepare('SELECT u.id, u.name, u.email, m.joined, m.role FROM teach_members m JOIN users u ON u.id = m.user_id WHERE m.class_id = ? ORDER BY m.role DESC, lower(u.name), u.email'); $st->execute([$c['id']]); $members = $st->fetchAll();
      $na = $db->prepare('SELECT COUNT(*) FROM teach_assignments WHERE class_id = ?'); $na->execute([$c['id']]); $nAsg = (int)$na->fetchColumn();
      $sub = $db->prepare('SELECT COUNT(*) AS n, AVG(CAST(s.best AS REAL) / NULLIF(s.total, 0)) AS avg FROM teach_submissions s JOIN teach_assignments a ON a.id = s.assignment_id WHERE a.class_id = ? AND s.user_id = ?');
      $ns = $db->prepare('SELECT COUNT(*) FROM teach_attendance WHERE class_id = ?'); $ns->execute([$c['id']]); $nSess = (int)$ns->fetchColumn();
      $ci = $db->prepare('SELECT COUNT(*) FROM teach_checkins k JOIN teach_attendance t ON t.id = k.session_id WHERE t.class_id = ? AND k.user_id = ?');
      $out = []; foreach ($members as $m) { $sub->execute([$c['id'], $m['id']]); $s = $sub->fetch(); $ci->execute([$c['id'], $m['id']]);
        $out[] = ['id' => (int)$m['id'], 'name' => mh_display_name($m), 'email' => $m['email'], 'role' => $m['role'], 'joined' => (int)$m['joined'], 'done' => (int)$s['n'], 'avg' => $s['avg'] !== null ? round((float)$s['avg'] * 100) : null, 'checkins' => (int)$ci->fetchColumn()]; }
      mh_json(['ok' => true, 'members' => $out, 'assignments' => $nAsg, 'sessions' => $nSess]);
    }
    case 'teach_member_remove': {
      mh_method('POST'); $u = mh_require_user(); $c = mh_teach_class_or_fail($in); mh_teach_tools_or_fail($u, $c);
      $db->prepare('DELETE FROM teach_members WHERE class_id = ? AND user_id = ?')->execute([$c['id'], (int)($in['user_id'] ?? 0)]); mh_json(['ok' => true]);
    }
    case 'teach_staff_add': {
      mh_method('POST'); $u = mh_require_user(); $c = mh_teach_class_or_fail($in); $acc = mh_teach_access($u, $c); if (!in_array($acc, ['owner', 'admin'], true)) mh_fail('Only the class owner can add co-instructors and TAs.', 403); mh_teach_tools_or_fail($u, $c);
      $email = mh_teach_email($in['email'] ?? ''); if ($email === '') mh_fail('Enter their email address.');
      $t = mh_user_by_email($email); if (!$t || (int)$t['verified'] !== 1) mh_fail('That person needs a Mathub account first: ask them to sign up with their montana.edu address.');
      if ((int)$t['id'] === (int)$c['owner_id']) mh_fail('That is the class owner.');
      $db->prepare('INSERT INTO teach_members (class_id, user_id, role, joined) VALUES (?, ?, \'ta\', ?) ON CONFLICT(class_id, user_id) DO UPDATE SET role = \'ta\'')->execute([$c['id'], $t['id'], $now]);
      if (mh_role($email) === '') $db->prepare('INSERT OR IGNORE INTO roles (email, role, updated, scope) VALUES (?, \'TA\', ?, \'teach\')')->execute([$email, $now]);
      try { require_once __DIR__ . '/requests.php'; mh_req_notify((int)$t['id'], $u, 'teach', $c['code'] . ' ' . $c['title'], 'You were added to the teaching team.', '#/teach/' . $c['id']); } catch (Throwable $e) {}
      mh_json(['ok' => true]);
    }

    /* --- announcements --- */
    case 'teach_post': {
      mh_method('POST'); $u = mh_require_user(); $c = mh_teach_class_or_fail($in); mh_teach_tools_or_fail($u, $c);
      mh_rate_or_fail("teachpost:user:{$u['id']}", 40, 86400);
      $title = mh_teach_line($in['title'] ?? '', 120); $body = mh_teach_text($in['body'] ?? '', 4000); if (mb_strlen($title) < 3) mh_fail('Give the announcement a title.');
      $db->prepare('INSERT INTO teach_posts (class_id, user_id, title, body, pinned, created) VALUES (?, ?, ?, ?, ?, ?)')->execute([$c['id'], $u['id'], $title, $body, !empty($in['pinned']) ? 1 : 0, $now]);
      $told = mh_teach_notify_members($c, $u, 'class', $title, mb_substr($body !== '' ? $body : $title, 0, 200), '#/class/' . $c['id']);
      mh_json(['ok' => true, 'told' => $told]);
    }
    case 'teach_post_delete': {
      mh_method('POST'); $u = mh_require_user(); $st = $db->prepare('SELECT * FROM teach_posts WHERE id = ?'); $st->execute([(int)($in['post_id'] ?? 0)]); $p = $st->fetch(); if (!$p) mh_fail('Not found.', 404);
      $c = mh_teach_class((int)$p['class_id']); if (!$c) mh_fail('Not found.', 404); mh_teach_tools_or_fail($u, $c);
      $db->prepare('DELETE FROM teach_posts WHERE id = ?')->execute([$p['id']]); mh_json(['ok' => true]);
    }

    /* --- practice assignments, drawn from a Mathub class's question bank --- */
    case 'teach_assignment_save': {
      mh_method('POST'); $u = mh_require_user(); $c = mh_teach_class_or_fail($in); mh_teach_tools_or_fail($u, $c);
      $title = mh_teach_line($in['title'] ?? '', 120); if (mb_strlen($title) < 3) mh_fail('Give the assignment a title.');
      $course = preg_replace('/[^a-z0-9]/', '', (string)($in['course'] ?? '')); if (!mh_is_course($course)) mh_fail('Pick the Mathub class whose questions to use.');
      $topics = array_values(array_unique(array_filter(array_map(fn($t) => preg_replace('/[^A-Za-z0-9_.-]/', '', (string)$t), is_array($in['topics'] ?? null) ? array_slice($in['topics'], 0, 40) : []), fn($t) => $t !== ''))); if (!$topics) mh_fail('Pick at least one topic.');
      $count = max(3, min(40, (int)($in['count'] ?? 10))); $minutes = max(0, min(240, (int)($in['minutes'] ?? 0)));
      $due = 0; if (!empty($in['due'])) { $d = mh_teach_date(substr((string)$in['due'], 0, 10)); if ($d === '') mh_fail('The due date must be a real date.'); $tm = mh_teach_time(substr((string)$in['due'], 11, 5)) ?: '23:59'; $tz = mh_config()['timezone'] ?? 'America/Denver'; $due = (new DateTime("$d $tm", new DateTimeZone($tz)))->getTimestamp(); }
      $note = mh_teach_text($in['note'] ?? '', 500); $aid = (int)($in['assignment_id'] ?? 0);
      if ($aid) { $st = $db->prepare('UPDATE teach_assignments SET title = ?, course = ?, topics = ?, count = ?, minutes = ?, due = ?, note = ? WHERE id = ? AND class_id = ?'); $st->execute([$title, $course, json_encode($topics), $count, $minutes, $due, $note, $aid, $c['id']]); if (!$st->rowCount()) mh_fail('Assignment not found.', 404); mh_json(['ok' => true, 'id' => $aid]); }
      mh_rate_or_fail("teachasg:user:{$u['id']}", 60, 86400);
      $db->prepare('INSERT INTO teach_assignments (class_id, title, course, topics, count, minutes, due, note, seed, created_by, created) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')->execute([$c['id'], $title, $course, json_encode($topics), $count, $minutes, $due, $note, random_int(1, 2000000000), $u['id'], $now]);
      $id = (int)$db->lastInsertId();
      $told = mh_teach_notify_members($c, $u, 'class_assign', $title, $count . ' practice questions' . ($due ? ', due ' . (new DateTime('@' . $due))->setTimezone(new DateTimeZone(mh_config()['timezone'] ?? 'America/Denver'))->format('D M j, g:i a') : ''), '#/class/' . $c['id']);
      mh_json(['ok' => true, 'id' => $id, 'told' => $told]);
    }
    case 'teach_assignment_delete': {
      mh_method('POST'); $u = mh_require_user(); $c = mh_teach_class_or_fail($in); mh_teach_tools_or_fail($u, $c);
      $db->prepare('DELETE FROM teach_assignments WHERE id = ? AND class_id = ?')->execute([(int)($in['assignment_id'] ?? 0), $c['id']]); mh_json(['ok' => true]);
    }
    case 'teach_submit': {
      mh_method('POST'); $u = mh_require_user(); mh_rate_or_fail("teachsub:user:{$u['id']}", 120, 3600);
      $st = $db->prepare('SELECT * FROM teach_assignments WHERE id = ?'); $st->execute([(int)($in['assignment_id'] ?? 0)]); $a = $st->fetch(); if (!$a) mh_fail('Assignment not found.', 404);
      $c = mh_teach_class((int)$a['class_id']); if (!$c || mh_teach_access($u, $c) !== 'student') mh_fail('Only students in this class can submit.', 403);
      $total = (int)$a['count']; $score = max(0, min($total, (int)($in['score'] ?? 0))); $secs = max(0, min(86400, (int)($in['seconds'] ?? 0)));
      $topics = []; if (is_array($in['topics'] ?? null)) foreach (array_slice($in['topics'], 0, 40, true) as $k => $v) { $k = preg_replace('/[^A-Za-z0-9_.-]/', '', (string)$k); if ($k !== '' && is_array($v)) $topics[$k] = [max(0, (int)($v[0] ?? 0)), max(0, (int)($v[1] ?? 0))]; }
      $db->prepare('INSERT INTO teach_submissions (assignment_id, user_id, score, total, best, seconds, attempts, topics, created, updated) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?) ON CONFLICT(assignment_id, user_id) DO UPDATE SET score = excluded.score, best = MAX(best, excluded.score), seconds = excluded.seconds, attempts = attempts + 1, topics = excluded.topics, updated = excluded.updated')
        ->execute([$a['id'], $u['id'], $score, $total, $score, $secs, json_encode($topics), $now, $now]);
      mh_json(['ok' => true, 'late' => (int)$a['due'] > 0 && $now > (int)$a['due']]);
    }
    case 'teach_results': {
      mh_method('GET'); $u = mh_require_user(); $st = $db->prepare('SELECT * FROM teach_assignments WHERE id = ?'); $st->execute([(int)($_GET['assignment_id'] ?? 0)]); $a = $st->fetch(); if (!$a) mh_fail('Assignment not found.', 404);
      $c = mh_teach_class((int)$a['class_id']); if (!$c) mh_fail('Not found.', 404); mh_teach_tools_or_fail($u, $c);
      $st = $db->prepare('SELECT u.id, u.name, u.email, s.score, s.best, s.total, s.attempts, s.seconds, s.topics, s.updated FROM teach_members m JOIN users u ON u.id = m.user_id LEFT JOIN teach_submissions s ON s.user_id = m.user_id AND s.assignment_id = ? WHERE m.class_id = ? AND m.role = \'student\' ORDER BY lower(u.name), u.email'); $st->execute([$a['id'], $c['id']]);
      $rows = []; $topicAgg = [];
      foreach ($st->fetchAll() as $r) { $rows[] = ['id' => (int)$r['id'], 'name' => mh_display_name($r), 'email' => $r['email'], 'done' => $r['updated'] !== null, 'best' => $r['best'] !== null ? (int)$r['best'] : null, 'total' => (int)($r['total'] ?? $a['count']), 'attempts' => (int)($r['attempts'] ?? 0), 'minutes' => $r['seconds'] !== null ? round((int)$r['seconds'] / 60, 1) : null, 'late' => $r['updated'] !== null && (int)$a['due'] > 0 && (int)$r['updated'] > (int)$a['due'], 'updated' => (int)($r['updated'] ?? 0)];
        foreach ((json_decode((string)($r['topics'] ?? ''), true) ?: []) as $t => $v) { $topicAgg[$t][0] = ($topicAgg[$t][0] ?? 0) + (int)$v[0]; $topicAgg[$t][1] = ($topicAgg[$t][1] ?? 0) + (int)$v[1]; } }
      $topics = []; foreach ($topicAgg as $t => [$ok, $n]) if ($n > 0) $topics[] = ['topic' => $t, 'correct' => $ok, 'total' => $n, 'pct' => round($ok / $n * 100)]; usort($topics, fn($x, $y) => $x['pct'] <=> $y['pct']);
      mh_json(['ok' => true, 'assignment' => mh_teach_assignment_public($a), 'students' => $rows, 'topics' => $topics]);
    }

    /* --- attendance: a 4-digit code shown in class, open for a few minutes --- */
    case 'teach_att_open': {
      mh_method('POST'); $u = mh_require_user(); $c = mh_teach_class_or_fail($in); mh_teach_tools_or_fail($u, $c);
      $min = max(1, min(30, (int)($in['minutes'] ?? 10))); $label = mh_teach_line($in['label'] ?? '', 60) ?: ('Class on ' . (new DateTime('now', new DateTimeZone(mh_config()['timezone'] ?? 'America/Denver')))->format('D M j'));
      $db->prepare('UPDATE teach_attendance SET closes = ? WHERE class_id = ? AND closes > ?')->execute([$now, $c['id'], $now]);
      $code = str_pad((string)random_int(0, 9999), 4, '0', STR_PAD_LEFT);
      $db->prepare('INSERT INTO teach_attendance (class_id, label, code, opens, closes, created_by) VALUES (?, ?, ?, ?, ?, ?)')->execute([$c['id'], $label, $code, $now, $now + $min * 60, $u['id']]);
      mh_json(['ok' => true, 'session' => ['id' => (int)$db->lastInsertId(), 'code' => $code, 'label' => $label, 'closes' => $now + $min * 60]]);
    }
    case 'teach_att_close': {
      mh_method('POST'); $u = mh_require_user(); $c = mh_teach_class_or_fail($in); mh_teach_tools_or_fail($u, $c);
      $db->prepare('UPDATE teach_attendance SET closes = ? WHERE class_id = ? AND id = ? AND closes > ?')->execute([$now, $c['id'], (int)($in['session_id'] ?? 0), $now]); mh_json(['ok' => true]);
    }
    case 'teach_checkin': {
      mh_method('POST'); $u = mh_require_user(); $c = mh_teach_class_or_fail($in); if (mh_teach_access($u, $c) !== 'student') mh_fail('Join this class first.', 403);
      mh_rate_or_fail("teachchk:user:{$u['id']}", 12, 900, 'Too many tries. Ask your instructor for the code.');
      $st = $db->prepare('SELECT * FROM teach_attendance WHERE class_id = ? AND opens <= ? AND closes > ? ORDER BY id DESC LIMIT 1'); $st->execute([$c['id'], $now, $now]); $s = $st->fetch();
      if (!$s) mh_fail('Check-in is closed right now.');
      if (!hash_equals((string)$s['code'], preg_replace('/\D/', '', (string)($in['code'] ?? '')))) mh_fail('That is not the code on the screen.');
      $db->prepare('INSERT OR IGNORE INTO teach_checkins (session_id, user_id, created) VALUES (?, ?, ?)')->execute([$s['id'], $u['id'], $now]); mh_json(['ok' => true]);
    }

    /* --- insights: how the class is doing, from its own assignments and check-ins --- */
    case 'teach_insights': {
      mh_method('GET'); $u = mh_require_user(); $c = mh_teach_class_or_fail($in); mh_teach_tools_or_fail($u, $c);
      $q = fn(string $sql, array $a) => (function () use ($db, $sql, $a) { $st = $db->prepare($sql); $st->execute($a); return $st; })();
      $students = (int)$q('SELECT COUNT(*) FROM teach_members WHERE class_id = ? AND role = \'student\'', [$c['id']])->fetchColumn();
      $joinedWeek = (int)$q('SELECT COUNT(*) FROM teach_members WHERE class_id = ? AND role = \'student\' AND joined > ?', [$c['id'], $now - 7 * 86400])->fetchColumn();
      $asg = []; foreach ($q('SELECT * FROM teach_assignments WHERE class_id = ? ORDER BY created', [$c['id']])->fetchAll() as $a) {
        $r = $q('SELECT COUNT(*) AS n, AVG(CAST(best AS REAL) / NULLIF(total, 0)) AS avg, SUM(CASE WHEN ? > 0 AND updated > ? THEN 1 ELSE 0 END) AS late FROM teach_submissions WHERE assignment_id = ?', [(int)$a['due'], (int)$a['due'], $a['id']])->fetch();
        $asg[] = ['id' => (int)$a['id'], 'title' => $a['title'], 'due' => (int)$a['due'], 'done' => (int)$r['n'], 'avg' => $r['avg'] !== null ? round((float)$r['avg'] * 100) : null, 'late' => (int)$r['late']]; }
      $topicAgg = []; foreach ($q('SELECT s.topics FROM teach_submissions s JOIN teach_assignments a ON a.id = s.assignment_id WHERE a.class_id = ?', [$c['id']])->fetchAll(PDO::FETCH_COLUMN) as $js) foreach ((json_decode((string)$js, true) ?: []) as $t => $v) { $topicAgg[$t][0] = ($topicAgg[$t][0] ?? 0) + (int)$v[0]; $topicAgg[$t][1] = ($topicAgg[$t][1] ?? 0) + (int)$v[1]; }
      $topics = []; foreach ($topicAgg as $t => [$ok, $n]) if ($n >= 5) $topics[] = ['topic' => $t, 'pct' => round($ok / $n * 100), 'answered' => $n]; usort($topics, fn($x, $y) => $x['pct'] <=> $y['pct']);
      $att = array_map(fn($s) => ['id' => (int)$s['id'], 'label' => $s['label'], 'opens' => (int)$s['opens'], 'closes' => (int)$s['closes'], 'n' => (int)$s['n']], $q('SELECT t.*, (SELECT COUNT(*) FROM teach_checkins k WHERE k.session_id = t.id) AS n FROM teach_attendance t WHERE t.class_id = ? ORDER BY t.opens DESC LIMIT 30', [$c['id']])->fetchAll());
      $open = $q('SELECT id, code, label, closes FROM teach_attendance WHERE class_id = ? AND closes > ? ORDER BY id DESC LIMIT 1', [$c['id'], $now])->fetch();
      mh_json(['ok' => true, 'students' => $students, 'joined_week' => $joinedWeek, 'assignments' => $asg, 'topics' => array_slice($topics, 0, 12), 'attendance' => $att, 'open' => $open ? ['id' => (int)$open['id'], 'code' => $open['code'], 'label' => $open['label'], 'closes' => (int)$open['closes']] : null]);
    }
  }
  mh_fail('Not found.', 404);
}
