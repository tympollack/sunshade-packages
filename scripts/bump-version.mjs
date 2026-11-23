#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const increment = process.argv[2] || 'patch';
const targetPkg = process.argv[3] || 'all';

if (!['patch', 'minor', 'major'].includes(increment)) {
  console.error(`Error: Invalid increment '${increment}'. Must be 'patch', 'minor', or 'major'.`);
  process.exit(1);
}

const packagesDir = path.resolve(process.cwd(), 'packages');
const workspacePackages = fs
  .readdirSync(packagesDir, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => path.join(packagesDir, entry.name, 'package.json'))
  .filter((pkgPath) => fs.existsSync(pkgPath))
  .map((pkgPath) => JSON.parse(fs.readFileSync(pkgPath, 'utf8')))
  .filter((pkg) => pkg.name && pkg.private !== true)
  .map((pkg) => pkg.name);

const selectedPackages =
  targetPkg === 'all'
    ? workspacePackages
    : workspacePackages.filter((name) => name === targetPkg);

if (selectedPackages.length === 0) {
  console.error(`Error: Unknown target package '${targetPkg}'. Available: ${workspacePackages.join(', ')}`);
  process.exit(1);
}

let content = '---\n';
for (const pkgName of selectedPackages) {
  content += `"${pkgName}": ${increment}\n`;
}
content += `---\n\nManual ${increment} release for ${targetPkg}\n`;

if (!fs.existsSync('.changeset')) {
  fs.mkdirSync('.changeset');
}
fs.writeFileSync('.changeset/manual-trigger.md', content);

console.log(`✓ Created changeset for ${increment} bump of ${targetPkg}`);
console.log('Applying version bump with changeset version...');
execSync('npx changeset version', { stdio: 'inherit' });
console.log('Rebuilding packages...');
execSync('npm run build', { stdio: 'inherit' });
console.log(`\n🎉 Successfully bumped ${targetPkg} (${increment})!`);
