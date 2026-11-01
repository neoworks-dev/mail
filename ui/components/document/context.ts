// What every block of one document shares: its density and how links open.

import { getContext, setContext } from 'svelte'
import type { Inline } from '../../../shared/document'

export interface DocumentLink {
	label: string
	href: string
}

export interface DocumentContext {
	readonly dense: boolean
	openLink(href: string): void
	/** Lets the user pick one of several links, from a menu at a window position. */
	chooseLink(links: DocumentLink[], x: number, y: number): void
}

const DOCUMENT_CONTEXT = Symbol('neomail.document')

export function setDocumentContext(context: DocumentContext): void {
	setContext(DOCUMENT_CONTEXT, context)
}

export function useDocumentContext(): DocumentContext {
	const context = getContext<DocumentContext | undefined>(DOCUMENT_CONTEXT)
	if (!context) throw new Error('a document block was drawn outside DocumentView')
	return context
}

/** The distinct links in a run of inlines, labelled by their text. */
export function linksIn(inlines: Inline[]): DocumentLink[] {
	const byHref = new Map<string, DocumentLink>()
	for (const inline of inlines) {
		if (inline.kind !== 'text' || !inline.href) continue
		const existing = byHref.get(inline.href)
		if (existing) {
			existing.label = `${existing.label}${inline.text}`
			continue
		}
		byHref.set(inline.href, { label: inline.text, href: inline.href })
	}
	return [...byHref.values()].map((link) => ({ href: link.href, label: menuLabel(link) }))
}

function menuLabel(link: DocumentLink): string {
	const label = link.label.trim()
	if (label === '' || label === link.href) return shorten(link.href)
	return `${shorten(label)} — ${shorten(link.href)}`
}

function shorten(text: string): string {
	if (text.length <= 60) return text
	return `${text.slice(0, 57)}…`
}
