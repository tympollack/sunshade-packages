#!/usr/bin/env node
import fs from 'node:fs';
import { execSync } from 'node:child_process';

const increment = process.argv[2] || 'patch';
const targetPkg = process.argv[3] || 'all';

if (!['patch', 'minor', 'major'].includes(increment)) {
  console.error(`Error: Invalid increment '${increment}'. Must be 'patch', 'minor', or 'major'.`);
  process.exit(1);
}

let content = '---\n';
if (targetPkg === 'all' || targetPkg === '@digitalcanopy/ui') {
  content += `"@digitalcanopy/ui": ${increment}\n`;
}
if (targetPkg === 'all' || targetPkg === '@digitalcanopy/supabase') {
  content += `"@digitalcanopy/supabase": ${increment}\n`;
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
