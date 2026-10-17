<?php
// Serves the local Pyodide package with CORS for Mathub tests.
header('Access-Control-Allow-Origin: *');
$path = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
// a stand-in for RevenueCat's GET /v1/subscribers/{id}, for the Mathub Pro and Max tests (config.local.php: revenuecat_api,
// revenuecat_secret 'sk_test'); who is subscribed, and to which plan, comes from tests/fixtures/rc-state.json, written by the test
if (preg_match('#^/revenuecat/v1/subscribers/(.+)$#', $path, $m)) {
  header('Content-Type: application/json');
  if (($_SERVER['HTTP_AUTHORIZATION'] ?? '') !== 'Bearer sk_test') { http_response_code(401); echo '{"code":7225,"message":"Invalid API key."}'; exit; }
  $id = rawurldecode($m[1]); $state = json_decode((string)@file_get_contents(__DIR__ . '/../fixtures/rc-state.json'), true) ?: []; $s = $state[$id] ?? null;
  $plan = $s ? ($s['plan'] ?? 'pro') : ''; $prod = $plan === 'max' ? 'mathub_max_monthly' : 'mathub_pro_monthly';
  $e = ['expires_date' => $s['expires'] ?? null, 'grace_period_expires_date' => null, 'product_identifier' => $prod, 'purchase_date' => gmdate('c')];
  $ent = $s ? ($plan === 'max' ? ['pro' => $e, 'max' => $e] : ['pro' => $e]) : [];
  echo json_encode(['request_date' => gmdate('c'), 'subscriber' => ['original_app_user_id' => $id, 'entitlements' => $ent, 'subscriptions' => $s ? [$prod => ['store' => $s['store'] ?? 'rc_billing', 'expires_date' => $s['expires'] ?? null, 'unsubscribe_detected_at' => $s['cancelled'] ?? null]] : (object)[], 'management_url' => $s ? 'https://billing.example/manage' : null]]);
  exit;
}
// a stand-in for RevenueCat's API v2, for cancelling a website plan (config.local.php: revenuecat_v2_api, revenuecat_v2_key
// 'sk_v2_test', revenuecat_project 'proj_test'): lists the customer's subscriptions from rc-state.json and, on cancel, marks
// the plan cancelled there (so v1 then shows it as not renewing); each cancel is logged in tests/fixtures/rc-cancels.json
if (preg_match('#^/revenuecat/v2/projects/([^/]+)/(customers/([^/]+)/subscriptions|subscriptions/([^/]+)/actions/cancel)$#', $path, $m)) {
  header('Content-Type: application/json');
  if (($_SERVER['HTTP_AUTHORIZATION'] ?? '') !== 'Bearer sk_v2_test' || $m[1] !== 'proj_test') { http_response_code(403); echo '{"type":"authorization_error","message":"Not allowed."}'; exit; }
  $F = __DIR__ . '/../fixtures/rc-state.json'; $state = json_decode((string)@file_get_contents($F), true) ?: [];
  if (!empty($m[3])) {
    $id = rawurldecode($m[3]); $s = $state[$id] ?? null; $items = [];
    if ($s && empty($s['v2fail'])) $items[] = ['object' => 'subscription', 'id' => 'sub_' . $id, 'customer_id' => $id, 'store' => $s['store'] ?? 'rc_billing', 'status' => strtotime($s['expires'] ?? 'now') > time() ? 'active' : 'expired', 'auto_renewal_status' => empty($s['cancelled']) ? 'will_renew' : 'will_not_renew'];
    if ($s && !empty($s['v2fail'])) { http_response_code(500); echo '{"type":"server_error"}'; exit; }
    echo json_encode(['object' => 'list', 'items' => $items]); exit;
  }
  if ($_SERVER['REQUEST_METHOD'] !== 'POST') { http_response_code(405); exit; }
  $id = preg_replace('/^sub_/', '', rawurldecode($m[4])); if (!isset($state[$id])) { http_response_code(404); echo '{"type":"resource_missing"}'; exit; }
  $state[$id]['cancelled'] = gmdate('c'); file_put_contents($F, json_encode($state));
  $log = json_decode((string)@file_get_contents(__DIR__ . '/../fixtures/rc-cancels.json'), true) ?: []; $log[] = $id; file_put_contents(__DIR__ . '/../fixtures/rc-cancels.json', json_encode($log));
  echo json_encode(['object' => 'subscription', 'id' => 'sub_' . $id, 'auto_renewal_status' => 'will_not_renew']); exit;
}
// a stand-in for Anthropic's POST /v1/messages, for Bo's tests (config.local.php: anthropic_api, anthropic_key 'sk-ant-test').
// It keeps the last request in tests/fixtures/ai-last.json so the tests can check what the server sends.
if ($path === '/anthropic/v1/messages') {
  header('Content-Type: application/json');
  if (($_SERVER['HTTP_X_API_KEY'] ?? '') !== 'sk-ant-test' || ($_SERVER['HTTP_ANTHROPIC_VERSION'] ?? '') === '') { http_response_code(401); echo '{"type":"error","error":{"type":"authentication_error","message":"invalid x-api-key"}}'; exit; }
  $raw = (string)file_get_contents('php://input'); $req = json_decode($raw, true) ?: [];
  @file_put_contents(__DIR__ . '/../fixtures/ai-last.json', $raw);
  $sys = implode("\n", array_map(fn($b) => $b['text'] ?? '', (array)($req['system'] ?? [])));
  $last = end($req['messages']); $content = is_array($last['content'] ?? null) ? $last['content'] : [['type' => 'text', 'text' => (string)($last['content'] ?? '')]];
  $utext = implode("\n", array_map(fn($b) => $b['text'] ?? '', array_filter($content, fn($b) => ($b['type'] ?? '') === 'text')));
  $hasImage = (bool)array_filter($content, fn($b) => ($b['type'] ?? '') === 'image');
  if (str_contains($sys, 'course syllabus') && str_contains($utext, 'Read the syllabus')) {
    $o = ['code' => 'TEST 101', 'name' => 'Testing Bo', 'term' => 'Fall 2026', 'color' => ['light' => '#0F766E'],
      'COURSE' => ['code' => 'TEST 101', 'name' => 'Testing Bo', 'term' => 'Fall 2026', 'school' => 'Montana State University', 'instructor' => 'Dr. Stand In', 'officeHours' => 'Mon 2-3'],
      'GRADING' => ['categories' => [['id' => 'hw', 'name' => 'Homework', 'weight' => 40], ['id' => 'ex', 'name' => 'Exams', 'weight' => 60]], 'scale' => [['letter' => 'A', 'min' => 90], ['letter' => 'B', 'min' => 80], ['letter' => 'C', 'min' => 70], ['letter' => 'D', 'min' => 60], ['letter' => 'F', 'min' => 0]]],
      'SEMESTER' => ['start' => '2026-08-24', 'end' => '2026-12-18'],
      'EXAMS' => [['id' => 'exam1', 'name' => 'Exam 1', 'date' => '2026-10-20', 'covers' => 'Units 1 and 2', 'units' => [1, 2], 'weight' => 30]],
      'CALENDAR' => [['2026-09-01', 'lecture', 'Ratios', 'ratios'], ['2026-10-20', 'exam', 'Exam 1']],
      'UNITS' => [['n' => 1, 'title' => 'Numbers', 'sections' => ['ratios', 'percents'], 'exam' => 'exam1'], ['n' => 2, 'title' => 'Change', 'sections' => ['rates', 'growth'], 'exam' => 'exam1']],
      'SECTIONS' => [['id' => 'ratios', 'label' => '1.1', 'title' => 'Ratios', 'unit' => 1, 'about' => 'Comparing quantities.'], ['id' => 'percents', 'label' => '1.2', 'title' => 'Percents', 'unit' => 1, 'about' => 'Parts of a hundred.'], ['id' => 'rates', 'label' => '2.1', 'title' => 'Rates', 'unit' => 2, 'about' => 'Change per unit.'], ['id' => 'growth', 'label' => '2.2', 'title' => 'Growth', 'unit' => 2, 'about' => 'Repeated change.']]];
    $text = "```json\n" . json_encode($o) . "\n```";
  } elseif (str_contains($sys, 'course syllabus') && preg_match('/Write the study material for unit (\d+)/', $utext, $mm)) {
    preg_match_all('/^- ([a-z0-9-]+) \(/m', $utext, $ids); $secs = []; $cards = []; $qs = [];
    foreach ($ids[1] as $k => $sid) {
      $secs[] = ['id' => $sid, 'ideas' => ["$sid explained simply.", "More about $sid."], 'pitfalls' => ["Mixing up $sid."], 'example' => ['p' => "A $sid problem", 's' => 'Its solution']];
      $cards[] = ['id' => "c$k", 'sec' => $sid, 'f' => "What is $sid?", 'b' => "The idea of $sid."];
      $qs[] = ['topic' => $sid, 'items' => [["Which one is $sid?", 'This one', ['That one', 'Neither', 'Both'], "Because it is $sid."], ["Is $sid useful?", 'Yes', ['No', 'Never', 'Only on Sundays'], 'It is.']]];
    }
    $text = "Here you go:\n```json\n" . json_encode(['SECTIONS' => $secs, 'FLASHCARDS' => $cards, 'QUIZ' => ['questions' => $qs]]) . "\n```";
  } elseif (str_contains($sys, 'VOICE MODE')) {
    // talking out loud: a short spoken answer with a line for the whiteboard
    $weak = preg_match('/WEAKEST TOPICS: ([^;\n]+?) \d+%|WEAKEST TOPICS: ([^;\n]+?) not practised/', $sys, $w) ? trim($w[1] ?: $w[2]) : '';
    $text = 'You said: ' . rtrim(mb_substr($utext, 0, 60), '?.!') . '. The chain rule says: take the derivative of the outside, then multiply by the derivative of the inside.' . "\n[board: The chain rule]\nmath: \\frac{d}{dx}f(g(x)) = f'(g(x))\\,g'(x)\ntip: Outside first, then times the derivative of the inside\n[/board]\n" . ($weak ? "Since $weak is your weakest topic, want to try one together?" : 'Want to try one together?');
    if (stripos($utext, 'remember') !== false) $text .= "\n[remember: Likes to talk things through]";
  } else {
    $weak = preg_match('/WEAKEST TOPICS: ([^;\n]+?) \d+%|WEAKEST TOPICS: ([^;\n]+?) not practised/', $sys, $w) ? trim($w[1] ?: $w[2]) : '';
    $text = 'Bo here. ' . ($weak ? "Your weakest topic is $weak. " : '') . (str_contains($sys, 'CLASS: ') ? 'I know your class. ' : '') . ($hasImage ? 'I see your photo. ' : '') . 'You asked: ' . mb_substr($utext, 0, 80) . ' (turns: ' . count($req['messages']) . ')';
    if (stripos($utext, 'remember') !== false) $text .= "\n[remember: Likes worked examples first]";
    // asked from a page (the floating Bo): say what he sees, so the tests know it arrived
    if (preg_match('/THE PAGE:\nPAGE: ([^\n]+)/', $sys, $pg)) $text .= "\nI can see your page: " . trim($pg[1]) . '.';
    if (preg_match('/\b(Q\d+|Problem \d+)\b/', $utext, $qn) && preg_match('/\[' . preg_quote($qn[1], '/') . '\][^\n]*?\) ([^\n]{0,60})/', $sys, $qp)) $text .= "\nLooking at {$qn[1]}: " . trim($qp[1]);
    if (preg_match('/WHAT THEY POINTED AT[^\n]*\n([^\n]{0,70})/', $sys, $fp)) $text .= "\nYou pointed at: " . trim($fp[1]);
    if (array_filter($content, fn($b) => ($b['type'] ?? '') === 'document')) $text .= "\nI read your PDF.";
    if (stripos($utext, 'math') !== false) $text .= "\nThe slope is $\\frac{\\Delta y}{\\Delta x}$ and x < 3 here.";
    // drawings on the board (assets/board-draw.js)
    if (stripos($utext, 'graph') !== false) $text .= "\nHere is the picture first." . "\n[board: Where y = x^2 - 3 is below zero]\n" . 'draw: {"type":"graph","x":[-4,4],"fns":[{"f":"x^2-3","label":"y = x^2 - 3"}],"points":[{"x":-1.732,"y":0,"label":"−√3"},{"x":1.732,"y":0,"label":"√3"}],"shade":{"f":"x^2-3","from":-1.732,"to":1.732,"color":"red"},"caption":"Below zero between the two roots"}' . "\n" . 'step: Set it to zero: $x^2 - 3 = 0$' . "\n" . 'answer: $-\sqrt{3} < x < \sqrt{3}$' . "\n[/board]\nSee the red part? What happens to y when x is 0?";
    if (stripos($utext, 'triangle') !== false) $text .= "\n[board: A 3-4-5 right triangle]\n" . 'draw: {"type":"figure","shapes":[{"kind":"polygon","points":[[0,0],[4,0],[4,3]],"labels":["A","B","C"]},{"kind":"segment","from":[0,0],"to":[4,0],"label":"4"},{"kind":"segment","from":[4,0],"to":[4,3],"label":"3"},{"kind":"segment","from":[0,0],"to":[4,3],"label":"5","color":"red"},{"kind":"angle","at":[4,0],"from":[0,0],"to":[4,3],"right":true},{"kind":"angle","at":[0,0],"from":[4,0],"to":[4,3],"label":"θ"}]}' . "\n" . 'step: Opposite over hypotenuse: $\sin\theta = \frac{3}{5}$' . "\n[/board]\nWhich side is opposite θ?";
    if (stripos($utext, 'normal') !== false) $text .= "\n[board: Above 115]\n" . 'draw: {"type":"normal","mean":100,"sd":15,"from":115,"to":null,"label":"IQ scores","caption":"About 16% is shaded"}' . "\n[/board]\nHow many standard deviations above the mean is 115?";
    if (stripos($utext, 'tangent') !== false) $text .= "\nHere's the line.\n[board: The tangent line]\n" . 'draw: {' . "\n" . '  "type": "graph", "f": "x^2",' . "\n" . '  "tangent": {"at": "a"},' . "\n" . '  "sliders": [{"name": "a", "min": -2, "max": 2, "value": 1}],' . "\n" . '  "caption": "Drag a: the line touches the curve at one point"' . "\n}\n" . 'check: {"q": "What is the slope of the tangent at x = 1?", "choices": ["1", "2", "4"], "answer": "2", "why": "The derivative of x^2 is 2x, and 2(1) = 2."}' . "\n[/board]\nTry the question on the board.";
    if (stripos($utext, 'loop') !== false) $text .= "\n[board: A loop]\ntext: It runs three times\n```python\nfor i in range(3):\n    print(i)\n```\n[/board]\nWhat does it print?";
    if (stripos($utext, 'solve') !== false) $text .= "\nHere it is, one step at a time.\n[board: Solving 2x + 3 = 11]\nstep: Take 3 from both sides: $2x = 8$\nstep: Divide both sides by 2: \$x = 4\$\nanswer: \$x = 4\$\ntip: Check it: $2(4) + 3 = 11$\n[/board]\nCan you do $3x - 5 = 10$ the same way?";
  }
  if (!empty($req['stream'])) {
    // the streaming form: server-sent events, the text in small pieces
    header('Content-Type: text/event-stream'); header('Cache-Control: no-cache');
    $ev = function (string $type, array $data): void { echo "event: $type\ndata: " . json_encode(['type' => $type] + $data) . "\n\n"; @ob_flush(); flush(); };
    $ev('message_start', ['message' => ['id' => 'msg_test', 'type' => 'message', 'role' => 'assistant', 'content' => [], 'model' => $req['model'] ?? '', 'usage' => ['input_tokens' => (int)(strlen($raw) / 4), 'output_tokens' => 1]]]);
    $ev('content_block_start', ['index' => 0, 'content_block' => ['type' => 'text', 'text' => '']]);
    $ev('ping', []);
    foreach (mb_str_split($text, 14) as $piece) { $ev('content_block_delta', ['index' => 0, 'delta' => ['type' => 'text_delta', 'text' => $piece]]); usleep(12000); }
    $ev('content_block_stop', ['index' => 0]);
    $ev('message_delta', ['delta' => ['stop_reason' => 'end_turn', 'stop_sequence' => null], 'usage' => ['output_tokens' => (int)(strlen($text) / 4)]]);
    $ev('message_stop', []);
    exit;
  }
  echo json_encode(['id' => 'msg_test', 'type' => 'message', 'role' => 'assistant', 'model' => $req['model'] ?? '', 'content' => [['type' => 'text', 'text' => $text]], 'stop_reason' => 'end_turn', 'usage' => ['input_tokens' => (int)(strlen($raw) / 4), 'output_tokens' => (int)(strlen($text) / 4)]]);
  exit;
}
// a stand-in for OpenAI's speech API (config.local.php: openai_api, openai_key 'sk-openai-test'): /audio/speech answers
// with a short silent WAV and keeps the request in tests/fixtures/tts-last.json; /audio/transcriptions hears the same
// question every time and keeps what it was sent in tests/fixtures/stt-last.json
// the Realtime API's call setup and hang-up (live calls with Bo): the offer and session go to tests/fixtures/live-last.json,
// hang-ups to tests/fixtures/live-hangups.json; a session whose instructions say REFUSE-FULL is refused unless it is the lean one
// the model list, which the admin panel's Check uses to try the key
if ($path === '/openai/v1/models') {
  header('Content-Type: application/json');
  if (($_SERVER['HTTP_AUTHORIZATION'] ?? '') !== 'Bearer sk-openai-test') { http_response_code(401); echo '{"error":{"message":"Incorrect API key provided."}}'; exit; }
  echo '{"object":"list","data":[{"id":"gpt-realtime-2.1-mini","object":"model"}]}'; exit;
}
if (preg_match('#^/openai/v1/realtime/calls(?:/([A-Za-z0-9_-]+)/hangup)?$#', $path, $m)) {
  if (($_SERVER['HTTP_AUTHORIZATION'] ?? '') !== 'Bearer sk-openai-test') { http_response_code(401); header('Content-Type: application/json'); echo '{"error":{"message":"Incorrect API key"}}'; exit; }
  if (!empty($m[1])) { $f = __DIR__ . '/../fixtures/live-hangups.json'; $h = json_decode((string)@file_get_contents($f), true) ?: []; $h[] = $m[1]; @file_put_contents($f, json_encode($h)); header('Content-Type: application/json'); echo '{}'; exit; }
  $sess = json_decode((string)($_POST['session'] ?? ''), true) ?: [];
  $tries = json_decode((string)@file_get_contents(__DIR__ . '/../fixtures/live-tries.json'), true) ?: []; $tries[] = array_keys($sess); @file_put_contents(__DIR__ . '/../fixtures/live-tries.json', json_encode($tries));
  if (str_contains((string)($sess['instructions'] ?? ''), 'REFUSE-FULL') && isset($sess['max_output_tokens'])) { http_response_code(400); header('Content-Type: application/json'); echo '{"error":{"message":"Unknown parameter: max_output_tokens"}}'; exit; }
  @file_put_contents(__DIR__ . '/../fixtures/live-last.json', json_encode(['sdp' => $_POST['sdp'] ?? '', 'session' => $sess, 'accept' => $_SERVER['HTTP_ACCEPT'] ?? '']));
  http_response_code(201); header('Content-Type: application/sdp'); header('Location: /v1/realtime/calls/rtc_test' . substr(md5((string)microtime(true)), 0, 8));
  echo "v=0\r\no=- 4611 2 IN IP4 127.0.0.1\r\ns=stand-in\r\nt=0 0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\n"; exit;
}
if (preg_match('#^/openai/v1/audio/(speech|transcriptions)$#', $path, $m)) {
  if (($_SERVER['HTTP_AUTHORIZATION'] ?? '') !== 'Bearer sk-openai-test') { http_response_code(401); header('Content-Type: application/json'); echo '{"error":{"message":"Incorrect API key"}}'; exit; }
  if ($m[1] === 'speech') {
    $raw = (string)file_get_contents('php://input'); @file_put_contents(__DIR__ . '/../fixtures/tts-last.json', $raw);
    $all = json_decode((string)@file_get_contents(__DIR__ . '/../fixtures/tts-all.json'), true) ?: []; $all[] = (json_decode($raw, true) ?: [])['input'] ?? ''; @file_put_contents(__DIR__ . '/../fixtures/tts-all.json', json_encode(array_slice($all, -40)));
    $n = 2400; $wav = 'RIFF' . pack('V', 36 + 2 * $n) . 'WAVEfmt ' . pack('VvvVVvv', 16, 1, 1, 8000, 16000, 2, 16) . 'data' . pack('V', 2 * $n) . str_repeat("\0", 2 * $n);
    header('Content-Type: audio/wav'); echo $wav; exit;
  }
  @file_put_contents(__DIR__ . '/../fixtures/stt-last.json', json_encode(['post' => $_POST, 'file' => isset($_FILES['file']) ? ['name' => $_FILES['file']['name'], 'type' => $_FILES['file']['type'], 'size' => $_FILES['file']['size']] : null]));
  header('Content-Type: application/json'); echo json_encode(['text' => 'What is the chain rule?']); exit;
}
$file = __DIR__ . '/package' . $path;
if ($path === '/' || !is_file($file)) { http_response_code(404); echo 'not found'; exit; }
$ext = strtolower(pathinfo($file, PATHINFO_EXTENSION));
$types = ['js' => 'text/javascript', 'mjs' => 'text/javascript', 'wasm' => 'application/wasm', 'json' => 'application/json', 'zip' => 'application/zip', 'whl' => 'application/octet-stream', 'ts' => 'text/plain', 'map' => 'application/json'];
header('Content-Type: ' . ($types[$ext] ?? 'application/octet-stream'));
header('Content-Length: ' . filesize($file));
readfile($file);
