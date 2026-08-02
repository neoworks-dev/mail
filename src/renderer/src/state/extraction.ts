// Parsing for user-triggered AI shipment extraction: the model is asked for
// bare JSON, but replies get validated strictly before anything is stored.

export interface ParsedShipment {
	carrier: string
	trackingNumber: string | null
	trackingUrl: string | null
	status?: string
	deliveryDate?: string
}

export function parseShipmentJson(raw: string): ParsedShipment | null {
	const start = raw.indexOf('{')
	const end = raw.lastIndexOf('}')
	if (start === -1 || end <= start) return null

	let parsed: Record<string, unknown>
	try {
		parsed = JSON.parse(raw.slice(start, end + 1))
	} catch {
		return null
	}
	if (typeof parsed.carrier !== 'string' || parsed.carrier.trim() === '') return null

	const result: ParsedShipment = {
		carrier: parsed.carrier.trim(),
		trackingNumber: optionalString(parsed.trackingNumber),
		trackingUrl: httpUrlOrNull(parsed.trackingUrl)
	}
	const status = optionalString(parsed.status)
	if (status) result.status = status
	const deliveryDate = optionalString(parsed.deliveryDate)
	if (deliveryDate) result.deliveryDate = deliveryDate
	return result
}

export interface ParsedActionItem {
	title: string
	due: string | null
}

const MAX_ACTION_ITEMS = 20

/** Parse the manual "extract action items" reply: a JSON array of items. */
export function parseActionsJson(raw: string): ParsedActionItem[] | null {
	const start = raw.indexOf('[')
	const end = raw.lastIndexOf(']')
	if (start === -1 || end <= start) return null

	let parsed: unknown
	try {
		parsed = JSON.parse(raw.slice(start, end + 1))
	} catch {
		return null
	}
	if (!Array.isArray(parsed)) return null

	const items: ParsedActionItem[] = []
	for (const entry of parsed.slice(0, MAX_ACTION_ITEMS)) {
		if (typeof entry !== 'object' || entry === null) continue
		const record = entry as Record<string, unknown>
		const title = optionalString(record.title)
		if (title === null) continue
		items.push({ title, due: optionalString(record.due) })
	}
	return items
}

export interface ParsedDigestItem {
	threadId: number
	note: string
}

export interface ParsedDigestGroup {
	title: string
	items: ParsedDigestItem[]
}

export interface ParsedDigest {
	intro: string | null
	groups: ParsedDigestGroup[]
}

/** Parse the structured digest reply: {intro?, groups:[{title, items:[{threadId, note}]}]}. */
export function parseDigestJson(raw: string): ParsedDigest | null {
	const start = raw.indexOf('{')
	const end = raw.lastIndexOf('}')
	if (start === -1 || end <= start) return null

	let parsed: Record<string, unknown>
	try {
		parsed = JSON.parse(raw.slice(start, end + 1))
	} catch {
		return null
	}
	if (!Array.isArray(parsed.groups)) return null

	const groups: ParsedDigestGroup[] = []
	for (const groupEntry of parsed.groups) {
		if (typeof groupEntry !== 'object' || groupEntry === null) continue
		const group = groupEntry as Record<string, unknown>
		const title = optionalString(group.title)
		if (title === null || !Array.isArray(group.items)) continue

		const items: ParsedDigestItem[] = []
		for (const itemEntry of group.items) {
			if (typeof itemEntry !== 'object' || itemEntry === null) continue
			const item = itemEntry as Record<string, unknown>
			const threadId = Number(item.threadId)
			if (!Number.isInteger(threadId) || threadId <= 0) continue
			items.push({ threadId, note: optionalString(item.note) || '' })
		}
		if (items.length > 0) groups.push({ title, items })
	}
	if (groups.length === 0) return null
	return { intro: optionalString(parsed.intro), groups }
}

function optionalString(value: unknown): string | null {
	if (typeof value !== 'string') return null
	const trimmed = value.trim()
	if (trimmed === '' || trimmed.toLowerCase() === 'null') return null
	return trimmed
}

function httpUrlOrNull(value: unknown): string | null {
	const text = optionalString(value)
	if (text === null) return null
	if (!/^https?:\/\//i.test(text)) return null
	return text
}
