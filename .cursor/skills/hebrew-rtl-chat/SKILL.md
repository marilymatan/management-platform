---
name: hebrew-rtl-chat
description: >-
  Formats every assistant chat reply with RTL prose blocks and correct bidi for
  Hebrew, mixed Hebrew/English, or עברית. Duplicates the always-applied workspace
  rule hebrew-rtl-chat.mdc in this repository; use in other workspaces when the
  user wants Cursor chat to render Hebrew-first.
---

# Hebrew / RTL chat formatting

Mirror of `.cursor/rules/hebrew-rtl-chat.mdc` in this repo (that rule uses `alwaysApply: true`).

## Always

On every assistant reply, wrap all non-code narrative in:

```html
<div dir="rtl">

… markdown here …

</div>
```

Do not put fenced code inside that div; close it before code, or use `dir="ltr"` for code.

If HTML is stripped, start Hebrew-heavy paragraphs with RLM (U+200F, `‏`).

## Code

Keep code, paths, and logs LTR (plain fences or `<div dir="ltr">`).

## Mixed EN/HE

Use LRM (U+200E) / RLM (U+200F) around embedded English in Hebrew when order breaks.

## Exception

Skip the RTL wrapper only if the user explicitly requests all-LTR for that turn.

## Composer 2 and similar models

Some models (notably **Composer 2**) mishandle HTML in chat: `<div dir="rtl">` can leave visible `</div>`, break lists, or scramble bidi next to `**` and inline `` ` ``. **Fallback:** omit the wrapper for that turn; start Hebrew paragraphs and list items with **RLM** (`‏`); keep code fences unwrapped; use **LRM/RLM** around short English fragments when needed. Use the full `<div>` wrapper when the client renders it correctly.
