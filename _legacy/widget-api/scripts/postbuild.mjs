import { cp, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { access } from 'node:fs/promises';
import { constants } from 'node:fs';

const srcDir = resolve('src');
const destDir = resolve('dist', 'src');

try {
  await access(srcDir, constants.R_OK);
} catch {
  console.error('[postbuild] Skipping copy: src directory not found');
  process.exit(0);
}

await rm(destDir, { recursive: true, force: true });
await cp(srcDir, destDir, { recursive: true });
console.log('[postbuild] Copied src -> dist/src');



