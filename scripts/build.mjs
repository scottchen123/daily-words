// Validates every words/*.json file and builds the website into _site/.
// Usage: node scripts/build.mjs        (exit code 1 = a word file has an error)
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const wordsDir = path.join(root, "words");
const outDir = path.join(root, "_site");
const SITE_FILES = ["index.html", "app.js", "style.css"];

const FILE_NAME = /^(\d{4}-\d{2}-\d{2})(-\d+)?\.json$/;
const REQUIRED = ["en", "zh"];
const OPTIONAL = ["phonetic", "pos", "sentence", "sentence_zh", "roots", "hook", "mnemonic"];
const ALLOWED = new Set([...REQUIRED, ...OPTIONAL, "family"]);

const errors = [];
const warnings = [];
const seen = new Map();
const days = [];
const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const files = fs.readdirSync(wordsDir).filter((f) => f.endsWith(".json") && !f.startsWith("_")).sort();
for (const f of files) {
  const m = FILE_NAME.exec(f);
  if (!m) { errors.push(`${f}: file name must be YYYY-MM-DD.json (or YYYY-MM-DD-2.json for a 2nd set that day)`); continue; }
  let d;
  try { d = JSON.parse(fs.readFileSync(path.join(wordsDir, f), "utf8").replace(/^﻿/, "")); }
  catch (e) { errors.push(`${f}: invalid JSON – ${e.message}`); continue; }
  if (d.date !== m[1]) errors.push(`${f}: "date" must be "${m[1]}" (same as the file name)`);
  if (d.title != null && typeof d.title !== "string") errors.push(`${f}: "title" must be a string`);
  if (!Array.isArray(d.words) || d.words.length === 0) { errors.push(`${f}: "words" must be a non-empty array`); continue; }

  const words = [];
  d.words.forEach((w, i) => {
    const at = `${f} words[${i}]`;
    if (!w || typeof w !== "object") { errors.push(`${at}: must be an object`); return; }
    for (const k of REQUIRED) if (typeof w[k] !== "string" || !w[k].trim()) errors.push(`${at}: "${k}" is required`);
    for (const k of OPTIONAL) if (w[k] != null && typeof w[k] !== "string") errors.push(`${at}: "${k}" must be a string`);
    if (w.family != null && (!Array.isArray(w.family) || w.family.length > 5 || w.family.some((x) => typeof x !== "string" || !x.trim())))
      errors.push(`${at}: "family" must be a list of up to 5 strings, e.g. ["novel 新奇的", "renovate 翻新"]`);
    for (const k of Object.keys(w)) if (!ALLOWED.has(k)) warnings.push(`${at}: unknown field "${k}" is ignored`);
    if (typeof w.en !== "string" || !w.en.trim()) return;
    if (w.sentence && !new RegExp("\\b" + escRe(w.en.trim()), "i").test(w.sentence))
      warnings.push(`${at}: sentence does not contain "${w.en}" – fill-in-the-blank will not work for it`);
    const key = w.en.trim().toLowerCase();
    if (seen.has(key)) warnings.push(`${at}: "${w.en}" is already in ${seen.get(key)} (progress is shared)`);
    else seen.set(key, f);
    const clean = {};
    for (const k of ALLOWED) if (typeof w[k] === "string" && w[k].trim()) clean[k] = w[k].trim();
    if (Array.isArray(w.family) && w.family.length) clean.family = w.family.filter((x) => typeof x === "string").map((x) => x.trim());
    words.push(clean);
  });
  days.push({ id: f.replace(/\.json$/, ""), date: m[1], title: (d.title || "").trim(), words });
}
if (!days.length && !errors.length) errors.push("words/: no word files found");

for (const w of warnings) console.log("WARNING " + w);
if (errors.length) {
  for (const e of errors) console.error("ERROR   " + e);
  console.error(`\n${errors.length} error(s). Fix the word file(s) above. The website was NOT updated.`);
  process.exit(1);
}

fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir);
for (const f of SITE_FILES) fs.copyFileSync(path.join(root, f), path.join(outDir, f));
// Cache-busting: index.html links style.css / app.js with ?v=<content hash>, so browsers load new versions at once.
let html = fs.readFileSync(path.join(outDir, "index.html"), "utf8");
for (const f of ["style.css", "app.js"]) {
  const v = crypto.createHash("sha1").update(fs.readFileSync(path.join(root, f))).digest("hex").slice(0, 8);
  html = html.replace(new RegExp('(href|src)="' + f.replace(".", "\.") + '"'), '$1="' + f + "?v=" + v + '"');
}
fs.writeFileSync(path.join(outDir, "index.html"), html);
fs.writeFileSync(path.join(outDir, "data.json"), JSON.stringify({ built: new Date().toISOString(), days }));
fs.writeFileSync(path.join(outDir, ".nojekyll"), "");
const total = days.reduce((n, d) => n + d.words.length, 0);
console.log(`OK: ${days.length} set(s), ${total} words, ${warnings.length} warning(s) -> _site/`);
