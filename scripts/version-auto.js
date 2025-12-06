import { readFileSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import path from 'node:path';
import url from 'node:url';

const ROOT = path.dirname(url.fileURLToPath(import.meta.url));
const pkgPath = path.join(ROOT, '..', 'package.json');

const readPkg = () => JSON.parse(readFileSync(pkgPath, 'utf8'));

function getPatchNumber() {
  try {
    const count = execSync('git rev-list --count HEAD', { encoding: 'utf8' }).trim();
    const n = Number.parseInt(count, 10);
    if (Number.isFinite(n)) return Math.max(n, 0) + 1;
  } catch (error) {
    console.warn('git rev-list unavailable, using timestamp for patch');
  }
  return Math.floor(Date.now() / 1000);
}

function updateVersion() {
  const pkg = readPkg();
  const [major = 0, minor = 0] = pkg.version.split('.').map((v) => Number.parseInt(v, 10) || 0);
  const patch = getPatchNumber();
  const nextVersion = `${major}.${minor}.${patch}`;
  pkg.version = nextVersion;
  writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);
  console.log(`Version set to ${nextVersion}`);

  try {
    execSync('git add package.json', { stdio: 'ignore' });
  } catch (error) {
    // best effort; ignore if git add fails
  }
}

updateVersion();
