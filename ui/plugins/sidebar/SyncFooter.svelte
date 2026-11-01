<!--
  How the selected account's sync is going and how far the local search index has come.
-->
<script lang="ts">
	import { Text, View } from '@neoworks/svelte-gpui/ui'
	import { currentTheme } from '@neoworks/svelte-gpui-ui'
	import type { SyncStatus } from '../../../shared/mail'
	import type { AccountsService } from '../accounts/service.svelte'

	let { accounts }: { accounts: AccountsService } = $props()

	const theme = $derived(currentTheme())

	const status = $derived.by((): SyncStatus | null => {
		const accountId = accounts.state.selectedAccountId
		if (accountId === null) return null
		const found = accounts.state.syncStatuses[accountId]
		if (!found) return null
		return found
	})

	function statusLabel(sync: SyncStatus): string {
		if (sync.phase === 'connecting') return 'Connecting…'
		if (sync.phase === 'listing') return 'Listing folders…'
		if (sync.phase === 'backfill')
			return `Syncing ${sync.folderPath} · ${sync.downloadedMessages}/${sync.totalMessages}`
		if (sync.phase === 'error') return `Error: ${sync.errorMessage}`
		return 'Up to date'
	}

	function statusColor(sync: SyncStatus): string {
		if (sync.phase === 'error') return theme.colors.danger
		return theme.colors.faint
	}

	function indexLabel(): string | null {
		const embedding = accounts.state.embeddingStatus
		if (!embedding) return null
		if (embedding.error) return `AI index error: ${embedding.error}`
		if (embedding.pending > 0) return `AI index: ${embedding.pending} messages left`
		return 'AI index up to date'
	}

	function indexColor(): string {
		const embedding = accounts.state.embeddingStatus
		if (embedding && embedding.error) return theme.colors.danger
		return theme.colors.faint
	}
</script>

{#if status || indexLabel()}
	<View style={{ paddingX: 12, gap: 2 }}>
		{#if status}
			<Text style={{ fontSize: 11.5, lineHeight: 16, color: statusColor(status), maxLines: 2 }}
				>{statusLabel(status)}</Text
			>
		{/if}
		{#if indexLabel()}
			<Text style={{ fontSize: 11.5, lineHeight: 16, color: indexColor(), truncate: true }}
				>{indexLabel()}</Text
			>
		{/if}
	</View>
{/if}
