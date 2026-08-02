<script lang="ts">
	// Renders an email body inside a fully isolated iframe.
	//
	// Security model:
	// - sandbox with NO "allow-scripts" and NO "allow-same-origin": the content
	//   runs script-free in an opaque origin with no access to the app, its
	//   storage, or the preload bridge. "allow-popups" +
	//   "allow-popups-to-escape-sandbox" exist solely so a user-clicked link
	//   reaches the main process's window-open handler, which sends http(s) to
	//   the system browser and denies everything else.
	// - A CSP <meta> injected into the srcdoc document is the second layer:
	//   default-src 'none' kills every fetch a renderer bug might allow, and
	//   img-src decides remote-image loading — blocked by default, enabled only
	//   per message when the user asks.
	import type { AttachmentMeta } from '../../../shared/mail'

	interface Props {
		htmlBody: string | null
		textBody: string | null
		attachments?: AttachmentMeta[]
	}

	let { htmlBody, textBody, attachments = [] }: Props = $props()

	let imagesAllowed = $state(false)

	// cid: parts resolved to data: URIs from the locally stored attachments;
	// stays within the frame CSP (img-src data:), no network involved.
	let inlineImages = $state<Record<string, string>>({})

	$effect(() => {
		inlineImages = {}
		if (htmlBody === null || !htmlBody.includes('cid:')) return
		const referenced = attachments.filter((attachment) => attachment.contentId !== null)
		for (const attachment of referenced) {
			void window.neomail.attachments.data(attachment.attachmentId).then((data) => {
				if (!data || attachment.contentId === null) return
				inlineImages[attachment.contentId] = `data:${data.contentType};base64,${data.base64}`
			})
		}
	})

	function resolveInlineImages(html: string): string {
		return html.replace(/(src\s*=\s*["']?)cid:([^"'\s>]+)/gi, (match, prefix: string, cid: string) => {
			const dataUri = inlineImages[cid]
			if (!dataUri) return match
			return `${prefix}${dataUri}`
		})
	}

	const REMOTE_IMAGE_PATTERN = /\ssrc\s*=\s*["']?https?:/i

	const hasRemoteImages = $derived(htmlBody !== null && REMOTE_IMAGE_PATTERN.test(htmlBody))

	function escapeHtml(text: string): string {
		return text
			.replace(/&/g, '&amp;')
			.replace(/</g, '&lt;')
			.replace(/>/g, '&gt;')
	}

	function contentSecurityPolicy(allowImages: boolean): string {
		const imageSources = allowImages ? "data: cid: http: https:" : "data: cid:"
		return [
			"default-src 'none'",
			"style-src 'unsafe-inline'",
			`img-src ${imageSources}`
		].join('; ')
	}

	const BASE_STYLE = `
		/* Force light scheme: the frame sits on a white backdrop, and a dark
		   OS scheme would otherwise render default (white) text on it. */
		:root { color-scheme: light; }
		body {
			margin: 16px;
			background: #ffffff;
			color: #1f2937;
			font-family: ui-sans-serif, system-ui, sans-serif;
			font-size: 14px;
			line-height: 1.5;
			overflow-wrap: break-word;
		}
		pre.neomail-plaintext { white-space: pre-wrap; font-family: inherit; margin: 0; }
		img { max-width: 100%; }
	`

	const documentSource = $derived.by(() => {
		let body = ''
		if (htmlBody !== null) {
			body = resolveInlineImages(htmlBody)
		} else if (textBody !== null) {
			body = `<pre class="neomail-plaintext">${escapeHtml(textBody)}</pre>`
		}
		return (
			'<!doctype html><html><head>' +
			`<meta http-equiv="Content-Security-Policy" content="${contentSecurityPolicy(imagesAllowed)}">` +
			'<meta charset="utf-8">' +
			'<base target="_blank">' +
			`<style>${BASE_STYLE}</style>` +
			`</head><body>${body}</body></html>`
		)
	})
</script>

<div class="flex h-full flex-col">
	{#if hasRemoteImages && !imagesAllowed}
		<div class="border-line-faint bg-raised flex items-center justify-between border-b px-4 py-1.5 text-xs">
			<span class="text-muted">Remote images blocked</span>
			<button class="text-default underline" onclick={() => (imagesAllowed = true)}>
				Load images
			</button>
		</div>
	{/if}
	<iframe
		title="Email content"
		class="h-full w-full flex-1 border-0 bg-white"
		sandbox="allow-popups allow-popups-to-escape-sandbox"
		referrerpolicy="no-referrer"
		srcdoc={documentSource}
	></iframe>
</div>
