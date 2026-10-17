<?php
/* ============================================================
   Mathub account server — Bo, the AI tutor (Mathub Max), talking with Bo out loud, and classes Bo writes
   from a syllabus (Pro and Max)
   Routes: ai_status, ai_thread, ai_tutor, ai_forget, ai_class, ai_speak, ai_listen, ai_live_start, ai_live_tick, ai_live_log
   - Writing a class needs Mathub Pro or Max; talking with Bo needs Max (plan_grants gives testers a plan).
   - This server is the only thing that talks to the AI (Anthropic's API; the key lives in config.local.php),
     and it keeps every request small so it costs as little as possible:
       * each class is turned into a compact text summary: its facts, grading, exams and one line per
         topic (from api/classdata/*.json for the built-in classes, packs/*.mathub.json, or the student's
         own class saved with their account);
       * the student's progress comes from the device as a short snapshot and is trimmed again here;
       * Bo's chat is kept here: only the last few turns go to the AI, plus up to 12 short notes Bo saved;
       * the parts that do not change (Bo's instructions, the class summary) are marked for prompt caching;
       * a class from a syllabus is written in steps: the syllabus is read once into an outline that is
         kept here, then each unit is written from that outline instead of the whole syllabus again.
   - The smallest model that does the job well: claude-haiku-5-5 by default (ai_model_tutor, ai_model_class).
   - Answers can stream (stream: 1): the reply goes out line by line as JSON (NDJSON) while the AI writes it, so
     the chat fills in and Bo starts talking within a second or two. In voice mode (voice: 1) Bo answers the way
     a tutor talks, briefly and in words, and writes formulas on a whiteboard instead of reading them.
   - Bo's board: whatever he works out (the steps of a problem, a formula, the answer) he writes as a page of his
     whiteboard, a [board: Title] … [/board] block with step:, math:, answer:, tip:, text:, draw: and check: lines
     and ``` code blocks, which the website draws neatly beside the chat and on calls (on a call through his
     write_on_board, draw_on_board and ask_on_board tools). A draw: line is a picture as JSON: a graph (with
     tangent lines, Riemann sums and sliders the student drags), number line, figure, the unit circle, table, bar
     or pie chart, scatter plot with its best-fit line, box plot, normal curve, probability tree, Venn diagram or
     flow chart (MH_AI_DRAW; drawn by assets/board-draw.js). A check: line is a question the student answers on
     the board, and sees at once whether it's right.
   - How Bo teaches (MH_AI_TEACH, in the chat, voice and call instructions): what research on expert tutors and
     learning says works: find out where the student is, the big picture first, one idea at a time, concrete
     before abstract, a worked example and then fading, draw it, check with real questions, a hint ladder,
     mistakes as information, a different angle when it didn't land, close the loop. Sources: docs/bo-teaching.md.
   - Bo's natural voice and listening on any browser (optional, openai_key in config.local.php): ai_speak turns
     one or two of Bo's sentences into speech, ai_listen turns a short recording of the student into text. No
     audio is kept. Without the key the browser's own speech recognition and voices are used.
   - Live calls with Bo (optional, openai_key): a real-time voice conversation through OpenAI's Realtime API
     (speech to speech over WebRTC). The browser sends its connection offer here; this server adds Bo's
     instructions (his live persona, the class summary, the progress snapshot, his notes, the last few chat
     turns), sets the call up with OpenAI and returns the answer, so the key never reaches the browser. The
     browser reports the minutes (ai_live_tick); past a limit this server hangs the call up. What was said is
     saved in the chat (ai_live_log). Minutes per call, per day and per month: ai_live_call, _daily, _monthly.
   - Monthly limits per account (ai_tutor_monthly, ai_class_monthly, ai_voice_monthly characters spoken,
     ai_listen_monthly seconds heard) and per-minute rate limits.
   Rows are removed with the account (ON DELETE CASCADE).
   ============================================================ */

require_once __DIR__ . '/myclasses.php';

const MH_AI_TURNS_SENT = 6;      // chat turns sent to the AI with each question
const MH_AI_TURNS_KEPT = 40;     // chat turns kept for the screen
const MH_AI_NOTES = 12;          // notes Bo keeps about a student
const MH_AI_FILE_BYTES = 7000000; // a syllabus file (PDF or photo)
const MH_AI_IMAGE_BYTES = 2500000; // a photo in the chat
const MH_AI_PDF_BYTES = 6500000;   // a problem set as a PDF in the chat
const MH_AI_SCREEN_CHARS = 9000;   // what is on the page the student asked from

function mh_ai_db(): PDO {
  static $ready = false; $db = mh_db();
  if (!$ready) {
    $db->exec('CREATE TABLE IF NOT EXISTS ai_usage (user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, ym TEXT NOT NULL, tutor INTEGER NOT NULL DEFAULT 0, classes INTEGER NOT NULL DEFAULT 0, tin INTEGER NOT NULL DEFAULT 0, tout INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (user_id, ym))');
    $db->exec('CREATE TABLE IF NOT EXISTS ai_threads (user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, cid TEXT NOT NULL, turns TEXT NOT NULL DEFAULT "[]", updated INTEGER NOT NULL, PRIMARY KEY (user_id, cid))');
    $db->exec('CREATE TABLE IF NOT EXISTS ai_notes (user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE, notes TEXT NOT NULL DEFAULT "[]", updated INTEGER NOT NULL)');
    $db->exec('CREATE TABLE IF NOT EXISTS ai_builds (id TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, created INTEGER NOT NULL, outline TEXT NOT NULL, units INTEGER NOT NULL, steps INTEGER NOT NULL DEFAULT 0)');
    $cols = array_column($db->query('PRAGMA table_info(ai_usage)')->fetchAll(), 'name');
    if (!in_array('voice', $cols, true)) $db->exec('ALTER TABLE ai_usage ADD COLUMN voice INTEGER NOT NULL DEFAULT 0');     // characters Bo spoke
    if (!in_array('listen', $cols, true)) $db->exec('ALTER TABLE ai_usage ADD COLUMN listen INTEGER NOT NULL DEFAULT 0');   // seconds of the student heard
    if (!in_array('live', $cols, true)) $db->exec('ALTER TABLE ai_usage ADD COLUMN live INTEGER NOT NULL DEFAULT 0');       // seconds of live calls
    $db->exec('CREATE TABLE IF NOT EXISTS ai_live (id TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, cid TEXT NOT NULL DEFAULT "", call TEXT NOT NULL DEFAULT "", started INTEGER NOT NULL, last INTEGER NOT NULL, secs INTEGER NOT NULL DEFAULT 0, ended INTEGER NOT NULL DEFAULT 0)');
    $ready = true;
  }
  return $db;
}

/** Rows whose account is gone, and class builds older than a day. */
function mh_ai_prune(): int {
  $db = mh_ai_db(); $n = 0;
  foreach (['ai_usage', 'ai_threads', 'ai_notes', 'ai_builds', 'ai_live'] as $t) $n += (int)$db->exec("DELETE FROM $t WHERE user_id NOT IN (SELECT id FROM users)");
  $n += (int)$db->exec('DELETE FROM ai_builds WHERE created < ' . (time() - 86400));
  // live calls the browser stopped reporting on: hang them up (the limits are counted from the reports)
  $V = mh_ai_voice_settings(mh_config());
  foreach ($db->query('SELECT id, call FROM ai_live WHERE ended = 0 AND last < ' . (time() - 180))->fetchAll() as $r) { if ($V['key'] !== '' && $r['call'] !== '') mh_ai_hangup($V, (string)$r['call']); $db->prepare('UPDATE ai_live SET ended = 1 WHERE id = ?')->execute([$r['id']]); $n++; }
  $n += (int)$db->exec('DELETE FROM ai_live WHERE started < ' . (time() - 40 * 86400));
  return $n;
}

function mh_ai_settings(array $cfg): array {
  return [
    'key' => trim((string)($cfg['anthropic_key'] ?? '')),
    'url' => (string)($cfg['anthropic_api'] ?? 'https://api.anthropic.com/v1/messages'),
    'tutor_model' => (string)($cfg['ai_model_tutor'] ?? 'claude-haiku-5-5'),
    'class_model' => (string)($cfg['ai_model_class'] ?? 'claude-haiku-5-5'),
    'tutor_monthly' => max(0, (int)($cfg['ai_tutor_monthly'] ?? 1500)),
    'class_monthly' => max(0, (int)($cfg['ai_class_monthly'] ?? 15)),
    'tutor_daily' => max(1, (int)($cfg['ai_tutor_daily'] ?? 300)),
  ];
}
/** Bo's natural voice and listening (OpenAI's speech API); optional. */
const MH_AI_VOICES = ['ash' => 'Ash: warm and steady', 'ballad' => 'Ballad: soft and calm', 'coral' => 'Coral: bright and friendly', 'sage' => 'Sage: clear and thoughtful', 'verse' => 'Verse: lively', 'alloy' => 'Alloy: even and neutral'];
function mh_ai_voice_settings(array $cfg): array {
  $v = (string)($cfg['ai_tts_voice'] ?? 'ash');
  return [
    'key' => trim((string)($cfg['openai_key'] ?? '')),
    'url' => rtrim((string)($cfg['openai_api'] ?? 'https://api.openai.com/v1'), '/'),
    'tts_model' => (string)($cfg['ai_tts_model'] ?? 'gpt-4o-mini-tts'),
    'stt_model' => (string)($cfg['ai_stt_model'] ?? 'gpt-4o-mini-transcribe'),
    'voice' => isset(MH_AI_VOICES[$v]) ? $v : 'ash',
    'voice_monthly' => max(0, (int)($cfg['ai_voice_monthly'] ?? 300000)),
    'listen_monthly' => max(0, (int)($cfg['ai_listen_monthly'] ?? 36000)),
    'live_model' => (string)($cfg['ai_live_model'] ?? 'gpt-realtime-2.1-mini'),
    'live_voice' => in_array($cfg['ai_live_voice'] ?? '', array_keys(MH_AI_LIVE_VOICES), true) ? $cfg['ai_live_voice'] : 'cedar',
    'live_monthly' => 60 * max(0, (int)($cfg['ai_live_monthly'] ?? 300)),   // seconds
    'live_daily' => 60 * max(1, (int)($cfg['ai_live_daily'] ?? 90)),
    'live_call' => 60 * max(1, (int)($cfg['ai_live_call'] ?? 30)),
  ];
}
/** The voices of live calls (OpenAI's realtime voices); cedar and marin sound the most natural. */
const MH_AI_LIVE_VOICES = ['cedar' => 'Cedar: warm and easygoing', 'marin' => 'Marin: bright and clear', 'ash' => 'Ash: steady', 'ballad' => 'Ballad: soft', 'coral' => 'Coral: friendly', 'sage' => 'Sage: calm', 'verse' => 'Verse: lively'];

/* ---------- usage ---------- */
function mh_ai_usage(int $uid): array {
  $st = mh_ai_db()->prepare('SELECT tutor, classes, voice, listen, live FROM ai_usage WHERE user_id = ? AND ym = ?'); $st->execute([$uid, gmdate('Y-m')]); $r = $st->fetch();
  return ['tutor' => $r ? (int)$r['tutor'] : 0, 'classes' => $r ? (int)$r['classes'] : 0, 'voice' => $r ? (int)$r['voice'] : 0, 'listen' => $r ? (int)$r['listen'] : 0, 'live' => $r ? (int)$r['live'] : 0];
}
/** Characters spoken or seconds heard this month. */
function mh_ai_add(int $uid, string $col, int $n): void {
  if (!in_array($col, ['voice', 'listen', 'live'], true)) return;
  $db = mh_ai_db(); $db->prepare('INSERT OR IGNORE INTO ai_usage (user_id, ym) VALUES (?, ?)')->execute([$uid, gmdate('Y-m')]);
  $db->prepare("UPDATE ai_usage SET $col = $col + ? WHERE user_id = ? AND ym = ?")->execute([max(0, $n), $uid, gmdate('Y-m')]);
}
function mh_ai_count(int $uid, string $what, int $tin, int $tout): void {
  $col = $what === 'classes' ? 'classes' : ($what === 'tutor' ? 'tutor' : '');
  $db = mh_ai_db(); $db->prepare('INSERT OR IGNORE INTO ai_usage (user_id, ym) VALUES (?, ?)')->execute([$uid, gmdate('Y-m')]);
  $db->prepare('UPDATE ai_usage SET ' . ($col ? "$col = $col + 1, " : '') . 'tin = tin + ?, tout = tout + ? WHERE user_id = ? AND ym = ?')->execute([$tin, $tout, $uid, gmdate('Y-m')]);
}

/* ---------- talking to the AI ---------- */
/** One request to Anthropic's Messages API. Returns text, why it stopped, and the tokens used. */
function mh_ai_call(array $A, string $model, array $system, array $messages, int $maxTokens, int $timeout): array {
  if ($A['key'] === '') mh_fail('Bo is not switched on yet. Please try again later.', 503);
  if (!function_exists('curl_init')) mh_fail('Bo cannot reach the AI from this server.', 503);
  $body = json_encode(['model' => $model, 'max_tokens' => $maxTokens, 'system' => $system, 'messages' => $messages], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
  $ch = curl_init($A['url']);
  curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_POST => true, CURLOPT_POSTFIELDS => $body, CURLOPT_TIMEOUT => $timeout, CURLOPT_CONNECTTIMEOUT => 8,
    CURLOPT_HTTPHEADER => ['x-api-key: ' . $A['key'], 'anthropic-version: 2023-06-01', 'content-type: application/json', 'accept: application/json']]);
  $raw = curl_exec($ch); $code = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE); $err = curl_errno($ch); curl_close($ch);
  $j = $raw === false ? null : json_decode((string)$raw, true);
  if ($raw === false || $code < 200 || $code >= 300 || !is_array($j)) { [$msg, $status] = mh_ai_trouble($raw === false ? null : (string)$raw, $code, $err); mh_fail($msg, $status); }
  $text = ''; foreach (($j['content'] ?? []) as $b) if (($b['type'] ?? '') === 'text') $text .= (string)$b['text'];
  $u = $j['usage'] ?? [];
  return ['text' => $text, 'stop' => (string)($j['stop_reason'] ?? ''), 'in' => (int)($u['input_tokens'] ?? 0) + (int)($u['cache_creation_input_tokens'] ?? 0) + (int)($u['cache_read_input_tokens'] ?? 0), 'out' => (int)($u['output_tokens'] ?? 0)];
}
/** What to tell the student when the AI did not answer: [message, HTTP status]. */
function mh_ai_trouble(?string $raw, int $code, int $err): array {
  if ($raw === null) return [$err === CURLE_OPERATION_TIMEDOUT ? 'Bo took too long to answer. Please try again.' : 'Bo could not be reached. Please try again in a minute.', 504];
  if ($code === 429 || $code === 529 || $code === 503) return ['Bo is very busy right now. Please try again in a minute.', 503];
  if ($code === 413) return ['That is too much for Bo to read at once. Try a shorter text or a smaller file.', 413];
  error_log('mathub ai: ' . $code . ' ' . substr($raw, 0, 300));
  return [$code === 400 ? 'Bo could not read that. Try a different file, or paste the text instead.' : 'Bo could not answer just now. Please try again.', 502];
}

/* ---------- streaming: the reply goes to the browser while the AI writes it ---------- */
/** One line of the stream (NDJSON). The first one sends the headers and turns off every buffer it can. */
function mh_ai_emit(array $o): void {
  static $open = false;
  if (!$open) {
    $open = true; $GLOBALS['mh_ai_streaming'] = true;
    @ini_set('zlib.output_compression', '0'); @ini_set('output_buffering', '0'); @ini_set('implicit_flush', '1');
    while (ob_get_level() > 0) @ob_end_clean();
    http_response_code(200);
    header('Content-Type: application/x-ndjson; charset=UTF-8');
    header('Cache-Control: no-store, no-transform');
    header('X-Accel-Buffering: no');   // nginx and some proxies: do not hold the reply back
  }
  echo json_encode($o, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE), "\n";
  @flush();
}
/** A failure: a normal JSON error before the stream started, an error line after. */
function mh_ai_fail(string $msg, int $status): void {
  if (!empty($GLOBALS['mh_ai_streaming'])) { mh_ai_emit(['t' => 'error', 'error' => $msg, 'status' => $status]); exit; }
  mh_fail($msg, $status);
}
/** mh_ai_call, streamed: $onText gets each piece of text as it arrives. Returns what mh_ai_call returns. */
function mh_ai_stream(array $A, string $model, array $system, array $messages, int $maxTokens, int $timeout, callable $onText): array {
  if ($A['key'] === '') mh_fail('Bo is not switched on yet. Please try again later.', 503);
  if (!function_exists('curl_init')) mh_fail('Bo cannot reach the AI from this server.', 503);
  $body = json_encode(['model' => $model, 'max_tokens' => $maxTokens, 'system' => $system, 'messages' => $messages, 'stream' => true], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
  $S = ['buf' => '', 'raw' => '', 'text' => '', 'in' => 0, 'out' => 0, 'stop' => '', 'err' => ''];
  $ch = curl_init($A['url']);
  curl_setopt_array($ch, [CURLOPT_POST => true, CURLOPT_POSTFIELDS => $body, CURLOPT_TIMEOUT => $timeout, CURLOPT_CONNECTTIMEOUT => 8,
    CURLOPT_HTTPHEADER => ['x-api-key: ' . $A['key'], 'anthropic-version: 2023-06-01', 'content-type: application/json', 'accept: text/event-stream'],
    CURLOPT_WRITEFUNCTION => function ($ch, string $chunk) use (&$S, $onText): int {
      $code = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
      if ($code && ($code < 200 || $code >= 300)) { $S['raw'] .= $chunk; return strlen($chunk); }
      $S['buf'] .= str_replace("\r\n", "\n", $chunk);
      while (($p = strpos($S['buf'], "\n\n")) !== false) {
        $ev = substr($S['buf'], 0, $p); $S['buf'] = substr($S['buf'], $p + 2); $data = '';
        foreach (explode("\n", $ev) as $line) if (strncmp($line, 'data:', 5) === 0) $data .= ltrim(substr($line, 5));
        $j = json_decode($data, true); if (!is_array($j)) continue;
        $type = (string)($j['type'] ?? '');
        if ($type === 'message_start') { $u = $j['message']['usage'] ?? []; $S['in'] = (int)($u['input_tokens'] ?? 0) + (int)($u['cache_creation_input_tokens'] ?? 0) + (int)($u['cache_read_input_tokens'] ?? 0); $S['out'] = (int)($u['output_tokens'] ?? 0); }
        elseif ($type === 'content_block_delta' && ($j['delta']['type'] ?? '') === 'text_delta') { $t = (string)($j['delta']['text'] ?? ''); if ($t !== '') { $S['text'] .= $t; $onText($t); } }
        elseif ($type === 'message_delta') { $S['stop'] = (string)($j['delta']['stop_reason'] ?? $S['stop']); if (isset($j['usage']['output_tokens'])) $S['out'] = (int)$j['usage']['output_tokens']; }
        elseif ($type === 'error') { $S['err'] = (string)($j['error']['type'] ?? 'error'); }
      }
      return strlen($chunk);
    }]);
  $ok = curl_exec($ch); $code = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE); $err = curl_errno($ch); curl_close($ch);
  if ($ok === false && $S['text'] === '') { [$msg, $status] = mh_ai_trouble(null, $code, $err); mh_ai_fail($msg, $status); }
  if ($code < 200 || $code >= 300) { [$msg, $status] = mh_ai_trouble($S['raw'], $code, $err); mh_ai_fail($msg, $status); }
  if ($S['err'] !== '' && $S['text'] === '') { [$msg, $status] = mh_ai_trouble('', $S['err'] === 'overloaded_error' ? 529 : 500, 0); mh_ai_fail($msg, $status); }
  if (($ok === false || $S['err'] !== '') && $S['stop'] === '') $S['stop'] = 'cut';
  return ['text' => $S['text'], 'stop' => $S['stop'], 'in' => $S['in'], 'out' => $S['out']];
}

/* ---------- Bo's voice and ears (OpenAI's speech API, optional) ---------- */
/** One request to the speech API: [HTTP status, body, content type]. $body is JSON, or an array for a file upload. */
function mh_ai_openai(array $V, string $path, $body, int $timeout): array {
  if (!function_exists('curl_init')) mh_fail('Speech is not available on this server.', 503, ['fallback' => true]);
  $ch = curl_init($V['url'] . $path); $h = ['Authorization: Bearer ' . $V['key']]; if (is_string($body)) $h[] = 'Content-Type: application/json';
  curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_POST => true, CURLOPT_POSTFIELDS => $body, CURLOPT_TIMEOUT => $timeout, CURLOPT_CONNECTTIMEOUT => 8, CURLOPT_HTTPHEADER => $h]);
  $raw = curl_exec($ch); $code = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE); $type = (string)curl_getinfo($ch, CURLINFO_CONTENT_TYPE); curl_close($ch);
  if ($raw === false || $code < 200 || $code >= 300) { if ($raw !== false) error_log('mathub speech: ' . $code . ' ' . substr((string)$raw, 0, 300)); mh_fail('Bo\'s voice is not available right now, so your device\'s voice is used.', 502, ['fallback' => true]); }
  return [$code, (string)$raw, $type];
}

/** The JSON object in a reply: inside a ```json block, or the outermost braces. */
function mh_ai_json(string $t): ?array {
  if (preg_match('/```(?:json)?\s*(\{[\s\S]*\})\s*```/i', $t, $m)) $t = $m[1];
  $a = strpos($t, '{'); $b = strrpos($t, '}'); if ($a === false || $b === false || $b <= $a) return null;
  $s = substr($t, $a, $b - $a + 1); $j = json_decode($s, true);
  if (!is_array($j)) $j = json_decode(preg_replace('/,(\s*[}\]])/', '$1', $s), true);
  return is_array($j) ? $j : null;
}

/* ---------- compact class summaries ---------- */
function mh_ai_plain($v, int $max = 0): string {
  $s = is_string($v) ? $v : (is_numeric($v) ? (string)$v : '');
  $s = html_entity_decode(strip_tags(str_replace(['<br>', '<br/>', '</li>', '</p>'], ' ', $s)), ENT_QUOTES | ENT_HTML5, 'UTF-8');
  $s = trim(preg_replace('/\s+/u', ' ', $s));
  if ($max > 0 && mb_strlen($s) > $max) $s = rtrim(mb_substr($s, 0, $max - 1)) . '…';
  return $s;
}

/** Text the student typed or Bo wrote: kept as is (math like x < 3 included), without control characters, cut to $max. */
function mh_ai_clip($v, int $max): string {
  $s = is_string($v) ? $v : ''; $s = preg_replace('/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/u', '', $s); $s = trim(preg_replace("/[ \t]+/u", ' ', preg_replace("/\n{3,}/", "\n\n", str_replace("\r", '', $s))));
  return mb_strlen($s) > $max ? rtrim(mb_substr($s, 0, $max - 1)) . '…' : $s;
}

/** The class as Mathub knows it: built-in (api/classdata), a class pack, or one the student made. */
function mh_ai_class(array $u, string $cid): ?array {
  if (preg_match('/^my\d{4,6}$/', $cid)) {
    $st = mh_myclass_db()->prepare('SELECT pack FROM my_classes WHERE user_id = ? AND cid = ?'); $st->execute([$u['id'], $cid]); $p = $st->fetchColumn();
    $j = $p ? json_decode((string)$p, true) : null; return is_array($j) ? $j : null;
  }
  if (!preg_match('/^[a-z0-9][a-z0-9_-]{0,40}$/', $cid)) return null;
  foreach ([__DIR__ . "/classdata/$cid.json", dirname(__DIR__) . "/packs/$cid.mathub.json"] as $f) {
    if (is_file($f)) { $j = json_decode((string)file_get_contents($f), true); if (is_array($j)) return $j; }
  }
  return null;
}

/** About 1,500 tokens for a whole class: facts, grading, exams, then every unit with one line per topic. */
function mh_ai_digest(array $C): string {
  $co = is_array($C['COURSE'] ?? null) ? $C['COURSE'] : [];
  $L = [];
  $L[] = 'CLASS: ' . mh_ai_plain($C['code'] ?? ($co['code'] ?? ''), 30) . ' ' . mh_ai_plain($C['name'] ?? ($co['name'] ?? ''), 80) . ' (' . mh_ai_plain($C['term'] ?? ($co['term'] ?? ''), 20) . (!empty($co['school']) ? ', ' . mh_ai_plain($co['school'], 40) : '') . ')';
  $who = !empty($co['instructor']) ? mh_ai_plain($co['instructor'], 60) : (is_array($co['instructors'] ?? null) ? implode(', ', array_map(fn($i) => mh_ai_plain(is_array($i) ? ($i['name'] ?? '') : $i, 40), array_slice($co['instructors'], 0, 3))) : '');
  if ($who !== '') $L[] = 'INSTRUCTOR: ' . $who . (!empty($co['officeHours']) ? ' | OFFICE HOURS: ' . mh_ai_plain($co['officeHours'], 100) : '');
  $meets = mh_ai_plain($co['lectures'] ?? ($co['meets'] ?? ($co['classDays'] ?? '')), 100); if ($meets !== '') $L[] = 'MEETS: ' . $meets;
  if (!empty($co['textbook'])) $L[] = 'TEXTBOOK: ' . mh_ai_plain(is_array($co['textbook']) ? ($co['textbook']['title'] ?? '') : $co['textbook'], 90);
  $G = is_array($C['GRADING'] ?? null) ? $C['GRADING'] : [];
  if (!empty($G['categories']) && is_array($G['categories'])) $L[] = 'GRADING: ' . implode('; ', array_map(fn($c) => mh_ai_plain($c['name'] ?? '', 45) . ' ' . (0 + ($c['weight'] ?? 0)) . '%', array_slice($G['categories'], 0, 14)));
  if (!empty($G['scale']) && is_array($G['scale'])) $L[] = 'SCALE: ' . implode(', ', array_map(fn($x) => mh_ai_plain($x['letter'] ?? '', 3) . '≥' . (0 + ($x['min'] ?? 0)), array_slice($G['scale'], 0, 13)));
  $ex = array_values(array_filter(is_array($C['EXAMS'] ?? null) ? $C['EXAMS'] : [], 'is_array'));
  if ($ex) $L[] = 'EXAMS: ' . implode(' | ', array_map(fn($e) => mh_ai_plain($e['name'] ?? '', 30) . ' ' . mh_ai_plain($e['date'] ?? '', 10) . ' (' . mh_ai_plain($e['covers'] ?? '', 70) . (!empty($e['weight']) ? '; ' . $e['weight'] . '%' : '') . ')', array_slice($ex, 0, 8)));
  $secs = []; foreach ((is_array($C['SECTIONS'] ?? null) ? $C['SECTIONS'] : []) as $s) if (is_array($s) && isset($s['id'])) $secs[(string)$s['id']] = $s;
  $units = is_array($C['UNITS'] ?? null) ? $C['UNITS'] : [];
  if ($units) {
    $L[] = 'TOPICS (in class order; each with its first idea):';
    foreach (array_slice($units, 0, 16) as $u) {
      if (!is_array($u)) continue;
      $exName = ''; foreach ($ex as $e) if (($e['id'] ?? '') === ($u['exam'] ?? null)) $exName = ' [' . mh_ai_plain($e['name'] ?? '', 30) . ']';
      $L[] = 'U' . (int)($u['n'] ?? 0) . ' ' . mh_ai_plain($u['title'] ?? '', 70) . $exName;
      foreach (array_slice(is_array($u['sections'] ?? null) ? $u['sections'] : [], 0, 20) as $sid) {
        $s = $secs[(string)$sid] ?? null; if (!$s) continue;
        $first = is_array($s['ideas'] ?? null) && $s['ideas'] ? $s['ideas'][0] : ($s['about'] ?? '');
        $label = (string)($s['label'] ?? (preg_match('/^\d+(\.\d+)*$/', (string)$s['id']) ? $s['id'] : ''));
        $L[] = '- ' . trim(mh_ai_plain($label, 10) . ' ' . mh_ai_plain($s['title'] ?? '', 70)) . ($first ? ': ' . mh_ai_plain($first, 110) : '');
      }
    }
  }
  return implode("\n", $L);
}

/** What happens in the class in the next two weeks (changes daily, so it is not cached). */
function mh_ai_upcoming(array $C, string $today): string {
  $end = gmdate('Y-m-d', strtotime($today . ' +14 days')); $rows = [];
  foreach ((is_array($C['CALENDAR'] ?? null) ? $C['CALENDAR'] : []) as $r) {
    if (!is_array($r) || !isset($r[0]) || !is_string($r[0])) continue; if ($r[0] < $today || $r[0] > $end) continue;
    $rows[] = substr($r[0], 5) . ' ' . mh_ai_plain($r[1] ?? '', 10) . ' ' . mh_ai_plain($r[2] ?? '', 60); if (count($rows) >= 12) break;
  }
  return $rows ? 'NEXT TWO WEEKS: ' . implode('; ', $rows) : '';
}

/** The student's progress, as sent by their device, cut down to a few short lines. */
function mh_ai_snapshot($s): string {
  if (!is_array($s)) return '';
  $p = fn($v, $n) => mh_ai_plain($v, $n); $L = [];
  $who = []; if (!empty($s['name'])) $who[] = 'name ' . $p($s['name'], 30); if (isset($s['streak'])) $who[] = 'streak ' . (int)$s['streak'] . ' days'; if (isset($s['xpToday'])) $who[] = 'XP today ' . (int)$s['xpToday'] . '/' . (int)($s['goal'] ?? 30); if (!empty($s['page'])) $who[] = 'now on ' . $p($s['page'], 50);
  if ($who) $L[] = 'STUDENT: ' . implode(', ', $who);
  if (is_array($s['readiness'] ?? null)) { $r = $s['readiness']; $L[] = 'READINESS: ' . $p($r['exam'] ?? '', 30) . ' on ' . $p($r['date'] ?? '', 10) . ' (' . (int)($r['days'] ?? 0) . ' days): ' . (int)($r['score'] ?? 0) . '% ' . $p($r['label'] ?? '', 20) . (isset($r['checklist']) ? ', prep checklist ' . $p($r['checklist'], 10) : ''); }
  $topic = fn($t) => $p($t['t'] ?? '', 50) . ' ' . (isset($t['acc']) ? round(100 * (float)$t['acc']) . '% right of ' . (int)($t['n'] ?? 0) : 'not practised');
  if (!empty($s['weak']) && is_array($s['weak'])) $L[] = 'WEAKEST TOPICS: ' . implode('; ', array_map($topic, array_slice($s['weak'], 0, 6)));
  if (!empty($s['strong']) && is_array($s['strong'])) $L[] = 'STRONG: ' . implode('; ', array_map(fn($x) => $p($x, 40), array_slice($s['strong'], 0, 4)));
  if (!empty($s['missed']) && is_array($s['missed'])) { $L[] = 'RECENTLY MISSED:'; foreach (array_slice($s['missed'], 0, 5) as $m) if (is_array($m)) $L[] = '- [' . $p($m['t'] ?? '', 30) . '] ' . $p($m['q'] ?? '', 140) . ' | they said ' . $p($m['a'] ?? '', 40) . ' | answer ' . $p($m['c'] ?? '', 40); }
  $nums = []; if (isset($s['due'])) $nums[] = (int)$s['due'] . ' flashcards due'; if (isset($s['mistakes'])) $nums[] = (int)$s['mistakes'] . ' missed questions to retry'; if ($nums) $L[] = 'TO DO: ' . implode(', ', $nums);
  if (!empty($s['grades']) && is_array($s['grades'])) $L[] = 'GRADES SO FAR: ' . implode('; ', array_map(fn($g) => $p($g['c'] ?? '', 30) . ' ' . $p($g['s'] ?? '', 10), array_slice($s['grades'], 0, 8)));
  if (!empty($s['deadlines']) && is_array($s['deadlines'])) $L[] = 'DUE SOON (all classes): ' . implode('; ', array_map(fn($d) => $p($d['d'] ?? '', 10) . ' ' . $p($d['t'] ?? '', 50), array_slice($s['deadlines'], 0, 6)));
  if (!empty($s['others']) && is_array($s['others'])) $L[] = 'OTHER CLASSES: ' . implode('; ', array_map(fn($o) => $p($o['c'] ?? '', 20) . ($o['ex'] ?? '' ? ' ' . $p($o['ex'], 25) . ' in ' . (int)($o['days'] ?? 0) . ' days' : ''), array_slice($s['others'], 0, 5)));
  return implode("\n", $L);
}

const MH_AI_TEACH = <<<'TXT'
HOW YOU TEACH: what the best tutors do. Use it every time you explain something.
1. Find out where they are first. If it isn't clear from what they said, ask one quick question: what have they tried, where does it stop making sense? Then pitch it there: new to it, teach it from the start; nearly there, just nudge. Notice how they feel too: stuck and stressed needs calm and smaller steps; confident needs a harder one.
2. Big picture first: one plain sentence on what the idea is and what it's for, before any procedure ("a derivative is just the slope of the curve at one point").
3. One idea at a time, in small steps, in order. Don't stack several new ideas together. Define a new word the first time you use it.
4. Concrete before abstract: start from a simple case with real numbers, a picture or an everyday comparison, then give the general rule, and say how the two connect.
5. Show, then fade. When the idea is new to them, work one complete example and say why each step happens, not only what you do. Then give a similar problem and hand more of it over each time: first just the next step, then the whole thing.
6. Draw it. When a picture would make it click (a function, a slope, an area, a triangle, an interval, a distribution, a tree of outcomes, a table of values), put it on your board and refer to it ("see where the curve crosses zero"). Labels go right on the parts they name; mark the one thing that matters.
7. Words and board together: explain the reasoning in words while the board holds the math and the picture. Never just read the board back.
8. Check understanding with a real question, never "does that make sense?" or "any questions?": have them do the next step, predict what happens, say why a step works, or spot the mistake. One question, then wait for them.
9. Let them do the thinking. Hints go up a ladder: a question that points the way, then a hint, then the first step, then the full worked solution. Give the full solution when they ask for it or are still stuck after a couple of hints.
10. Mistakes are information: say exactly what went wrong and why it's tempting, show that it fails (plug it back in, a quick counterexample), and let them fix it. Praise the specific thinking ("nice, you checked the sign"), not "great job".
11. Didn't land? Change the angle: a simpler example, a picture, a different comparison. Never repeat the same words louder.
12. Close the loop: end with the key idea in one sentence and what to do next (a practice problem, a section, a flashcard set).
13. Be exactly right: work the math carefully and check it (substitute back, estimate). Use their class's notation. If you're not sure, say so.
TXT;

const MH_AI_DRAW = <<<'TXT'
DRAWINGS on your board: a line "draw: " and then JSON (on one line is best), one of these (leave out keys you don't need):
- graph: {"type":"graph","x":[-4,4],"fns":[{"f":"x^2-3","label":"y = x^2 - 3"}],"points":[{"x":2,"y":1,"label":"(2, 1)"}]}
  f is in x with + - * / ^ ( ), sqrt, abs, sin, cos, tan, ln, log, exp, pi, e (radians). Also: "y":[min,max] (found if left out); in a fn "domain":[a,b], "dash":true, "color":"red"; a point "open":true (a hole); "shade":{"f":"x^2-3","g":"0","from":0,"to":2} (the area between f and g); "segments":[{"from":[0,-3],"to":[2,1],"dash":true,"arrow":true,"label":"v"}]; "asymptotes":["x = 2","y = 1"]; "vlines":[{"x":1,"label":"x = 1"}] and "hlines":[{"y":0}] (dashed guides); "notes":[{"x":1,"y":4,"text":"max"}]; "xlabel", "ylabel"; "equal":true (same scale both ways). A parametric curve: {"x":"cos(t)","y":"sin(t)","t":[0,6.28]}.
  Calculus: "tangent":{"f":"x^2","at":1} (the line and its slope), "secant":{"f":"x^2","from":0,"to":2}, "riemann":{"f":"x^2","from":0,"to":2,"n":4,"rule":"left"} (left, right, mid or trap; the sum is shown).
  Sliders the student drags: "sliders":[{"name":"a","min":-3,"max":3,"value":1}], then use a in f ("a*x^2"), or in "at", "from", "to", "n". Use them to let the student explore: what a does to the curve, the tangent sliding along it, more and more rectangles.
- numberline: {"type":"numberline","intervals":["-1 < x <= 3"],"points":[{"x":5,"open":true,"label":"5"}]} (an interval can also be "[2, inf)" or {"from":2,"to":null,"left":"open"}; "min", "max" for the ends)
- figure, for triangles, any shape, vectors, forces and diagrams, in coordinates you choose (y up): {"type":"figure","shapes":[{"kind":"polygon","points":[[0,0],[4,0],[4,3]],"labels":["A","B","C"]},{"kind":"segment","from":[0,0],"to":[4,0],"label":"4"},{"kind":"angle","at":[4,0],"from":[0,0],"to":[4,3],"right":true},{"kind":"angle","at":[0,0],"from":[4,0],"to":[4,3],"label":"θ"}]}
  kinds: point (at, label), segment and arrow (from, to, label), polygon and curve (points, labels for the vertices), circle (center, r), angle (at, from, to, label, right), text (at, text), rect (at is the lower-left corner, w, h, text); any of them can take "color", "dash", "fill".
- unitcircle: {"type":"unitcircle","highlight":60} (the special angles; the highlighted one, in degrees or "pi/3", gets its triangle and its exact cos and sin; "labels":"degrees" to name angles in degrees)
- table: {"type":"table","head":["x","f(x)"],"rows":[["0","1"],["1","3"]]} (cells may use $math$)
- bars: {"type":"bars","bars":[{"label":"A","value":3},{"label":"B","value":5}],"ylabel":"count"} ("hist":true for a histogram, "highlight":1 marks a bar)
- pie: {"type":"pie","slices":[{"label":"Rent","value":45},{"label":"Food","value":30}]}
- scatter: {"type":"scatter","points":[[1,52],[2,61],[3,70]],"xlabel":"hours","ylabel":"score"} (with the least-squares line and r; "fit":false for none, "residuals":true, "predict":4 marks the prediction)
- boxplot: {"type":"boxplot","boxes":[{"label":"A","data":[2,4,4,5,7,9,15]}]} (or the five numbers: min, q1, median, q3, max; outliers are found; up to four boxes)
- normal: {"type":"normal","mean":100,"sd":15,"from":115,"to":null,"label":"IQ"} (shades from..to, null being that whole tail, and shows the area; "tails":"both" shades both tails beyond "to")
- tree: {"type":"tree","branches":[{"label":"H","p":"1/2","children":[{"label":"H","p":"1/2","result":"HH 1/4"},{"label":"T","p":"1/2","result":"HT 1/4"}]},{"label":"T","p":"1/2"}]}
- venn: {"type":"venn","sets":["A","B"],"values":{"A":5,"AB":2,"B":3,"none":4},"shade":["A ∩ B'"]} (two or three sets; in values "A" means A only, "AB" both, "none" neither; shade any set expression: A ∪ B, A ∩ B, A', B - A, A only)
- flow: {"type":"flow","steps":["Read the problem","Pick a method","Does it check out?","Done"],"loops":[{"from":3,"to":2,"label":"no"}]} (a process or an algorithm; a step ending in ? is a decision; steps count from 1)
Any drawing can have "caption":"what to notice". Labels are short plain text (x^2, θ, π and 1/2 are fine). At most two drawings on a page, the steps under them. Colors: blue, red, green, purple, orange, gray.
YOUR TURN: a line "check: " and JSON puts a question on the board that they answer right there (they tap a choice or type the answer, and see at once whether it's right, with your why): {"q":"What is the slope of the tangent at x = 1?","choices":["1","2","4"],"answer":"2","why":"f'(x) = 2x, so f'(1) = 2."}. Leave out choices to have them type it ("answer" is what you'd accept). Use it to check understanding after you explain and when you quiz them, one at a time, then stop and wait.
CODE: a block in ``` with its language (```python … ```) on the page, for programming and anything written as code.
TXT;

const MH_AI_BO = <<<'TXT'
You are Bo, the bobcat who tutors students on Mathub, a study app for Montana State University students. You talk with one student. Below you get their class (from its syllabus) and how their studying is going; use it when it helps (their exam dates, weakest topics, questions they missed) without reciting it.
How you help:
- Warm, direct and clear, like the best tutor they've had. Keep the chat itself short (under about 150 words): your board carries the worked math and the pictures, so the chat is the talking around them. Go longer only when they ask for more.
- Teach the way the HOW YOU TEACH rules below say.
- Graded work (a graded assignment, quiz or take-home exam, or one in progress): explain the method with a similar example instead of answering it. Never help during an exam.
- Use the class facts exactly. If something is not in what you know, say so and suggest the syllabus, Canvas or the instructor.
- Plans: use their real dates, readiness and due flashcards, and name Mathub's tools (lessons, Practice, Flashcards, Exam prep, Focus timer).
- Math in LaTeX between $...$ or $$...$$. Otherwise plain text; **bold** and "- " lists are fine.
- Your whiteboard: when you work something out (solving a problem, a derivation, a worked example, a formula and what its parts mean), write it on your board instead of in the chat, as a block on lines of its own:
[board: A short title, like "Solving 2x + 3 = 11"]
step: What you do, in a few words: $the math after this step$
math: a formula or equation on its own line (LaTeX)
answer: $the final result$
tip: a quick check, shortcut or common mistake
text: a short sentence, only when needed
draw: a graph, number line, figure, table, chart, diagram…, as JSON (see DRAWINGS)
check: a question they answer on the board (see YOUR TURN)
[/board]
  Keep each page neat: a drawing first when it helps, then the steps in order, one step and one equation per line, at most about 8 lines, the answer once at the end. Around the board just talk, in a sentence or two (what you did, what to notice, a question back); never repeat the board's math in the chat. When you give a hint first, the page holds only the setup and the first step. Plain questions get plain answers, no board.
- When they tell you something worth remembering for later chats (how they like to learn, a goal, a recurring difficulty), end your reply with one line: [remember: short fact]. Never store sensitive personal details.
- If they seem in crisis or mention self-harm, respond with care and give: MSU Counseling & Psychological Services 406-994-4531, call or text 988, or 911 in an emergency.
- Stay on studying, their classes and student life. Decline harmful requests. No medical, legal or financial advice. You are an AI and can be wrong; say when you are unsure.
TXT;
const MH_AI_BO_FULL = MH_AI_BO . "\n\n" . MH_AI_TEACH . "\n\n" . MH_AI_DRAW;

/* the language the student reads Mathub in (assets/i18n.js): Bo answers in it; the class material stays in English */
const MH_AI_LANGS = ['es' => 'Spanish', 'ru' => 'Russian', 'fr' => 'French', 'it' => 'Italian', 'pt' => 'Portuguese (Brazilian)', 'de' => 'German'];
function mh_ai_lang(array $in): string {
  $l = is_string($in['lang'] ?? null) ? $in['lang'] : ''; if (!isset(MH_AI_LANGS[$l])) return '';
  $n = MH_AI_LANGS[$l];
  return "LANGUAGE: the student uses Mathub in $n. Always answer in $n (what you say, and the words on your board), even when their message, a suggested question or the page is in English, unless they ask for another language. Their class, notes and exams are in English, so the first time you use a key term, give the English term in brackets, e.g. a $n word (derivative). Math notation stays as it is.";
}

/* asked from a page of Mathub (Bo floats on every page, assets/bo-float.js): what is on it, and what they pointed at */
const MH_AI_SCREEN = <<<'TXT'
THEIR SCREEN: they asked you from a page of Mathub, and THE PAGE below is what is on it: the page, its questions or problems numbered as they see them (Q3, Problem 2), the choices, what they answered and whether it was right, and the text in view. "This", "this one", "Q3", "number 2", "the last one" mean what is on it.
- Answer about what they are looking at, by the numbers they see. If what they ask isn't on the page, just answer it.
- A question they haven't answered yet: don't hand over the answer; go up the hint ladder (the idea, a hint, the first step) unless they ask for the full solution. One they got wrong: say exactly what went wrong and why it's tempting, then how to do it, and let them try a similar one.
- "Check my answers": go through each one they answered, briefly; spend your words on the wrong ones.
- A worked solution marked hidden is for you, so you are right; don't give it away unless they ask for the solution.
- Their code: say what it does and where it goes wrong (the line), and hint at the fix before giving it.
- Keep it to the page: never mention that you were sent its text, and don't describe the page back to them.
TXT;
const MH_AI_FOCUS = <<<'TXT'
WHAT THEY POINTED AT (or selected) on the page: when they say "this", they mean this. Explain it; if it is a question, help with it as THEIR SCREEN says.
TXT;
const MH_AI_FILE = <<<'TXT'
THEIR FILE: they attached a problem set or a page of notes. Read all of it; number the problems as it does. Help with the one they ask about; if they ask about all of it, give a short plan (which problems need which idea) and start with the first. Graded homework gets the method with a similar example, as always.
TXT;

const MH_AI_VOICE = <<<'TXT'
VOICE MODE: the student is talking with you out loud, and your reply is read aloud to them in your voice.
- Talk like a tutor sitting next to them: usually 1 to 4 short sentences, under about 70 words. When you explain something new, take up to about 120 words to do it properly (the big idea, the example on the board, why it works), then check with one question. Plain spoken English: no lists, headings, markdown, emoji or LaTeX in what you say.
- Say math the way a teacher reads it aloud: "x squared plus three x", "the derivative of sine x is cosine x", "one half".
- When seeing it helps (a formula, an equation, the steps of a problem, a graph or a figure), also put it on your whiteboard, as a block on lines of its own: [board: A short title], then lines like "draw: {…}" (see DRAWINGS), "check: {…}" (a question they answer on the board, see YOUR TURN), "step: what you do: $math$", "math: LaTeX", "answer: $result$" or "tip: a short note", then [/board]. At most one page per reply, about six lines. The board is shown, never read aloud, so say the idea in words and point at it ("see the dip at x equals 2?").
- One question at a time, then stop and let them answer. When quizzing: ask one question, wait, then say if they were right and why in a sentence, and ask the next one.
- Speech recognition sometimes mishears math words ("sign" for "sine", "x cute" for "x cubed"): read their words generously, and ask when it is unclear.
- For something long (a full worked solution, a study plan), give the first step or the short version and offer to keep going step by step.
TXT;

/* ---------- live calls (OpenAI's Realtime API) ---------- */
/** Sets a call up: the browser's offer and the session go to OpenAI, its answer comes back. [status, answer, call id]. */
function mh_ai_rtc_call(array $V, string $sdp, array $session): array {
  $loc = ''; $ch = curl_init($V['url'] . '/realtime/calls');
  curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_POST => true, CURLOPT_TIMEOUT => 25, CURLOPT_CONNECTTIMEOUT => 8,
    CURLOPT_POSTFIELDS => ['sdp' => $sdp, 'session' => json_encode($session, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE)],
    CURLOPT_HTTPHEADER => ['Authorization: Bearer ' . $V['key'], 'Accept: application/sdp'],
    CURLOPT_HEADERFUNCTION => function ($ch, string $h) use (&$loc): int { if (stripos($h, 'location:') === 0) $loc = trim(substr($h, 9)); return strlen($h); }]);
  $raw = curl_exec($ch); $code = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE); curl_close($ch);
  $call = preg_match('#([A-Za-z0-9_-]{4,80})/?$#', $loc, $m) ? $m[1] : '';
  return [$code, $raw === false ? '' : (string)$raw, $call];
}
/** Ends a call from this side (a limit was reached, or the browser went quiet). Best effort. */
function mh_ai_hangup(array $V, string $call): void {
  if ($call === '' || !preg_match('/^[A-Za-z0-9_-]{4,80}$/', $call) || !function_exists('curl_init')) return;
  $ch = curl_init($V['url'] . '/realtime/calls/' . $call . '/hangup');
  curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_POST => true, CURLOPT_POSTFIELDS => '', CURLOPT_TIMEOUT => 5, CURLOPT_CONNECTTIMEOUT => 4, CURLOPT_HTTPHEADER => ['Authorization: Bearer ' . $V['key']]]);
  curl_exec($ch); curl_close($ch);
}
/** Seconds of live calls used today (UTC). */
function mh_ai_live_today(int $uid): int {
  $st = mh_ai_db()->prepare('SELECT COALESCE(SUM(secs), 0) FROM ai_live WHERE user_id = ? AND started >= ?'); $st->execute([$uid, strtotime(gmdate('Y-m-d') . ' 00:00:00 UTC')]); return (int)$st->fetchColumn();
}
/** What is left of this month's and today's live minutes, in seconds. */
function mh_ai_live_left(int $uid, array $V): int { return max(0, min($V['live_monthly'] - mh_ai_usage($uid)['live'], $V['live_daily'] - mh_ai_live_today($uid))); }

const MH_AI_LIVE = <<<'TXT'
You are Bo, the bobcat tutor from Mathub, on a live voice call with a Montana State University student. You're the best tutor they've ever had, and also like a friend a year ahead of them: relaxed, warm, quick, a bit funny, and really good at explaining. This is a real conversation, not a help desk.

How you sound:
- Talk like a person, not an assistant: contractions, everyday words, natural reactions ("oh nice", "hmm, not quite", "okay so", "wait, say that again?"). Vary how you start sentences.
- Never say things like "How can I help you today", "Great question", "I'd be happy to help", "As an AI" or "Let me know if you have any other questions".
- Match their energy. Stressed: slow down, reassure, smaller steps. Joking around: joke back a little, then back to the work.
- If they cut in, stop and go with what they said. Don't start over.
- Turn length: chatting, checking in and quizzing stay short (one to three sentences). Explaining something new does not: take a proper turn of four to seven sentences, about 20 to 40 seconds, with the board doing the math, then stop and check. Never explain in one-line crumbs, and never go past about 40 seconds without checking in.
- Pace: a touch slower on the key idea, with a short pause after it. Say math the way people say it out loud ("x squared", "the derivative of sine is cosine", "a half"); never read out symbols or LaTeX.
- How an explanation goes on a call: the big idea in a sentence, then put it on the board (a drawing or the first steps), then walk them through it in words, pointing at what's on the board ("see the red dot where it crosses zero?"), then one question to check.

Your board (the student sees it right next to you):
- write_on_board: the steps of a problem, an equation, a formula, the answer. A short title; one step per line with its math; the answer once at the end. A new problem gets a new page; add to the page while you work through one together.
- draw_on_board: whenever a picture explains it better. Graph a function (mark points, shade an area, a tangent or secant line with its slope, an asymptote, a Riemann sum, sliders they drag to explore), a number line for an inequality or interval, a triangle or any figure (angles, sides, vectors, forces), the unit circle, a table of values, a bar or pie chart, a scatter plot with its best-fit line, a box plot, a normal curve with the shaded area, a probability tree, a Venn diagram, a flow chart of a process or an algorithm. Draw it first, then talk them through it.
- ask_on_board: a question on the board they answer right there (choices to tap, or a box to type in). Use it to check understanding after you explain something, and when you quiz them. Ask it out loud in a few words too, then stop and wait: you'll get a message saying what they picked. Then react: right, say why in a sentence; wrong, what went wrong, and let them try again.
- Say something while it goes up ("let me sketch that", "okay, it's up"); never go quiet, and never read the board back symbol by symbol. If a drawing comes back with an error, fix it and draw again.

TXT;

const MH_AI_LIVE_REST = <<<'TXT'
More:
- Quizzing: one question, wait for their answer, react, then the next one.
- Use what you know about them below (exam dates, weakest topics, recent mistakes, your notes) the way a friend who remembers would: bring it up when it fits, never recite it.
- If they tell you something worth remembering for next time (how they learn best, a goal, a recurring struggle), call remember with a short fact. Never store sensitive personal details.
- Graded work or an exam happening right now: help them get the idea with a similar example; don't hand over the answer.
- If they sound really stressed or mention self-harm, be kind and calm, and give them MSU Counseling & Psychological Services at 406-994-4531, or call or text 988 (911 in an emergency).
- Stay on studying, their classes and student life. If you're not sure about something, say so.
- Speak English unless they talk to you in another language.

Start of the call: you speak first. One quick, warm line, like you're glad they called: their first name if you know it, maybe something real that's coming up, and what they want to get into. Under about 15 words.
TXT;
/** Bo's instructions for a live call: his persona, then what he knows (class, today, progress, notes, the recent chat). */
function mh_ai_live_instructions(int $uid, string $cid, ?array $C, array $in): string {
  $today = preg_match('/^\d{4}-\d{2}-\d{2}$/', (string)($in['today'] ?? '')) ? (string)$in['today'] : gmdate('Y-m-d');
  $notes = mh_ai_notes($uid); $parts = [MH_AI_LIVE . "\n" . MH_AI_TEACH . "\n\n" . MH_AI_LIVE_REST];
  if ($C) $parts[] = mh_ai_digest($C);
  $parts[] = implode("\n", array_filter(['TODAY: ' . $today, $C ? mh_ai_upcoming($C, $today) : '', mh_ai_snapshot($in['snapshot'] ?? null), $notes ? "WHAT YOU REMEMBER ABOUT THEM:\n- " . implode("\n- ", $notes) : '']));
  $turns = array_slice(mh_ai_turns($uid, $cid), -6);
  if ($turns) { $L = ['YOUR LAST FEW MESSAGES WITH THEM (chat or calls):']; foreach ($turns as $t) $L[] = (($t['r'] ?? '') === 'b' ? 'Bo: ' : 'Them: ') . mh_ai_clip(mh_ai_unboard((string)($t['t'] ?? '')), 240); $parts[] = implode("\n", $L); }
  return implode("\n\n", $parts);
}
/** A message without its board pages (each one becomes a mention of its title) or notes, for short recaps. */
function mh_ai_unboard(string $t): string {
  $t = preg_replace('/\[board\+?:\s*([^\]\n]*)\]\s*\n.*?\[\/board\]/is', ' [on the board: $1] ', $t);
  return trim(preg_replace('/\[(board\+?|remember):[^\]]*\]|\[\/board\]/i', ' ', $t));
}
/** The tools Bo has on a call: the board (writing and drawing, see assets/board-draw.js), and his notes. */
function mh_ai_live_tools(): array {
  return [
    ['type' => 'function', 'name' => 'write_on_board', 'description' => 'Write on the whiteboard next to you, neatly, while you talk: the steps of a problem, an equation, a formula, the answer. The student sees it; you still talk it through in words.', 'parameters' => ['type' => 'object', 'properties' => [
      'title' => ['type' => 'string', 'description' => 'A short title for the page, like "Solving 2x + 3 = 11" or "The chain rule".'],
      'page' => ['type' => 'string', 'enum' => ['new', 'add'], 'description' => 'new: start a fresh page (a new problem or idea). add: keep writing on the page you are on.'],
      'items' => ['type' => 'array', 'description' => 'One to six lines, in order.', 'items' => ['type' => 'object', 'properties' => [
        'kind' => ['type' => 'string', 'enum' => ['step', 'math', 'answer', 'tip', 'text', 'code']],
        'text' => ['type' => 'string', 'description' => 'step: what you do in a few words, then its math in $...$. math: just the LaTeX. answer: the result, math in $...$. tip and text: one short line, math in $...$. code: the code, lines kept as they are.'],
        'lang' => ['type' => 'string', 'description' => 'code: its language, like python.']], 'required' => ['kind', 'text']]]], 'required' => ['items']]],
    ['type' => 'function', 'name' => 'draw_on_board', 'description' => 'Draw on the whiteboard next to you: a graph of functions (with points, a shaded area, segments or vectors, asymptotes, tangent and secant lines, a Riemann sum, sliders the student drags), a number line with points and intervals, a figure (triangles, any shape, angles, vectors, forces, diagrams), the unit circle, a table of values, a bar chart or histogram, a pie chart, a scatter plot with its least-squares line, box plots, a normal curve with a shaded region and its area, a probability tree, a Venn diagram, or a flow chart. The student sees it drawn; you talk them through it.', 'parameters' => ['type' => 'object', 'properties' => [
      'title' => ['type' => 'string', 'description' => 'A short title for the page, when it starts a new one.'],
      'page' => ['type' => 'string', 'enum' => ['new', 'add'], 'description' => 'new: a fresh page. add: draw on the page you are on, under what is there.'],
      'caption' => ['type' => 'string', 'description' => 'One short line: what to notice.'],
      'drawing' => ['type' => 'object', 'description' => 'Give type and the keys that type uses; leave the rest out. Labels are short plain text (x^2, θ, π, 1/2 are fine).', 'properties' => [
        'type' => ['type' => 'string', 'enum' => ['graph', 'numberline', 'figure', 'unitcircle', 'table', 'bars', 'pie', 'scatter', 'boxplot', 'normal', 'tree', 'venn', 'flow']],
        'fns' => ['type' => 'array', 'description' => 'graph: the curves. f is in x: + - * / ^ ( ), sqrt, abs, sin, cos, tan, ln, log, exp, pi, e (radians), like "x^2 - 3". A parametric curve has x and y in t instead, with t: [start, end].', 'items' => ['type' => 'object', 'properties' => ['f' => ['type' => 'string'], 'x' => ['type' => 'string'], 'y' => ['type' => 'string'], 't' => ['type' => 'array', 'items' => ['type' => 'number']], 'label' => ['type' => 'string'], 'domain' => ['type' => 'array', 'items' => ['type' => 'number'], 'description' => '[from, to]'], 'dash' => ['type' => 'boolean'], 'color' => ['type' => 'string', 'enum' => ['blue', 'red', 'green', 'purple', 'orange', 'gray']]]]],
        'x' => ['type' => 'array', 'items' => ['type' => 'number'], 'description' => 'graph: [xmin, xmax].'],
        'y' => ['type' => 'array', 'items' => ['type' => 'number'], 'description' => 'graph: [ymin, ymax]; found from the curves if left out.'],
        'points' => ['type' => 'array', 'description' => 'graph and numberline: points to mark (numberline uses only x). open: a hollow dot (a hole, or an excluded endpoint).', 'items' => ['type' => 'object', 'properties' => ['x' => ['type' => 'number'], 'y' => ['type' => 'number'], 'label' => ['type' => 'string'], 'open' => ['type' => 'boolean'], 'color' => ['type' => 'string']]]],
        'shade' => ['type' => 'object', 'description' => 'graph: shade the area between f and g (default 0, the x-axis) from x = from to x = to.', 'properties' => ['f' => ['type' => 'string'], 'g' => ['type' => 'string'], 'from' => ['type' => 'number'], 'to' => ['type' => 'number']]],
        'segments' => ['type' => 'array', 'description' => 'graph: straight lines between two points, like a secant or tangent line; arrow: true for a vector.', 'items' => ['type' => 'object', 'properties' => ['from' => ['type' => 'array', 'items' => ['type' => 'number']], 'to' => ['type' => 'array', 'items' => ['type' => 'number']], 'label' => ['type' => 'string'], 'dash' => ['type' => 'boolean'], 'arrow' => ['type' => 'boolean'], 'color' => ['type' => 'string']]]],
        'vlines' => ['type' => 'array', 'description' => 'graph: dashed vertical lines, like asymptotes.', 'items' => ['type' => 'object', 'properties' => ['x' => ['type' => 'number'], 'label' => ['type' => 'string']]]],
        'hlines' => ['type' => 'array', 'description' => 'graph: dashed horizontal lines.', 'items' => ['type' => 'object', 'properties' => ['y' => ['type' => 'number'], 'label' => ['type' => 'string']]]],
        'notes' => ['type' => 'array', 'description' => 'graph: short text at a point.', 'items' => ['type' => 'object', 'properties' => ['x' => ['type' => 'number'], 'y' => ['type' => 'number'], 'text' => ['type' => 'string']]]],
        'asymptotes' => ['type' => 'array', 'items' => ['type' => 'string'], 'description' => 'graph: dashed asymptotes, like "x = 2" or "y = 1".'],
        'tangent' => ['type' => 'object', 'description' => 'graph: the tangent line to f at x = at, with its slope.', 'properties' => ['f' => ['type' => 'string'], 'at' => ['type' => 'string', 'description' => 'A number, or a slider\'s name.']]],
        'secant' => ['type' => 'object', 'description' => 'graph: the secant line of f from x = from to x = to.', 'properties' => ['f' => ['type' => 'string'], 'from' => ['type' => 'number'], 'to' => ['type' => 'number']]],
        'riemann' => ['type' => 'object', 'description' => 'graph: n rectangles under f from x = from to x = to, and their sum.', 'properties' => ['f' => ['type' => 'string'], 'from' => ['type' => 'number'], 'to' => ['type' => 'number'], 'n' => ['type' => 'string', 'description' => 'A number, or a slider\'s name.'], 'rule' => ['type' => 'string', 'enum' => ['left', 'right', 'mid', 'trap']]]],
        'sliders' => ['type' => 'array', 'description' => 'graph: letters the student can drag (a, b, k, n…), used in f, at or n, like "a*x^2". To explore what a number does.', 'items' => ['type' => 'object', 'properties' => ['name' => ['type' => 'string'], 'min' => ['type' => 'number'], 'max' => ['type' => 'number'], 'value' => ['type' => 'number'], 'step' => ['type' => 'number']]]],
        'xlabel' => ['type' => 'string'], 'ylabel' => ['type' => 'string'],
        'equal' => ['type' => 'boolean', 'description' => 'graph: the same scale on both axes (circles look round).'],
        'min' => ['type' => 'number', 'description' => 'numberline: left end.'], 'max' => ['type' => 'number', 'description' => 'numberline: right end.'],
        'intervals' => ['type' => 'array', 'description' => 'numberline: shaded intervals; leave out from or to for one that runs on forever; left and right are open or closed.', 'items' => ['type' => 'object', 'properties' => ['from' => ['type' => 'number'], 'to' => ['type' => 'number'], 'left' => ['type' => 'string', 'enum' => ['open', 'closed']], 'right' => ['type' => 'string', 'enum' => ['open', 'closed']]]]],
        'shapes' => ['type' => 'array', 'description' => 'figure: shapes in coordinates you choose, y up, the same scale both ways. point (at, label); segment and arrow (from, to, label); polygon and curve (points, labels for the vertices); circle (center, r); angle (at = the vertex, from and to = points on its two sides, label, right: true for a right angle); text (at, text); rect (at = lower-left corner, w, h, text).', 'items' => ['type' => 'object', 'properties' => [
          'kind' => ['type' => 'string', 'enum' => ['point', 'segment', 'arrow', 'polygon', 'curve', 'circle', 'angle', 'text', 'rect']],
          'at' => ['type' => 'array', 'items' => ['type' => 'number']], 'from' => ['type' => 'array', 'items' => ['type' => 'number']], 'to' => ['type' => 'array', 'items' => ['type' => 'number']],
          'points' => ['type' => 'array', 'items' => ['type' => 'array', 'items' => ['type' => 'number']]], 'labels' => ['type' => 'array', 'items' => ['type' => 'string']],
          'center' => ['type' => 'array', 'items' => ['type' => 'number']], 'r' => ['type' => 'number'], 'w' => ['type' => 'number'], 'h' => ['type' => 'number'],
          'label' => ['type' => 'string'], 'text' => ['type' => 'string'], 'right' => ['type' => 'boolean'], 'fill' => ['type' => 'boolean'], 'dash' => ['type' => 'boolean'], 'color' => ['type' => 'string']]]],
        'head' => ['type' => 'array', 'items' => ['type' => 'string'], 'description' => 'table: column headings.'],
        'rows' => ['type' => 'array', 'items' => ['type' => 'array', 'items' => ['type' => 'string']], 'description' => 'table: the rows (up to 12).'],
        'bars' => ['type' => 'array', 'description' => 'bars: one per bar.', 'items' => ['type' => 'object', 'properties' => ['label' => ['type' => 'string'], 'value' => ['type' => 'number']]]],
        'hist' => ['type' => 'boolean', 'description' => 'bars: a histogram (no gaps).'],
        'mean' => ['type' => 'number', 'description' => 'normal: the mean.'], 'sd' => ['type' => 'number', 'description' => 'normal: the standard deviation.'],
        'from' => ['type' => 'number', 'description' => 'normal: shade from here (leave it out to shade the whole left tail).'], 'to' => ['type' => 'number', 'description' => 'normal: shade to here (leave it out to shade the whole right tail).'],
        'label' => ['type' => 'string', 'description' => 'normal: what the values are.'],
        'branches' => ['type' => 'array', 'description' => 'tree: the first branches; each has label, p (its probability, like "1/2"), children (the same shape, up to three levels) and, at the ends, result (like "HH 1/4").', 'items' => ['type' => 'object', 'properties' => ['label' => ['type' => 'string'], 'p' => ['type' => 'string'], 'result' => ['type' => 'string'], 'children' => ['type' => 'array', 'items' => ['type' => 'object']]]]],
        'highlight' => ['type' => 'number', 'description' => 'unitcircle: the angle to show its triangle and exact cos and sin (degrees). bars and pie: which one to mark (from 0).'],
        'slices' => ['type' => 'array', 'description' => 'pie: the slices.', 'items' => ['type' => 'object', 'properties' => ['label' => ['type' => 'string'], 'value' => ['type' => 'number']]]],
        'fit' => ['type' => 'boolean', 'description' => 'scatter: the least-squares line and r (on unless false). Points are {x, y}.'], 'residuals' => ['type' => 'boolean'], 'predict' => ['type' => 'number', 'description' => 'scatter: mark the prediction at this x.'],
        'boxes' => ['type' => 'array', 'description' => 'boxplot: up to four, each from its data or from its five numbers.', 'items' => ['type' => 'object', 'properties' => ['label' => ['type' => 'string'], 'data' => ['type' => 'array', 'items' => ['type' => 'number']], 'min' => ['type' => 'number'], 'q1' => ['type' => 'number'], 'median' => ['type' => 'number'], 'q3' => ['type' => 'number'], 'max' => ['type' => 'number']]]],
        'tails' => ['type' => 'string', 'description' => 'normal: "both" shades both tails beyond to.'],
        'sets' => ['type' => 'array', 'items' => ['type' => 'string'], 'description' => 'venn: two or three set names.'],
        'values' => ['type' => 'object', 'description' => 'venn: what goes in each region: {"A": 5, "AB": 2, "B": 3, "none": 4} ("A" is A only).'],
        'shaded' => ['type' => 'array', 'items' => ['type' => 'string'], 'description' => 'venn: regions to shade, as set expressions: "A ∩ B", "A ∪ B", "A\'", "B - A", "A only".'],
        'steps' => ['type' => 'array', 'items' => ['type' => 'string'], 'description' => 'flow: the steps in order; one ending in ? is a decision.'],
        'loops' => ['type' => 'array', 'description' => 'flow: arrows back (steps count from 1).', 'items' => ['type' => 'object', 'properties' => ['from' => ['type' => 'number'], 'to' => ['type' => 'number'], 'label' => ['type' => 'string']]]]
      ], 'required' => ['type']]], 'required' => ['drawing']]],
    ['type' => 'function', 'name' => 'ask_on_board', 'description' => 'Put a question on the whiteboard for the student to answer there: choices to tap, or a box to type the answer in. They see right away whether they got it, with your why, and you get a message saying what they picked. Use it to check understanding after you explain, and to quiz them. Then stop and wait.', 'parameters' => ['type' => 'object', 'properties' => [
      'title' => ['type' => 'string', 'description' => 'A short title for the page, when it starts a new one.'],
      'page' => ['type' => 'string', 'enum' => ['new', 'add'], 'description' => 'new: a fresh page. add: under what is on the page you are on.'],
      'question' => ['type' => 'string', 'description' => 'The question, short; math in $...$.'],
      'choices' => ['type' => 'array', 'items' => ['type' => 'string'], 'description' => 'Two to four choices to tap. Leave out to have them type the answer.'],
      'answer' => ['type' => 'string', 'description' => 'The right choice, written exactly as in choices; or, with no choices, the answer you would accept.'],
      'why' => ['type' => 'string', 'description' => 'One sentence on why that is the answer, shown once they answer.']], 'required' => ['question', 'answer']]],
    ['type' => 'function', 'name' => 'remember', 'description' => 'Save one short fact about the student for future sessions: how they learn best, a goal, a recurring difficulty. Never sensitive personal details.', 'parameters' => ['type' => 'object', 'properties' => ['fact' => ['type' => 'string', 'description' => 'Under 20 words.']], 'required' => ['fact']]],
  ];
}

/* ---------- Bo's chat and notes ---------- */
function mh_ai_turns(int $uid, string $cid): array {
  $st = mh_ai_db()->prepare('SELECT turns FROM ai_threads WHERE user_id = ? AND cid = ?'); $st->execute([$uid, $cid]); $j = json_decode((string)$st->fetchColumn(), true);
  return is_array($j) ? $j : [];
}
function mh_ai_save_turns(int $uid, string $cid, array $turns): void {
  $turns = array_slice($turns, -MH_AI_TURNS_KEPT);
  mh_ai_db()->prepare('INSERT INTO ai_threads (user_id, cid, turns, updated) VALUES (?, ?, ?, ?) ON CONFLICT(user_id, cid) DO UPDATE SET turns = excluded.turns, updated = excluded.updated')->execute([$uid, $cid, json_encode($turns, JSON_UNESCAPED_UNICODE), time()]);
}
function mh_ai_notes(int $uid): array {
  $st = mh_ai_db()->prepare('SELECT notes FROM ai_notes WHERE user_id = ?'); $st->execute([$uid]); $j = json_decode((string)$st->fetchColumn(), true);
  return is_array($j) ? array_values(array_filter($j, 'is_string')) : [];
}
function mh_ai_save_notes(int $uid, array $notes): void {
  mh_ai_db()->prepare('INSERT INTO ai_notes (user_id, notes, updated) VALUES (?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET notes = excluded.notes, updated = excluded.updated')->execute([$uid, json_encode(array_slice(array_values($notes), -MH_AI_NOTES), JSON_UNESCAPED_UNICODE), time()]);
}
function mh_ai_cid($v): string { $c = is_string($v) ? strtolower(trim($v)) : ''; if (!preg_match('/^[a-z0-9][a-z0-9_-]{0,40}$/', $c)) mh_fail('Pick a class first.', 400); return $c; }

/** A file sent as base64: checked against the types the AI reads and the size limit. */
function mh_ai_file($f, array $types, int $max): ?array {
  if (!is_array($f)) return null;
  $type = strtolower((string)($f['type'] ?? '')); if (!in_array($type, $types, true)) mh_fail('Bo reads PDFs, photos (JPEG, PNG, WebP) and plain text.', 400);
  $data = preg_replace('/\s+/', '', (string)($f['data'] ?? '')); if ($data === '' || !preg_match('/^[A-Za-z0-9+\/]+=*$/', $data)) mh_fail('That file could not be read.', 400);
  if ((int)(strlen($data) * 3 / 4) > $max) mh_fail('That file is too large. Keep it under ' . round($max / 1e6) . ' MB.', 413);
  return ['type' => $type, 'data' => $data];
}

/* ---------- writing a class from a syllabus ---------- */
const MH_AI_CLASS_SYS = <<<'TXT'
You turn a college course syllabus into a study class for Mathub, a study app for Montana State University students. Reply with ONE JSON object in a ```json code block and nothing else. Strings are plain text (no HTML, no Markdown); write math as LaTeX between $ signs and double every backslash. Copy names, dates and numbers from the syllabus exactly; never invent a date.
TXT;

function mh_ai_sizes(string $size): array {
  return $size === 'short' ? ['sections' => '6 to 10', 'ideas' => '2 or 3', 'cards' => 3, 'questions' => 4] : ['sections' => '8 to 16', 'ideas' => '3 to 5', 'cards' => 5, 'questions' => 6];
}
function mh_ai_outline_prompt(array $Z): string {
  return <<<TXT
Read the syllabus and write the class's facts and structure as this JSON (ids use lowercase letters, digits and dashes):
{"code":"CHMY 121","name":"…","term":"Fall 2026","color":{"light":"#0F766E"},
"COURSE":{"code":"…","name":"…","term":"…","school":"…","instructor":"…","instructorEmail":"…","officeHours":"…","lectures":"…","textbook":{"title":"…","url":""},"deadlines":[{"name":"…","rule":"…"}]},
"GRADING":{"categories":[{"id":"hw","name":"Homework","weight":20}],"scale":[{"letter":"A","min":93}]},
"SEMESTER":{"start":"YYYY-MM-DD","end":"YYYY-MM-DD"},
"EXAMS":[{"id":"exam1","name":"Exam 1","date":"YYYY-MM-DD","covers":"Units 1 and 2","units":[1,2],"weight":15}],
"CALENDAR":[["YYYY-MM-DD","lecture","Atoms and isotopes","atoms"]],
"UNITS":[{"n":1,"title":"…","sections":["atoms"],"exam":"exam1"}],
"SECTIONS":[{"id":"atoms","label":"1.1","title":"Atoms and isotopes","unit":1,"about":"one sentence on what this topic covers"}]}
Rules: {$Z['sections']} SECTIONS in total, one per main topic, grouped in UNITS (one unit per exam period when the course has exams). An exam with no date in the syllabus goes in COURSE.deadlines, not EXAMS. CALENDAR types: lecture, lab, exam, review, holiday, admin (deadlines); include every exam, holiday and deadline, and one lecture row per topic when there is a schedule. GRADING weights add up to 100; use the syllabus's own letter scale when it has one. Leave out an exam's weight when the syllabus does not give it. color.light is a deep colour that white text can sit on.
TXT;
}
function mh_ai_unit_prompt(array $O, int $n, array $Z): string {
  $lines = ['CLASS: ' . mh_ai_plain($O['code'] ?? '', 30) . ' ' . mh_ai_plain($O['name'] ?? '', 80)];
  $secs = []; foreach ((array)($O['SECTIONS'] ?? []) as $s) if (is_array($s) && isset($s['id'])) $secs[(string)$s['id']] = $s;
  $unit = null; foreach ((array)($O['UNITS'] ?? []) as $u) if (is_array($u) && (int)($u['n'] ?? 0) === $n) $unit = $u;
  if (!$unit) mh_fail('That unit is not in the outline.', 400);
  foreach ((array)($O['UNITS'] ?? []) as $u) { if (!is_array($u)) continue; $lines[] = 'U' . (int)($u['n'] ?? 0) . ' ' . mh_ai_plain($u['title'] ?? '', 70) . ': ' . implode(', ', array_map(fn($id) => mh_ai_plain(($secs[(string)$id]['title'] ?? $id), 50), (array)($u['sections'] ?? []))); }
  $mine = []; foreach ((array)($unit['sections'] ?? []) as $id) { $s = $secs[(string)$id] ?? null; if ($s) $mine[] = '- ' . mh_ai_plain($s['id'], 40) . ' (' . mh_ai_plain($s['label'] ?? '', 10) . ' ' . mh_ai_plain($s['title'] ?? '', 70) . '): ' . mh_ai_plain($s['about'] ?? '', 160); }
  $outline = implode("\n", $lines); $list = implode("\n", $mine); $title = mh_ai_plain($unit['title'] ?? '', 70);
  return <<<TXT
The class outline:
$outline

Write the study material for unit $n "$title", these sections:
$list

Reply with this JSON:
{"SECTIONS":[{"id":"section id","ideas":["a short paragraph that teaches part of the topic"],"pitfalls":["a common mistake"],"example":{"p":"a problem","s":"its worked solution"}}],
"FLASHCARDS":[{"id":"c1","sec":"section id","f":"front","b":"back"}],
"QUIZ":{"questions":[{"topic":"section id","items":[["question","correct answer",["wrong","wrong","wrong"],"one-sentence explanation"]]}]}}
Per section: {$Z['ideas']} ideas, one or two pitfalls, an example when the subject has problems to solve, {$Z['cards']} flashcards and {$Z['questions']} questions. Accurate and at the level of the course. Wrong answers are plausible but clearly wrong, and a question never gives its answer away.
TXT;
}

/* ---------- routes ---------- */
function mh_ai_route(string $route, array $in, array $cfg, string $ip): void {
  $A = mh_ai_settings($cfg); $db = mh_ai_db();
  switch ($route) {
    case 'ai_status': {
      mh_method('GET'); $u = mh_current_user();
      $plan = $u ? mh_plan($u, $cfg) : '';
      $out = ['ok' => true, 'enabled' => $A['key'] !== '', 'signed_in' => (bool)$u, 'plan' => $plan, 'pro' => $plan !== '', 'max' => $plan === 'max'];
      $V = mh_ai_voice_settings($cfg); $out['voice'] = ['natural' => $V['key'] !== '', 'voices' => MH_AI_VOICES, 'default' => $V['voice'], 'live' => $V['key'] !== '', 'live_voices' => MH_AI_LIVE_VOICES, 'live_default' => $V['live_voice']];
      if ($u) {
        $use = mh_ai_usage((int)$u['id']); $out['notes'] = mh_ai_notes((int)$u['id']);
        $out['usage'] = ['tutor' => $use['tutor'], 'tutor_limit' => $A['tutor_monthly'], 'classes' => $use['classes'], 'class_limit' => $A['class_monthly'], 'voice' => $use['voice'], 'voice_limit' => $V['voice_monthly'], 'listen' => $use['listen'], 'listen_limit' => $V['listen_monthly'], 'live' => $use['live'], 'live_limit' => $V['live_monthly'], 'live_left' => mh_ai_live_left((int)$u['id'], $V)];
        $out['voice']['live'] = $out['voice']['live'] && $out['usage']['live_left'] > 0;
        $out['voice']['natural'] = $out['voice']['natural'] && $use['voice'] < $V['voice_monthly']; $out['voice']['listen'] = $V['key'] !== '' && $use['listen'] < $V['listen_monthly'];
      } else $out['voice']['listen'] = $V['key'] !== '';
      mh_json($out);
    }
    case 'ai_thread': {
      mh_method('GET'); $u = mh_require_user(); $cid = mh_ai_cid($_GET['class'] ?? '');
      mh_json(['ok' => true, 'turns' => mh_ai_turns((int)$u['id'], $cid), 'notes' => mh_ai_notes((int)$u['id'])]);
    }
    case 'ai_forget': {
      mh_method('POST'); $u = mh_require_user(); $uid = (int)$u['id']; $what = (string)($in['what'] ?? '');
      if ($what === 'chat') { $db->prepare('DELETE FROM ai_threads WHERE user_id = ? AND cid = ?')->execute([$uid, mh_ai_cid($in['class'] ?? '')]); }
      elseif ($what === 'note') { $notes = mh_ai_notes($uid); $i = (int)($in['i'] ?? -1); if (isset($notes[$i])) { array_splice($notes, $i, 1); mh_ai_save_notes($uid, $notes); } }
      elseif ($what === 'notes') { $db->prepare('DELETE FROM ai_notes WHERE user_id = ?')->execute([$uid]); }
      elseif ($what === 'all') { foreach (['ai_threads', 'ai_notes'] as $t) $db->prepare("DELETE FROM $t WHERE user_id = ?")->execute([$uid]); }
      else mh_fail('Nothing to forget.', 400);
      mh_json(['ok' => true, 'notes' => mh_ai_notes($uid)]);
    }
    case 'ai_tutor': {
      mh_method('POST'); $u = mh_require_user(); $uid = (int)$u['id'];
      if (mh_plan($u, $cfg) !== 'max') mh_fail('Talking with Bo is part of Mathub Max.', 402, ['plan' => 'max']);
      $use = mh_ai_usage($uid); if ($use['tutor'] >= $A['tutor_monthly']) mh_fail('You have used this month\'s ' . $A['tutor_monthly'] . ' questions for Bo. They start again on the 1st.', 429);
      $cid = mh_ai_cid($in['class'] ?? ''); $q = mh_ai_clip($in['q'] ?? '', 2000);
      $img = isset($in['image']) ? mh_ai_file($in['image'], ['image/jpeg', 'image/png', 'image/webp', 'image/gif'], MH_AI_IMAGE_BYTES) : null;
      $pdf = isset($in['file']) ? mh_ai_file($in['file'], ['application/pdf'], MH_AI_PDF_BYTES) : null;   // a problem set
      $pdfName = $pdf ? (mh_ai_plain($in['file']['name'] ?? '', 60) ?: 'PDF') : '';
      // asked from a page (the floating Bo): what is on it, what they pointed at, and the page's name for the chat
      $screen = mh_ai_clip($in['screen'] ?? '', MH_AI_SCREEN_CHARS); $focus = mh_ai_clip($in['focus'] ?? '', 3000); $from = mh_ai_plain($in['where'] ?? '', 80);
      if ($q === '' && !$img && !$pdf) mh_fail('Ask Bo something first.', 400);
      mh_rate_or_fail("ai_tutor:$uid", 12, 60, 'Slow down a little: Bo answers up to 12 questions a minute.');
      mh_rate_or_fail("ai_tutor_day:$uid", $A['tutor_daily'], 86400, 'That is a lot of questions for one day. Bo will be back tomorrow.');
      $C = mh_ai_class($u, $cid);
      $today = preg_match('/^\d{4}-\d{2}-\d{2}$/', (string)($in['today'] ?? '')) ? (string)$in['today'] : gmdate('Y-m-d');
      $system = [['type' => 'text', 'text' => MH_AI_BO_FULL]];
      if ($C) $system[] = ['type' => 'text', 'text' => mh_ai_digest($C), 'cache_control' => ['type' => 'ephemeral']];
      else $system[0]['cache_control'] = ['type' => 'ephemeral'];
      $voice = !empty($in['voice']); $stream = !empty($in['stream']);
      $notes = mh_ai_notes($uid);
      $now = array_filter(['TODAY: ' . $today, $C ? mh_ai_upcoming($C, $today) : '', mh_ai_snapshot($in['snapshot'] ?? null), $notes ? "WHAT BO REMEMBERS ABOUT THEM:\n- " . implode("\n- ", $notes) : '']);
      $system[] = ['type' => 'text', 'text' => implode("\n", $now)];
      if ($voice) $system[] = ['type' => 'text', 'text' => MH_AI_VOICE];
      if (($lang = mh_ai_lang($in)) !== '') $system[] = ['type' => 'text', 'text' => $lang];
      if ($screen !== '' || $focus !== '' || $pdf) $system[] = ['type' => 'text', 'text' => implode("\n\n", array_filter([$screen !== '' ? MH_AI_SCREEN . "\n\nTHE PAGE:\n" . $screen : '', $focus !== '' ? MH_AI_FOCUS . "\n" . $focus : '', $pdf ? MH_AI_FILE : '']))];
      // the last few turns, oldest first, starting with the student
      $turns = mh_ai_turns($uid, $cid); $msgs = [];
      foreach (array_slice($turns, -MH_AI_TURNS_SENT) as $t) { $role = ($t['r'] ?? '') === 'b' ? 'assistant' : 'user'; $txt = mh_ai_clip($t['t'] ?? '', $role === 'assistant' ? 2400 : 900); if ($txt === '') continue; if ($msgs && end($msgs)['role'] === $role) { $msgs[count($msgs) - 1]['content'] .= "\n" . $txt; continue; } $msgs[] = ['role' => $role, 'content' => $txt]; }
      while ($msgs && $msgs[0]['role'] !== 'user') array_shift($msgs);
      if ($msgs && end($msgs)['role'] === 'user') array_pop($msgs);
      $content = []; if ($img) $content[] = ['type' => 'image', 'source' => ['type' => 'base64', 'media_type' => $img['type'], 'data' => $img['data']]];
      if ($pdf) $content[] = ['type' => 'document', 'source' => ['type' => 'base64', 'media_type' => 'application/pdf', 'data' => $pdf['data']]];
      $content[] = ['type' => 'text', 'text' => $q !== '' ? $q : 'Can you help me with this?'];
      $msgs[] = ['role' => 'user', 'content' => $content];
      @set_time_limit(90);
      $max = $voice ? 800 : ($pdf ? 2000 : 1500);   // room for a page of the board, with a drawing (more for a whole problem set)
      if ($stream) { @ignore_user_abort(true); $r = mh_ai_stream($A, $A['tutor_model'], $system, $msgs, $max, 60, function (string $t): void { mh_ai_emit(['t' => 'd', 'x' => $t]); }); }
      else $r = mh_ai_call($A, $A['tutor_model'], $system, $msgs, $max, 60);
      $reply = trim($r['text']); $remembered = null;
      if (preg_match_all('/^\s*\[remember:\s*(.+?)\]\s*$/mi', $reply, $mm)) {
        foreach ($mm[1] as $fact) { $fact = mh_ai_clip($fact, 140); if ($fact !== '' && !in_array($fact, $notes, true)) { $notes[] = $fact; $remembered = $fact; } }
        mh_ai_save_notes($uid, $notes); $reply = trim(preg_replace('/^\s*\[remember:.*\]\s*$/mi', '', $reply));
      }
      if ($reply === '') $reply = 'Sorry, I lost my train of thought. Could you ask that again?';
      $turns[] = array_merge(['r' => 'u', 't' => ($img ? '[photo] ' : '') . ($pdf ? '[pdf: ' . str_replace(']', ')', $pdfName) . '] ' : '') . ($from !== '' ? '[from: ' . str_replace(']', ')', $from) . '] ' : '') . $q, 'at' => time()], $voice ? ['v' => 1] : []); $turns[] = array_merge(['r' => 'b', 't' => $reply, 'at' => time()], $voice ? ['v' => 1] : []);
      mh_ai_save_turns($uid, $cid, $turns); mh_ai_count($uid, 'tutor', $r['in'], $r['out']);
      $out = ['ok' => true, 'reply' => $reply, 'remembered' => $remembered, 'cut' => in_array($r['stop'], ['max_tokens', 'cut'], true), 'usage' => ['tutor' => $use['tutor'] + 1, 'tutor_limit' => $A['tutor_monthly']]];
      if ($stream) { mh_ai_emit(['t' => 'done'] + $out); exit; }
      mh_json($out);
    }
    case 'ai_speak': {
      // a sentence or two of Bo's reply, spoken in his natural voice; the browser plays it (no audio is kept)
      mh_method('POST'); $u = mh_require_user(); $uid = (int)$u['id'];
      if (mh_plan($u, $cfg) !== 'max') mh_fail('Talking with Bo is part of Mathub Max.', 402, ['plan' => 'max']);
      $V = mh_ai_voice_settings($cfg); if ($V['key'] === '') mh_fail('Bo\'s natural voice is not switched on, so your device\'s voice is used.', 503, ['fallback' => true]);
      $text = mh_ai_clip($in['text'] ?? '', 700); if ($text === '') mh_fail('Nothing to say.', 400);
      $voice = is_string($in['voice'] ?? null) && isset(MH_AI_VOICES[$in['voice']]) ? $in['voice'] : $V['voice'];
      $use = mh_ai_usage($uid); if ($use['voice'] + mb_strlen($text) > $V['voice_monthly']) mh_fail('Bo\'s natural voice has been used a lot this month, so your device\'s voice takes over until the 1st.', 429, ['fallback' => true]);
      mh_rate_or_fail("ai_speak:$uid", 90, 60, 'Bo is talking a lot. Your device\'s voice takes over for a minute.');
      @set_time_limit(45);
      [, $audio, $type] = mh_ai_openai($V, '/audio/speech', json_encode(['model' => $V['tts_model'], 'voice' => $voice, 'input' => $text, 'response_format' => 'mp3',
        'instructions' => 'You are Bo, a friendly bobcat who tutors college students. Voice: warm, upbeat and encouraging, like a favourite tutor. Pace: natural and relaxed, a little slower through math. Read math the way a teacher says it aloud. Never sound robotic.'], JSON_UNESCAPED_UNICODE), 40);
      mh_ai_add($uid, 'voice', mb_strlen($text));
      http_response_code(200); header('Content-Type: ' . (preg_match('#^audio/[a-z0-9.+-]+$#i', $type) ? $type : 'audio/mpeg')); header('Cache-Control: no-store'); header('Content-Length: ' . strlen($audio));
      echo $audio; exit;
    }
    case 'ai_listen': {
      // a short recording of the student, turned into text (for browsers without their own speech recognition)
      mh_method('POST'); $u = mh_require_user(); $uid = (int)$u['id'];
      if (mh_plan($u, $cfg) !== 'max') mh_fail('Talking with Bo is part of Mathub Max.', 402, ['plan' => 'max']);
      $V = mh_ai_voice_settings($cfg); if ($V['key'] === '') mh_fail('Listening is not switched on here. Type your question instead.', 503, ['fallback' => true]);
      $a = is_array($in['audio'] ?? null) ? $in['audio'] : []; $type = strtolower(trim(explode(';', (string)($a['type'] ?? ''))[0]));
      $ext = ['audio/webm' => 'webm', 'audio/ogg' => 'ogg', 'audio/mp4' => 'mp4', 'audio/x-m4a' => 'm4a', 'audio/aac' => 'm4a', 'audio/mpeg' => 'mp3', 'audio/wav' => 'wav', 'audio/x-wav' => 'wav'][$type] ?? '';
      if ($ext === '') mh_fail('That recording could not be read.', 400);
      $data = preg_replace('/\s+/', '', (string)($a['data'] ?? '')); if ($data === '' || !preg_match('/^[A-Za-z0-9+\/]+=*$/', $data)) mh_fail('That recording could not be read.', 400);
      if ((int)(strlen($data) * 3 / 4) > 4000000) mh_fail('That was a long one. Keep it under two minutes.', 413);
      $secs = max(1, min(120, (int)($in['secs'] ?? 10)));
      $use = mh_ai_usage($uid); if ($use['listen'] + $secs > $V['listen_monthly']) mh_fail('Bo has listened a lot this month. Type your questions until the 1st.', 429);
      mh_rate_or_fail("ai_listen:$uid", 30, 60, 'Slow down a little: Bo listens to up to 30 questions a minute.');
      // the class's own words help it hear math and topic names right
      $C = isset($in['class']) && is_string($in['class']) && preg_match('/^[a-z0-9][a-z0-9_-]{0,40}$/', $in['class']) ? mh_ai_class($u, $in['class']) : null;
      $hint = 'A college student talking with their tutor about math and their class.';
      if ($C) { $words = [mh_ai_plain($C['code'] ?? '', 20), mh_ai_plain($C['name'] ?? '', 60)]; foreach (array_slice((array)($C['SECTIONS'] ?? []), 0, 40) as $sec) if (is_array($sec)) $words[] = mh_ai_plain($sec['title'] ?? '', 40); $hint .= ' Topics: ' . mb_substr(implode(', ', array_filter($words)), 0, 600); }
      $bin = base64_decode($data); @set_time_limit(60);
      $file = class_exists('CURLStringFile') ? new CURLStringFile($bin, 'speech.' . $ext, $type) : null;
      $tmp = null; if (!$file) { $tmp = tempnam(sys_get_temp_dir(), 'mhs'); file_put_contents($tmp, $bin); $file = new CURLFile($tmp, $type, 'speech.' . $ext); }
      try { [, $raw] = mh_ai_openai($V, '/audio/transcriptions', ['model' => $V['stt_model'], 'file' => $file, 'language' => 'en', 'prompt' => $hint, 'response_format' => 'json'], 50); }
      finally { if ($tmp) @unlink($tmp); }
      $j = json_decode($raw, true); $text = mh_ai_clip(is_array($j) ? ($j['text'] ?? '') : '', 2000);
      mh_ai_add($uid, 'listen', $secs);
      mh_json(['ok' => true, 'text' => $text]);
    }
    case 'ai_live_start': {
      // a live call: the browser's WebRTC offer in, OpenAI's answer out, with Bo's instructions added here
      mh_method('POST'); $u = mh_require_user(); $uid = (int)$u['id'];
      if (mh_plan($u, $cfg) !== 'max') mh_fail('Talking with Bo is part of Mathub Max.', 402, ['plan' => 'max']);
      $V = mh_ai_voice_settings($cfg); if ($V['key'] === '') mh_fail('Live calls are not switched on yet.', 503, ['fallback' => true]);
      $left = mh_ai_live_left($uid, $V); if ($left <= 0) mh_fail(mh_ai_usage($uid)['live'] >= $V['live_monthly'] ? 'That is all the live call time for this month. It starts again on the 1st.' : 'That is a lot of calling for one day. Bo is around again tomorrow.', 429, ['fallback' => true]);
      mh_rate_or_fail("ai_live:$uid", 30, 3600, 'That is a lot of calls in an hour. Try again in a bit.');
      $sdp = str_replace("\r\n", "\n", (string)($in['sdp'] ?? '')); if (strncmp($sdp, 'v=0', 3) !== 0 || strlen($sdp) > 30000) mh_fail('The call could not start.', 400);
      $sdp = str_replace("\n", "\r\n", $sdp);
      $cid = mh_ai_cid($in['class'] ?? ''); $C = mh_ai_class($u, $cid);
      $voice = is_string($in['voice'] ?? null) && isset(MH_AI_LIVE_VOICES[$in['voice']]) ? $in['voice'] : $V['live_voice'];
      $speed = round(max(0.8, min(1.25, (float)($in['speed'] ?? 1))), 2); $eager = in_array($in['eagerness'] ?? '', ['low', 'auto', 'high'], true) ? $in['eagerness'] : 'auto';
      $hint = 'A college student on a call with their tutor about math and their class.';
      if ($C) { $w = [mh_ai_plain($C['code'] ?? '', 20), mh_ai_plain($C['name'] ?? '', 60)]; foreach (array_slice((array)($C['SECTIONS'] ?? []), 0, 40) as $sec) if (is_array($sec)) $w[] = mh_ai_plain($sec['title'] ?? '', 40); $hint .= ' Topics: ' . mb_substr(implode(', ', array_filter($w)), 0, 600); }
      $sys = mh_ai_live_instructions($uid, $cid, $C, $in);
      if (($lang = mh_ai_lang($in)) !== '') $sys .= "\n\n" . $lang . ' On the call, speak it with a natural accent.';
      $full = ['type' => 'realtime', 'model' => $V['live_model'], 'instructions' => $sys, 'output_modalities' => ['audio'], 'max_output_tokens' => 1600,
        'audio' => ['input' => ['noise_reduction' => ['type' => 'near_field'], 'transcription' => ['model' => 'gpt-4o-mini-transcribe', 'language' => 'en', 'prompt' => $hint], 'turn_detection' => ['type' => 'semantic_vad', 'eagerness' => $eager, 'create_response' => true, 'interrupt_response' => true]],
                    'output' => array_merge(['voice' => $voice], $speed != 1.0 ? ['speed' => $speed] : [])],
        'tools' => mh_ai_live_tools(), 'tool_choice' => 'auto'];
      // the fewest settings that still make a good call, in case the account's model refuses one of the others
      $lean = ['type' => 'realtime', 'model' => $V['live_model'], 'instructions' => $sys, 'audio' => ['input' => ['transcription' => ['model' => 'gpt-4o-mini-transcribe'], 'turn_detection' => ['type' => 'semantic_vad']], 'output' => ['voice' => $voice]], 'tools' => mh_ai_live_tools()];
      // one call at a time per account
      foreach ($db->query('SELECT id, call FROM ai_live WHERE ended = 0 AND user_id = ' . $uid)->fetchAll() as $r) { mh_ai_hangup($V, (string)$r['call']); $db->prepare('UPDATE ai_live SET ended = 1 WHERE id = ?')->execute([$r['id']]); }
      @set_time_limit(60);
      [$code, $answer, $call] = mh_ai_rtc_call($V, $sdp, $full);
      if ($code >= 400 && $code < 500 && $code !== 401 && $code !== 429) { error_log('mathub live: ' . $code . ' ' . substr($answer, 0, 300)); [$code, $answer, $call] = mh_ai_rtc_call($V, $sdp, $lean); }
      if ($code < 200 || $code >= 300 || strncmp(ltrim($answer), 'v=0', 3) !== 0) { error_log('mathub live: ' . $code . ' ' . substr($answer, 0, 300)); mh_fail($code === 429 ? 'Bo is very busy right now. Try the call again in a minute.' : 'Bo could not pick up just now. Try again, or use basic voice.', 502, ['fallback' => true]); }
      $lid = bin2hex(random_bytes(12)); $now = time();
      $db->prepare('INSERT INTO ai_live (id, user_id, cid, call, started, last) VALUES (?, ?, ?, ?, ?, ?)')->execute([$lid, $uid, $cid, $call, $now, $now]);
      mh_json(['ok' => true, 'sdp' => $answer, 'lid' => $lid, 'left' => min($left, $V['live_call']), 'voice' => $voice]);
    }
    case 'ai_live_tick': {
      // the browser reports the call every half minute; the minutes are counted here and the limits kept
      mh_method('POST'); $u = mh_require_user(); $uid = (int)$u['id']; $V = mh_ai_voice_settings($cfg);
      $lid = preg_replace('/[^a-f0-9]/', '', (string)($in['lid'] ?? '')); $st = $db->prepare('SELECT * FROM ai_live WHERE id = ? AND user_id = ?'); $st->execute([$lid, $uid]); $r = $st->fetch();
      if (!$r) mh_fail('That call is over.', 404);
      if ((int)$r['ended']) mh_json(['ok' => true, 'left' => 0, 'end' => true]);
      $now = time(); $d = max(0, min(45, $now - (int)$r['last'])); $secs = (int)$r['secs'] + $d;
      $db->prepare('UPDATE ai_live SET secs = ?, last = ? WHERE id = ?')->execute([$secs, $now, $lid]); mh_ai_add($uid, 'live', $d);
      $left = min(mh_ai_live_left($uid, $V), $V['live_call'] - $secs);
      if ($left <= 0) {
        mh_ai_hangup($V, (string)$r['call']); $db->prepare('UPDATE ai_live SET ended = 1 WHERE id = ?')->execute([$lid]);
        mh_json(['ok' => true, 'left' => 0, 'end' => true, 'why' => $V['live_call'] - $secs <= 0 ? 'That was a long one: calls end after ' . round($V['live_call'] / 60) . ' minutes. Call Bo again any time.' : 'That is all the live call time for now. It comes back tomorrow, or on the 1st for the monthly limit.']);
      }
      mh_json(['ok' => true, 'left' => $left]);
    }
    case 'ai_live_log': {
      // what was said on the call goes into the chat with Bo, his new notes into his notes; end: the call is over
      mh_method('POST'); $u = mh_require_user(); $uid = (int)$u['id']; $V = mh_ai_voice_settings($cfg);
      $lid = preg_replace('/[^a-f0-9]/', '', (string)($in['lid'] ?? '')); $st = $db->prepare('SELECT * FROM ai_live WHERE id = ? AND user_id = ?'); $st->execute([$lid, $uid]); $r = $st->fetch();
      if (!$r) mh_fail('That call is over.', 404);
      $new = [];
      foreach (array_slice(is_array($in['turns'] ?? null) ? $in['turns'] : [], 0, 80) as $t) {
        if (!is_array($t)) continue; $txt = mh_ai_clip($t['t'] ?? '', 3000); if ($txt === '') continue;   // room for the pages Bo wrote
        $new[] = ['r' => ($t['r'] ?? '') === 'b' ? 'b' : 'u', 't' => $txt, 'at' => time(), 'v' => 1];
      }
      if ($new) mh_ai_save_turns($uid, (string)$r['cid'], array_merge(mh_ai_turns($uid, (string)$r['cid']), $new));
      $notes = mh_ai_notes($uid); $added = false;
      foreach (array_slice(is_array($in['notes'] ?? null) ? $in['notes'] : [], 0, 4) as $f) { $f = mh_ai_clip(is_string($f) ? $f : '', 140); if ($f !== '' && !in_array($f, $notes, true)) { $notes[] = $f; $added = true; } }
      if ($added) mh_ai_save_notes($uid, $notes);
      if (!empty($in['end']) && !(int)$r['ended']) {
        $now = time(); $d = max(0, min(45, $now - (int)$r['last'])); mh_ai_add($uid, 'live', $d);
        $db->prepare('UPDATE ai_live SET secs = secs + ?, last = ?, ended = 1 WHERE id = ?')->execute([$d, $now, $lid]);
        mh_ai_hangup($V, (string)$r['call']);
      }
      mh_json(['ok' => true, 'saved' => count($new), 'notes' => mh_ai_notes($uid)]);
    }
    case 'ai_class': {
      mh_method('POST'); $u = mh_require_user(); $uid = (int)$u['id'];
      if (!in_array(mh_plan($u, $cfg), ['pro', 'max'], true)) mh_fail('Making a class with Bo is part of Mathub Pro and Max.', 402, ['plan' => 'pro']);
      mh_rate_or_fail("ai_class:$uid", 40, 3600, 'Bo is writing a lot of classes for you. Try again in a while.');
      $step = (string)($in['step'] ?? ''); $Z = mh_ai_sizes((string)($in['size'] ?? 'full'));
      @set_time_limit(200);
      if ($step === 'outline') {
        $use = mh_ai_usage($uid); if ($use['classes'] >= $A['class_monthly']) mh_fail('You have used this month\'s ' . $A['class_monthly'] . ' classes written by Bo. They start again on the 1st, and you can still make classes with your own AI.', 429);
        $S = is_array($in['syllabus'] ?? null) ? $in['syllabus'] : []; $text = trim((string)($S['text'] ?? ''));
        $file = isset($S['file']) ? mh_ai_file($S['file'], ['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'text/plain'], MH_AI_FILE_BYTES) : null;
        if ($text === '' && !$file) mh_fail('Paste your syllabus or attach it first.', 400);
        if (mb_strlen($text) > 120000) mh_fail('That syllabus is very long. Paste the parts with the schedule, topics, exams and grading.', 413);
        $doc = [];
        if ($file && $file['type'] === 'application/pdf') $doc[] = ['type' => 'document', 'source' => ['type' => 'base64', 'media_type' => 'application/pdf', 'data' => $file['data']]];
        elseif ($file && $file['type'] === 'text/plain') $text = trim($text . "\n" . mb_substr((string)base64_decode($file['data']), 0, 120000));
        elseif ($file) $doc[] = ['type' => 'image', 'source' => ['type' => 'base64', 'media_type' => $file['type'], 'data' => $file['data']]];
        if ($text !== '') $doc[] = ['type' => 'text', 'text' => "THE SYLLABUS:\n" . $text];
        $doc[] = ['type' => 'text', 'text' => 'Today is ' . gmdate('Y-m-d') . ".\n" . mh_ai_outline_prompt($Z)];
        $r = mh_ai_call($A, $A['class_model'], [['type' => 'text', 'text' => MH_AI_CLASS_SYS]], [['role' => 'user', 'content' => $doc]], 8000, 170);
        $O = mh_ai_json($r['text']);
        if (!$O || empty($O['UNITS']) || empty($O['SECTIONS']) || !is_array($O['UNITS']) || !is_array($O['SECTIONS'])) { mh_ai_count($uid, '', $r['in'], $r['out']); mh_fail($r['stop'] === 'max_tokens' ? 'That syllabus made a very long outline. Choose "Shorter class" and try again.' : 'Bo could not find the topics and dates in that. Try the syllabus PDF itself, or paste its text.', 422); }
        $units = array_values(array_filter(array_map(fn($x) => is_array($x) ? (int)($x['n'] ?? 0) : 0, $O['UNITS'])));
        if (!$units || count($units) > 16 || count($O['SECTIONS']) > 40) mh_fail('That syllabus did not split into units Bo could use. Try pasting its schedule and topics.', 422);
        $id = bin2hex(random_bytes(12));
        $db->prepare('INSERT INTO ai_builds (id, user_id, created, outline, units) VALUES (?, ?, ?, ?, ?)')->execute([$id, $uid, time(), json_encode($O, JSON_UNESCAPED_UNICODE), count($units)]);
        mh_ai_count($uid, 'classes', $r['in'], $r['out']);
        mh_json(['ok' => true, 'build' => $id, 'outline' => $O, 'units' => $units]);
      }
      if ($step === 'unit') {
        $bid = preg_replace('/[^a-f0-9]/', '', (string)($in['build'] ?? '')); $n = (int)($in['unit'] ?? 0);
        $st = $db->prepare('SELECT * FROM ai_builds WHERE id = ? AND user_id = ?'); $st->execute([$bid, $uid]); $b = $st->fetch();
        if (!$b || (int)$b['created'] < time() - 3 * 3600) mh_fail('This class is no longer being written. Start again.', 404);
        if ((int)$b['steps'] >= 2 * (int)$b['units'] + 2) mh_fail('Bo has already written this class. Start a new one.', 429);
        $db->prepare('UPDATE ai_builds SET steps = steps + 1 WHERE id = ?')->execute([$bid]);
        $O = json_decode((string)$b['outline'], true);
        $r = mh_ai_call($A, $A['class_model'], [['type' => 'text', 'text' => MH_AI_CLASS_SYS]], [['role' => 'user', 'content' => mh_ai_unit_prompt($O, $n, $Z)]], 10000, 170);
        mh_ai_count($uid, '', $r['in'], $r['out']);
        $J = mh_ai_json($r['text']);
        if (!$J) mh_fail($r['stop'] === 'max_tokens' ? 'Unit ' . $n . ' came out too long. Choose "Shorter class" and try again.' : 'Bo stumbled writing unit ' . $n . '. Try again.', 422);
        mh_json(['ok' => true, 'unit' => $n, 'data' => $J]);
      }
      mh_fail('Unknown step.', 400);
    }
  }
  mh_fail('Not found.', 404);
}
