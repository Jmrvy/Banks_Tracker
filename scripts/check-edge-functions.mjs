/**
 * Parse every edge function, so a syntax error cannot reach a deploy.
 *
 * The edge functions are Deno and live outside tsconfig's scope, so nothing
 * in CI ever read them: `typecheck:strict` covers src/utils and src/lib, the
 * unit tests import neither, and `vite build` bundles only the browser app.
 *
 * That gap shipped a real bug twice. The Trace system prompt is one long
 * template literal, and a backtick inside it has to be escaped; an unescaped
 * pair closes the literal and the file stops parsing. It was fixed once
 * (93a89ea) and reintroduced by the next commit that appended a sentence
 * (6c2a0f7), where it sat on main — the repo copy uncompilable while the
 * deployed copy, transcribed by hand, still worked. Nothing was watching.
 *
 * esbuild only parses here; it does not resolve the https:// and npm:
 * imports Deno uses, which is exactly what we want — this is a syntax gate,
 * not a typecheck.
 */
import { transformSync } from 'esbuild';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = 'supabase/functions';

const walk = (dir) =>
  readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    return statSync(path).isDirectory()
      ? walk(path)
      : path.endsWith('.ts')
        ? [path]
        : [];
  });

const files = walk(ROOT).sort();
const failures = [];

for (const file of files) {
  try {
    transformSync(readFileSync(file, 'utf8'), { loader: 'ts' });
  } catch (err) {
    for (const e of err.errors ?? [{ text: err.message }]) {
      failures.push(`${file}:${e.location?.line ?? '?'}  ${e.text}`);
    }
  }
}

if (failures.length) {
  console.error(`\n${failures.length} edge function syntax error(s):\n`);
  for (const f of failures) console.error(`  ${f}`);
  console.error('');
  process.exit(1);
}

console.log(`${files.length} edge function files parse cleanly.`);
