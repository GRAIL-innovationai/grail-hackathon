<?php
/* ============================================================
   Mathub — outgoing mail. No dependencies.
   Modes: smtp (built-in client, SSL or STARTTLS), mail (PHP mail()), log (write to data/mail.log).
   ============================================================ */

function mh_mail_mode(array $cfg): string {
  $m = $cfg['mail_mode'] ?? 'auto';
  if ($m === 'auto') return ($cfg['smtp_pass'] ?? '') !== '' ? 'smtp' : 'mail';
  return in_array($m, ['smtp', 'mail', 'log'], true) ? $m : 'mail';
}

/** Returns ['ok' => bool, 'error' => string|null]. */
function mh_send_mail(array $cfg, string $to, string $subject, string $text, string $html): array {
  $mode = mh_mail_mode($cfg);
  $from = $cfg['mail_from']; $fromName = $cfg['mail_from_name'] ?? 'Mathub';
  $boundary = 'mh' . bin2hex(random_bytes(8));
  $body = "--$boundary\r\nContent-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: 8bit\r\n\r\n" . mh_crlf($text) . "\r\n\r\n"
        . "--$boundary\r\nContent-Type: text/html; charset=UTF-8\r\nContent-Transfer-Encoding: 8bit\r\n\r\n" . mh_crlf($html) . "\r\n\r\n--$boundary--\r\n";
  $encSubject = '=?UTF-8?B?' . base64_encode($subject) . '?=';
  $encFromName = '=?UTF-8?B?' . base64_encode($fromName) . '?=';
  $headers = [
    'From' => "$encFromName <$from>",
    'Reply-To' => $from,
    'MIME-Version' => '1.0',
    'Content-Type' => "multipart/alternative; boundary=\"$boundary\"",
    'X-Mailer' => 'Mathub',
  ];
  if ($mode === 'log') {
    $line = '[' . gmdate('c') . "] to=$to subject=\"$subject\"\n$text\n---\n";
    @file_put_contents(__DIR__ . '/data/mail.log', $line, FILE_APPEND | LOCK_EX);
    return ['ok' => true, 'error' => null];
  }
  if ($mode === 'smtp') return mh_smtp_send($cfg, $from, $to, $encSubject, $headers, $body);
  $h = '';
  foreach ($headers as $k => $v) $h .= "$k: $v\r\n";
  $ok = @mail($to, $encSubject, $body, $h, '-f' . $from);
  if (!$ok) $ok = @mail($to, $encSubject, $body, $h);
  return ['ok' => (bool)$ok, 'error' => $ok ? null : 'PHP mail() refused the message. Fill in smtp_pass in api/config.php to send through the mailbox instead.'];
}

function mh_crlf(string $s): string {
  $s = str_replace(["\r\n", "\r"], "\n", $s);
  return str_replace("\n", "\r\n", $s);
}

function mh_smtp_send(array $cfg, string $from, string $to, string $subject, array $headers, string $body): array {
  $host = $cfg['smtp_host']; $port = (int)($cfg['smtp_port'] ?: 465);
  $user = $cfg['smtp_user'] ?: $from; $pass = $cfg['smtp_pass'];
  $ssl = $port === 465;
  $ctx = stream_context_create(['ssl' => ['verify_peer' => true, 'verify_peer_name' => true, 'SNI_enabled' => true, 'peer_name' => $host]]);
  $sock = @stream_socket_client(($ssl ? 'ssl://' : 'tcp://') . "$host:$port", $errno, $errstr, 15, STREAM_CLIENT_CONNECT, $ctx);
  if (!$sock) return ['ok' => false, 'error' => "SMTP connect failed: $errstr ($errno)"];
  stream_set_timeout($sock, 15);
  $read = function () use ($sock) {
    $out = '';
    while (($line = fgets($sock, 2048)) !== false) { $out .= $line; if (preg_match('/^\d{3} /', $line)) break; if (!preg_match('/^\d{3}-/', $line)) break; }
    return $out;
  };
  $cmd = function (string $c, array $okCodes) use ($sock, $read) {
    fwrite($sock, $c . "\r\n"); $r = $read();
    $code = (int)substr($r, 0, 3);
    if (!in_array($code, $okCodes, true)) throw new RuntimeException("SMTP: " . trim($r));
    return $r;
  };
  $ehloName = preg_replace('/[^a-zA-Z0-9.\-]/', '', $_SERVER['SERVER_NAME'] ?? 'localhost') ?: 'localhost';
  try {
    $greet = $read(); if ((int)substr($greet, 0, 3) !== 220) throw new RuntimeException('SMTP: ' . trim($greet));
    $cmd("EHLO $ehloName", [250]);
    if (!$ssl) {
      $cmd('STARTTLS', [220]);
      if (!stream_socket_enable_crypto($sock, true, STREAM_CRYPTO_METHOD_TLS_CLIENT)) throw new RuntimeException('SMTP: STARTTLS negotiation failed');
      $cmd("EHLO $ehloName", [250]);
    }
    $cmd('AUTH LOGIN', [334]);
    $cmd(base64_encode($user), [334]);
    $cmd(base64_encode($pass), [235]);
    $cmd("MAIL FROM:<$from>", [250]);
    $cmd("RCPT TO:<$to>", [250, 251]);
    $cmd('DATA', [354]);
    $msg = "Date: " . date('r') . "\r\nTo: <$to>\r\nSubject: $subject\r\nMessage-ID: <" . bin2hex(random_bytes(10)) . "@" . (explode('@', $from)[1] ?? 'mathub.space') . ">\r\n";
    foreach ($headers as $k => $v) $msg .= "$k: $v\r\n";
    $msg .= "\r\n" . preg_replace('/^\./m', '..', $body);
    fwrite($sock, $msg . "\r\n.\r\n");
    $r = $read(); if ((int)substr($r, 0, 3) !== 250) throw new RuntimeException('SMTP: ' . trim($r));
    fwrite($sock, "QUIT\r\n"); fclose($sock);
    return ['ok' => true, 'error' => null];
  } catch (Throwable $e) {
    @fclose($sock);
    return ['ok' => false, 'error' => $e->getMessage()];
  }
}
