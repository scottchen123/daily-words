# AGENTS.md — How to add new words to this repo

You are an AI assistant. The user gives you **word material** (a screenshot, photo, list or text of English words
with meanings) and this repo's URL. Your job: **add one new JSON file to `words/`** and commit it to `main`.
That is the whole job. GitHub Actions validates the file and publishes the website automatically.

- Repo: https://github.com/scottchen123/daily-words
- Live site: https://scottchen123.github.io/daily-words/
- Learner: Chinese native speaker, English level B1–B2.

## Rules (do not break)
1. **Only add files in `words/`.** Do not edit `index.html`, `app.js`, `style.css`, `scripts/`, `.github/` or old word files
   unless the user explicitly asks you to fix something in them.
2. **One new file per batch**, named `words/YYYY-MM-DD.json` (the date the user gives the words, local time
   Asia/Shanghai unless the user says otherwise). If that file already exists, use `words/YYYY-MM-DD-2.json`, then `-3`, …
   Never overwrite an existing file — the learner's progress depends on old words staying.
3. File must be valid **UTF-8 JSON** (no comments, no trailing commas, straight double quotes `"`).
4. Copy `en`, `phonetic`, `pos`, `zh` **exactly from the user's material**. Only fill a field yourself if the material
   doesn't have it (e.g. phonetic missing → use British IPA like `/ˈwɜːd/`; meaning cut off in the image → write the
   most common meaning and tell the user which word you completed).
5. Write `sentence` and `sentence_zh` yourself (see "Sentence rules").

## File format (fixed — keep exactly this shape)
```json
{
  "date": "2026-11-10",
  "title": "第2组 Set 2",
  "words": [
    {
      "en": "advance",
      "phonetic": "/ədˈvɑːns/",
      "pos": "v./n.",
      "zh": "推进；促进；进步",
      "sentence": "Medical science has advanced a lot in the last fifty years.",
      "sentence_zh": "过去五十年里，医学进步了很多。"
    }
  ]
}
```

| Field | Required | Notes |
|---|---|---|
| `date` | yes | Must equal the date in the file name (`YYYY-MM-DD`). |
| `title` | no | Short label shown in the menu. Convention: `第N组 Set N` (N = number of existing word files + 1). A topic may follow, e.g. `第2组 Set 2 · Business`. |
| `words` | yes | Non-empty array, keep the user's order. |
| `en` | yes | The English word or phrase — this is the answer the learner types. Lowercase unless it is a proper noun. |
| `zh` | yes | Chinese meanings, separated by `；` (full-width semicolon). |
| `phonetic` | no | IPA with slashes, e.g. `/bɜːst/`. |
| `pos` | no | `n.` `v.` `adj.` `adv.` `prep.` `conj.` `phr.` — combine with `/`, e.g. `n./v.` |
| `sentence` | no (strongly wanted) | Example sentence, see rules below. |
| `sentence_zh` | no (strongly wanted) | Natural Chinese translation of `sentence`. |

No other fields. Unknown fields are ignored and produce a warning.

## Sentence rules
- B1–B2 level, natural everyday or news English, 8–16 words, one sentence.
- The sentence **must contain the word starting with exactly the letters of `en`**
  (`advance` → "advanced" ✓, `define` → "defined" ✓; `buy` → "bought" ✗). The website blanks this word for fill-in practice.
  Irregular forms don't match — use the base form or a regular `-s/-ed/-ing/-ly` form instead.
- Use the most common meaning (the first one in `zh`).
- Avoid names of real living people, politics, and anything sad or violent.

## How to commit
Any of these works:
- **git**: clone, add the file, `git commit -m "Add words YYYY-MM-DD (N words)"`, push to `main`.
- **GitHub API / MCP** (`create_or_update_file`, or `PUT /repos/scottchen123/daily-words/contents/words/YYYY-MM-DD.json`) on branch `main`
  with message `Add words YYYY-MM-DD (N words)`.
- **GitHub web**: Add file → Create new file → `words/YYYY-MM-DD.json` → Commit to `main`.

If you can run Node, validate first: `node scripts/build.mjs` (prints `OK: …` or `ERROR …`; no dependencies needed).

## After committing — verify
1. Check the latest run of **Actions → "Validate and deploy"** is green
   (`gh run list -R scottchen123/daily-words -L 1`). Red = the file has an error; read the log, fix the file, commit again.
   While it is red the live site keeps the old version, nothing breaks.
2. About 1 minute later the new set appears at the top of the menu on https://scottchen123.github.io/daily-words/
   (data is at `https://scottchen123.github.io/daily-words/data.json`).
3. Tell the user (in simple Chinese): the file you added, how many words, and any word whose meaning or phonetic you filled in yourself.

## How the site uses the data (for context only)
`scripts/build.mjs` merges all `words/*.json` into `_site/data.json`. The page has 5 modes — Write (默写),
Listen (听写), Cards (认词), Print (A4 默写纸), Summary (日/周/月总结 with most-missed words and spelling-error types) —
plus a spaced-review list ("Today's review", words return after 1, 2, 4, 7, 15, 30 days) and Favourites (收藏).
Progress, favourites and practice history are keyed by `en` (lowercased) and stored in the learner's browser,
so **never rename or delete existing words**. Repeating a word in a later file is allowed (it shares progress), but
avoid it unless the user wants it.
