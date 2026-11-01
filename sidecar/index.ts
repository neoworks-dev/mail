// The sidecar's entry: the mail engine, run by Bun beside the native window. The host starts
// it with `bun sidecar/index.ts` and talks to it over stdin and stdout (see kernel/transport).

import './kernel/console'
import './kernel/events'
import { bootSidecar } from './kernel/boot'
import { corePlugins } from './plugins'

await bootSidecar(corePlugins)
