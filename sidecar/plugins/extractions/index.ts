// Shipments and action items found in messages: storing what the AI extracted on request, and
// looking a shipment's live status up with the carrier. Parse-time shipment heuristics run in
// the parser; this plugin only handles what the user asks for.

import type { Context } from '@neoworks/extension-system'
import { trackShipment } from '../../mail/tracking'

export const extractions = {
	name: 'extractions',
	inject: ['store', 'mailOps', 'paths', 'rpc'],
	apply(ctx: Context) {
		ctx.rpc.handle('messages.trackShipment', async (messageId) => {
			const extraction = ctx.store.getExtraction(messageId, 'shipment')
			if (!extraction) throw new Error('message has no shipment extraction')
			const payload = JSON.parse(extraction.payload) as {
				carrier: string
				trackingNumber: string | null
				deliveryDate?: string
				[key: string]: unknown
			}
			if (!payload.trackingNumber) throw new Error('no tracking number to look up')

			const result = await trackShipment(ctx.paths.data, payload.carrier, payload.trackingNumber)
			let deliveryDate = payload.deliveryDate
			if (result.deliveryDate !== null) deliveryDate = result.deliveryDate
			const merged = {
				...payload,
				status: result.status,
				deliveryDate,
				lastEvent: result.lastEvent,
				trackedAt: result.trackedAt
			}
			ctx.store.saveExtraction(messageId, 'shipment', extraction.source, JSON.stringify(merged))
		})

		ctx.rpc.handle('messages.saveShipment', (messageId, payload) => {
			if (typeof payload.carrier !== 'string' || payload.carrier === '') {
				throw new Error('extraction needs a carrier')
			}
			const cleaned = { ...payload }
			if (cleaned.trackingUrl !== null && !/^https?:\/\//i.test(String(cleaned.trackingUrl))) {
				cleaned.trackingUrl = null
			}
			ctx.mailOps.requireLocation(messageId)
			ctx.store.saveExtraction(messageId, 'shipment', 'ai', JSON.stringify(cleaned))
		})

		ctx.rpc.handle('messages.saveActions', (messageId, items) => {
			if (!Array.isArray(items)) throw new Error('items must be an array')
			const cleaned = items
				.filter((item) => typeof item.title === 'string' && item.title.trim() !== '')
				.map((item) => ({ title: item.title.trim(), due: cleanDue(item.due) }))
			ctx.mailOps.requireLocation(messageId)
			ctx.store.saveExtraction(messageId, 'actions', 'ai', JSON.stringify({ items: cleaned }))
		})
	}
}

function cleanDue(due: unknown): string | null {
	if (typeof due !== 'string') return null
	const trimmed = due.trim()
	if (trimmed === '') return null
	return trimmed
}
