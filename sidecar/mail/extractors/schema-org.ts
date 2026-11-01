// Reads the schema.org items a sender embedded in an HTML mail, from JSON-LD scripts and from
// microdata attributes (itemscope, itemtype, itemprop), into one shape. Gmail documents both
// formats for senders; real mail uses both.

import type { ChildNode, Element } from 'domhandler'
import { textContent } from 'domutils'
import { parseDocument } from 'htmlparser2'

export type SchemaValue = string | SchemaItem

export interface SchemaItem {
	/** The type without its schema.org prefix, such as `ParcelDelivery`; '' when untyped. */
	type: string
	properties: Record<string, SchemaValue[]>
}

const URL_ATTRIBUTE_TAGS = new Set(['a', 'area', 'link'])
const SOURCE_ATTRIBUTE_TAGS = new Set(['img', 'source', 'audio', 'video', 'iframe', 'embed'])

export function readSchemaItems(html: string): SchemaItem[] {
	if (!/schema\.org/i.test(html)) return []
	const document = parseDocument(html)
	const items: SchemaItem[] = []
	collectJsonLd(document.children, items)
	collectMicrodata(document.children, null, items)
	return items
}

/** `http://schema.org/OrderDelivered` → `OrderDelivered`; other strings stay as they are. */
export function stripSchemaPrefix(value: string): string {
	return value.replace(/^(?:https?:)?\/\/schema\.org\//i, '')
}

export function firstString(item: SchemaItem, property: string): string | null {
	for (const value of item.properties[property] || []) {
		if (typeof value === 'string' && value.trim() !== '') return value.trim()
	}
	return null
}

export function firstItem(item: SchemaItem, property: string): SchemaItem | null {
	for (const value of item.properties[property] || []) {
		if (typeof value !== 'string') return value
	}
	return null
}

/** A property that may be a plain name or an item with a `name`, such as `carrier`. */
export function nameOf(item: SchemaItem, property: string): string | null {
	const nested = firstItem(item, property)
	if (nested) return firstString(nested, 'name')
	return firstString(item, property)
}

function collectJsonLd(nodes: ChildNode[], items: SchemaItem[]): void {
	for (const node of nodes) {
		if (node.type !== 'script' && node.type !== 'tag') continue
		const element = node as Element
		if (element.name === 'script') {
			const scriptType = (element.attribs.type || '').toLowerCase()
			if (scriptType === 'application/ld+json') items.push(...parseJsonLd(textContent(element)))
			continue
		}
		collectJsonLd(element.children, items)
	}
}

function parseJsonLd(source: string): SchemaItem[] {
	let parsed: unknown
	try {
		parsed = JSON.parse(source)
	} catch {
		return []
	}
	const roots = Array.isArray(parsed) ? parsed : [parsed]
	const items: SchemaItem[] = []
	for (const root of roots) {
		if (!isRecord(root)) continue
		const graph = root['@graph']
		if (Array.isArray(graph)) {
			items.push(...graph.filter(isRecord).map(jsonLdItem))
			continue
		}
		items.push(jsonLdItem(root))
	}
	return items
}

function jsonLdItem(object: Record<string, unknown>): SchemaItem {
	const properties: Record<string, SchemaValue[]> = {}
	for (const [key, value] of Object.entries(object)) {
		if (key.startsWith('@')) continue
		const values = Array.isArray(value) ? value : [value]
		properties[key] = values.map(jsonLdValue).filter((entry) => entry !== null)
	}
	return { type: jsonLdType(object['@type']), properties }
}

function jsonLdValue(value: unknown): SchemaValue | null {
	if (isRecord(value)) return jsonLdItem(value)
	if (typeof value === 'string') return value
	if (typeof value === 'number' || typeof value === 'boolean') return String(value)
	return null
}

function jsonLdType(value: unknown): string {
	if (typeof value === 'string') return stripSchemaPrefix(value)
	if (Array.isArray(value) && typeof value[0] === 'string') return stripSchemaPrefix(value[0])
	return ''
}

/**
 * Walks the DOM keeping the innermost open item: an element with `itemscope` opens a new one,
 * nested under the current item when it also has `itemprop`, top-level otherwise.
 */
function collectMicrodata(
	nodes: ChildNode[],
	current: SchemaItem | null,
	items: SchemaItem[]
): void {
	for (const node of nodes) {
		if (node.type !== 'tag') continue
		const element = node as Element
		const propertyNames = (element.attribs.itemprop || '')
			.split(/\s+/)
			.filter((name) => name !== '')

		if (!('itemscope' in element.attribs)) {
			if (current) addProperties(current, propertyNames, microdataValue(element))
			collectMicrodata(element.children, current, items)
			continue
		}

		const item: SchemaItem = { type: microdataType(element), properties: {} }
		if (current && propertyNames.length > 0) addProperties(current, propertyNames, item)
		else items.push(item)
		collectMicrodata(element.children, item, items)
	}
}

function addProperties(item: SchemaItem, names: string[], value: SchemaValue): void {
	for (const name of names) {
		if (!item.properties[name]) item.properties[name] = []
		item.properties[name].push(value)
	}
}

function microdataType(element: Element): string {
	const firstType = (element.attribs.itemtype || '').trim().split(/\s+/)[0]
	return stripSchemaPrefix(firstType)
}

function microdataValue(element: Element): string {
	const attributes = element.attribs
	if (element.name === 'meta') return attributes.content || ''
	if (URL_ATTRIBUTE_TAGS.has(element.name)) return attributes.href || ''
	if (SOURCE_ATTRIBUTE_TAGS.has(element.name)) return attributes.src || ''
	if (element.name === 'time' && attributes.datetime) return attributes.datetime
	if ((element.name === 'data' || element.name === 'meter') && attributes.value) {
		return attributes.value
	}
	if (attributes.content) return attributes.content
	return textContent(element).replace(/\s+/g, ' ').trim()
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value)
}
