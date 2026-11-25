import { copyFile, mkdir, readdir } from 'node:fs/promises';

const sources = (await readdir('src')).filter((f) => f.endsWith('.html'));
if (sources.length !== 1) {
  console.error(
    `build: expected exactly one src/*.html, found ${sources.length}`,
  );
  process.exit(1);
}

await mkdir('dist', { recursive: true });
await copyFile(`src/${sources[0]}`, 'dist/index.html');
console.log(`build: src/${sources[0]} -> dist/index.html (copied)`);
