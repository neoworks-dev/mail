<!--
  The conversations of the mailbox's current view, newest first, under date sections. Only the
  rows near the window are built. In a plain inbox, bulk categories fold into bundle rows. A press opens a
  conversation; Ctrl adds it to the selection and Shift selects a range; the right button opens
  its menu, the middle one opens it in a new tab. Pages load as the end comes near.
-->
<script lang="ts">
	import { ContextMenu, List, Text, View } from '@neoworks/svelte-gpui/ui'
	import type { MenuItem, PointerEvent, ScrollPosition } from '@neoworks/svelte-gpui/ui'
	import { currentTheme, LoadingSpinner, typeStyle } from '@neoworks/svelte-gpui-ui'
	import type { ThreadSummary } from '../../../shared/mail'
	import { labelTitle } from '../../components/message-list/labels'
	import type { CommandsService } from '../../kernel/commands'
	import {
		BUNDLED_LABELS,
		buildThreadListItems,
		visibleThreads,
		type ThreadListItem
	} from '../../lib/bundling'
	import { withDateSections, type Sectioned } from '../../lib/dateSections'
	import type { AccountsService } from '../accounts/service.svelte'
	import type { MailboxService } from '../mailbox/service.svelte'
	import type { ReaderService } from '../reader/service.svelte'
	import { folderDisplayName } from '../sidebar/folders'
	import BundleRow from './BundleRow.svelte'
	import FilterChips from './FilterChips.svelte'
	import ListHeader from './ListHeader.svelte'
	import { hasActiveFilter } from './filters'
	import { threadMenuItems } from './threadMenu'
	import ThreadRow from './ThreadRow.svelte'

	interface Props {
		accounts: AccountsService
		mailbox: MailboxService
		reader: ReaderService
		commands: CommandsService
	}

	let { accounts, mailbox, reader, commands }: Props = $props()

	/** Load the next page when the end is closer than this, in pixels. */
	const LOAD_MORE_DISTANCE = 600
	/** From this width on, each conversation takes one line, as in Notion Mail. */
	const WIDE_LIST_WIDTH = 560

	const theme = $derived(currentTheme())
	let expandedBundles = $state<Set<string>>(new Set())
	/** Where a Shift range starts, as a position among the visible conversation rows. */
	let selectionAnchor = $state<number | null>(null)
	let menu: ContextMenu | undefined = $state()
	let menuPosition: [number, number] = [0, 0]
	let listWidth = $state(0)
	const wide = $derived(listWidth >= WIDE_LIST_WIDTH)

	// A new view starts with its bundles folded and no range anchor.
	$effect(() => {
		if (mailbox.state.view === null) return
		expandedBundles = new Set()
		selectionAnchor = null
	})

	const bundlingEnabled = $derived.by(() => {
		const view = mailbox.state.view
		if (!view || view.label !== null) return false
		if (view.kind === 'unified') return true
		const inbox = accounts.inbox()
		return inbox !== null && inbox.folderId === view.folderId
	})

	const items = $derived(
		buildThreadListItems(mailbox.state.threads, bundlingEnabled, expandedBundles)
	)
	const orderedThreads = $derived(visibleThreads(items))
	const sectionedItems = $derived(withDateSections(items, sectionDate))

	const title = $derived.by(() => {
		const view = mailbox.state.view
		if (!view) return ''
		let name = 'All inboxes'
		if (view.kind === 'folder') name = folderName(view.folderId)
		if (view.label === null) return name
		return `${name} · ${labelTitle(view.label)}`
	})

	function folderName(folderId: number): string {
		const folder = accounts.state.folders.find((entry) => entry.folderId === folderId)
		if (!folder) return ''
		return folderDisplayName(folder)
	}

	/** Threads unfolded under a bundle stay in the bundle's section, so they give no date. */
	function sectionDate(item: ThreadListItem): string | null {
		if (item.type === 'bundle') return item.threads[0].date
		if (isBundled(item.thread)) return null
		return item.thread.date
	}

	function isBundled(thread: ThreadSummary): boolean {
		if (!bundlingEnabled || thread.label === null) return false
		return BUNDLED_LABELS.includes(thread.label)
	}

	/** A list of one category, or a bundle's own threads, need not repeat the category. */
	function showLabel(thread: ThreadSummary): boolean {
		const view = mailbox.state.view
		if (view && view.label !== null) return false
		return !isBundled(thread)
	}

	function itemKey(item: Sectioned<ThreadListItem>): string {
		if (item.type === 'section') return `section:${item.title}`
		if (item.type === 'bundle') return `bundle:${item.label}`
		return `thread:${item.thread.threadId}`
	}

	function toggleBundle(label: string): void {
		const next = new Set(expandedBundles)
		if (next.has(label)) {
			next.delete(label)
		} else {
			next.add(label)
		}
		expandedBundles = next
	}

	function openBundleAsFilter(label: string): void {
		const view = mailbox.state.view
		if (!view) return
		if (view.kind === 'unified') {
			void mailbox.openUnified(label)
			return
		}
		void mailbox.openFolder(view.folderId, label)
	}

	function pressThread(event: PointerEvent, thread: ThreadSummary): void {
		const position = orderedThreads.indexOf(thread)
		if (event.shift && selectionAnchor !== null) {
			const start = Math.min(selectionAnchor, position)
			const end = Math.max(selectionAnchor, position)
			mailbox.setSelection(orderedThreads.slice(start, end + 1).map((entry) => entry.threadId))
			return
		}
		selectionAnchor = position
		if (event.ctrl || event.meta) {
			mailbox.toggleSelection(thread.threadId)
			return
		}
		mailbox.clearSelection()
		void reader.openThread(thread.accountId, thread.threadId)
	}

	function altPressThread(event: PointerEvent, thread: ThreadSummary): void {
		if (event.button === 1) {
			void reader.openInNewTab({
				kind: 'thread',
				accountId: thread.accountId,
				threadId: thread.threadId
			})
			return
		}
		menuPosition = [event.windowX, event.windowY]
		openMenu(
			threadMenuItems(thread, {
				mailbox,
				reader,
				commands,
				folders: accounts.state.folders,
				reopen: reopenMenu
			})
		)
	}

	function openMenu(menuItems: MenuItem[]): void {
		if (menu) menu.openAt(menuPosition[0], menuPosition[1], menuItems)
	}

	/** The menu is closing as its item runs, so the next one opens a moment later. */
	function reopenMenu(menuItems: MenuItem[]): void {
		setTimeout(() => openMenu(menuItems), 0)
	}

	function ownAddress(thread: ThreadSummary): string {
		return accounts.ownEmail(thread.accountId)
	}

	/** Archiving or deleting the open thread also closes it, as from the toolbar. */
	function removeThread(
		thread: ThreadSummary,
		action: (thread: ThreadSummary) => Promise<void>
	): void {
		if (reader.openThreadId === thread.threadId) reader.closeActive()
		void action(thread)
	}

	function toggleRead(thread: ThreadSummary): void {
		void mailbox.setThreadRead(thread, thread.threadUnread > 0)
	}

	function accountEmail(thread: ThreadSummary): string | null {
		if (!mailbox.unified) return null
		const email = accounts.ownEmail(thread.accountId)
		if (email === '') return null
		return email
	}

	function emptyText(): string {
		if (hasActiveFilter(mailbox.state.filter)) return 'No messages match these filters'
		return 'No messages here'
	}

	function scrolled(position: ScrollPosition): void {
		if (position.maxY - position.y > LOAD_MORE_DISTANCE) return
		if (mailbox.state.threads.length >= mailbox.state.totalThreads) return
		void mailbox.loadMore()
	}
</script>

<View style={{ flex: 1, minWidth: 0 }} onlayout={(layout) => (listWidth = layout.width)}>
	<ListHeader
		{title}
		total={mailbox.state.totalThreads}
		selectedCount={mailbox.state.selectedThreadIds.length}
		{commands}
	/>
	<FilterChips {mailbox} />
	{#if mailbox.state.threads.length === 0}
		<View style={{ flex: 1, align: 'center', justify: 'center', padding: 24 }}>
			{#if mailbox.state.loading}
				<LoadingSpinner size={22} />
			{:else}
				<Text style={{ fontSize: 13, color: theme.colors.faint }}>{emptyText()}</Text>
			{/if}
		</View>
	{:else}
		<List
			items={sectionedItems}
			key={itemKey}
			estimatedRowHeight={72}
			style={{ flex: 1 }}
			onscroll={scrolled}
		>
			{#snippet row(item)}
				{#if item.type === 'section'}
					<Text
						style={{
							...typeStyle('caption'),
							fontSize: 12,
							fontWeight: 600,
							color: theme.colors.faint,
							paddingLeft: 28,
							paddingTop: 14,
							paddingBottom: 4
						}}>{item.title}</Text
					>
				{:else if item.type === 'bundle'}
					<BundleRow
						label={item.label}
						threads={item.threads}
						expanded={item.expanded}
						{wide}
						ontoggle={() => toggleBundle(item.label)}
						onviewall={() => openBundleAsFilter(item.label)}
					/>
				{:else}
					<ThreadRow
						thread={item.thread}
						open={reader.openThreadId === item.thread.threadId}
						selected={mailbox.state.selectedThreadIds.includes(item.thread.threadId)}
						{wide}
						showLabel={showLabel(item.thread)}
						accountEmail={accountEmail(item.thread)}
						ownAddress={ownAddress(item.thread)}
						onpress={(event) => pressThread(event, item.thread)}
						onaltpress={(event) => altPressThread(event, item.thread)}
						onarchive={() => removeThread(item.thread, (thread) => mailbox.archive(thread))}
						ondelete={() => removeThread(item.thread, (thread) => mailbox.remove(thread))}
						ontoggleread={() => toggleRead(item.thread)}
						ontoggleflag={() => void mailbox.toggleFlagged(item.thread)}
					/>
				{/if}
			{/snippet}
		</List>
	{/if}
</View>
<ContextMenu bind:this={menu} />
