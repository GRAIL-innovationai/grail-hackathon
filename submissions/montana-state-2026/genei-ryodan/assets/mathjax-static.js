/* MathJax settings for the static study-guide pages (learn/*). A file instead of an inline script, so those pages can
   forbid inline scripts in their Content-Security-Policy. MathJax itself loads next, from jsDelivr, pinned to 3.2.2. */
window.MathJax = { tex: { inlineMath: [['$', '$'], ['\\(', '\\)']], displayMath: [['$$', '$$'], ['\\[', '\\]']], processEscapes: true }, svg: { fontCache: 'global' }, options: { skipHtmlTags: ['script', 'noscript', 'style', 'textarea', 'pre', 'code'] } };
