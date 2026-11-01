# Our changes to litehtml

litehtml-sys 0.2.5 as published, with these changes to the C++ engine in `vendor/litehtml`.
Every changed spot carries a `neoworks:` comment. Each fix has a minimal case in
`spikes/html-rendering/cases/` and a test in `host/mail-html/tests/layout.rs`.

- **Percentage heights under an auto-height parent compute to auto** (`render_item.cpp`).
  Upstream resolved them against the viewport height, so `height:100%` wrappers (PostHog,
  LinkedIn, Gojek) stretched to the window.
- **`align="center"` and `<center>` centre block children** (`-webkit-center` in `types.h`,
  `html_tag.cpp`, `el_div/td/tr.cpp`, `master_css.h`, `line_box.cpp`,
  `render_block_context.cpp`). Upstream only centred text, so centred mail columns sat on
  the left.
- **The width a block reports to a shrink-to-fit parent obeys max-width and min-width**
  (`render_block.cpp`). Inline-block columns with `width:100%; max-width:197px` made their
  table as wide as all of them unclamped (FlixBus).
- **Long words break after URL punctuation** (`document_container.cpp`). Words of 20 or more
  characters may wrap after `/ ? & = . - _ #`, so links wrap inside the pane instead of
  running past it. Browsers only do this under `word-break: break-word`.
- **A cell's fixed `height` sets its row's minimum height** (`render_table.cpp`). Spacer
  cells such as `<td height="32"></td>` collapsed to nothing.
- **Margins collapse through empty blocks** (`render_block_context.cpp`). Two empty `<p>`s
  left four margins of space instead of one.
- **Cells centre block content vertically** (`render_block_context.cpp`). Only inline content
  honoured `vertical-align: middle`.
- **Table cell measurements are cached** (`render_item.cpp`, `render_table.cpp`). Tables laid
  out every cell three times at every nesting level; a mail with tables nested 15 deep took
  1.5 s and now takes about 15 ms.
