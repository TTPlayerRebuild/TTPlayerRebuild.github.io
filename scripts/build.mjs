import { mkdir, cp } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
await mkdir(`${root}/dist`, { recursive: true });
// Only public assets enter the Pages artifact. No configuration or test files.
for (const name of ['index.html', 'assets', '.nojekyll']) {
  await cp(`${root}/public/${name}`, `${root}/dist/${name}`, { recursive: true });
}
console.log('Static website built in dist/');
