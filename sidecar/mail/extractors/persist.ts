// Writes parse-time extractions to `message_extractions`: the shipment under its own kind and
// all summary cards as one `cards` row. A shipment the agent found is never replaced.

import type { Database } from '../sqlite'
import type { MessageExtractions } from './index'

export const CARDS_KIND = 'cards'
const PARSER_SOURCE = 'parser'

export function saveMessageExtractions(
	database: Database,
	messageId: number,
	extractions: MessageExtractions
): void {
	if (extractions.shipment !== null && !hasAiShipment(database, messageId)) {
		const { source, ...payload } = extractions.shipment
		writeExtraction(database, messageId, 'shipment', source, JSON.stringify(payload))
	}
	if (extractions.cards.length > 0) {
		const payload = JSON.stringify({ cards: extractions.cards })
		writeExtraction(database, messageId, CARDS_KIND, PARSER_SOURCE, payload)
	}
}

function hasAiShipment(database: Database, messageId: number): boolean {
	const row = database
		.prepare(
			"SELECT 1 FROM message_extractions WHERE message_id = ? AND kind = 'shipment' AND source = 'ai'"
		)
		.get(messageId)
	return row !== undefined
}

function writeExtraction(
	database: Database,
	messageId: number,
	kind: string,
	source: string,
	payload: string
): void {
	database
		.prepare(
			`INSERT OR REPLACE INTO message_extractions (message_id, kind, source, payload)
			 VALUES (?, ?, ?, ?)`
		)
		.run(messageId, kind, source, payload)
}
