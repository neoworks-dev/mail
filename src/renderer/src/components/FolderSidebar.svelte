<script lang="ts">
	import { Button, Tooltip } from '@neoworks-dev/ui'
	import type { Component } from 'svelte'
	import { ALL_MAIL_LABELS, type MailFolder, type SyncStatus } from '../../../shared/mail'
	import {
		ArchiveIcon,
		CaretDownIcon,
		CaretRightIcon,
		FolderIcon,
		MoonIcon,
		NotePencilIcon,
		PaperPlaneTiltIcon,
		PlusIcon,
		SidebarSimpleIcon,
		StackSimpleIcon,
		SunIcon,
		TrashIcon,
		TrayIcon,
		WarningIcon
	} from '../icons'
	import { mailState } from '../state/mail.svelte'
	import { themeState } from '../state/theme.svelte'

	const COLLAPSED_KEY = 'neomail:sidebar:collapsed'
	const FOLDERS_OPEN_KEY = 'neomail:sidebar:folders'

	let collapsed = $state(localStorage.getItem(COLLAPSED_KEY) === '1')
	let foldersOpen = $state(localStorage.getItem(FOLDERS_OPEN_KEY) === '1')

	function toggleCollapsed(): void {
		collapsed = !collapsed
		localStorage.setItem(COLLAPSED_KEY, collapsed ? '1' : '0')
	}

	function toggleFolders(): void {
		foldersOpen = !foldersOpen
		localStorage.setItem(FOLDERS_OPEN_KEY, foldersOpen ? '1' : '0')
	}

	let accountMenuOpen = $state(false)

	const currentAccountEmail = $derived.by((): string => {
		const account = mailState.accounts.find(
			(entry) => entry.accountId === mailState.selectedAccountId
		)
		if (account) return account.email
		if (mailState.accounts.length > 0) return mailState.accounts[0].email
		return ''
	})

	function chooseAccount(accountId: number): void {
		accountMenuOpen = false
		void mailState.selectAccount(accountId)
	}

	function openAccountSetup(): void {
		accountMenuOpen = false
		mailState.accountSetupOpen = true
	}

	const currentStatus = $derived.by((): SyncStatus | null => {
		if (mailState.selectedAccountId === null) return null
		const status = mailState.syncStatuses[mailState.selectedAccountId]
		if (!status) return null
		return status
	})

	function statusLabel(status: SyncStatus): string {
		if (status.phase === 'connecting') return 'Connecting…'
		if (status.phase === 'listing') return 'Listing folders…'
		if (status.phase === 'backfill') {
			return `Syncing ${status.folderPath} · ${status.downloadedMessages}/${status.totalMessages}`
		}
		if (status.phase === 'error') return `Error: ${status.errorMessage}`
		return 'Up to date'
	}

	const LABEL_TITLES: Record<string, string> = {
		newsletter: 'Newsletter',
		ad: 'Ads',
		notification: 'Updates',
		social: 'Social',
		spam: 'Spam'
	}

	type SpecialKind = 'inbox' | 'drafts' | 'sent' | 'archive' | 'junk' | 'trash'

	const SPECIAL_ICONS: Record<SpecialKind, Component> = {
		inbox: TrayIcon,
		drafts: NotePencilIcon,
		sent: PaperPlaneTiltIcon,
		archive: ArchiveIcon,
		junk: WarningIcon,
		trash: TrashIcon
	}

	const SPECIAL_ORDER: SpecialKind[] = ['inbox', 'drafts', 'sent', 'archive', 'junk', 'trash']

	const NAME_KINDS: Record<string, SpecialKind> = {
		inbox: 'inbox',
		drafts: 'drafts',
		draft: 'drafts',
		entwürfe: 'drafts',
		sent: 'sent',
		'sent messages': 'sent',
		'sent items': 'sent',
		gesendet: 'sent',
		'gesendete elemente': 'sent',
		archive: 'archive',
		archives: 'archive',
		archiv: 'archive',
		junk: 'junk',
		spam: 'junk',
		trash: 'trash',
		bin: 'trash',
		papierkorb: 'trash',
		'deleted items': 'trash',
		'deleted messages': 'trash',
		gelöscht: 'trash'
	}

	const SPECIAL_USE_KINDS: Record<string, SpecialKind> = {
		'\\Inbox': 'inbox',
		'\\Drafts': 'drafts',
		'\\Sent': 'sent',
		'\\Archive': 'archive',
		'\\Junk': 'junk',
		'\\Trash': 'trash'
	}

	function specialKind(folder: MailFolder): SpecialKind | null {
		if (folder.path === 'INBOX') return 'inbox'
		if (folder.specialUse && SPECIAL_USE_KINDS[folder.specialUse]) {
			return SPECIAL_USE_KINDS[folder.specialUse]
		}
		const byName = NAME_KINDS[folder.name.toLowerCase()]
		if (byName) return byName
		return null
	}

	interface PrimaryFolder {
		folder: MailFolder
		kind: SpecialKind
	}

	const primaryFolders = $derived.by((): PrimaryFolder[] => {
		const found = new Map<SpecialKind, MailFolder>()
		for (const folder of mailState.folders) {
			const kind = specialKind(folder)
			if (kind && !found.has(kind)) found.set(kind, folder)
		}
		const ordered: PrimaryFolder[] = []
		for (const kind of SPECIAL_ORDER) {
			const folder = found.get(kind)
			if (folder) ordered.push({ folder, kind })
		}
		return ordered
	})

	const otherFolders = $derived.by((): MailFolder[] => {
		const primaryIds = new Set(primaryFolders.map((entry) => entry.folder.folderId))
		return mailState.folders.filter((folder) => !primaryIds.has(folder.folderId))
	})

	function displayName(folder: MailFolder): string {
		if (folder.path === 'INBOX') return 'Inbox'
		return folder.name
	}

	function isSelected(folder: MailFolder): boolean {
		return folder.folderId === mailState.selectedFolderId
	}

	/** Category subsections shown under the inbox: All, Priority, one per label. */
	const CATEGORY_ENTRIES: Array<{ label: string | null; title: string }> = [
		{ label: null, title: 'All' },
		{ label: '__priority', title: 'Priority' },
		...ALL_MAIL_LABELS.map((label) => ({
			label: label as string | null,
			title: LABEL_TITLES[label]
		}))
	]

	function categoryCount(counts: Record<string, number>, label: string | null): number {
		if (label === null) return counts['__all'] || 0
		return counts[label] || 0
	}
</script>

<aside class="border-line-faint flex shrink-0 flex-col border-r {collapsed ? 'w-12' : 'w-60'}">
	{#if collapsed}
		<div class="border-line-faint flex flex-col items-center gap-1 border-b p-1.5">
			<Tooltip text="Compose" placement="right">
				<Button variant="primary" size="sm" icon={NotePencilIcon} onclick={() => mailState.openCompose()} />
			</Tooltip>
		</div>

		<nav class="flex flex-1 flex-col items-center gap-0.5 overflow-y-auto p-1.5">
			{#if mailState.accounts.length > 1}
				<Tooltip text="All inboxes" placement="right">
					<button
						class="hover:bg-hover flex h-9 w-9 items-center justify-center rounded-lg
							{mailState.unifiedInbox ? 'bg-raised' : 'text-muted'}"
						onclick={() => mailState.selectUnifiedInbox()}
					>
						<StackSimpleIcon size={16} />
					</button>
				</Tooltip>
			{/if}
			{#each primaryFolders as entry (entry.folder.folderId)}
				{@const Icon = SPECIAL_ICONS[entry.kind]}
				<Tooltip
					text={entry.folder.unreadMessages > 0
						? `${displayName(entry.folder)} · ${entry.folder.unreadMessages} unread`
						: displayName(entry.folder)}
					placement="right"
				>
					<button
						class="hover:bg-hover relative flex h-9 w-9 items-center justify-center rounded-lg
							{isSelected(entry.folder) ? 'bg-raised' : 'text-muted'}"
						onclick={() => mailState.selectFolder(entry.folder.folderId)}
					>
						<Icon size={16} />
						{#if entry.folder.unreadMessages > 0}
							<span class="bg-action absolute top-1.5 right-1.5 h-1.5 w-1.5 rounded-full"></span>
						{/if}
					</button>
				</Tooltip>
			{/each}
			{#if otherFolders.length > 0}
				<Tooltip text="Folders" placement="right">
					<button
						class="text-muted hover:bg-hover flex h-9 w-9 items-center justify-center rounded-lg"
						onclick={toggleCollapsed}
					>
						<FolderIcon size={16} />
					</button>
				</Tooltip>
			{/if}
		</nav>

		<div class="border-line-faint flex flex-col items-center gap-1 border-t p-1.5">
			<Tooltip text={themeState.current === 'dark' ? 'Light mode' : 'Dark mode'} placement="right">
				<Button
					variant="ghost"
					size="sm"
					icon={themeState.current === 'dark' ? SunIcon : MoonIcon}
					onclick={() => themeState.toggle()}
				/>
			</Tooltip>
			<Tooltip text="Expand sidebar" placement="right">
				<Button variant="ghost" size="sm" icon={SidebarSimpleIcon} onclick={toggleCollapsed} />
			</Tooltip>
		</div>
	{:else}
		<div class="border-line-faint border-b p-3">
			<Button
				variant="primary"
				size="sm"
				full
				icon={NotePencilIcon}
				onclick={() => mailState.openCompose()}
			>
				Compose
			</Button>
		</div>

		<nav class="flex flex-1 flex-col gap-1 overflow-y-auto p-2">
			{#if mailState.accounts.length > 1}
				<button
					class="hover:bg-raised flex w-full items-center gap-2 rounded-lg px-3 py-1.5 text-left text-sm
						{mailState.unifiedInbox && mailState.labelFilter === null ? 'bg-raised font-medium' : 'text-muted'}"
					onclick={() => mailState.selectUnifiedInbox()}
				>
					<StackSimpleIcon size={15} class="shrink-0" />
					<span class="min-w-0 flex-1 truncate">All inboxes</span>
				</button>
				{#each CATEGORY_ENTRIES as category (category.title)}
					<button
						class="hover:bg-raised flex w-full items-center rounded-lg py-1 pr-3 pl-9 text-left text-xs
							{mailState.unifiedInbox && mailState.labelFilter === category.label
							? 'bg-raised text-default font-medium'
							: 'text-muted'}"
						onclick={() => mailState.selectUnifiedInbox(category.label)}
					>
						<span class="min-w-0 flex-1 truncate">{category.title}</span>
						{#if categoryCount(mailState.unifiedLabelCounts, category.label) > 0}
							<span class="text-faint tabular-nums">
								{categoryCount(mailState.unifiedLabelCounts, category.label)}
							</span>
						{/if}
					</button>
				{/each}
				<div class="border-line-faint mx-3 my-1 border-b"></div>
			{/if}

			{#each primaryFolders as entry (entry.folder.folderId)}
				{@const Icon = SPECIAL_ICONS[entry.kind]}
				<button
					class="hover:bg-raised flex w-full items-center gap-2 rounded-lg px-3 py-1.5 text-left text-sm
						{isSelected(entry.folder) && mailState.labelFilter === null ? 'bg-raised font-medium' : 'text-muted'}"
					onclick={() => mailState.selectFolder(entry.folder.folderId)}
				>
					<Icon size={15} class="shrink-0" />
					<span class="min-w-0 flex-1 truncate">{displayName(entry.folder)}</span>
					{#if entry.folder.unreadMessages > 0}
						<span class="text-faint text-xs tabular-nums">{entry.folder.unreadMessages}</span>
					{/if}
				</button>
				{#if entry.kind === 'inbox'}
					{#each CATEGORY_ENTRIES as category (category.title)}
						<button
							class="hover:bg-raised flex w-full items-center rounded-lg py-1 pr-3 pl-9 text-left text-xs
								{isSelected(entry.folder) && mailState.labelFilter === category.label
								? 'bg-raised text-default font-medium'
								: 'text-muted'}"
							onclick={() => mailState.selectFolder(entry.folder.folderId, category.label)}
						>
							<span class="min-w-0 flex-1 truncate">{category.title}</span>
							{#if categoryCount(mailState.inboxLabelCounts, category.label) > 0}
								<span class="text-faint tabular-nums">
									{categoryCount(mailState.inboxLabelCounts, category.label)}
								</span>
							{/if}
						</button>
					{/each}
				{/if}
			{/each}

			{#if otherFolders.length > 0}
				<button
					class="text-muted hover:bg-raised flex w-full items-center gap-2 rounded-lg px-3 py-1.5 text-left text-sm"
					onclick={toggleFolders}
				>
					<FolderIcon size={15} class="shrink-0" />
					<span class="min-w-0 flex-1 truncate">Folders</span>
					<span class="transition-transform {foldersOpen ? 'rotate-90' : ''}">
						<CaretRightIcon size={12} />
					</span>
				</button>
				{#if foldersOpen}
					{#each otherFolders as folder (folder.folderId)}
						<button
							class="hover:bg-raised flex w-full items-center justify-between rounded-lg py-1.5 pr-3 pl-9 text-left text-sm
								{isSelected(folder) ? 'bg-raised font-medium' : 'text-muted'}"
							onclick={() => mailState.selectFolder(folder.folderId)}
						>
							<span class="min-w-0 flex-1 truncate">{displayName(folder)}</span>
							{#if folder.unreadMessages > 0}
								<span class="text-faint ml-2 text-xs tabular-nums">{folder.unreadMessages}</span>
							{/if}
						</button>
					{/each}
				{/if}
			{/if}
		</nav>

		<div class="flex items-center justify-between px-2 pb-1">
			<Tooltip text={themeState.current === 'dark' ? 'Light mode' : 'Dark mode'} placement="top">
				<Button
					variant="ghost"
					size="sm"
					icon={themeState.current === 'dark' ? SunIcon : MoonIcon}
					onclick={() => themeState.toggle()}
				/>
			</Tooltip>
			<Tooltip text="Collapse sidebar" placement="top">
				<Button variant="ghost" size="sm" icon={SidebarSimpleIcon} onclick={toggleCollapsed} />
			</Tooltip>
		</div>

		<!-- Current account + add-account live in one dropdown, opening upward. -->
		<div class="border-line-faint relative border-t p-2">
			{#if accountMenuOpen}
				<!-- svelte-ignore a11y_no_static_element_interactions, a11y_click_events_have_key_events -->
				<div class="fixed inset-0 z-10" onclick={() => (accountMenuOpen = false)}></div>
				<div
					class="border-line bg-raised absolute right-2 bottom-full left-2 z-20 mb-1 overflow-hidden rounded-lg border shadow-lg"
				>
					{#each mailState.accounts as account (account.accountId)}
						<button
							class="hover:bg-hover flex w-full items-center px-3 py-1.5 text-left text-sm
								{account.accountId === mailState.selectedAccountId ? 'font-medium' : 'text-muted'}"
							onclick={() => chooseAccount(account.accountId)}
						>
							<span class="min-w-0 flex-1 truncate">{account.email}</span>
						</button>
					{/each}
					<div class="border-line-faint border-t"></div>
					<button
						class="text-muted hover:bg-hover flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm"
						onclick={openAccountSetup}
					>
						<PlusIcon size={14} class="shrink-0" />
						<span>Add account</span>
					</button>
				</div>
			{/if}
			<button
				class="text-muted hover:bg-raised flex w-full items-center gap-2 rounded-lg px-3 py-1.5 text-left text-sm"
				onclick={() => (accountMenuOpen = !accountMenuOpen)}
			>
				<span class="min-w-0 flex-1 truncate text-xs">{currentAccountEmail}</span>
				<span class="transition-transform {accountMenuOpen ? 'rotate-180' : ''}">
					<CaretDownIcon size={12} />
				</span>
			</button>
		</div>

		{#if currentStatus || mailState.embeddingStatus}
			<footer class="border-line-faint text-faint flex flex-col gap-0.5 border-t px-3 py-2 text-xs">
				{#if currentStatus}
					<span class={currentStatus.phase === 'error' ? 'text-red' : ''}>
						{statusLabel(currentStatus)}
					</span>
				{/if}
				{#if mailState.embeddingStatus}
					{@const embedding = mailState.embeddingStatus}
					{#if embedding.error}
						<span class="text-red truncate" title={embedding.error}>
							AI index error: {embedding.error}
						</span>
					{:else if embedding.pending > 0}
						<span>AI index: {embedding.pending} messages left</span>
					{:else}
						<span>AI index up to date</span>
					{/if}
				{/if}
			</footer>
		{/if}
	{/if}
</aside>
