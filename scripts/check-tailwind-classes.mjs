#!/usr/bin/env node
/**
 * Fails when a Tailwind class written in `src/` compiles to nothing.
 *
 * A class built on a value outside the theme scale is not an error — Tailwind
 * simply does not generate it, the build stays green, and the class reaches
 * the browser as dead text. `bg-primary/12` did exactly that: five tinted
 * icon halos and an empty-state mark rendered on bare backgrounds, and
 * nothing anywhere said so.
 *
 * The check is narrow on purpose. It looks only at opacity modifiers on the
 * design tokens (`bg-primary/12`, `border-warn/25`, …), which is where the
 * scale runs out, and it accepts a class that appears anywhere in the CSS —
 * a variant like `hover:bg-destructive/90` emits under its own selector.
 *
 * Run after `vite build`; it reads `dist/assets/*.css`.
 */
import fs from "node:fs";
import path from "node:path";

const TOKENS = [
  "primary", "secondary", "accent", "destructive", "muted", "muted-foreground",
  "pos", "neg", "warn", "success", "warning", "info", "line", "foreground",
  "background", "card", "popover", "border", "ring", "accent-deep",
];
const PROPS = [
  "bg", "text", "border", "ring", "fill", "stroke", "from", "to", "via",
  "divide", "outline", "shadow", "decoration", "placeholder", "caret",
];

const DIST = "dist/assets";
if (!fs.existsSync(DIST)) {
  console.error("check:classes — no dist/assets; run `npm run build` first.");
  process.exit(1);
}
const css = fs
  .readdirSync(DIST)
  .filter((f) => f.endsWith(".css"))
  .map((f) => fs.readFileSync(path.join(DIST, f), "utf8"))
  .join("");

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(e.name)) out.push(p);
  }
  return out;
}

const re = new RegExp(
  `\\b(?:${PROPS.join("|")})-(?:${TOKENS.join("|")})\\/(\\d+)\\b`,
  "g",
);

const sites = new Map(); // class -> Set(file)
for (const file of walk("src")) {
  const src = fs.readFileSync(file, "utf8");
  for (const m of src.matchAll(re)) {
    if (!sites.has(m[0])) sites.set(m[0], new Set());
    sites.get(m[0]).add(file);
  }
}

const dead = [...sites.entries()].filter(([cls]) => !css.includes(cls.replace("/", "\\/")));

if (dead.length === 0) {
  console.log(`check:classes — ${sites.size} token opacity classes, all generated.`);
  process.exit(0);
}

console.error(`check:classes — ${dead.length} class(es) compile to nothing:\n`);
for (const [cls, files] of dead) {
  console.error(`  ${cls}`);
  for (const f of [...files].sort()) console.error(`    ${f}`);
}
console.error(
  "\nAdd the step to `theme.extend.opacity` in tailwind.config.ts, or use one the scale has.",
);
process.exit(1);
