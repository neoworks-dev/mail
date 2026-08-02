<script lang="ts">
	// The Ctrl+K command bar: plain text searches the mailbox (FTS or
	// semantic), a ">" prefix switches to commands — VS Code style.
	import type { SearchResult } from '../../../shared/mail'
	import { keybindings } from '../state/keybindings.svelte'
	import { comboLabel } from '../state/keycombo'
	import { mailState } from '../state/mail.svelte'
	import { filterCommands, type PaletteCommand } from '../state/palette'

	const SEARCH_DEBOUNCE_MS = 200

	let query = $state('')
	let selectedIndex = $state(0)
	let inputElement = $state<HTMLInputElement | null>(null)
	let listElement = $state<HTMLElement | null>(null)

	// Keep the keyboard-selected row visible while arrowing through the list.
	$effect(() => {
		void selectedIndex
		const selected = listElement?.querySelector('[data-selected="true"]')
		selected?.scrollIntoView({ block: 'nearest' })
	})
	let searchResults = $state<SearchResult[]>([])
	let searching = $state(false)
	let searchError = $state<string | null>(null)
	let semantic = $state(false)
	let searchTimer: ReturnType<typeof setTimeout> | null = null

	const commandMode = $derived(query.startsWith('>'))
	const searchTerm = $derived(commandMode ? '' : query.trim())

	$effect(() => {
		if (mailState.paletteOpen) {
			query = mailState.palettePrefill
			mailState.palettePrefill = ''
			selectedIndex = 0
			searchResults = []
			searchError = null
			inputElement?.focus()
		}
	})

	/** Commands with their live keybinding labels, filtered by the > query. */
	const commands = $derived.by((): PaletteCommand[] => {
		const list: PaletteCommand[] = []
		const shortcut = (id: string): string | null => {
			const combo = keybindings.comboFor(id)
			if (combo.key === '') return null
			return comboLabel(combo)
		}
		list.push({
			id: 'compose',
			label: 'Compose new message',
			shortcut: shortcut('compose.new'),
			run: () => mailState.openCompose()
		})

		if (mailState.actionTarget) {
			const target = mailState.actionTarget
			const replyTarget = mailState.replyTarget
			list.push({
				id: 'archive',
				label: 'Archive conversation',
				shortcut: shortcut('thread.archive'),
				run: () => void mailState.archiveMessage(target)
			})
			list.push({
				id: 'delete',
				label: 'Delete conversation',
				shortcut: shortcut('thread.delete'),
				run: () => void mailState.deleteMessage(target)
			})
			list.push({
				id: 'flag',
				label: target.flagged ? 'Remove flag' : 'Flag conversation',
				shortcut: shortcut('thread.flag'),
				run: () => void mailState.toggleFlagged(target)
			})
			list.push({
				id: 'unread',
				label: 'Mark as unread',
				shortcut: shortcut('thread.unread'),
				run: () => void mailState.markUnread(target)
			})
			list.push({
				id: 'summarize',
				label: 'Summarize conversation with AI',
				shortcut: null,
				run: () => void mailState.summarizeOpenThread()
			})
			list.push({
				id: 'extract-shipment',
				label: 'Extract shipping info with AI',
				shortcut: null,
				run: () => void mailState.aiExtractShipment()
			})
			list.push({
				id: 'extract-actions',
				label: 'Extract action items with AI',
				shortcut: null,
				run: () => void mailState.aiExtractActions()
			})
			if (replyTarget) {
				list.push({
					id: 'reply',
					label: 'Reply',
					shortcut: shortcut('thread.reply'),
					run: () => mailState.openReply(replyTarget, false)
				})
				list.push({
					id: 'reply-all',
					label: 'Reply all',
					shortcut: shortcut('thread.replyAll'),
					run: () => mailState.openReply(replyTarget, true)
				})
			}
		}

		if (mailState.accounts.length > 1) {
			list.push({
				id: 'unified',
				label: 'Go to all inboxes',
				shortcut: null,
				run: () => void mailState.selectUnifiedInbox()
			})
		}
		for (const folder of mailState.folders) {
			list.push({
				id: `folder-${folder.folderId}`,
				label: `Go to ${folder.path === 'INBOX' ? 'Inbox' : folder.name}`,
				shortcut: null,
				run: () => void mailState.selectFolder(folder.folderId)
			})
		}
		for (const account of mailState.accounts) {
			if (account.accountId === mailState.selectedAccountId) continue
			list.push({
				id: `account-${account.accountId}`,
				label: `Switch account: ${account.email}`,
				shortcut: null,
				run: () => void mailState.selectAccount(account.accountId)
			})
		}
		list.push({
			id: 'assistant',
			label: mailState.assistantOpen ? 'Hide assistant' : 'Show assistant',
			shortcut: shortcut('assistant.toggle'),
			run: () => (mailState.assistantOpen = !mailState.assistantOpen)
		})
		list.push({
			id: 'digest',
			label: 'Generate daily digest now',
			shortcut: null,
			run: () => {
				mailState.closeThread()
				void mailState.generateDigest(false)
			}
		})
		list.push({
			id: 'keybindings',
			label: 'Keyboard shortcuts…',
			shortcut: shortcut('keybindings.show'),
			run: () => (mailState.keybindingSettingsOpen = true)
		})
		list.push({
			id: 'add-account',
			label: 'Add mail account',
			shortcut: null,
			run: () => (mailState.accountSetupOpen = true)
		})
		return filterCommands(list, commandMode ? query.slice(1) : '')
	})

	// Plain text: debounced mailbox search.
	$effect(() => {
		const term = searchTerm
		const useSemantic = semantic
		if (searchTimer) clearTimeout(searchTimer)
		if (term === '' || !mailState.paletteOpen) {
			searchResults = []
			searching = false
			return
		}
		searching = true
		searchTimer = setTimeout(() => {
			void runSearch(term, useSemantic)
		}, SEARCH_DEBOUNCE_MS)
	})

	async function runSearch(term: string, useSemantic: boolean): Promise<void> {
		try {
			searchError = null
			const results = useSemantic
				? await window.neomail.searchSemantic(term, mailState.selectedAccountId)
				: await window.neomail.search(term, mailState.selectedAccountId)
			// Stale responses (query changed meanwhile) are dropped.
			if (term !== searchTerm || useSemantic !== semantic) return
			searchResults = results
			selectedIndex = 0
		} catch (error) {
			searchError = error instanceof Error ? error.message : String(error)
			searchResults = []
		} finally {
			if (term === searchTerm) searching = false
		}
	}

	const activeCount = $derived(commandMode || searchTerm === '' ? commands.length : searchResults.length)

	$effect(() => {
		if (selectedIndex >= activeCount) selectedIndex = 0
	})

	function close(): void {
		mailState.paletteOpen = false
	}

	function runCommand(command: PaletteCommand): void {
		close()
		command.run()
	}

	function openResult(result: SearchResult): void {
		close()
		void mailState.openThread(result)
	}

	function onKeydown(event: KeyboardEvent): void {
		if (event.key === 'Escape') {
			event.preventDefault()
			close()
			return
		}
		if (event.key === 's' && event.altKey) {
			event.preventDefault()
			semantic = !semantic
			return
		}
		if (event.key === 'ArrowDown') {
			event.preventDefault()
			if (selectedIndex < activeCount - 1) selectedIndex += 1
			return
		}
		if (event.key === 'ArrowUp') {
			event.preventDefault()
			if (selectedIndex > 0) selectedIndex -= 1
			return
		}
		if (event.key === 'Enter') {
			event.preventDefault()
			if (commandMode || searchTerm === '') {
				const command = commands[selectedIndex]
				if (command) runCommand(command)
				return
			}
			const result = searchResults[selectedIndex]
			if (result) openResult(result)
		}
	}

	function formatDate(iso: string): string {
		return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
	}
</script>

{#if mailState.paletteOpen}
	<!-- svelte-ignore a11y_no_static_element_interactions, a11y_click_events_have_key_events -->
	<div class="fixed inset-0 z-50 flex justify-center bg-black/30 pt-24" onclick={close}>
		<div
			class="bg-canvas border-line flex h-fit max-h-[28rem] w-[620px] max-w-[90vw] flex-col overflow-hidden rounded-xl border shadow-lg"
			onclick={(event) => event.stopPropagation()}
		>
			<div class="border-line flex items-center gap-2 border-b px-4">
				<input
					bind:this={inputElement}
					bind:value={query}
					onkeydown={onKeydown}
					type="text"
					placeholder="Search mail… ('>' for commands)"
					class="min-w-0 flex-1 bg-transparent py-3 text-sm outline-none"
				/>
				{#if !commandMode}
					<button
						class="shrink-0 rounded-full border px-2 py-0.5 text-xs
							{semantic ? 'border-line-strong text-default' : 'border-line text-muted'}"
						title="Semantic search (Alt+S)"
						onclick={() => (semantic = !semantic)}
					>
						Semantic
					</button>
				{/if}
			</div>
			<div class="overflow-y-auto py-1" bind:this={listElement}>
				{#if commandMode || searchTerm === ''}
					{#if commands.length === 0}
						<p class="text-faint px-4 py-3 text-sm">No matching commands</p>
					{/if}
					{#each commands as command, index (command.id)}
						<button
							class="flex w-full items-center justify-between px-4 py-2 text-left text-sm
								{index === selectedIndex ? 'bg-elevated' : 'hover:bg-elevated'}"
							data-selected={index === selectedIndex}
							onmouseenter={() => (selectedIndex = index)}
							onclick={() => runCommand(command)}
						>
							<span class="truncate">{command.label}</span>
							{#if command.shortcut}
								<kbd class="border-line text-faint ml-3 shrink-0 rounded border px-1.5 py-0.5 text-xs">
									{command.shortcut}
								</kbd>
							{/if}
						</button>
					{/each}
				{:else}
					{#if searchError}
						<p class="text-red px-4 py-3 text-xs">{searchError}</p>
					{:else if searching && searchResults.length === 0}
						<p class="text-faint px-4 py-3 text-sm">Searching…</p>
					{:else if searchResults.length === 0}
						<p class="text-faint px-4 py-3 text-sm">No messages found</p>
					{/if}
					{#each searchResults as result, index (result.messageId)}
						<button
							class="flex w-full flex-col gap-0.5 px-4 py-2 text-left
								{index === selectedIndex ? 'bg-elevated' : 'hover:bg-elevated'}"
							data-selected={index === selectedIndex}
							onmouseenter={() => (selectedIndex = index)}
							onclick={() => openResult(result)}
						>
							<span class="flex items-baseline justify-between gap-2">
								<span class="truncate text-sm font-medium">{result.fromName || result.fromAddress}</span>
								<span class="text-faint shrink-0 text-xs">
									{result.folderPath} · {formatDate(result.date)}
								</span>
							</span>
							<span class="truncate text-sm">{result.subject || '(no subject)'}</span>
							<span class="text-muted truncate text-xs">{result.matchSnippet}</span>
						</button>
					{/each}
				{/if}
			</div>
			<p class="border-line-faint text-faint border-t px-4 py-1.5 text-[10px]">
				Type to search · "&gt;" commands · Alt+S semantic · Enter opens
			</p>
		</div>
	</div>
{/if}
