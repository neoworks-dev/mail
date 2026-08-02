<script lang="ts">
	// Right-click menu for a thread row. "Category" and "Move to" open hover
	// flyouts; the flyout side flips when the menu sits near the right edge.
	import { ALL_MAIL_LABELS, type ThreadSummary } from '../../../shared/mail'
	import {
		ArchiveIcon,
		ArrowBendUpLeftIcon,
		CaretRightIcon,
		EnvelopeSimpleIcon,
		FolderIcon,
		PlusIcon,
		SquareSplitHorizontalIcon,
		StarIcon,
		TagIcon,
		TrashIcon
	} from '../icons'
	import { mailState } from '../state/mail.svelte'

	interface Props {
		x: number
		y: number
		thread: ThreadSummary
		onClose: () => void
	}

	let { x, y, thread, onClose }: Props = $props()

	const LABEL_TITLES: Record<string, string> = {
		newsletter: 'Newsletter',
		ad: 'Ads',
		notification: 'Updates',
		social: 'Social',
		spam: 'Spam'
	}

	const MENU_WIDTH = 208

	let menuElement = $state<HTMLElement | null>(null)

	// Keep the menu on screen; measured after mount.
	const position = $derived.by(() => {
		let left = x
		let top = y
		if (menuElement) {
			const rect = menuElement.getBoundingClientRect()
			if (left + rect.width > window.innerWidth - 8) left = window.innerWidth - rect.width - 8
			if (top + rect.height > window.innerHeight - 8) top = window.innerHeight - rect.height - 8
		}
		return { left, top }
	})

	/** Open flyouts to the left when a second menu width would overflow. */
	const flyoutSide = $derived(
		position.left + MENU_WIDTH * 2 > window.innerWidth - 8 ? 'right-full' : 'left-full'
	)

	const moveTargets = $derived(
		mailState.folders.filter(
			(folder) => folder.accountId === thread.accountId && folder.folderId !== thread.folderId
		)
	)

	/**
	 * Close the menu, then act on a SNAPSHOT of the thread prop — after
	 * onClose() the menu unmounts and the reactive prop getter would
	 * dereference null inside the async action.
	 */
	function run(action: (target: ThreadSummary) => void | Promise<void>): void {
		const target = thread
		onClose()
		void action(target)
	}

	async function markRead(target: ThreadSummary): Promise<void> {
		target.seen = true
		target.threadUnread = 0
		await window.neomail.messages.markSeen(target.messageId, true)
	}

	async function openReplyFromRow(target: ThreadSummary): Promise<void> {
		await mailState.openThread(target)
		if (mailState.replyTarget) mailState.openReply(mailState.replyTarget, false)
	}
</script>

<svelte:window onkeydown={(event) => event.key === 'Escape' && onClose()} />

<!-- svelte-ignore a11y_no_static_element_interactions, a11y_click_events_have_key_events -->
<div class="fixed inset-0 z-40" onclick={onClose} oncontextmenu={(event) => {
	event.preventDefault()
	onClose()
}}></div>
<div
	bind:this={menuElement}
	class="border-line bg-raised fixed z-50 w-52 rounded-lg border py-1 shadow-lg"
	style="left: {position.left}px; top: {position.top}px"
>
	<button
		class="hover:bg-hover flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm"
		onclick={() => run((target) => mailState.openThread(target))}
	>
		<EnvelopeSimpleIcon size={14} class="text-muted shrink-0" />
		Open
	</button>
	<button
		class="hover:bg-hover flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm"
		onclick={() => run((target) => mailState.openThreadInNewTab(target.accountId, target.threadId))}
	>
		<PlusIcon size={14} class="text-muted shrink-0" />
		Open in new tab
	</button>
	<button
		class="hover:bg-hover flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm"
		onclick={() => run((target) => mailState.openThreadInSplit(target.accountId, target.threadId))}
	>
		<SquareSplitHorizontalIcon size={14} class="text-muted shrink-0" />
		Open in split view
	</button>
	<button
		class="hover:bg-hover flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm"
		onclick={() => run(openReplyFromRow)}
	>
		<ArrowBendUpLeftIcon size={14} class="text-muted shrink-0" />
		Reply
	</button>
	<div class="border-line-faint my-1 border-t"></div>
	{#if thread.threadUnread > 0}
		<button
			class="hover:bg-hover flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm"
			onclick={() => run(markRead)}
		>
			<EnvelopeSimpleIcon size={14} class="text-muted shrink-0" />
			Mark as read
		</button>
	{:else}
		<button
			class="hover:bg-hover flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm"
			onclick={() => run((target) => mailState.markUnread(target))}
		>
			<EnvelopeSimpleIcon size={14} class="text-muted shrink-0" />
			Mark as unread
		</button>
	{/if}
	<button
		class="hover:bg-hover flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm"
		onclick={() => run((target) => mailState.toggleFlagged(target))}
	>
		<StarIcon size={14} class="text-muted shrink-0" />
		{thread.flagged ? 'Remove flag' : 'Flag'}
	</button>
	<div class="border-line-faint my-1 border-t"></div>

	<div class="group/label relative">
		<button class="group-hover/label:bg-hover flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm">
			<TagIcon size={14} class="text-muted shrink-0" />
			<span class="min-w-0 flex-1">Category</span>
			<CaretRightIcon size={12} class="text-faint shrink-0" />
		</button>
		<div
			class="border-line bg-raised absolute top-0 {flyoutSide} z-10 hidden w-44 rounded-lg border py-1 shadow-lg group-hover/label:block"
		>
			<button
				class="hover:bg-hover flex w-full items-center px-3 py-1.5 text-left text-sm
					{thread.label === null ? 'font-medium' : ''}"
				onclick={() => run((target) => mailState.setMessageLabel(target, null))}
			>
				No category
			</button>
			{#each ALL_MAIL_LABELS as label (label)}
				<button
					class="hover:bg-hover flex w-full items-center px-3 py-1.5 text-left text-sm
						{thread.label === label ? 'font-medium' : ''}"
					onclick={() => run((target) => mailState.setMessageLabel(target, label))}
				>
					{LABEL_TITLES[label]}
				</button>
			{/each}
		</div>
	</div>

	{#if moveTargets.length > 0}
		<div class="group/move relative">
			<button class="group-hover/move:bg-hover flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm">
				<FolderIcon size={14} class="text-muted shrink-0" />
				<span class="min-w-0 flex-1">Move to</span>
				<CaretRightIcon size={12} class="text-faint shrink-0" />
			</button>
			<div
				class="border-line bg-raised absolute top-0 {flyoutSide} z-10 hidden max-h-64 w-44 overflow-y-auto rounded-lg border py-1 shadow-lg group-hover/move:block"
			>
				{#each moveTargets as folder (folder.folderId)}
					<button
						class="hover:bg-hover flex w-full items-center px-3 py-1.5 text-left text-sm"
						onclick={() => run((target) => mailState.moveMessage(target, folder.folderId))}
					>
						<span class="min-w-0 flex-1 truncate">{folder.name}</span>
					</button>
				{/each}
			</div>
		</div>
	{/if}

	<div class="border-line-faint my-1 border-t"></div>
	<button
		class="hover:bg-hover flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm"
		onclick={() => run((target) => mailState.archiveMessage(target))}
	>
		<ArchiveIcon size={14} class="text-muted shrink-0" />
		Archive
	</button>
	<button
		class="hover:bg-hover text-red flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm"
		onclick={() => run((target) => mailState.deleteMessage(target))}
	>
		<TrashIcon size={14} class="shrink-0" />
		Delete
	</button>
</div>
