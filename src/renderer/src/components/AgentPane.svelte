<script lang="ts">
	import { Button, LoadingSpinner, Tooltip } from '@neoworks-dev/ui'
	import { onDestroy, onMount, tick } from 'svelte'
	import {
		ArrowCounterClockwiseIcon,
		BookmarkSimpleIcon,
		CaretDownIcon,
		DownloadSimpleIcon,
		GearSixIcon,
		GitBranchIcon,
		PencilSimpleIcon,
		PlusIcon,
		StopIcon,
		TrashIcon,
		XIcon
	} from '../icons'
	import {
		blobUrl,
		createSession,
		deleteSession,
		exportSessionJsonl,
		forkSession,
		getSession,
		listCommands,
		listModels,
		listSessionEvents,
		listSessions,
		listTools,
		patchSession,
		renameSession,
		sendBranch,
		sendCommand,
		setEventLabel,
		sendInterrupt,
		sendToolConfirmation,
		sendUnqueue,
		sendUserMessage,
		streamSession,
		uploadBlob,
		type NibServerEvent
	} from '../nib/client'
	import { renderMarkdown } from '../nib/markdown'
	import { applyEvent, emptyTranscript, type ToolItem, type UserItem } from '../nib/transcript'
	import {
		THINKING_LEVELS,
		type CommandInfo,
		type ModelsResponse,
		type SessionMeta,
		type SessionSnapshot,
		type ThinkingLevel,
		type ToolDisplay,
		type UiNode
	} from '../nib/types'
	import { mailState } from '../state/mail.svelte'
	import UiSurfaceView from './UiSurfaceView.svelte'

	const MAIL_PROMPT =
		'You are the assistant inside Neomail, a personal email client. The user talks to you ' +
		'about their mail. Use the mailbox tools before answering: search_email for full-text ' +
		'search, list_folders for the folder overview, list_recent for the newest messages of a ' +
		'folder (filter by sender or unread), read_email for one message, read_thread for a ' +
		'whole conversation and find_similar for semantically related mail. Call show_thread to ' +
		'open a conversation on screen for the user. Keep answers short.'

	/** Surfaces with this prefix are app commands, not things to render. */
	const APP_SURFACE_PREFIX = 'neomail:'

	let transcript = $state(emptyTranscript())
	let sessionId = $state<string | null>(null)
	let sessionTitle = $state('')
	let sessions = $state<SessionMeta[]>([])
	let snapshot = $state<SessionSnapshot | null>(null)
	let commands = $state<CommandInfo[]>([])
	let toolDisplays = $state<Record<string, ToolDisplay>>({})

	let draft = $state('')
	let startError = $state<string | null>(null)
	let connecting = $state(true)
	let loadingSession = $state(false)
	let pickerOpen = $state(false)
	let renaming = $state(false)
	let renameDraft = $state('')
	let slashIndex = $state(0)
	let stopStream: (() => void) | null = null
	let scrollElement = $state<HTMLElement | null>(null)

	let settingsOpen = $state(false)
	let models = $state<ModelsResponse | null>(null)
	let settingsError = $state<string | null>(null)
	/** Images pasted into the input, already uploaded as session blobs. */
	let pendingImages = $state<
		Array<{ ref: string; mediaType: string; name: string; previewUrl: string }>
	>([])
	let uploadingImage = $state(false)
	/** Tool approval whose input is being edited before allowing. */
	let editApprovalId = $state<string | null>(null)
	let editApprovalJson = $state('')
	let editApprovalError = $state<string | null>(null)
	/** Image upload failures, shown under the input. */
	let inputError = $state<string | null>(null)

	const running = $derived(transcript.running)
	const awaitingApproval = $derived(
		!transcript.running && transcript.stopReason === 'requires_action'
	)

	// Slash autocomplete while the draft is a bare /prefix (no arguments yet).
	const slashSuggestions = $derived.by((): CommandInfo[] => {
		const match = draft.match(/^\/(\S*)$/)
		if (!match) return []
		const prefix = match[1].toLowerCase()
		return commands.filter((command) => command.name.toLowerCase().startsWith(prefix)).slice(0, 8)
	})

	$effect(() => {
		if (slashIndex >= slashSuggestions.length) slashIndex = 0
	})

	onMount(async () => {
		try {
			const status = await window.neomail.nib.start()
			if (!status.running) {
				startError = status.error || 'agent server is not running'
				return
			}
			const [commandsResponse, toolsResponse] = await Promise.all([listCommands(), listTools()])
			commands = commandsResponse.commands
			for (const tool of toolsResponse.tools) {
				if (tool.display) toolDisplays[tool.name] = tool.display
			}

			await refreshSessions()
			if (sessions.length > 0) {
				await openSession(sessions[0].id)
			} else {
				await newSession()
			}
		} catch (error) {
			startError = error instanceof Error ? error.message : String(error)
		} finally {
			connecting = false
		}
	})

	onDestroy(() => {
		if (stopStream) stopStream()
	})

	async function refreshSessions(): Promise<void> {
		const result = await listSessions()
		sessions = result.sessions
	}

	async function openSession(id: string): Promise<void> {
		if (stopStream) stopStream()
		loadingSession = true
		pickerOpen = false
		settingsOpen = false
		editApprovalId = null
		inputError = null
		// Blob refs are per-session; pending attachments cannot cross over.
		clearPendingImages()
		try {
			transcript = emptyTranscript()
			sessionId = id
			const backlog = await listSessionEvents(id, 0)
			for (const event of backlog.events) {
				// No navigation side effects while replaying history.
				if (isAppSurface(event)) continue
				applyEvent(transcript, event)
			}
			snapshot = await getSession(id)
			sessionTitle = snapshot.title
			stopStream = streamSession(id, backlog.lastSeq, onServerEvent)
			void scrollToBottom()
		} finally {
			loadingSession = false
		}
	}

	async function newSession(): Promise<void> {
		const session = await createSession({ title: 'Mail assistant', appendSystemPrompt: MAIL_PROMPT })
		await refreshSessions()
		await openSession(session.id)
	}

	async function removeSession(id: string): Promise<void> {
		await deleteSession(id)
		await refreshSessions()
		if (sessionId !== id) return
		if (sessions.length > 0) {
			await openSession(sessions[0].id)
		} else {
			await newSession()
		}
	}

	function isAppSurface(event: NibServerEvent): boolean {
		return event.type === 'ui.surface' && event.surfaceId.startsWith(APP_SURFACE_PREFIX)
	}

	function onServerEvent(event: NibServerEvent): void {
		if (isAppSurface(event)) {
			if (event.type === 'ui.surface' && event.view !== null) handleAppSurface(event.surfaceId, event.view)
			return
		}
		applyEvent(transcript, event)
		if (event.type === 'session.status_idle') {
			void refreshSnapshot()
		}
		void scrollToBottom()
	}

	/** The agent navigating the app: fire-and-forget commands via surfaces. */
	function handleAppSurface(surfaceId: string, view: UiNode): void {
		if (surfaceId !== 'neomail:open-thread' || view.kind !== 'keyValue') return
		const entries = new Map(view.entries.map((entry) => [entry.key, entry.value]))
		const accountId = Number(entries.get('accountId'))
		const threadId = Number(entries.get('threadId'))
		if (!Number.isFinite(accountId) || !Number.isFinite(threadId)) return
		void mailState.openThreadById(accountId, threadId)
	}

	async function refreshSnapshot(): Promise<void> {
		if (!sessionId) return
		snapshot = await getSession(sessionId)
		sessionTitle = snapshot.title
	}

	async function submit(event: SubmitEvent): Promise<void> {
		event.preventDefault()
		const text = draft.trim()
		if (!sessionId) return
		if (text === '' && pendingImages.length === 0) return
		draft = ''
		inputError = null
		const images = pendingImages.map((image) => ({ ref: image.ref, mediaType: image.mediaType }))
		clearPendingImages()

		const commandMatch = text.match(/^\/(\S+)\s*([\s\S]*)$/)
		const known = commandMatch ? commands.find((entry) => entry.name === commandMatch[1]) : undefined
		if (commandMatch && known) {
			await sendCommand(sessionId, known.name, commandMatch[2])
		} else if (running) {
			// Busy agent: queue as a follow-up instead of steering mid-turn.
			await sendUserMessage(sessionId, text, 'followUp', images)
			void refreshSnapshot()
		} else {
			await sendUserMessage(sessionId, text, undefined, images)
		}
		void scrollToBottom()
	}

	function applySuggestion(command: CommandInfo): void {
		draft = `/${command.name} `
	}

	function onInputKeydown(event: KeyboardEvent): void {
		if (slashSuggestions.length > 0) {
			if (event.key === 'ArrowDown') {
				event.preventDefault()
				slashIndex = Math.min(slashIndex + 1, slashSuggestions.length - 1)
				return
			}
			if (event.key === 'ArrowUp') {
				event.preventDefault()
				slashIndex = Math.max(slashIndex - 1, 0)
				return
			}
			if (event.key === 'Tab' || event.key === 'Enter') {
				event.preventDefault()
				applySuggestion(slashSuggestions[slashIndex])
				return
			}
		}
		if (event.key === 'Enter' && !event.shiftKey) {
			event.preventDefault()
			;(event.currentTarget as HTMLTextAreaElement).form?.requestSubmit()
		}
	}

	async function approve(
		item: ToolItem,
		result: 'allow' | 'deny' | 'always_session' | 'always_project'
	): Promise<void> {
		if (!sessionId) return
		item.needsApproval = false
		await sendToolConfirmation(sessionId, item.toolUseId, result)
	}

	function startEditApproval(item: ToolItem): void {
		editApprovalId = item.toolUseId
		editApprovalJson = JSON.stringify(item.input ?? {}, null, 2)
		editApprovalError = null
	}

	/** Allow with edited arguments; the server re-validates and may reject. */
	async function approveEdited(item: ToolItem): Promise<void> {
		if (!sessionId) return
		let parsed: unknown
		try {
			parsed = JSON.parse(editApprovalJson)
		} catch {
			editApprovalError = 'Not valid JSON.'
			return
		}
		editApprovalId = null
		editApprovalError = null
		item.needsApproval = false
		await sendToolConfirmation(sessionId, item.toolUseId, 'allow', parsed)
	}

	function isBookmarked(eventId: string): boolean {
		if (!snapshot || !snapshot.labels) return false
		return Boolean(snapshot.labels[eventId])
	}

	async function toggleBookmark(eventId: string): Promise<void> {
		if (!sessionId || !snapshot) return
		const next = isBookmarked(eventId) ? null : 'bookmark'
		const result = await setEventLabel(sessionId, eventId, next)
		snapshot.labels = result.labels
	}

	/** Rewind to just before this user message and prefill it for editing. */
	async function retryFrom(item: UserItem): Promise<void> {
		if (!sessionId || running) return
		await sendBranch(sessionId, Math.max(0, item.seq - 1))
		draft = item.text
	}

	/** Fork the whole session at its head and switch to the child. */
	async function forkCurrentSession(): Promise<void> {
		if (!sessionId || !snapshot) return
		settingsOpen = false
		const child = await forkSession(sessionId, snapshot.lastSeq)
		await refreshSessions()
		await openSession(child.id)
	}

	async function exportTranscript(): Promise<void> {
		if (!sessionId) return
		settingsOpen = false
		const text = await exportSessionJsonl(sessionId)
		const blob = new Blob([text], { type: 'application/jsonl' })
		const url = URL.createObjectURL(blob)
		const anchor = document.createElement('a')
		anchor.href = url
		anchor.download = `nib-${sessionId}.jsonl`
		anchor.click()
		URL.revokeObjectURL(url)
	}

	async function toggleSettings(): Promise<void> {
		settingsOpen = !settingsOpen
		if (!settingsOpen || models !== null) return
		try {
			models = await listModels()
		} catch (error) {
			settingsError = error instanceof Error ? error.message : String(error)
		}
	}

	async function changeModel(provider: string, model: string): Promise<void> {
		if (!sessionId) return
		try {
			const result = await patchSession(sessionId, { provider, model })
			snapshot = result.session
		} catch (error) {
			settingsError = error instanceof Error ? error.message : String(error)
		}
	}

	async function changeThinkingLevel(thinkingLevel: ThinkingLevel): Promise<void> {
		if (!sessionId) return
		try {
			const result = await patchSession(sessionId, { thinkingLevel })
			snapshot = result.session
		} catch (error) {
			settingsError = error instanceof Error ? error.message : String(error)
		}
	}

	/** Pasted images upload as session blobs and attach to the next message. */
	async function onInputPaste(event: ClipboardEvent): Promise<void> {
		if (!sessionId || !event.clipboardData) return
		const files = [...event.clipboardData.files].filter((file) => file.type.startsWith('image/'))
		if (files.length === 0) return
		event.preventDefault()
		uploadingImage = true
		try {
			for (const file of files) {
				const descriptor = await uploadBlob(sessionId, file, file.type, file.name)
				pendingImages = [
					...pendingImages,
					{
						ref: descriptor.ref,
						mediaType: descriptor.mediaType,
						name: file.name || 'pasted image',
						previewUrl: URL.createObjectURL(file)
					}
				]
			}
		} catch (error) {
			inputError = error instanceof Error ? error.message : String(error)
		} finally {
			uploadingImage = false
		}
	}

	function removePendingImage(ref: string): void {
		for (const image of pendingImages) {
			if (image.ref === ref) URL.revokeObjectURL(image.previewUrl)
		}
		pendingImages = pendingImages.filter((image) => image.ref !== ref)
	}

	function clearPendingImages(): void {
		for (const image of pendingImages) {
			URL.revokeObjectURL(image.previewUrl)
		}
		pendingImages = []
	}

	async function interrupt(): Promise<void> {
		if (!sessionId) return
		await sendInterrupt(sessionId)
	}

	async function unqueue(messageId: string): Promise<void> {
		if (!sessionId) return
		await sendUnqueue(sessionId, messageId)
		void refreshSnapshot()
	}

	async function commitRename(): Promise<void> {
		renaming = false
		if (!sessionId || renameDraft.trim() === '' || renameDraft === sessionTitle) return
		await renameSession(sessionId, renameDraft.trim())
		sessionTitle = renameDraft.trim()
		void refreshSessions()
	}

	/** Tool calls that reference a message or thread open it on click. */
	function toolOpensEmail(item: ToolItem): boolean {
		if (item.toolName === 'read_email') return true
		return item.toolName === 'read_thread' || item.toolName === 'show_thread'
	}

	async function openFromTool(item: ToolItem): Promise<void> {
		const input = (item.input ?? {}) as Record<string, unknown>
		if (item.toolName === 'read_email') {
			const messageId = Number(input.messageId)
			if (!Number.isFinite(messageId)) return
			const location = await window.neomail.messages.locate(messageId)
			if (location) await mailState.openThreadById(location.accountId, location.threadId)
			return
		}
		const threadId = Number(input.threadId)
		if (!Number.isFinite(threadId)) return
		const accountId = await window.neomail.threads.locate(threadId)
		if (accountId !== null) await mailState.openThreadById(accountId, threadId)
	}

	/** display.label templates: {field} and {a|b} pick fields from the input. */
	function toolLabel(item: ToolItem): string {
		const display = toolDisplays[item.toolName]
		if (!display || !display.label) return item.toolName
		const input = (item.input ?? {}) as Record<string, unknown>
		return display.label.replace(/\{([^}]+)\}/g, (_match, expression: string) => {
			for (const field of expression.split('|')) {
				const value = input[field.trim()]
				if (value !== undefined && value !== null && value !== '') return String(value)
			}
			return ''
		})
	}

	function resultView(item: ToolItem): string {
		const display = toolDisplays[item.toolName]
		if (!display || !display.result) return 'text'
		return display.result
	}

	function compactJson(value: unknown): string {
		const json = JSON.stringify(value)
		if (!json || json === '{}') return ''
		if (json.length <= 120) return json
		return `${json.slice(0, 120)}…`
	}

	function formatTokens(count: number): string {
		if (count < 1000) return String(count)
		return `${(count / 1000).toFixed(1)}k`
	}

	function relativeTime(iso: string): string {
		const deltaMs = Date.now() - new Date(iso).getTime()
		const minutes = Math.round(deltaMs / 60_000)
		if (minutes < 1) return 'now'
		if (minutes < 60) return `${minutes}m`
		const hours = Math.round(minutes / 60)
		if (hours < 24) return `${hours}h`
		return `${Math.round(hours / 24)}d`
	}

	async function scrollToBottom(): Promise<void> {
		await tick()
		if (!scrollElement) return
		scrollElement.scrollTop = scrollElement.scrollHeight
	}
</script>

<aside class="flex min-w-0 flex-1 flex-col">
	<header class="border-line-faint flex items-center gap-1.5 border-b px-3 py-2">
		{#if renaming}
			<input
				bind:value={renameDraft}
				onblur={() => void commitRename()}
				onkeydown={(event) => {
					if (event.key === 'Enter') void commitRename()
					if (event.key === 'Escape') renaming = false
				}}
				class="border-line bg-canvas min-w-0 flex-1 rounded-lg border px-2 py-1 text-sm outline-none"
			/>
		{:else}
			<button
				class="hover:bg-hover flex min-w-0 flex-1 items-center gap-1 rounded-lg px-2 py-1 text-left"
				title="Switch session"
				onclick={() => (pickerOpen = !pickerOpen)}
			>
				<span class="truncate text-sm font-semibold">{sessionTitle || 'Assistant'}</span>
				<CaretDownIcon size={12} class="shrink-0" />
			</button>
		{/if}
		<Tooltip text="Rename session" placement="bottom">
			<Button
				variant="ghost"
				size="sm"
				icon={PencilSimpleIcon}
				onclick={() => {
					renameDraft = sessionTitle
					renaming = true
				}}
			/>
		</Tooltip>
		<Tooltip text="Session settings" placement="bottom">
			<Button
				variant={settingsOpen ? 'surface' : 'ghost'}
				size="sm"
				icon={GearSixIcon}
				onclick={() => void toggleSettings()}
			/>
		</Tooltip>
		<Tooltip text="New session" placement="bottom">
			<Button variant="ghost" size="sm" icon={PlusIcon} onclick={() => void newSession()} />
		</Tooltip>
	</header>

	{#if settingsOpen && snapshot}
		<div class="border-line-faint space-y-2.5 border-b px-3 py-2.5 text-xs">
			<label class="flex items-center gap-2">
				<span class="text-faint w-16 shrink-0">Model</span>
				<select
					class="border-line bg-canvas min-w-0 flex-1 rounded-lg border px-2 py-1 outline-none"
					value={`${snapshot.provider}/${snapshot.model}`}
					onchange={(event) => {
						const [provider, ...rest] = event.currentTarget.value.split('/')
						void changeModel(provider, rest.join('/'))
					}}
				>
					{#if models}
						{#each models.providers as providerEntry (providerEntry.provider)}
							{#each providerEntry.models as model (model.id)}
								<option value={`${providerEntry.provider}/${model.id}`}>
									{model.displayName || model.id}
								</option>
							{/each}
						{/each}
					{:else}
						<option value={`${snapshot.provider}/${snapshot.model}`}>{snapshot.model}</option>
					{/if}
				</select>
			</label>
			<label class="flex items-center gap-2">
				<span class="text-faint w-16 shrink-0">Thinking</span>
				<select
					class="border-line bg-canvas min-w-0 flex-1 rounded-lg border px-2 py-1 outline-none"
					value={snapshot.thinkingLevel}
					onchange={(event) => void changeThinkingLevel(event.currentTarget.value as never)}
				>
					{#each THINKING_LEVELS as level (level)}
						<option value={level}>{level}</option>
					{/each}
				</select>
			</label>
			<div class="flex gap-2">
				<Button size="sm" icon={GitBranchIcon} onclick={() => void forkCurrentSession()}>
					Fork session
				</Button>
				<Button size="sm" icon={DownloadSimpleIcon} onclick={() => void exportTranscript()}>
					Export JSONL
				</Button>
			</div>
			{#if snapshot.parentSessionId}
				<p class="text-faint">Forked from another session at seq {snapshot.forkedAfterSeq}.</p>
			{/if}
			{#if settingsError}
				<p class="text-red">{settingsError}</p>
			{/if}
		</div>
	{/if}

	{#if pickerOpen}
		<div class="border-line-faint max-h-64 overflow-y-auto border-b">
			{#each sessions as session (session.id)}
				<div class="hover:bg-hover flex items-center gap-1 px-3 py-1.5">
					<button
						class="flex min-w-0 flex-1 items-baseline gap-2 text-left"
						onclick={() => void openSession(session.id)}
					>
						<span class="truncate text-sm {session.id === sessionId ? 'font-semibold' : ''}">
							{session.title || 'Untitled'}
						</span>
						<span class="text-faint shrink-0 text-xs">{relativeTime(session.updatedAt)}</span>
					</button>
					<button
						class="text-faint hover:text-red shrink-0"
						title="Delete session"
						onclick={() => void removeSession(session.id)}
					>
						<TrashIcon size={13} />
					</button>
				</div>
			{/each}
		</div>
	{/if}

	{#if connecting || loadingSession}
		<div class="flex flex-1 items-center justify-center">
			<LoadingSpinner size={20} />
		</div>
	{:else if startError}
		<div class="flex flex-1 items-center justify-center p-6">
			<p class="text-red text-center text-sm">{startError}</p>
		</div>
	{:else}
		<div class="flex-1 space-y-3 overflow-y-auto p-4" bind:this={scrollElement}>
			{#each transcript.items as item, index (index)}
				{#if item.kind === 'user'}
					<div class="group relative ml-6">
						<div class="bg-raised rounded-lg px-3 py-2 text-sm whitespace-pre-wrap">
							{#if item.queued}<span class="text-faint mr-1 text-xs">queued ·</span>{/if}{item.text}
							{#if item.images.length > 0 && sessionId}
								<div class="mt-1.5 flex flex-wrap gap-1.5">
									{#each item.images as image (image.ref)}
										<img
											src={blobUrl(sessionId, image.ref)}
											alt="attachment"
											class="border-line max-h-40 rounded-lg border"
										/>
									{/each}
								</div>
							{/if}
						</div>
						<div
							class="bg-elevated border-line absolute -top-2.5 right-1 hidden items-center rounded-lg border px-0.5 shadow-sm group-hover:flex"
						>
							<button
								class="{isBookmarked(item.eventId) ? 'text-amber' : 'text-faint'} hover:text-default p-1"
								title={isBookmarked(item.eventId) ? 'Remove bookmark' : 'Bookmark'}
								onclick={() => void toggleBookmark(item.eventId)}
							>
								<BookmarkSimpleIcon
									size={13}
									weight={isBookmarked(item.eventId) ? 'fill' : 'regular'}
								/>
							</button>
							{#if !running}
								<button
									class="text-faint hover:text-default p-1"
									title="Rewind here and edit this message"
									onclick={() => void retryFrom(item)}
								>
									<ArrowCounterClockwiseIcon size={13} />
								</button>
							{/if}
						</div>
					</div>
				{:else if item.kind === 'assistant'}
					{#if item.final}
						<div class="group relative">
							<!-- eslint-disable-next-line svelte/no-at-html-tags -- sanitized by renderMarkdown -->
							<div class="prose prose-sm mr-2 max-w-none text-sm">{@html renderMarkdown(item.text)}</div>
							<button
								class="bg-elevated border-line absolute -top-2.5 right-1 hidden rounded-lg border p-1 shadow-sm group-hover:block
									{isBookmarked(item.eventId) ? 'text-amber' : 'text-faint'} hover:text-default"
								title={isBookmarked(item.eventId) ? 'Remove bookmark' : 'Bookmark'}
								onclick={() => void toggleBookmark(item.eventId)}
							>
								<BookmarkSimpleIcon
									size={13}
									weight={isBookmarked(item.eventId) ? 'fill' : 'regular'}
								/>
							</button>
						</div>
					{:else}
						<div class="mr-2 text-sm whitespace-pre-wrap">{item.text}</div>
					{/if}
				{:else if item.kind === 'thinking'}
					<details class="text-faint text-xs">
						<summary class="cursor-pointer select-none">Thinking…</summary>
						<p class="mt-1 whitespace-pre-wrap">{item.text}</p>
					</details>
				{:else if item.kind === 'tool'}
					<div class="border-line-faint rounded-lg border px-3 py-2 text-xs">
						<div class="flex items-center gap-2">
							{#if item.running && !item.needsApproval}
								<LoadingSpinner size={12} />
							{/if}
							{#if toolOpensEmail(item)}
								<button
									class="cursor-pointer font-mono font-medium hover:underline"
									title="Open in Neomail"
									onclick={() => void openFromTool(item)}
								>
									{toolLabel(item)}
								</button>
							{:else}
								<span class="font-mono font-medium">{toolLabel(item)}</span>
							{/if}
						</div>
						{#if compactJson(item.input) !== '' && toolDisplays[item.toolName]?.input !== 'hidden'}
							<p class="text-faint mt-1 truncate font-mono">{compactJson(item.input)}</p>
						{/if}
						{#each item.progress as line, lineIndex (lineIndex)}
							<p class="text-faint mt-1">{line}</p>
						{/each}
						{#if item.result !== null && resultView(item) !== 'hidden'}
							<details class="mt-1.5" open={item.isError}>
								<summary class="text-faint cursor-pointer select-none">
									{item.isError ? 'Error' : 'Result'}
								</summary>
								{#if item.isError}
									<p class="text-red mt-1 whitespace-pre-wrap">{item.result}</p>
								{:else if resultView(item) === 'markdown'}
									<!-- eslint-disable-next-line svelte/no-at-html-tags -- sanitized by renderMarkdown -->
									<div class="prose prose-sm mt-1 max-w-none">{@html renderMarkdown(item.result)}</div>
								{:else if resultView(item) === 'code' || resultView(item) === 'file'}
									<pre class="bg-canvas mt-1 overflow-x-auto rounded-lg p-2 font-mono">{item.result}</pre>
								{:else}
									<p class="mt-1 whitespace-pre-wrap">{item.result}</p>
								{/if}
							</details>
						{/if}
						{#if item.needsApproval}
							{#if editApprovalId === item.toolUseId}
								<div class="mt-2 space-y-1.5">
									<textarea
										bind:value={editApprovalJson}
										rows="6"
										spellcheck="false"
										class="border-line bg-canvas w-full resize-y rounded-lg border p-2 font-mono text-xs outline-none"
									></textarea>
									{#if editApprovalError}
										<p class="text-red">{editApprovalError}</p>
									{/if}
									<div class="flex gap-2">
										<Button size="sm" variant="primary" onclick={() => void approveEdited(item)}>
											Allow edited
										</Button>
										<Button size="sm" variant="ghost" onclick={() => (editApprovalId = null)}>
											Cancel
										</Button>
									</div>
								</div>
							{:else}
								<div class="mt-2 flex flex-wrap gap-2">
									<Button size="sm" variant="primary" onclick={() => void approve(item, 'allow')}>
										Allow
									</Button>
									<Button size="sm" onclick={() => void approve(item, 'always_session')}>Always</Button>
									<Tooltip text="Remember for this workspace (needs a trusted workspace)" placement="top">
										<Button size="sm" onclick={() => void approve(item, 'always_project')}>
											Always (project)
										</Button>
									</Tooltip>
									<Button size="sm" variant="ghost" onclick={() => startEditApproval(item)}>
										Edit input
									</Button>
									<Button size="sm" variant="danger" onclick={() => void approve(item, 'deny')}>
										Deny
									</Button>
								</div>
							{/if}
						{/if}
					</div>
				{:else if item.kind === 'surface'}
					<div class="border-line-faint bg-raised rounded-lg border px-3 py-2">
						<UiSurfaceView node={item.view} />
					</div>
				{:else}
					<p class="text-faint text-xs {item.kind === 'error' ? 'text-red' : ''}">{item.text}</p>
				{/if}
			{/each}
			{#if running}
				<p class="text-faint text-xs">Working…</p>
			{/if}
			{#if awaitingApproval}
				<p class="text-amber text-xs">Waiting for tool approval above.</p>
			{/if}
		</div>

		{#if snapshot && snapshot.queued.length > 0}
			<div class="border-line-faint flex flex-wrap gap-1.5 border-t px-3 py-2">
				{#each snapshot.queued as queued (queued.id)}
					<span class="border-line bg-raised flex items-center gap-1.5 rounded-lg border px-2 py-0.5 text-xs">
						<span class="max-w-48 truncate">{queued.text}</span>
						<button
							class="text-faint hover:text-default"
							title="Remove from queue"
							onclick={() => void unqueue(queued.id)}
						>
							<XIcon size={11} />
						</button>
					</span>
				{/each}
			</div>
		{/if}

		<form onsubmit={submit} class="border-line-faint relative border-t p-3">
			{#if slashSuggestions.length > 0}
				<div
					class="border-line bg-canvas absolute right-3 bottom-full left-3 mb-1 overflow-hidden rounded-lg border shadow-lg"
				>
					{#each slashSuggestions as suggestion, index (suggestion.name)}
						<button
							type="button"
							class="flex w-full items-baseline gap-2 px-3 py-1.5 text-left text-xs
								{index === slashIndex ? 'bg-hover' : 'hover:bg-hover'}"
							onmouseenter={() => (slashIndex = index)}
							onclick={() => applySuggestion(suggestion)}
						>
							<span class="font-mono font-medium">/{suggestion.name}</span>
							{#if suggestion.argumentHint}
								<span class="text-faint font-mono">{suggestion.argumentHint}</span>
							{/if}
							<span class="text-muted min-w-0 flex-1 truncate">{suggestion.description}</span>
						</button>
					{/each}
				</div>
			{/if}
			{#if pendingImages.length > 0 || uploadingImage}
				<div class="mb-2 flex flex-wrap items-center gap-1.5">
					{#each pendingImages as image (image.ref)}
						<span class="border-line bg-raised flex items-center gap-1.5 rounded-lg border p-1 pr-1.5">
							<img src={image.previewUrl} alt={image.name} class="h-8 w-8 rounded object-cover" />
							<span class="text-faint max-w-32 truncate text-xs">{image.name}</span>
							<button
								class="text-faint hover:text-default"
								title="Remove image"
								onclick={() => removePendingImage(image.ref)}
							>
								<XIcon size={11} />
							</button>
						</span>
					{/each}
					{#if uploadingImage}
						<LoadingSpinner size={14} />
					{/if}
				</div>
			{/if}
			{#if inputError}
				<p class="text-red mb-1 text-xs">{inputError}</p>
			{/if}
			<div class="flex items-end gap-2">
				<textarea
					bind:value={draft}
					rows="3"
					placeholder={running ? 'Queue a follow-up… (/ for commands)' : 'Ask about your email… (/ for commands)'}
					class="border-line bg-canvas min-w-0 flex-1 resize-none rounded-lg border px-3 py-2 text-sm outline-none focus:border-line-strong"
					onkeydown={onInputKeydown}
					onpaste={(event) => void onInputPaste(event)}
				></textarea>
				{#if running}
					<Tooltip text="Stop the agent" placement="top">
						<Button variant="danger" size="sm" icon={StopIcon} onclick={() => void interrupt()} />
					</Tooltip>
				{/if}
			</div>
			{#if snapshot}
				<p class="text-faint mt-1 flex justify-between text-[10px] tabular-nums">
					<span>
						{formatTokens(snapshot.context.usedTokens)}/{formatTokens(snapshot.context.contextWindow)}
						tokens · {Math.round(snapshot.context.ratio * 100)}%
					</span>
					<span>${snapshot.cost.toFixed(3)}</span>
				</p>
			{/if}
		</form>
	{/if}
</aside>
