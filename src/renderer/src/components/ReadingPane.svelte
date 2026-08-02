<script lang="ts">
	import { Button, Select, Tooltip } from '@neoworks-dev/ui'
	import { ALL_MAIL_LABELS, type ThreadMessage } from '../../../shared/mail'
	import {
		ArchiveIcon,
		ArrowBendDoubleUpLeftIcon,
		ArrowBendUpLeftIcon,
		EnvelopeSimpleIcon,
		PencilSimpleIcon,
		SparkleIcon,
		SquareSplitHorizontalIcon,
		StarIcon,
		TrashIcon,
		XIcon
	} from '../icons'
	import { renderMarkdown } from '../nib/markdown'
	import { mailState, type ReadingTab } from '../state/mail.svelte'
	import MessageBodyFrame from './MessageBodyFrame.svelte'

	interface Props {
		paneIndex: number
	}

	let { paneIndex }: Props = $props()

	const pane = $derived(mailState.panes[paneIndex])
	const tab = $derived.by((): ReadingTab | null => {
		if (!pane || pane.tabs.length === 0) return null
		return pane.tabs[Math.min(pane.activeTabIndex, pane.tabs.length - 1)]
	})

	const messages = $derived(tab ? tab.messages : [])
	const threadOpen = $derived(tab !== null && tab.view.kind === 'thread' && messages.length > 0)

	// Toolbar actions target the tab's newest message in the selected folder.
	const actionTarget = $derived.by((): ThreadMessage | null => {
		if (messages.length === 0) return null
		if (mailState.selectedFolderId !== null) {
			const inFolder = messages.filter((message) => message.folderId === mailState.selectedFolderId)
			if (inFolder.length > 0) return inFolder[inFolder.length - 1]
		}
		return messages[messages.length - 1]
	})

	const replyTarget = $derived.by((): ThreadMessage | null => {
		if (messages.length === 0) return null
		return messages[messages.length - 1]
	})

	const canMove = $derived.by(() => {
		if (!actionTarget) return false
		return mailState.folders.some((folder) => folder.accountId === actionTarget.accountId)
	})

	const subject = $derived(messages.length > 0 ? messages[0].subject : '')

	const summary = $derived.by(() => {
		if (!tab || tab.view.kind !== 'thread') return null
		const state = mailState.threadSummaries[tab.view.threadId]
		if (!state) return null
		return state
	})

	const inDraftsFolder = $derived.by(() => {
		const folder = mailState.folders.find((entry) => entry.folderId === mailState.selectedFolderId)
		if (!folder) return false
		return folder.specialUse === '\\Drafts' || folder.name === 'Drafts'
	})

	let actionError = $state<string | null>(null)

	const shipment = $derived.by(() => {
		if (!tab || !actionTarget) return null
		const body = tab.bodies[actionTarget.messageId]
		if (!body) return null
		return body.shipment
	})

	const actionItems = $derived.by(() => {
		if (!tab || !actionTarget) return null
		const body = tab.bodies[actionTarget.messageId]
		if (!body || !body.actions || body.actions.items.length === 0) return null
		return body.actions.items
	})

	let trackingCopied = $state(false)

	async function copyTrackingNumber(trackingNumber: string): Promise<void> {
		await navigator.clipboard.writeText(trackingNumber)
		trackingCopied = true
		setTimeout(() => (trackingCopied = false), 1500)
	}

	const security = $derived.by(() => {
		if (!tab || !actionTarget) return null
		const body = tab.bodies[actionTarget.messageId]
		if (!body) return null
		return body.security
	})

	const authFailures = $derived.by(() => {
		if (!security || !security.auth) return []
		const failing = ['fail', 'softfail', 'permerror']
		const failures: string[] = []
		if (security.auth.spf && failing.includes(security.auth.spf)) {
			failures.push(`SPF ${security.auth.spf}`)
		}
		if (security.auth.dkim && failing.includes(security.auth.dkim)) {
			failures.push(`DKIM ${security.auth.dkim}`)
		}
		if (security.auth.dmarc && failing.includes(security.auth.dmarc)) {
			failures.push(`DMARC ${security.auth.dmarc}`)
		}
		return failures
	})

	const securityNoteworthy = $derived.by(() => {
		if (!security) return false
		return security.nameSpoof !== null || authFailures.length > 0 || security.firstTimeSender
	})

	const unsubscribeAvailable = $derived.by(() => {
		if (!tab || !actionTarget) return false
		const body = tab.bodies[actionTarget.messageId]
		if (!body) return false
		return body.unsubscribe !== null
	})

	let unsubscribeState = $state<'idle' | 'confirm' | 'working' | 'done'>('idle')

	$effect(() => {
		void tab?.view
		unsubscribeState = 'idle'
	})

	async function runUnsubscribe(): Promise<void> {
		if (!actionTarget) return
		unsubscribeState = 'working'
		try {
			await window.neomail.messages.unsubscribe(actionTarget.messageId)
			unsubscribeState = 'done'
		} catch (error) {
			unsubscribeState = 'idle'
			actionError = error instanceof Error ? error.message : String(error)
		}
	}

	const moveOptions = $derived([
		{ value: '', label: 'Move to…' },
		...mailState.folders
			.filter((folder) => folder.folderId !== mailState.selectedFolderId)
			.map((folder) => ({ value: String(folder.folderId), label: folder.name }))
	])

	const labelOptions = [
		{ value: 'none', label: 'No category' },
		...ALL_MAIL_LABELS.map((label) => ({
			value: label,
			label: label.charAt(0).toUpperCase() + label.slice(1)
		}))
	]

	function onLabelSelect(value: string | string[]): void {
		if (typeof value !== 'string' || !actionTarget) return
		const target = actionTarget
		const label = value === 'none' ? null : value
		if (label === target.label) return
		void runAction(() => mailState.setMessageLabel(target, label))
	}

	async function runAction(action: () => Promise<void>): Promise<void> {
		actionError = null
		try {
			await action()
		} catch (error) {
			actionError = error instanceof Error ? error.message : String(error)
		}
	}

	function onMoveSelect(value: string | string[]): void {
		if (typeof value !== 'string' || value === '' || !actionTarget) return
		const target = actionTarget
		void runAction(() => mailState.moveMessage(target, Number(value)))
	}

	function senderLabel(message: ThreadMessage): string {
		if (message.fromName !== '') return `${message.fromName} <${message.fromAddress}>`
		return message.fromAddress
	}

	function formatFullDate(iso: string): string {
		return new Date(iso).toLocaleString(undefined, {
			weekday: 'short',
			day: 'numeric',
			month: 'short',
			year: 'numeric',
			hour: '2-digit',
			minute: '2-digit'
		})
	}

	function recipientLine(addresses: Array<{ name: string; address: string }>): string {
		return addresses
			.map((entry) => {
				if (entry.name !== '') return `${entry.name} <${entry.address}>`
				return entry.address
			})
			.join(', ')
	}

	const showTabBar = $derived(pane && (pane.tabs.length > 1 || mailState.panes.length > 1))

	/** Every open tab across panes, for the empty-pane overview list. */
	const allOpenTabs = $derived.by(() => {
		const entries: Array<{ paneIndex: number; tabIndex: number; tab: ReadingTab }> = []
		mailState.panes.forEach((paneState, entryPaneIndex) => {
			paneState.tabs.forEach((entryTab, entryTabIndex) => {
				entries.push({ paneIndex: entryPaneIndex, tabIndex: entryTabIndex, tab: entryTab })
			})
		})
		return entries
	})

	function tabSubtitle(entry: { tab: ReadingTab }): string {
		if (entry.tab.view.kind === 'digest') return 'Daily digest'
		const newest = entry.tab.messages[entry.tab.messages.length - 1]
		if (!newest) return ''
		if (newest.fromName !== '') return newest.fromName
		return newest.fromAddress
	}
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<section
	class="flex min-w-0 flex-1 flex-col"
	onclickcapture={() => mailState.setActivePane(paneIndex)}
>
	{#if showTabBar}
		<div class="border-line-faint flex shrink-0 items-center gap-0.5 border-b px-1.5 py-1">
			{#each pane.tabs as paneTab, tabIndex (paneTab.id)}
				<div
					class="group/tab flex min-w-0 max-w-44 items-center gap-1 rounded-lg px-2 py-0.5
						{tabIndex === pane.activeTabIndex ? 'bg-raised' : 'hover:bg-hover'}"
				>
					<button
						class="min-w-0 flex-1 truncate text-left text-xs
							{tabIndex === pane.activeTabIndex ? '' : 'text-muted'}"
						onclick={() => mailState.setActiveTab(paneIndex, tabIndex)}
					>
						{paneTab.title}
					</button>
					<button
						class="text-faint hover:text-default invisible shrink-0 group-hover/tab:visible"
						title="Close tab"
						onclick={() => mailState.closeTab(paneIndex, tabIndex)}
					>
						<XIcon size={11} />
					</button>
				</div>
			{/each}
			<span class="flex-1"></span>
			<Tooltip text={mailState.panes.length > 1 ? 'Close split' : 'Split view'} placement="bottom">
				<Button
					variant="ghost"
					size="sm"
					icon={SquareSplitHorizontalIcon}
					onclick={() => void mailState.toggleSplit()}
				/>
			</Tooltip>
		</div>
	{/if}

	{#if tab && tab.view.kind === 'digest'}
		{#if mailState.dailyDigest}
			{@const digest = mailState.dailyDigest}
			<div class="flex min-h-0 flex-1 flex-col overflow-y-auto p-6">
				<div class="mx-auto w-full max-w-xl">
					<div class="mb-2 flex items-baseline justify-between">
						<h2 class="text-sm font-semibold">
							Daily digest{digest.running ? ' — generating…' : ''}
						</h2>
						<button
							class="text-faint hover:text-default text-xs"
							onclick={() => mailState.dismissDigest()}
						>
							Dismiss
						</button>
					</div>
					{#if digest.error}
						<p class="text-red text-sm">{digest.error}</p>
					{:else}
						{#if digest.intro}
							<p class="text-muted mb-3 text-sm">{digest.intro}</p>
						{/if}
						{#each digest.groups as group (group.title)}
							<h3 class="text-faint mt-4 mb-1.5 text-[10px] font-medium tracking-wide uppercase">
								{group.title}
							</h3>
							<div class="flex flex-col gap-1.5">
								{#each group.cards as card (card.threadId)}
									<button
										class="border-line-faint bg-raised hover:bg-hover flex w-full flex-col gap-0.5 rounded-lg border px-3 py-2 text-left"
										onclick={() => void mailState.openThreadById(card.accountId, card.threadId)}
									>
										<span class="flex items-baseline justify-between gap-2">
											<span class="truncate text-sm font-medium">{card.sender}</span>
											{#if card.label}
												<span class="text-faint shrink-0 text-[10px]">{card.label}</span>
											{/if}
										</span>
										<span class="truncate text-sm">{card.subject}</span>
										{#if card.note !== ''}
											<span class="text-muted text-xs">{card.note}</span>
										{:else}
											<span class="text-faint truncate text-xs">{card.snippet}</span>
										{/if}
									</button>
								{/each}
							</div>
						{/each}
						{#if digest.prose}
							<!-- eslint-disable-next-line svelte/no-at-html-tags -- sanitized by renderMarkdown -->
							<div class="prose prose-sm max-w-none text-sm">{@html renderMarkdown(digest.prose)}</div>
						{/if}
					{/if}
				</div>
			</div>
		{:else}
			<div class="flex flex-1 flex-col items-center justify-center gap-3">
				<p class="text-faint text-sm">No digest generated yet</p>
				<Button size="sm" onclick={() => void mailState.generateDigest(false)}>Generate digest</Button>
			</div>
		{/if}
	{:else if !threadOpen}
		{#if allOpenTabs.length > 0}
			<div class="flex min-h-0 flex-1 flex-col overflow-y-auto p-6">
				<div class="mx-auto w-full max-w-xl">
					<h2 class="text-faint mb-2 text-[10px] font-medium tracking-wide uppercase">Open tabs</h2>
					<div class="flex flex-col gap-1.5">
						{#each allOpenTabs as entry (entry.tab.id)}
							<div
								class="border-line-faint bg-raised hover:bg-hover group/open flex items-center gap-2 rounded-lg border px-3 py-2"
							>
								<button
									class="flex min-w-0 flex-1 flex-col gap-0.5 text-left"
									onclick={() => mailState.setActiveTab(entry.paneIndex, entry.tabIndex)}
								>
									<span class="truncate text-sm font-medium">{entry.tab.title}</span>
									{#if tabSubtitle(entry) !== ''}
										<span class="text-muted truncate text-xs">{tabSubtitle(entry)}</span>
									{/if}
								</button>
								{#if mailState.panes.length > 1}
									<span class="text-faint shrink-0 text-[10px]">
										pane {entry.paneIndex + 1}
									</span>
								{/if}
								<button
									class="text-faint hover:text-default invisible shrink-0 group-hover/open:visible"
									title="Close tab"
									onclick={() => mailState.closeTab(entry.paneIndex, entry.tabIndex)}
								>
									<XIcon size={12} />
								</button>
							</div>
						{/each}
					</div>
				</div>
			</div>
		{:else}
			<div class="text-faint flex h-full items-center justify-center text-sm">
				Select a conversation to read
			</div>
		{/if}
	{:else if tab}
		<header class="border-line-faint flex shrink-0 items-center gap-2 border-b px-4 py-2">
			<h2 class="min-w-0 flex-1 truncate text-sm font-semibold">{subject || '(no subject)'}</h2>
			{#if inDraftsFolder && actionTarget}
				{@const target = actionTarget}
				<Tooltip text="Edit draft" placement="bottom">
					<Button
						variant="ghost"
						size="sm"
						icon={PencilSimpleIcon}
						onclick={() => void mailState.editDraft(target)}
					/>
				</Tooltip>
			{:else if replyTarget}
				{@const reply = replyTarget}
				<Tooltip text="Reply (r)" placement="bottom">
					<Button
						variant="ghost"
						size="sm"
						icon={ArrowBendUpLeftIcon}
						onclick={() => mailState.openReply(reply, false)}
					/>
				</Tooltip>
				<Tooltip text="Reply all (a)" placement="bottom">
					<Button
						variant="ghost"
						size="sm"
						icon={ArrowBendDoubleUpLeftIcon}
						onclick={() => mailState.openReply(reply, true)}
					/>
				</Tooltip>
			{/if}
			{#if !summary}
				<Tooltip text="Summarize with AI" placement="bottom">
					<Button
						variant="ghost"
						size="sm"
						icon={SparkleIcon}
						onclick={() => void mailState.summarizeOpenThread()}
					/>
				</Tooltip>
			{/if}
			{#if actionTarget}
				{@const target = actionTarget}
				<span class="bg-line mx-1 h-4 w-px"></span>
				<Tooltip text={target.flagged ? 'Remove flag (s)' : 'Flag (s)'} placement="bottom">
					<Button
						variant="ghost"
						size="sm"
						onclick={() => void runAction(() => mailState.toggleFlagged(target))}
					>
						<span class={target.flagged ? 'text-amber' : ''}>
							<StarIcon size={14} weight={target.flagged ? 'fill' : 'bold'} />
						</span>
					</Button>
				</Tooltip>
				<Tooltip text="Mark as unread (u)" placement="bottom">
					<Button
						variant="ghost"
						size="sm"
						icon={EnvelopeSimpleIcon}
						onclick={() => void runAction(() => mailState.markUnread(target))}
					/>
				</Tooltip>
				<Tooltip text="Archive (e)" placement="bottom">
					<Button
						variant="ghost"
						size="sm"
						icon={ArchiveIcon}
						onclick={() => void runAction(() => mailState.archiveMessage(target))}
					/>
				</Tooltip>
				<Tooltip text="Delete (#)" placement="bottom">
					<Button
						variant="ghost"
						size="sm"
						onclick={() => void runAction(() => mailState.deleteMessage(target))}
					>
						<span class="text-red"><TrashIcon size={14} weight="bold" /></span>
					</Button>
				</Tooltip>
				<div class="w-32">
					<Select
						value={target.label === null ? 'none' : target.label}
						options={labelOptions}
						onChange={onLabelSelect}
					/>
				</div>
				{#if canMove}
					<div class="w-36">
						<Select value="" options={moveOptions} onChange={onMoveSelect} />
					</div>
				{/if}
			{/if}
		</header>

		{#if actionError}
			<p class="text-red border-line shrink-0 border-b px-4 py-1.5 text-xs">{actionError}</p>
		{/if}

		{#if security && securityNoteworthy}
			<div
				class="border-line-faint bg-raised flex shrink-0 flex-wrap items-center gap-x-3 gap-y-0.5 border-b px-4 py-1.5 text-xs"
			>
				{#if security.nameSpoof}
					<span class="text-red font-medium">
						⚠ Sender name claims {security.nameSpoof.claimedDomain}, but the message came from
						{security.nameSpoof.actualDomain}
					</span>
				{/if}
				{#if authFailures.length > 0}
					<span class="text-red">Authentication failed: {authFailures.join(', ')}</span>
				{/if}
				{#if security.firstTimeSender}
					<span class="text-muted">First message from this sender</span>
				{/if}
			</div>
		{/if}

		{#if unsubscribeAvailable && unsubscribeState !== 'done'}
			<div class="border-line-faint flex shrink-0 items-center gap-2 border-b px-4 py-1.5 text-xs">
				<span class="text-muted min-w-0 flex-1 truncate">Mailing list</span>
				{#if unsubscribeState === 'idle'}
					<button class="text-default hover:underline" onclick={() => (unsubscribeState = 'confirm')}>
						Unsubscribe
					</button>
				{:else if unsubscribeState === 'confirm'}
					<span class="text-muted">Really unsubscribe?</span>
					<button class="text-red hover:underline" onclick={() => void runUnsubscribe()}>Yes</button>
					<button class="text-muted hover:underline" onclick={() => (unsubscribeState = 'idle')}>
						No
					</button>
				{:else}
					<span class="text-faint">Unsubscribing…</span>
				{/if}
			</div>
		{:else if unsubscribeState === 'done'}
			<p class="text-green border-line-faint shrink-0 border-b px-4 py-1.5 text-xs">
				Unsubscribed — the list may take a few days to stop sending.
			</p>
		{/if}

		{#if shipment || mailState.extractingShipment || mailState.shipmentExtractionError}
			<div class="border-line-faint bg-raised shrink-0 border-b px-4 py-2 text-xs">
				{#if mailState.extractingShipment}
					<span class="text-faint">Extracting shipment info with AI…</span>
				{:else if shipment}
					<div class="flex flex-wrap items-center gap-2">
						<span class="font-medium">📦 {shipment.carrier}</span>
						{#if shipment.trackingNumber}
							<button
								class="border-line hover:border-line-strong rounded border px-1.5 py-0.5 font-mono"
								title="Copy tracking number"
								onclick={() => void copyTrackingNumber(shipment.trackingNumber || '')}
							>
								{trackingCopied ? 'Copied!' : shipment.trackingNumber}
							</button>
						{/if}
						{#if shipment.status}
							<span class="text-muted">{shipment.status}</span>
						{/if}
						{#if shipment.deliveryDate}
							<span class="text-muted">· ETA {shipment.deliveryDate}</span>
						{/if}
						{#if shipment.trackingNumber}
							<button
								class="text-default hover:underline"
								title="Fetch the live status from the carrier API"
								onclick={() => void mailState.refreshShipmentStatus()}
							>
								{mailState.trackingShipment ? 'Updating…' : shipment.trackedAt ? 'Update status' : 'Track now'}
							</button>
						{/if}
						{#if shipment.trackingUrl}
							<a
								href={shipment.trackingUrl}
								target="_blank"
								rel="noreferrer"
								class="text-muted hover:underline"
							>
								↗
							</a>
						{/if}
						{#if shipment.source === 'ai'}
							<span class="text-faint">AI</span>
						{/if}
					</div>
					{#if shipment.lastEvent}
						<p class="text-muted mt-1">
							{shipment.lastEvent}
							{#if shipment.trackedAt}
								<span class="text-faint">
									· checked {new Date(shipment.trackedAt).toLocaleTimeString(undefined, {
										hour: '2-digit',
										minute: '2-digit'
									})}
								</span>
							{/if}
						</p>
					{/if}
				{:else if mailState.shipmentExtractionError}
					<span class="text-red">{mailState.shipmentExtractionError}</span>
				{/if}
			</div>
		{/if}

		{#if actionItems || mailState.extractingActions}
			<div class="border-line-faint bg-raised shrink-0 border-b px-4 py-2 text-xs">
				{#if mailState.extractingActions}
					<span class="text-faint">Extracting action items with AI…</span>
				{:else if actionItems}
					<p class="text-faint mb-1 text-[10px] font-medium tracking-wide uppercase">Action items · AI</p>
					<ul class="flex flex-col gap-0.5">
						{#each actionItems as item, index (index)}
							<li class="flex items-baseline gap-1.5">
								<span class="text-faint">○</span>
								<span class="min-w-0 flex-1">{item.title}</span>
								{#if item.due}
									<span class="text-amber shrink-0">{item.due}</span>
								{/if}
							</li>
						{/each}
					</ul>
				{/if}
			</div>
		{/if}

		{#if summary && tab.view.kind === 'thread'}
			{@const threadId = tab.view.threadId}
			<div class="border-line-faint bg-raised shrink-0 border-b px-4 py-2.5">
				<div class="flex items-start justify-between gap-3">
					<div class="min-w-0 flex-1">
						<p class="text-faint mb-1 text-[10px] font-medium tracking-wide uppercase">
							AI summary{summary.running ? ' — generating…' : ''}
						</p>
						{#if summary.error}
							<p class="text-red text-xs">{summary.error}</p>
						{:else}
							<p class="text-sm whitespace-pre-wrap">{summary.text}</p>
						{/if}
					</div>
					<button
						class="text-faint hover:text-default shrink-0 text-xs"
						title="Dismiss summary"
						onclick={() => mailState.dismissSummary(threadId)}
					>
						✕
					</button>
				</div>
			</div>
		{/if}

		<div class="flex min-h-0 flex-1 flex-col overflow-y-auto">
			{#each messages as message (message.messageId)}
				{#if tab.expandedMessageId === message.messageId}
					<article class="border-line-faint flex min-h-96 flex-1 flex-col border-b">
						<button
							class="hover:bg-hover flex shrink-0 flex-col gap-0.5 px-5 py-2.5 text-left"
							onclick={() => void mailState.toggleExpanded(tab, message.messageId)}
						>
							<div class="flex items-baseline justify-between gap-2">
								<span class="text-default truncate text-sm font-medium">{senderLabel(message)}</span>
								<span class="text-faint shrink-0 text-xs">{formatFullDate(message.date)}</span>
							</div>
							{#if tab.bodies[message.messageId]}
								{@const body = tab.bodies[message.messageId]}
								<div class="text-muted flex flex-col gap-0.5 text-xs">
									{#if body.toAddresses.length > 0}
										<span class="truncate">To: {recipientLine(body.toAddresses)}</span>
									{/if}
									{#if body.ccAddresses.length > 0}
										<span class="truncate">Cc: {recipientLine(body.ccAddresses)}</span>
									{/if}
								</div>
							{/if}
						</button>
						{#if tab.bodies[message.messageId]}
							{@const body = tab.bodies[message.messageId]}
							{@const chips = body.attachments
								.filter((attachment) => !attachment.isInline)
								.map((attachment) => ({
									attachmentId: attachment.attachmentId,
									filename: attachment.filename || 'attachment',
									size: attachment.size
								}))}
							{#if chips.length > 0}
								<div class="border-line-faint flex shrink-0 flex-wrap gap-1.5 border-t px-5 py-2">
									{#each chips as chip (chip.attachmentId)}
										<button
											class="border-line bg-raised hover:bg-hover flex items-center gap-1.5 rounded-lg border px-2 py-0.5 text-xs"
											title="Save attachment"
											onclick={() => void window.neomail.attachments.save(chip.attachmentId)}
										>
											<span class="max-w-48 truncate">{chip.filename}</span>
											<span class="text-faint">
												{chip.size < 1024
													? `${chip.size} B`
													: chip.size < 1024 * 1024
														? `${Math.round(chip.size / 1024)} KB`
														: `${(chip.size / (1024 * 1024)).toFixed(1)} MB`}
											</span>
										</button>
									{/each}
								</div>
							{/if}
							{#key message.messageId}
								<MessageBodyFrame
									htmlBody={body.htmlBody}
									textBody={body.textBody}
									attachments={body.attachments}
								/>
							{/key}
						{:else}
							<p class="text-faint px-5 py-3 text-xs">Loading…</p>
						{/if}
					</article>
				{:else}
					<button
						class="border-line-faint hover:bg-hover flex shrink-0 items-baseline gap-2 border-b px-5 py-2 text-left"
						onclick={() => void mailState.toggleExpanded(tab, message.messageId)}
					>
						<span class="text-muted w-48 shrink-0 truncate text-sm">
							{message.fromName || message.fromAddress}
						</span>
						<span class="text-faint min-w-0 flex-1 truncate text-xs">{message.snippet}</span>
						{#if message.folderPath !== 'INBOX'}
							<span class="text-faint border-line shrink-0 rounded border px-1 text-[10px]">
								{message.folderPath}
							</span>
						{/if}
						<span class="text-faint shrink-0 text-xs tabular-nums">{formatFullDate(message.date)}</span>
					</button>
				{/if}
			{/each}
		</div>
	{/if}
</section>
