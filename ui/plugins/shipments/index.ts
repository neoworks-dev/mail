// Shipment tracking on messages about a parcel: a card under the body with the carrier, the
// tracking number, the status and a link, which can ask the carrier for the live status. A
// command in the thread toolbar's More menu asks the agent to find a shipment the parser missed.

import type { Context } from '@neoworks/extension-system'
import ShipmentCard from './ShipmentCard.svelte'

export const shipments = {
	name: 'shipments',
	inject: ['slots', 'sidecar', 'reader', 'assistant'],
	apply(ctx: Context) {
		ctx.slots.register('message.footer', {
			id: 'shipments',
			order: 10,
			component: ShipmentCard,
			props: { sidecar: ctx.sidecar, reader: ctx.reader, assistant: ctx.assistant }
		})
	}
}
