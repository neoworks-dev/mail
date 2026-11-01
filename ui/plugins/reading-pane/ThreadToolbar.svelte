<!--
  The thread's actions: replying on the left, then flag, unread, archive, delete and move at the
  right end. They apply to its newest message in the folder being shown, as the keys
  do; archiving, deleting and marking unread close the tab. Other plugins add buttons through
  the `thread.actions` slot.
-->
<script lang="ts">
	import { Text, View } from '@neoworks/svelte-gpui/ui'
	import {
		currentTheme,
		IconButton,
		Menu,
		typeStyle,
		type MenuEntry
	} from '@neoworks/svelte-gpui-ui'
	import starFilledIcon from '@phosphor-icons/core/fill/star-fill.svg'
	import folderIcon from '@phosphor-icons/core/regular/folder-simple.svg'
	import archiveIcon from '@phosphor-icons/core/regular/archive.svg'
	import replyAllIcon from '@phosphor-icons/core/regular/arrow-bend-double-up-left.svg'
	import replyIcon from '@phosphor-icons/core/regular/arrow-bend-up-left.svg'
	import unreadIcon from '@phosphor-icons/core/regular/envelope-simple.svg'
	import pencilIcon from '@phosphor-icons/core/regular/pencil-simple.svg'
	import starIcon from '@phosphor-icons/core/regular/star.svg'
	import trashIcon from '@phosphor-icons/core/regular/trash.svg'
	import type { ThreadMessage } from '../../../shared/mail'
	import Slot from '../../kernel/slots/Slot.svelte'
	import type { ReadingTab } from '../reader/service.svelte'
	import { describeError } from './format'
	import { actionTarget, type ReadingServices } from './services'

	let {
		services,
		tab,
		paneIndex
	}: { services: ReadingServices; tab: ReadingTab; paneIndex: number } = $props()

	const theme = $derived(currentTheme())
	let actionError = $state<string | null>(null)

	const target = $derived(actionTarget(services, tab))

	const newest = $derived(tab.messages[tab.messages.length - 1])

	const isDraft = $derived.by(() => {
		if (!target) return false
		const folder = services.accounts.state.folders.find(
			(entry) => entry.folderId === target.folderId
		)
		if (!folder) return false
		return folder.specialUse === '\\Drafts' || folder.name === 'Drafts'
	})

	const flagLabel = $derived.by(() => {
		if (target && target.flagged) return 'Remove flag (s)'
		return 'Flag (s)'
	})

	const moveItems = $derived.by((): MenuEntry[] => {
		const current = target
		if (!current) return []
		return services.accounts.state.folders
			.filter(
				(folder) => folder.accountId === current.accountId && folder.folderId !== current.folderId
			)
			.map((folder) => ({
				label: folder.name,
				onselect: () =>
					void closingAction((message) => services.mailbox.move(message, folder.folderId))
			}))
	})

	async function run(action: () => Promise<void>): Promise<void> {
		actionError = null
		services.reader.setActivePane(paneIndex)
		try {
			await action()
		} catch (error) {
			actionError = describeError(error)
		}
	}

	/** An action that takes the message out of view, so the tab closes first. */
	async function closingAction(action: (message: ThreadMessage) => Promise<void>): Promise<void> {
		const current = target
		if (!current) return
		await run(async () => {
			services.reader.closeActive()
			await action(current)
		})
	}

	async function reply(replyAll: boolean): Promise<void> {
		const message = newest
		if (!message) return
		await run(async () => {
			const body = await services.reader.loadBody(message.messageId)
			services.composer.openReply(message, body, replyAll)
		})
	}

	async function editDraft(): Promise<void> {
		const current = target
		if (!current) return
		await run(async () => {
			const body = await services.reader.loadBody(current.messageId)
			await services.composer.editDraft(current, body)
		})
	}

	async function toggleFlag(): Promise<void> {
		const current = target
		if (!current) return
		await run(() => services.mailbox.toggleFlagged(current))
	}

	async function markUnread(): Promise<void> {
		await closingAction((message) => services.mailbox.markSeen(message, false))
	}
</script>

<View style={{ direction: 'row', align: 'center', gap: 2, wrap: true, rowGap: 6 }}>
	{#if actionError}
		<Text
			style={{
				...typeStyle('caption'),
				color: theme.colors.danger,
				maxWidth: 260,
				truncate: true,
				marginRight: 6
			}}
		>
			{actionError}
		</Text>
	{/if}
	{#if isDraft}
		<IconButton icon={pencilIcon} label="Edit draft" size="sm" onpress={() => void editDraft()} />
	{:else}
		<IconButton icon={replyIcon} label="Reply (r)" size="sm" onpress={() => void reply(false)} />
		<IconButton
			icon={replyAllIcon}
			label="Reply all (a)"
			size="sm"
			onpress={() => void reply(true)}
		/>
	{/if}
	<Slot name="thread.actions" props={{ tab }} />
	{#if target}
		<View style={{ flex: 1, minWidth: 6 }} />
		<IconButton
			icon={starIcon}
			selectedIcon={starFilledIcon}
			selected={target.flagged}
			label={flagLabel}
			size="sm"
			onpress={() => void toggleFlag()}
		/>
		<IconButton
			icon={unreadIcon}
			label="Mark as unread (u)"
			size="sm"
			onpress={() => void markUnread()}
		/>
		<IconButton
			icon={archiveIcon}
			label="Archive (e)"
			size="sm"
			onpress={() => void closingAction((message) => services.mailbox.archive(message))}
		/>
		<IconButton
			icon={trashIcon}
			label="Delete (#)"
			size="sm"
			onpress={() => void closingAction((message) => services.mailbox.remove(message))}
		/>
		{#if moveItems.length > 0}
			<Menu items={moveItems} placement="bottom-end">
				{#snippet trigger(triggerProps)}
					<IconButton icon={folderIcon} label="Move to…" size="sm" onpress={triggerProps.onpress} />
				{/snippet}
			</Menu>
		{/if}
	{/if}
</View>
