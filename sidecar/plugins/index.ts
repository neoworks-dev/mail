// The sidecar's plugins. Everything the mail engine does is one of these; the kernel only
// provides `paths` and `rpc`. Order does not decide activation, since each plugin waits for
// what it injects, but it does decide shutdown, which runs from the end of the list: the
// outbox flushes before `send` goes, and both before the connections close.

import type { SidecarPlugin } from '../kernel/boot'
import { accounts } from './accounts'
import { classifier } from './classifier'
import { credentials } from './credentials'
import { digest } from './digest'
import { embeddings } from './embeddings'
import { extractions } from './extractions'
import { gmail } from './gmail'
import { library } from './library'
import { mailOps } from './mail-ops'
import { neo } from './neo'
import { notifications } from './notifications'
import { outbox } from './outbox'
import { reader } from './reader'
import { search } from './search'
import { send } from './send'
import { settings } from './settings'
import { store } from './store'
import { sync } from './sync'
import { system } from './system'
import { unsubscribe } from './unsubscribe'

export const corePlugins: SidecarPlugin[] = [
	system,
	settings,
	credentials,
	store,
	mailOps,
	sync,
	accounts,
	gmail,
	library,
	reader,
	search,
	embeddings,
	classifier,
	send,
	unsubscribe,
	extractions,
	digest,
	notifications,
	neo,
	outbox
]
