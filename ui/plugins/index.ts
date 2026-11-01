// The UI's plugins. Everything the window shows and does is one of these; the kernel only
// provides the sidecar connection, settings, commands, keys and slots. Order does not decide
// activation, since each plugin waits for what it injects.

import type { UiPlugin } from '../kernel/loader'
import { accounts } from './accounts'
import { assistant } from './assistant'
import { composer } from './composer'
import { frame } from './frame'
import { mailbox } from './mailbox'
import { reader } from './reader'
import { theme } from './theme'

export const corePlugins: UiPlugin[] = [theme, accounts, mailbox, reader, composer, assistant, frame]
