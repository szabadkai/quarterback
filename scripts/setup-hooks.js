import { execSync } from 'node:child_process';

// Set git hooks path to .husky without relying on deprecated husky install command
try {
  execSync('git rev-parse --git-dir', { stdio: 'ignore' });
  execSync('git config core.hooksPath .husky', { stdio: 'inherit' });
  console.log('Git hooks path set to .husky');
} catch (error) {
  console.warn('Skipping hook setup (not a git repo or git not available).');
}
