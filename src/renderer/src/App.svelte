<script lang="ts">
	import { Button, LoadingSpinner, Tooltip } from '@neoworks-dev/ui'
	import { onMount } from 'svelte'
	import AccountSetup from './components/AccountSetup.svelte'
	import AgentPane from './components/AgentPane.svelte'
	import CommandPalette from './components/CommandPalette.svelte'
	import Composer from './components/Composer.svelte'
	import FolderSidebar from './components/FolderSidebar.svelte'
	import KeybindingSettings from './components/KeybindingSettings.svelte'
	import MessageList from './components/MessageList.svelte'
	import PaneResizer from './components/PaneResizer.svelte'
	import ReadingPane from './components/ReadingPane.svelte'
	import UndoSendToast from './components/UndoSendToast.svelte'
	import { ArrowLeftIcon, ArrowRightIcon, MagnifyingGlassIcon, SparkleIcon } from './icons'
	import { keybindings } from './state/keybindings.svelte'
	import { comboLabel } from './state/keycombo'
	import { mailState } from './state/mail.svelte'

	const LIST_PANE_WIDTH_KEY = 'neomail:pane:list'
	const ASSISTANT_PANE_WIDTH_KEY = 'neomail:pane:assistant'

	let listPaneWidth = $state(storedPaneWidth(LIST_PANE_WIDTH_KEY, 600))
	let assistantPaneWidth = $state(storedPaneWidth(ASSISTANT_PANE_WIDTH_KEY, 380))

	function storedPaneWidth(key: string, fallback: number): number {
		const value = Number(localStorage.getItem(key))
		if (Number.isFinite(value) && value >= 240) return value
		return fallback
	}

	function clampWidth(value: number, min: number, max: number): number {
		return Math.min(Math.max(value, min), max)
	}

	function resizeListPane(deltaX: number): void {
		listPaneWidth = clampWidth(listPaneWidth + deltaX, 400, window.innerWidth * 0.6)
		localStorage.setItem(LIST_PANE_WIDTH_KEY, String(Math.round(listPaneWidth)))
	}

	function resizeAssistantPane(deltaX: number): void {
		assistantPaneWidth = clampWidth(assistantPaneWidth - deltaX, 300, 720)
		localStorage.setItem(ASSISTANT_PANE_WIDTH_KEY, String(Math.round(assistantPaneWidth)))
	}

	onMount(() => {
		void mailState.bootstrap()
	})

	// Global keybindings: declared here, rebindable via the settings overlay.
	keybindings.register([
		{
			id: 'palette.open',
			title: 'Open command bar',
			defaultCombo: { key: 'k', ctrl: true },
			run: () => {
				if (mailState.paletteOpen) {
					mailState.paletteOpen = false
					return
				}
				mailState.palettePrefill = '>'
				mailState.paletteOpen = true
			}
		},
		{
			id: 'palette.search',
			title: 'Search mail',
			defaultCombo: { key: '/' },
			run: () => {
				mailState.palettePrefill = ''
				mailState.paletteOpen = true
			}
		},
		{
			id: 'compose.new',
			title: 'Compose new message',
			defaultCombo: { key: 'c' },
			run: () => mailState.openCompose()
		},
		{
			id: 'thread.next',
			title: 'Next conversation',
			defaultCombo: { key: 'j' },
			run: () => void mailState.openAdjacentThread(1)
		},
		{
			id: 'thread.prev',
			title: 'Previous conversation',
			defaultCombo: { key: 'k' },
			run: () => void mailState.openAdjacentThread(-1)
		},
		{
			id: 'thread.openFirst',
			title: 'Open first conversation',
			defaultCombo: { key: 'enter' },
			when: () => mailState.openThreadId === null && mailState.threads.length > 0,
			run: () => void mailState.openThread(mailState.threads[0])
		},
		{
			id: 'thread.archive',
			title: 'Archive conversation',
			defaultCombo: { key: 'e' },
			when: () => mailState.actionTarget !== null,
			run: () => {
				const target = mailState.actionTarget
				if (target) void mailState.archiveMessage(target)
			}
		},
		{
			id: 'thread.delete',
			title: 'Delete conversation',
			defaultCombo: { key: '#' },
			when: () => mailState.actionTarget !== null,
			run: () => {
				const target = mailState.actionTarget
				if (target) void mailState.deleteMessage(target)
			}
		},
		{
			id: 'thread.flag',
			title: 'Toggle flag',
			defaultCombo: { key: 's' },
			when: () => mailState.actionTarget !== null,
			run: () => {
				const target = mailState.actionTarget
				if (target) void mailState.toggleFlagged(target)
			}
		},
		{
			id: 'thread.unread',
			title: 'Mark as unread',
			defaultCombo: { key: 'u' },
			when: () => mailState.actionTarget !== null,
			run: () => {
				const target = mailState.actionTarget
				if (target) void mailState.markUnread(target)
			}
		},
		{
			id: 'thread.reply',
			title: 'Reply',
			defaultCombo: { key: 'r' },
			when: () => mailState.replyTarget !== null,
			run: () => {
				const target = mailState.replyTarget
				if (target) mailState.openReply(target, false)
			}
		},
		{
			id: 'thread.replyAll',
			title: 'Reply all',
			defaultCombo: { key: 'a' },
			when: () => mailState.replyTarget !== null,
			run: () => {
				const target = mailState.replyTarget
				if (target) mailState.openReply(target, true)
			}
		},
		{
			id: 'assistant.toggle',
			title: 'Toggle assistant',
			defaultCombo: { key: 'a', ctrl: true, shift: true },
			run: () => (mailState.assistantOpen = !mailState.assistantOpen)
		},
		{
			id: 'keybindings.show',
			title: 'Keyboard shortcuts',
			defaultCombo: { key: '?' },
			run: () => (mailState.keybindingSettingsOpen = true)
		}
	])

	function isEditableTarget(target: EventTarget | null): boolean {
		if (!(target instanceof HTMLElement)) return false
		if (target.isContentEditable) return true
		const tag = target.tagName
		return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'
	}

	const overlayOpen = $derived(
		mailState.paletteOpen ||
			mailState.accountSetupOpen ||
			mailState.keybindingSettingsOpen ||
			mailState.compose !== null
	)

	function onEscape(): void {
		if (mailState.keybindingSettingsOpen) {
			mailState.keybindingSettingsOpen = false
			return
		}
		if (mailState.paletteOpen) {
			mailState.paletteOpen = false
			return
		}
		if (mailState.accountSetupOpen) {
			mailState.accountSetupOpen = false
			return
		}
		// The composer autosaves, so closing on Escape loses nothing.
		if (mailState.compose) {
			mailState.closeCompose()
			return
		}
		if (mailState.selectedThreadIds.length > 0) {
			mailState.clearThreadSelection()
			return
		}
		mailState.closeThread()
	}

	/** Double-tap Space (outside inputs) opens the command bar. */
	const DOUBLE_SPACE_MS = 350
	let lastSpaceAt = 0

	function onKeydown(event: KeyboardEvent): void {
		if (mailState.accounts.length === 0) return
		if (event.key === 'Escape') {
			onEscape()
			return
		}
		const blocked = overlayOpen || isEditableTarget(event.target)

		if (event.key === ' ' && !blocked) {
			const now = Date.now()
			if (now - lastSpaceAt < DOUBLE_SPACE_MS) {
				lastSpaceAt = 0
				event.preventDefault()
				mailState.paletteOpen = true
				return
			}
			lastSpaceAt = now
			event.preventDefault()
			return
		}

		keybindings.handleKeydown(event, blocked)
	}

	const searchShortcut = $derived.by(() => {
		// Touch overrides so the label updates after a rebind.
		void keybindings.overrides
		return comboLabel(keybindings.comboFor('palette.open'))
	})
</script>

<svelte:window onkeydown={onKeydown} />

<div class="bg-canvas text-default flex h-full flex-col gap-1.5 p-2">
	{#if !mailState.accountsLoaded}
		<div class="flex h-full items-center justify-center">
			<LoadingSpinner size={28} />
		</div>
	{:else if mailState.accounts.length === 0}
		<AccountSetup />
	{:else}
		<!-- Bare top bar floating on the canvas; the search button opens the command bar. -->
		<header class="grid shrink-0 grid-cols-[1fr_auto_1fr] items-center px-1 py-0.5">
			<div class="flex items-center gap-0.5">
				<Tooltip text="Back" placement="bottom">
					<Button
						variant="ghost"
						size="sm"
						icon={ArrowLeftIcon}
						disabled={!mailState.canGoBack}
						onclick={() => void mailState.goBack()}
					/>
				</Tooltip>
				<Tooltip text="Forward" placement="bottom">
					<Button
						variant="ghost"
						size="sm"
						icon={ArrowRightIcon}
						disabled={!mailState.canGoForward}
						onclick={() => void mailState.goForward()}
					/>
				</Tooltip>
			</div>
			<button
				class="border-line-faint bg-surface hover:border-line text-muted hover:text-default flex w-[min(50vw,560px)] items-center gap-2 rounded-lg border px-3 py-1.5 text-sm"
				onclick={() => (mailState.paletteOpen = true)}
			>
				<MagnifyingGlassIcon size={14} class="shrink-0" />
				<span class="min-w-0 flex-1 truncate text-left">Search mail…</span>
				<kbd class="border-line text-faint shrink-0 rounded border px-1.5 py-0.5 text-[10px]">
					{searchShortcut}
				</kbd>
			</button>
			<div class="flex justify-end">
				<Tooltip text="Assistant" placement="bottom">
					<Button
						variant={mailState.assistantOpen ? 'surface' : 'ghost'}
						size="sm"
						icon={SparkleIcon}
						onclick={() => (mailState.assistantOpen = !mailState.assistantOpen)}
					/>
				</Tooltip>
			</div>
		</header>

		<!-- Three floating surfaces: sidebar+list, reading pane, assistant.
		     The dividers in the gaps drag to resize; widths persist locally. -->
		<div class="flex min-h-0 flex-1 overflow-hidden">
			<div
				class="border-line-faint bg-surface flex shrink-0 overflow-hidden rounded-xl border"
				style="width: {listPaneWidth}px"
			>
				<FolderSidebar />
				<MessageList />
			</div>
			<PaneResizer onResize={resizeListPane} />
			{#each mailState.panes as _pane, paneIndex (paneIndex)}
				{#if paneIndex > 0}
					<div class="w-2 shrink-0"></div>
				{/if}
				<div
					class="bg-surface flex min-w-0 flex-1 overflow-hidden rounded-xl border
						{mailState.panes.length > 1 && paneIndex === mailState.activePaneIndex
						? 'border-line'
						: 'border-line-faint'}"
				>
					<ReadingPane {paneIndex} />
				</div>
			{/each}
			{#if mailState.assistantOpen}
				<PaneResizer onResize={resizeAssistantPane} />
				<div
					class="border-line-faint bg-surface flex shrink-0 overflow-hidden rounded-xl border"
					style="width: {assistantPaneWidth}px"
				>
					<AgentPane />
				</div>
			{/if}
		</div>
		<Composer />
		<UndoSendToast />
		<CommandPalette />
		<KeybindingSettings />
		{#if mailState.accountSetupOpen}
			<AccountSetup modal />
		{/if}
	{/if}
</div>
