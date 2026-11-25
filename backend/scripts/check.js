import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';

const root = path.resolve(process.cwd(), 'src');
const files = [];

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (entry.isFile() && full.endsWith('.js')) files.push(full);
  }
}

walk(root);
// include prisma seed and config entry points
for (const extra of ['prisma/seed.js', 'scripts/check.js']) {
  const p = path.resolve(process.cwd(), extra);
  if (fs.existsSync(p)) files.push(p);
}

let failed = false;
for (const file of files) {
  const rel = path.relative(process.cwd(), file);
  const res = spawnSync(process.execPath, ['--check', file], { stdio: 'inherit' });
  if (res.status !== 0) {
    console.error(`Syntax check failed: ${rel}`);
    failed = true;
  }
}

if (failed) process.exit(1);
console.log(`Syntax OK (${files.length} files checked).`);
