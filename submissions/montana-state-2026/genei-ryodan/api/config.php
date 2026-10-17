<?php
/* ============================================================
   Mathub account server — configuration
   Edit this file after uploading to Hostinger. Nothing else needs
   changing. Keep it out of version control if you add a password.
   ============================================================ */
return [
  // Who may sign up. Exact domain or any subdomain (student.montana.edu, msu.montana.edu…).
  'allowed_domains' => ['montana.edu'],
  // Individual addresses allowed in addition to the domains above (for example your own non-MSU address).
  'extra_allowed_emails' => [],

  // Discussion moderators (account emails). Moderators can pin, lock, remove posts and comments, ban users and see the report queue.
  'moderators' => [],

  // Administrators (account emails). Everything a moderator can do, plus permanently delete any post or comment,
  // see the member list, and ban, unban or delete any account. Administrators are moderators automatically.
  'admins' => [],

  // Sender for verification / reset emails. Must be a mailbox that exists on your domain.
  'mail_from'       => 'info@mathub.space',
  'mail_from_name'  => 'Mathub',
  'site_name'       => 'Mathub',

  // How to send mail:
  //   'auto' = use SMTP when smtp_pass is filled in, otherwise PHP mail()
  //   'smtp' = always SMTP, 'mail' = always PHP mail(), 'log' = do not send, write codes to data/mail.log (testing only)
  'mail_mode'       => 'auto',

  // Hostinger mailbox SMTP (hPanel → Emails → Manage → Configuration). Fill smtp_pass with the password of info@mathub.space.
  'smtp_host'       => 'smtp.hostinger.com',
  'smtp_port'       => 465,          // 465 = SSL (recommended on Hostinger), 587 = STARTTLS
  'smtp_user'       => 'info@mathub.space',
  'smtp_pass'       => '',

  // Public address of the site, used in notification emails. Leave blank to use the current host.
  'site_url'        => '',

  // Canvas calendar feed (Calendar → Calendar Feed in Canvas). Easiest is to paste it in the admin panel (#/forum/admin);
  // setting it here instead overrides the admin panel. Events are matched to classes by the course name in [brackets].
  'canvas_feed'     => '',
  'canvas_course_match' => ['calc' => ['M 171', 'M171', 'Calculus I'], 'physics' => ['PHSX 220', 'PHSX220', 'Physics I'], 'precalc' => ['M 151', 'M151', 'Precalc'], 'writ' => ['WRIT 101', 'WRIT101', 'College Writing'], 'csci' => ['CSCI 127', 'CSCI127', 'Joy and Beauty of Data'], 'biob' => ['BIOB 160', 'BIOB160', 'Principles of Living Systems'], 'kin' => ['KIN 322', 'KIN322'], 'psyx' => ['PSYX 340', 'PSYX340', 'Psychological Disorders']],
  'timezone'        => 'America/Denver',

  // Verified staff, shown with a badge on the board: 'email' => 'Instructor' or 'TA'. Can also be managed in the admin panel.
  'staff'           => [],

  // Weekly digest emails go out on Sunday evening. They are sent a few at a time whenever the site is used, or all at once
  // when a Hostinger cron job calls  api/index.php?r=cron&key=<cron_key>  (leave blank to rely on site traffic).
  'cron_key'        => '',
  'digest_day'      => 0,    // 0 = Sunday … 6 = Saturday (local time, see 'timezone')
  'digest_hour'     => 17,   // send from 5 pm local time
  'reminder_hour'   => 18,   // evening reminders ("tomorrow: … due") go out from 6 pm local time to members who opted in

  // Optional. If set, GET api/index.php?r=stats with header X-Admin-Key: <this value> returns sign-up counts.
  'admin_key'       => '',

  // The plans (see docs/app-subscriptions.md): Mathub Pro (classes Bo writes from a syllabus, and making classes)
  // and Mathub Max (Pro, plus Bo the AI tutor). Secrets go in config.local.php, never in this file:
  //   revenuecat_secret  RevenueCat secret API key (sk_...)
  //   pro_web_link, max_web_link  the production Web Purchase Links from RevenueCat (https://pay.rev.cat/...), without a user id
  //   pro_web_price, max_web_price  the prices to show on the website
  //   plan_grants        accounts that get a plan without paying, for testing: ['someone@montana.edu' => 'max']
  //   revenuecat_v2_key, revenuecat_project  optional: a RevenueCat API v2 secret key (sk_...) allowed to write
  //                      subscriptions, and the project id (proj...), so "Cancel plan" cancels a website plan right
  //                      on Mathub; without them the Your plan page sends the student to RevenueCat's customer portal
  'revenuecat_secret' => '',
  'revenuecat_v2_key' => '',
  'revenuecat_project' => '',
  'pro_web_link'      => '',
  'max_web_link'      => '',
  'pro_web_price'     => '$15',
  'max_web_price'     => '$50',
  'pro_entitlement'   => 'pro',
  'max_entitlement'   => 'max',
  'plan_grants'       => [],

  // Classes Bo writes (Pro and Max) and Bo, the AI tutor (Max): api/ai.php. Put the Anthropic API key in
  // config.local.php as 'anthropic_key'. The defaults use the smallest model that does the job well; every
  // request is kept small by the server (class summaries, a short progress snapshot, the last few turns).
  'anthropic_key'     => '',
  'ai_model_tutor'    => 'claude-haiku-5-5',
  'ai_model_class'    => 'claude-haiku-5-5',
  'ai_tutor_monthly'  => 1500,   // questions to Bo per account per month
  'ai_tutor_daily'    => 300,
  'ai_class_monthly'  => 15,     // classes Bo writes per account per month

  // Talking with Bo out loud. Without a key, the browser's own speech recognition and voices are used (free).
  // With an OpenAI API key in config.local.php as 'openai_key', Bo speaks in a natural voice (about 1.5 cents a
  // minute of speech) and can listen on every browser, Firefox included (about a third of a cent a minute).
  'openai_key'        => '',
  'ai_tts_model'      => 'gpt-4o-mini-tts',
  'ai_tts_voice'      => 'ash',      // ash, ballad, coral, sage, verse or alloy; students can pick another
  'ai_stt_model'      => 'gpt-4o-mini-transcribe',
  'ai_voice_monthly'  => 300000,   // characters Bo speaks per account per month (about 5 hours), then the device's voice
  'ai_listen_monthly' => 36000,    // seconds Bo listens per account per month (10 hours) on browsers without speech recognition

  // Live calls with Bo (the same openai_key): a real-time voice conversation, speech to speech, through OpenAI's
  // Realtime API. Bo hears tone and pauses, answers in about half a second, and can be interrupted like a person.
  // The mini model keeps it to a few cents a minute; 'gpt-realtime-2.1' sounds the same and reasons better, at
  // several times the price. Without the key, calls fall back to basic voice (the browser hears, Claude answers).
  'ai_live_model'     => 'gpt-realtime-2.1-mini',
  'ai_live_voice'     => 'cedar',    // cedar, marin, ash, ballad, coral, sage or verse; students can pick another
  'ai_live_monthly'   => 300,        // minutes of live calls per account per month
  'ai_live_daily'     => 90,         // minutes per day
  'ai_live_call'      => 30,         // minutes per call (Bo can be called again right away)

  // Storage. Keep the database inside api/data (protected by .htaccess) or move it above public_html.
  'db_path'         => __DIR__ . '/data/mathub.sqlite',

  // Security tuning (sensible defaults).
  'code_ttl_minutes'    => 15,   // how long a 6-digit email code stays valid
  'session_days'        => 180,  // how long a login lasts on a device
  'max_data_bytes'      => 600000, // per course per user progress blob
];
