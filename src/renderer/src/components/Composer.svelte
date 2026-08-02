<script lang="ts">
	import { Button, LoadingSpinner } from '@neoworks-dev/ui'
	import { marked } from 'marked'
	import { mailState } from '../state/mail.svelte'
	import RecipientInput from './RecipientInput.svelte'

	const AUTOSAVE_DELAY_MS = 2000

	const draft = $derived(mailState.compose)

	let sending = $state(false)
	let errorMessage = $state<string | null>(null)
	let showPreview = $state(false)
	let draftSavedAt = $state<string | null>(null)

	const previewHtml = $derived.by(() => {
		if (!draft || !showPreview) return ''
		return marked.parse(draft.markdown, { gfm: true, breaks: true, async: false }) as string
	})

	// Autosave to the Drafts folder after typing settles; content fields only,
	// so the draftMessageId update after a save does not retrigger the effect.
	let lastSavedSnapshot = ''
	$effect(() => {
		if (!draft) return
		const snapshot = JSON.stringify([draft.to, draft.cc, draft.subject, draft.markdown, draft.attachments])
		if (draft.to === '' && draft.subject === '' && draft.markdown === '') return
		if (snapshot === lastSavedSnapshot) return

		const timer = setTimeout(() => {
			if (sending) return
			lastSavedSnapshot = snapshot
			void mailState
				.saveComposeDraft()
				.then(() => {
					draftSavedAt = new Date().toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
				})
				.catch(() => {})
		}, AUTOSAVE_DELAY_MS)
		return () => clearTimeout(timer)
	})

	function formatSize(bytes: number): string {
		if (bytes < 1024) return `${bytes} B`
		if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
		return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
	}

	async function send(event: SubmitEvent): Promise<void> {
		event.preventDefault()
		if (!draft) return
		sending = true
		errorMessage = null
		try {
			await mailState.sendCompose()
		} catch (error) {
			errorMessage = error instanceof Error ? error.message : String(error)
		} finally {
			sending = false
		}
	}

	async function aiDraft(): Promise<void> {
		errorMessage = null
		showPreview = false
		try {
			await mailState.generateReplyDraft()
		} catch (error) {
			errorMessage = error instanceof Error ? error.message : String(error)
		}
	}
</script>

{#if draft}
	<div class="fixed inset-0 z-40 flex items-center justify-center bg-black/40">
		<form
			onsubmit={send}
			class="bg-canvas border-line flex h-[80vh] w-[720px] max-w-[90vw] flex-col rounded-xl border shadow-lg"
		>
			<header class="border-line flex items-center justify-between border-b px-4 py-2.5">
				<h2 class="text-sm font-semibold">
					{draft.replyToMessageId !== null ? 'Reply' : 'New message'}
				</h2>
				<button
					type="button"
					class="text-faint hover:text-default text-sm"
					onclick={() => mailState.closeCompose()}
				>
					✕
				</button>
			</header>

			<div class="border-line-faint flex items-center gap-2 border-b px-4 py-1.5">
				<span class="text-faint w-12 shrink-0 text-xs">To</span>
				<RecipientInput
					bind:value={draft.to}
					accountId={draft.accountId}
					placeholder="recipient@example.com, …"
					required
				/>
			</div>
			<div class="border-line-faint flex items-center gap-2 border-b px-4 py-1.5">
				<span class="text-faint w-12 shrink-0 text-xs">Cc</span>
				<RecipientInput bind:value={draft.cc} accountId={draft.accountId} />
			</div>
			<div class="border-line-faint flex items-center gap-2 border-b px-4 py-1.5">
				<span class="text-faint w-12 shrink-0 text-xs">Subject</span>
				<input
					type="text"
					bind:value={draft.subject}
					class="w-full bg-transparent py-1 text-sm outline-none"
				/>
			</div>

			{#if showPreview}
				<div class="min-h-0 flex-1 overflow-y-auto px-5 py-3">
					<!-- eslint-disable-next-line svelte/no-at-html-tags -- own markdown render, not mail content -->
					<div class="prose prose-sm max-w-none text-sm">{@html previewHtml}</div>
				</div>
			{:else}
				<textarea
					bind:value={draft.markdown}
					placeholder="Write in markdown…"
					class="min-h-0 w-full flex-1 resize-none bg-transparent px-5 py-3 font-mono text-sm outline-none"
				></textarea>
			{/if}

			{#if draft.attachments.length > 0}
				<div class="border-line-faint flex flex-wrap gap-1.5 border-t px-4 py-2">
					{#each draft.attachments as attachment (attachment.path)}
						<span class="border-line bg-elevated flex items-center gap-1.5 rounded-lg border px-2 py-0.5 text-xs">
							<span class="max-w-48 truncate">{attachment.name}</span>
							<span class="text-faint">{formatSize(attachment.size)}</span>
							<button
								type="button"
								class="text-faint hover:text-default"
								title="Remove attachment"
								onclick={() => mailState.removeComposeAttachment(attachment.path)}
							>
								✕
							</button>
						</span>
					{/each}
				</div>
			{/if}

			<footer class="border-line flex items-center gap-3 border-t px-4 py-2.5">
				<button
					type="button"
					class="text-muted hover:text-default text-xs underline"
					onclick={() => (showPreview = !showPreview)}
				>
					{showPreview ? 'Edit' : 'Preview'}
				</button>
				<button
					type="button"
					class="text-muted hover:text-default text-xs underline"
					onclick={() => void mailState.addComposeAttachments()}
				>
					Attach
				</button>
				{#if draft.replyToMessageId !== null}
					{#if mailState.aiDrafting}
						<button
							type="button"
							class="text-muted hover:text-default flex items-center gap-1 text-xs underline"
							onclick={() => mailState.cancelReplyDraft()}
						>
							<LoadingSpinner size={12} /> Stop drafting
						</button>
					{:else}
						<button
							type="button"
							class="text-muted hover:text-default text-xs underline"
							title="Draft the reply with AI; text you already wrote is used as guidance"
							onclick={() => void aiDraft()}
						>
							AI draft
						</button>
					{/if}
				{/if}
				{#if draftSavedAt}
					<span class="text-faint text-xs">Draft saved {draftSavedAt}</span>
				{/if}
				{#if errorMessage}
					<p class="text-red min-w-0 flex-1 truncate text-xs" title={errorMessage}>{errorMessage}</p>
				{:else}
					<span class="flex-1"></span>
				{/if}
				<Button type="button" variant="ghost" onclick={() => mailState.closeCompose()}>Cancel</Button>
				<Button type="submit" variant="primary" disabled={sending}>
					{#if sending}
						<LoadingSpinner size={14} class="mr-2" /> Sending…
					{:else}
						Send
					{/if}
				</Button>
			</footer>
		</form>
	</div>
{/if}
