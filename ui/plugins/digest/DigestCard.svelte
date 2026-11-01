<!--
  One conversation of the digest: its sender and subject, looked up by thread id, and the
  agent's note on why it matters. Pressing it opens the thread.
-->
<script lang="ts">
	import { Button, Text, View } from '@neoworks/svelte-gpui/ui'
	import { currentTheme, typeStyle } from '@neoworks/svelte-gpui-ui'
	import type { DigestItem } from '../../../shared/assistant'
	import type { ThreadMessage } from '../../../shared/mail'
	import type { SidecarService } from '../../kernel/sidecar/service'
	import type { ReaderService } from '../reader/service.svelte'

	let { item, sidecar, reader }: { item: DigestItem; sidecar: SidecarService; reader: ReaderService } = $props()

	const theme = $derived(currentTheme())
	let newest = $state<ThreadMessage | null>(null)

	$effect(() => {
		void loadThread(item.threadId)
	})

	async function loadThread(threadId: number): Promise<void> {
		const accountId = await sidecar.call('threads.locate', threadId)
		if (accountId === null) return
		const messages = await sidecar.call('threads.messages', accountId, threadId)
		const last = messages[messages.length - 1]
		if (last) newest = last
	}

	async function open(): Promise<void> {
		const accountId = await sidecar.call('threads.locate', item.threadId)
		if (accountId === null) return
		await reader.openThread(accountId, item.threadId)
	}

	const sender = $derived.by(() => {
		if (!newest) return `Thread ${item.threadId}`
		if (newest.fromName !== '') return newest.fromName
		return newest.fromAddress
	})
</script>

<Button
	style={{
		direction: 'column',
		align: 'stretch',
		gap: 2,
		paddingX: 14,
		paddingY: 10,
		radius: theme.radii.control,
		borderWidth: 1,
		borderColor: theme.colors.line,
		background: theme.colors.surface,
		transition: 120
	}}
	hover={{ background: theme.colors.hover }}
	onpress={() => void open()}
>
	<View style={{ direction: 'row', align: 'baseline', gap: 8 }}>
		<Text style={{ ...typeStyle('bodySmall'), fontWeight: 600, flex: 1, minWidth: 0, truncate: true }}>{sender}</Text>
		{#if newest && newest.label}
			<Text style={{ ...typeStyle('caption'), color: theme.colors.faint }}>{newest.label}</Text>
		{/if}
	</View>
	{#if newest}
		<Text style={{ ...typeStyle('bodySmall'), truncate: true }}>{newest.subject}</Text>
	{/if}
	{#if item.note !== ''}
		<Text style={{ ...typeStyle('caption'), color: theme.colors.muted }}>{item.note}</Text>
	{/if}
</Button>
