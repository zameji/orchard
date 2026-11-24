import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { minify } from 'html-minifier-terser';

const sources = (await readdir('src')).filter((f) => f.endsWith('.html'));
if (sources.length !== 1) {
  console.error(`build: expected exactly one src/*.html, found ${sources.length}`);
  process.exit(1);
}

const input = `src/${sources[0]}`;
const out = await minify(await readFile(input, 'utf8'), {
  collapseWhitespace: true,
  removeComments: true,
  minifyCSS: true,
  minifyJS: true,
});

await mkdir('dist', { recursive: true });
await writeFile('dist/index.html', out);
console.log(`build: ${input} -> dist/index.html (${out.length} bytes)`);
