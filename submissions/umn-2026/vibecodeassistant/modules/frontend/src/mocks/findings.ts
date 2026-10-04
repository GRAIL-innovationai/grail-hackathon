import type { Finding } from '../contracts/finding'

export const mockFindings: Finding[] = [
  {
    id: 'finding-runtime-critical-auth-loop',
    title: 'Login flow crashes after token refresh loop',
    category: 'runtime',
    severity: 'critical',
    verification: 'confirmed',
    source_modules: ['runtime', 'security'],
    location: {
      url: 'http://localhost:3000/login',
      element: 'form[data-testid="login-form"]',
    },
    evidence: {
      snippet: 'Unhandled promise rejection while refreshing token after login submit.',
      captured_output:
        'POST /api/session/refresh 500 Internal Server Error\nConsole: Cannot read properties of undefined (reading refreshToken)',
    },
    description_plain:
      'The app enters a token refresh loop immediately after sign-in and leaves the login screen unusable.',
    impact_plain:
      'Users can be locked out of the application and repeated retries may overload the auth backend.',
    cwe_id: 'CWE-670',
    fix_suggestion: {
      summary: 'Guard refresh retries and stop retrying after a single failed refresh response.',
      diff: `diff --git a/src/auth/session.ts b/src/auth/session.ts\n@@\n- return refreshSession()\n+ if (!refreshToken) throw new Error('Missing refresh token')\n+ return refreshSession({ retry: false })`,
    },
    review: {
      decision: 'confirmed',
      reason: 'Reproduced in the mocked login flow.',
      reviewer: 'Norman',
      timestamp: '2026-10-03T09:00:00.000Z',
    },
    fix_review: {
      decision: 'pending',
      reviewer: '',
      timestamp: '',
    },
  },
  {
    id: 'finding-static-high-route-leak',
    title: 'Unbounded event listeners in dashboard route',
    category: 'static',
    severity: 'high',
    verification: 'confirmed',
    source_modules: ['static'],
    location: {
      file: '/repo/src/routes/dashboard.tsx',
      line_start: 88,
      line_end: 123,
    },
    evidence: {
      snippet: 'window.addEventListener("message", onFrameMessage)\n// cleanup missing',
      captured_output: 'Potential memory leak: listener added inside effect without cleanup.',
    },
    description_plain:
      'A route component registers browser message listeners on each render and does not remove them.',
    impact_plain:
      'Repeated navigation can multiply listeners, slow the page, and duplicate actions.',
    cwe_id: 'CWE-401',
    fix_suggestion: {
      summary: 'Move the listener into a stable effect and remove it on cleanup.',
      diff: `diff --git a/src/routes/dashboard.tsx b/src/routes/dashboard.tsx\n@@\n- window.addEventListener('message', onFrameMessage)\n+ window.addEventListener('message', onFrameMessage)\n+ return () => window.removeEventListener('message', onFrameMessage)`,
    },
    review: {
      decision: 'pending',
      reason: '',
      reviewer: '',
      timestamp: '',
    },
    fix_review: {
      decision: 'pending',
      reviewer: '',
      timestamp: '',
    },
  },
  {
    id: 'finding-security-medium-unescaped-snippet',
    title: 'Captured XSS payload appears in app output',
    category: 'security',
    severity: 'medium',
    verification: 'hypothesis',
    source_modules: ['runtime', 'security'],
    location: {
      url: 'http://localhost:3000/comments',
      element: '.comment-preview',
    },
    evidence: {
      snippet: '<img src=x onerror=alert(1)>',
      captured_output: 'Preview rendered user supplied HTML in the comment workflow.',
    },
    description_plain:
      'User-controlled markup appears to be echoed back into the page without clear escaping guarantees.',
    impact_plain:
      'If the payload executes in the target app, an attacker could run arbitrary script in user sessions.',
    cwe_id: 'CWE-79',
    fix_suggestion: {
      summary: 'Escape untrusted comment content before rendering and add tests for hostile payloads.',
    },
    review: {
      decision: 'pending',
      reason: '',
      reviewer: '',
      timestamp: '',
    },
    fix_review: {
      decision: 'pending',
      reviewer: '',
      timestamp: '',
    },
  },
  {
    id: 'finding-compliance-low-missing-contact',
    title: 'Contact page not discoverable from the footer',
    category: 'compliance',
    severity: 'low',
    verification: 'confirmed',
    source_modules: ['compliance'],
    location: {
      url: 'http://localhost:3000/',
      element: 'footer',
    },
    evidence: {
      snippet: 'Footer links: Privacy Policy, Terms of Service',
      captured_output: 'Compliance crawl did not find a contact page or contact details.',
    },
    description_plain:
      'The site footer exposes privacy and terms links but omits a contact page or equivalent support details.',
    impact_plain:
      'Users may have no clear route to request support, legal notices, or privacy-related assistance.',
    fix_suggestion: {
      summary: 'Add a contact page and link it from the footer and support menus.',
    },
    review: {
      decision: 'escalated',
      reason: 'Need legal review on required minimum disclosures.',
      reviewer: 'Norman',
      timestamp: '2026-10-03T09:15:00.000Z',
    },
    fix_review: {
      decision: 'declined',
      reviewer: 'Norman',
      timestamp: '2026-10-03T09:30:00.000Z',
    },
  },
  {
    id: 'finding-security-info-exposed-secret',
    title: 'Demo API key exposed in client bundle',
    category: 'security',
    severity: 'info',
    verification: 'confirmed',
    source_modules: ['static', 'security'],
    location: {
      file: '/repo/src/config/demo.ts',
      line_start: 4,
      line_end: 4,
    },
    evidence: {
      snippet: 'sk_live_' + 'EXPOSEDSECRET1234567890TOKEN',
      captured_output: 'Static scan found a value matching a secret pattern in a client-side config file.',
    },
    description_plain:
      'A demo credential that resembles a live API key is committed to frontend source code.',
    impact_plain:
      'Even if unused, exposed credentials can leak into builds, logs, and screenshots, increasing operational risk.',
    cwe_id: 'CWE-798',
    fix_suggestion: {
      summary: 'Remove the credential from source control and replace it with server-side configuration.',
    },
    review: {
      decision: 'pending',
      reason: '',
      reviewer: '',
      timestamp: '',
    },
    fix_review: {
      decision: 'pending',
      reviewer: '',
      timestamp: '',
    },
  },
]

export const findingIds = mockFindings.map((finding) => finding.id)
