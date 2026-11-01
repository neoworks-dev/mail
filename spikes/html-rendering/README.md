# HTML rendering spike

Can litehtml draw real mail well enough to replace the block model in the reading pane? This
renders a sample of the local mailbox twice, once with litehtml and once with headless
Chromium as the reference, and puts them side by side.

The litehtml side goes through `host/mail-html`, which lays the mail out into a display list,
and `render/src/paint.rs`, a tiny-skia painter standing in for the GPUI one. Text comes from
cosmic-text, as it does in GPUI on Linux. The `litehtml` crate's own CPU renderer is not used:
it skipped every image and left some mails blank.

The corpus is private mail, so it stays in `corpus/` and `output/`, both ignored by git. Remote
images are never fetched: both renderers get the same gray placeholder in their place, and
Chromium runs with networking disabled.

```sh
cd spikes/html-rendering
bun install
bun export-corpus.ts          # sample HTML mail from ~/.config/neoworks-mail/mail.db
cargo run --release --manifest-path render/Cargo.toml -- corpus output/litehtml
bun reference.ts              # Chromium screenshots into output/chromium
bun report.ts                 # output/report.html
```
