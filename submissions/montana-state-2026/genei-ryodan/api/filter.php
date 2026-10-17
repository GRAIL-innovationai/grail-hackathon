<?php
/* ============================================================
   Mathub — profanity filter for discussions
   Censors curse words and slurs (with common obfuscations such as
   f*ck, sh1t, fuuuck) by replacing all but the first letter with *.
   The same list lives in assets/forum.js for the live preview; this
   server-side copy is the one that matters.
   ============================================================ */
declare(strict_types=1);

// Matched anywhere inside a word (safe: no common clean word contains them).
const MH_STRONG = ['fuck', 'fuk', 'shit', 'shite', 'bitch', 'cunt', 'asshole', 'arsehole', 'motherfuck', 'bullshit', 'dumbass', 'jackass', 'nigg', 'faggot', 'retard', 'pussy', 'pussies', 'whore', 'slut', 'wanker', 'twat', 'douche', 'bastard', 'goddamn', 'cocksuck', 'dickhead', 'dipshit', 'fucker', 'fag', 'tranny', 'wetback', 'dyke'];
// Matched only as a whole word (with a plural or -ed/-ing ending), because they appear inside clean words.
const MH_WORD = ['ass', 'arse', 'cock', 'dick', 'chink', 'kike', 'damn', 'crap', 'piss', 'tits', 'cum', 'wtf', 'stfu', 'prick', 'gook', 'coon'];

function mh_norm_token(string $s): string {
  $s = mb_strtolower($s);
  $s = strtr($s, ['@' => 'a', '4' => 'a', '3' => 'e', '1' => 'i', '!' => 'i', '|' => 'i', '0' => 'o', '$' => 's', '5' => 's', '7' => 't', '+' => 't', '€' => 'e', '£' => 'l']);
  $s = preg_replace('/[^a-z*]/', '', $s) ?? '';
  return preg_replace('/(.)\1{2,}/', '$1$1', $s) ?? '';
}
function mh_word_regex(string $w): string { $chars = str_split($w); $first = array_shift($chars); return $first . '+' . implode('', array_map(fn($c) => "[$c*]+", $chars)); }
function mh_is_profane(string $norm): bool {
  static $strong = null, $word = null;
  if ($strong === null) {
    $strong = '/(' . implode('|', array_map('mh_word_regex', MH_STRONG)) . ')/';
    $word = '/^(' . implode('|', array_map('mh_word_regex', MH_WORD)) . ')(?:s|es|ed|ing|er|ers)?$/';
  }
  if ($norm === '' || strlen($norm) < 2) return false;
  return (bool)preg_match($strong, $norm) || (bool)preg_match($word, $norm);
}
function mh_censor(string $text): string {
  return preg_replace_callback('/[^\s]+/u', function ($m) {
    $tok = $m[0];
    if (!preg_match('/^([^\p{L}\p{N}*]*)(.*?)([^\p{L}\p{N}*]*)$/us', $tok, $p)) return $tok;
    $core = $p[2]; if ($core === '') return $tok;
    if (!mh_is_profane(mh_norm_token($core))) return $tok;
    return $p[1] . mb_substr($core, 0, 1) . str_repeat('*', max(1, mb_strlen($core) - 1)) . $p[3];
  }, $text) ?? $text;
}
