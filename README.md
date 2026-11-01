# Mail

Neoworks' mail client: a native window drawn by [GPUI](https://www.gpui.rs/) through
[svelte-gpui](../svelte-gpui), in the NeoWorks design system, with the neo agent
([neoworks-harness](../neoworks-harness)) built in. Everything it does is a plugin on
[`@neoworks/extension-system`](../extension-system).

## Running it

```sh
bun install
bun run host       # builds the native host into target/ (seeds GPUI from ../svelte-gpui/target)
bun run start      # builds the UI bundle and opens the window
bun run dev        # the same with hot reload: saving a file reloads the window
```

`bun run typecheck` checks the sidecar, the UI and the Svelte components; `bun run test` runs the tests.

## How it fits together

```
host/      Rust: the svelte-gpui window, and the relay to the sidecar (host/src/sidecar.rs)
ui/        the window: Svelte 5 in QuickJS, drawn natively
  kernel/    plugin kernel: sidecar connection, settings, commands, keymap, slots
  plugins/   everything you see: frame, sidebar, message list, reading pane, composer, ...
sidecar/   the mail engine under Bun: IMAP sync, SMTP, the SQLite store, embeddings, neo
  kernel/    plugin kernel: stdio frames, the rpc route service, paths
  plugins/   everything it does: store, sync, send, outbox, search, classifier, neo, ...
  mail/      the engine's modules the plugins are built from
shared/    what both sides agree on: routes and events, mail types, documents, assistant items
```

The host starts the sidecar (`bun sidecar/index.ts`) and passes frames between it and the window
without reading them, one JSON object per line. The window calls routes such as
`threads.list` and hears events such as `messages.changed`; `shared/routes.ts` lists them all.

**Everything is a plugin.** On both sides the kernel only provides the plumbing. A sidecar plugin
serves routes with `ctx.rpc.handle` and tells others about mail through context events
(`mail/messages-changed`, `mail/new-messages`, ...). A UI plugin provides a service, registers
commands and key bindings, and draws into slots that other plugins declare: the frame declares
`header.*`, `navigation`, `content`, `aside`, `overlays` and `onboarding`, the reading pane
declares `thread.header`, `thread.actions`, `message.banners`, `message.footer` and the keyed
`reading.view`. Unloading a plugin takes everything it added with it.

**Message bodies** are reduced to blocks in the sidecar (`sidecar/mail/document.ts`), since the
native window has no HTML engine: trackers are stripped first, scripts, styles and hidden
preheaders dropped, layout tables flattened, inline `cid:` images resolved, and remote images
blocked until you load them for a message.

**The assistant is neo.** The sidecar registers Mail as an app on the neo daemon and offers the
agent Mail's tools (`mail.search_email`, `mail.read_thread`, `mail.show_thread`, ...). The
assistant pane shows the agent's current session, the same one every other neo app shows.
Summaries, reply drafts, action items, shipment tracking and the daily digest are requests to
that agent, which hands the result back through tools such as `mail.write_reply` and
`mail.show_summary`. Without a running daemon (`neo up`) everything else works.

## Data

Mail keeps its data where the Electron version did, in `~/.config/neoworks-mail`: the database
(`mail.db`), the downloaded embedding model, `ui-settings.json` and the digest and tracking
settings. Passwords are encrypted under a key kept in the system keychain; rows written by the
Electron version still read.

| Env | |
|---|---|
| `NEOMAIL_DATA_DIR` | another data directory, for trial runs on a copy of the mailbox |
| `NEOMAIL_DISABLE` | sidecar plugins to leave out, comma separated, such as `sync,embeddings,neo` |
| `NEOMAIL_NEO` | `off` keeps Mail off the neo bus |
| `NEOMAIL_SIDECAR` | another sidecar entry script, or `off` |
| `NEOMAIL_BUN` | another `bun` |
| `NEOMAIL_GOOGLE_CLIENT_ID`, `NEOMAIL_GOOGLE_CLIENT_SECRET` | the Google OAuth client for Gmail sign-in |
| `NEOMAIL_DHL_API_KEY` | live DHL shipment tracking |
