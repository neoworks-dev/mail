<!--
  The message being written, over the window: recipients, subject, the markdown body or its
  preview, attachments, and the footer with the agent's reply draft, the autosave state and Send.
  The body autosaves to Drafts once typing has settled for two seconds.
-->
<script lang="ts">
	import { Input, Scroll, Text, View } from '@neoworks/svelte-gpui/ui'
	import { Button, Chip, Divider, IconButton, LoadingSpinner, currentTheme, typeStyle } from '@neoworks/svelte-gpui-ui'
	import eyeIcon from '@phosphor-icons/core/regular/eye.svg'
	import paperclipIcon from '@phosphor-icons/core/regular/paperclip.svg'
	import pencilIcon from '@phosphor-icons/core/regular/pencil-simple.svg'
	import sendIcon from '@phosphor-icons/core/regular/paper-plane-tilt.svg'
	import sparkleIcon from '@phosphor-icons/core/regular/sparkle.svg'
	import closeIcon from '@phosphor-icons/core/regular/x.svg'
	import { DocumentView } from '../../components/document'
	import ModalScrim from '../../components/modal/ModalScrim.svelte'
	import Slot from '../../kernel/slots/Slot.svelte'
	import { extractQuote } from '../../lib/quote'
	import type { AccountsService } from '../accounts/service.svelte'
	import type { AssistantService } from '../assistant/service.svelte'
	import type { ComposerService } from '../composer/service.svelte'
	import { markdownToBlocks } from './markdown'
	import RecipientField from './RecipientField.svelte'
	import type { ComposerActions } from './actions'
	import { formatSize, formatTime } from './format'

	interface Props {
		composer: ComposerService
		accounts: AccountsService
		assistant: AssistantService
		actions: ComposerActions
	}

	let { composer, accounts, assistant, actions }: Props = $props()

	const AUTOSAVE_DELAY_MS = 2000

	const theme = $derived(currentTheme())
	const draft = $derived(composer.state.draft)
	let showPreview = $state(false)
	let errorMessage = $state<string | null>(null)
	let sending = $state(false)

	const previewBlocks = $derived.by(() => {
		if (!draft || !showPreview) return []
		return markdownToBlocks(draft.markdown)
	})

	const title = $derived.by(() => {
		if (draft && draft.replyToMessageId !== null) return 'Reply'
		return 'New message'
	})

	// Autosave on content only, so the draft id a save writes back does not start another save.
	let lastSavedSnapshot = ''
	$effect(() => {
		if (!draft) return
		const snapshot = JSON.stringify([draft.to, draft.cc, draft.subject, draft.markdown, draft.attachments])
		if (draft.to === '' && draft.subject === '' && draft.markdown === '') return
		if (snapshot === lastSavedSnapshot) return
		const timer = setTimeout(() => {
			if (sending) return
			lastSavedSnapshot = snapshot
			void composer.saveDraft().catch(() => {})
		}, AUTOSAVE_DELAY_MS)
		return () => clearTimeout(timer)
	})

	async function send(): Promise<void> {
		if (!draft || sending) return
		sending = true
		errorMessage = null
		try {
			await composer.send()
		} catch (error) {
			errorMessage = describe(error)
		} finally {
			sending = false
		}
	}

	async function attach(): Promise<void> {
		errorMessage = null
		try {
			await actions.pickAttachments()
		} catch (error) {
			errorMessage = describe(error)
		}
	}

	async function draftWithAssistant(): Promise<void> {
		if (!draft || draft.replyToMessageId === null) return
		errorMessage = null
		const message = await actions.replyTarget(draft.replyToMessageId)
		if (!message) {
			errorMessage = 'The message this replies to is no longer there.'
			return
		}
		const guidance = draft.markdown.replace(extractQuote(draft.markdown), '').trim()
		showPreview = false
		await assistant.draftReply(message, guidance, accounts.ownEmail(draft.accountId))
	}

	function describe(error: unknown): string {
		if (error instanceof Error) return error.message
		return String(error)
	}

	function shownError(): string | null {
		if (errorMessage !== null) return errorMessage
		return assistant.state.error
	}

	function previewLabel(): string {
		if (showPreview) return 'Edit'
		return 'Preview'
	}

	function previewIcon(): string {
		if (showPreview) return pencilIcon
		return eyeIcon
	}

	const fieldLabelStyle = $derived({ ...typeStyle('caption'), color: theme.colors.faint, width: 56 })
</script>

{#if draft}
	<ModalScrim onclose={() => composer.close()} panelStyle={{ width: 760, maxWidth: '100%', height: '86%' }}>
		<View style={{ direction: 'row', align: 'center', paddingLeft: 20, paddingRight: 8, paddingY: 8 }}>
			<Text style={{ ...typeStyle('title'), flex: 1 }}>{title}</Text>
			<Text style={{ ...typeStyle('caption'), color: theme.colors.faint, marginRight: 8 }}>
				From {accounts.ownEmail(draft.accountId)}
			</Text>
			<IconButton icon={closeIcon} label="Close" onpress={() => composer.close()} />
		</View>
		<Divider />
		<View style={{ direction: 'row', align: 'center', paddingX: 20, minHeight: 40 }}>
			<Text style={fieldLabelStyle}>To</Text>
			<RecipientField bind:value={draft.to} placeholder="recipient@example.com, …" suggest={(term) => actions.suggest(draft.accountId, term)} />
		</View>
		<Divider />
		<View style={{ direction: 'row', align: 'center', paddingX: 20, minHeight: 40 }}>
			<Text style={fieldLabelStyle}>Cc</Text>
			<RecipientField bind:value={draft.cc} suggest={(term) => actions.suggest(draft.accountId, term)} />
		</View>
		<Divider />
		<View style={{ direction: 'row', align: 'center', paddingX: 20, minHeight: 40 }}>
			<Text style={fieldLabelStyle}>Subject</Text>
			<Input
				bind:value={draft.subject}
				style={{ ...typeStyle('bodySmall'), flex: 1, minWidth: 0, background: 'transparent', color: theme.colors.text, paddingY: 6 }}
			/>
		</View>
		<Divider />
		{#if showPreview}
			<Scroll style={{ flex: 1, minHeight: 0 }}>
				<View style={{ paddingX: 24, paddingY: 16 }}>
					<DocumentView blocks={previewBlocks} onopenlink={actions.openLink} />
				</View>
			</Scroll>
		{:else}
			<Input
				bind:value={draft.markdown}
				multiline
				placeholder="Write in markdown…"
				style={{ flex: 1, minHeight: 0, paddingX: 24, paddingY: 16, background: 'transparent', color: theme.colors.text, fontFamily: 'mono', fontSize: 14, lineHeight: 21 }}
			/>
		{/if}
		{#if draft.attachments.length > 0}
			<Divider />
			<View style={{ direction: 'row', wrap: true, gap: 8, paddingX: 20, paddingY: 10 }}>
				{#each draft.attachments as attachment (attachment.path)}
					<Chip
						variant="input"
						label={`${attachment.name} · ${formatSize(attachment.size)}`}
						icon={paperclipIcon}
						onremove={() => composer.removeAttachment(attachment.path)}
					/>
				{/each}
			</View>
		{/if}
		<Divider />
		<View style={{ direction: 'row', align: 'center', gap: 8, paddingX: 16, paddingY: 12 }}>
			<Button variant="ghost" size="sm" icon={previewIcon()} onpress={() => (showPreview = !showPreview)}>
				<Text>{previewLabel()}</Text>
			</Button>
			<Button variant="ghost" size="sm" icon={paperclipIcon} onpress={() => void attach()}><Text>Attach</Text></Button>
			{#if draft.replyToMessageId !== null}
				{#if assistant.state.draftingReply}
					<View style={{ direction: 'row', align: 'center', gap: 6, paddingX: 8 }}>
						<LoadingSpinner size={14} thickness={3} />
						<Text style={{ ...typeStyle('caption'), color: theme.colors.muted }}>The agent is drafting…</Text>
					</View>
				{:else}
					<Button variant="ghost" size="sm" icon={sparkleIcon} disabled={!assistant.available} onpress={() => void draftWithAssistant()}>
						<Text>Draft with agent</Text>
					</Button>
				{/if}
			{/if}
			<Slot name="composer.toolbar" />
			<View style={{ flex: 1, minWidth: 0, direction: 'row', align: 'center', gap: 8 }}>
				{#if shownError() !== null}
					<Text style={{ ...typeStyle('caption'), color: theme.colors.danger, flex: 1, minWidth: 0, truncate: true }}>{shownError()}</Text>
				{:else if composer.state.savedAt !== null}
					<Text style={{ ...typeStyle('caption'), color: theme.colors.faint }}>Draft saved {formatTime(composer.state.savedAt)}</Text>
				{/if}
			</View>
			<Button variant="ghost" onpress={() => composer.close()}><Text>Cancel</Text></Button>
			<Button variant="primary" icon={sendIcon} disabled={sending} onpress={() => void send()}><Text>Send</Text></Button>
		</View>
	</ModalScrim>
{/if}
