import DOMPurify from 'dompurify'
import { marked } from 'marked'

/**
 * Render assistant/extension markdown to sanitized HTML. Model output can
 * quote hostile email content, so everything goes through DOMPurify before
 * it may touch the DOM. Images are forbidden here: the app CSP allows
 * remote images (the body frame needs that), so markdown must never be able
 * to embed a tracking pixel into the app document.
 */
export function renderMarkdown(text: string): string {
	const html = marked.parse(text, { gfm: true, breaks: true, async: false }) as string
	return DOMPurify.sanitize(html, { FORBID_TAGS: ['img', 'picture', 'source', 'svg'] })
}
