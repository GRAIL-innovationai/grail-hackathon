// Check filenames and key-shaped literals without ever printing their contents.
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const root = __dirname;
const git = spawnSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], { cwd: root, encoding: 'utf8', windowsHide: true });
const tracked = git.status === 0;
const forbidden = file => /(^|\/)(\.env($|\.(?!example$))|data\/)|\.(sqlite|db)(-|$)|-recovery\.json$|\.(pem|key)$/i.test(file);
function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const full = path.join(dir, entry.name), relative = path.relative(root, full).replaceAll('\\', '/');
    if (entry.name.startsWith('.env') && entry.name !== '.env.example') return [];
    if (entry.isSymbolicLink() || ['.git', 'data', 'node_modules', 'tmp'].includes(entry.name)) return [];
    return entry.isDirectory() ? walk(full) : [relative];
  });
}
const files = tracked ? git.stdout.split('\0').filter(Boolean) : walk(root);
const issues = [];
for (const file of files) {
  if (forbidden(file)) { issues.push(`${file}: private file must not be published`); continue; }
  if (!/\.(js|cjs|json|md|html|css|ya?ml|toml)$|^\.env\.example$/.test(file)) continue;
  const full = path.join(root, file);
  if (!fs.existsSync(full) || fs.statSync(full).size > 1024 * 1024) continue;
  const content = fs.readFileSync(full, 'utf8');
  if (/\bgsk_[A-Za-z0-9]{20,}|\bAIza[A-Za-z0-9_-]{30,}|\bsk-(?:proj-)?[A-Za-z0-9_-]{24,}|-----BEGIN [A-Z ]*PRIVATE KEY-----/.test(content)) issues.push(`${file}: possible credential literal`);
}
if (issues.length) { console.error(issues.join('\n')); process.exitCode = 1; }
else console.log(`Public-source check passed (${files.length} ${tracked ? 'tracked and unignored' : 'candidate source'} files). ${tracked ? 'Private ignored paths are excluded; inspect staged content before publishing.' : 'No Git repository yet; private paths were excluded. Re-run after staging.'}`);
