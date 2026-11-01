// Undo send: outgoing mail waits in the outbox for the undo window before the SMTP transaction
// runs. Unloading the plugin, which is also what quitting does, sends everything still
// waiting instead of dropping it.

import type { Context } from '@neoworks/extension-system'
import { SendOutbox } from '../../mail/outbox'

export const outbox = {
	name: 'outbox',
	inject: ['sender', 'rpc'],
	apply(ctx: Context) {
		const queue = new SendOutbox((input) => ctx.sender.sendMessage(input), {
			onSent: (sendId) => ctx.rpc.broadcast('send.done', { sendId }),
			onFailed: (sendId, errorMessage, input) =>
				ctx.rpc.broadcast('send.failed', { sendId, errorMessage, input })
		})
		ctx.effect(() => () => queue.flush(), 'flush outbox')
		ctx.rpc.handle('send.queue', (input) => queue.queue(input))
		ctx.rpc.handle('send.cancel', (sendId) => queue.cancel(sendId))
	}
}
