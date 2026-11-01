<!--
  The digest: an intro, then the agent's groups by importance. While the agent writes it a
  spinner says so; with none there is a button to ask for one.
-->
<script lang="ts">
	import { Scroll, Text, View } from '@neoworks/svelte-gpui/ui'
	import { Button, currentTheme, LoadingSpinner, typeStyle } from '@neoworks/svelte-gpui-ui'
	import type { SidecarService } from '../../kernel/sidecar/service'
	import type { AssistantService } from '../assistant/service.svelte'
	import type { ReaderService } from '../reader/service.svelte'
	import DigestCard from './DigestCard.svelte'

	let {
		sidecar,
		reader,
		assistant
	}: { sidecar: SidecarService; reader: ReaderService; assistant: AssistantService } = $props()

	const theme = $derived(currentTheme())
	const digest = $derived(assistant.state.digest)

	const heading = $derived.by(() => {
		if (digest && digest.pending) return 'Daily digest — the agent is writing it…'
		return 'Daily digest'
	})
</script>

{#if digest}
	<Scroll style={{ flex: 1 }}>
		<View style={{ padding: 24, align: 'center' }}>
			<View style={{ width: '100%', maxWidth: 620, gap: 10 }}>
				<View style={{ direction: 'row', align: 'center', gap: 8 }}>
					<Text style={{ ...typeStyle('title'), flex: 1 }}>{heading}</Text>
					<Button variant="ghost" size="sm" onpress={() => assistant.dismissDigest()}
						><Text>Dismiss</Text></Button
					>
				</View>
				{#if digest.pending}
					<View style={{ direction: 'row', align: 'center', gap: 8 }}>
						<LoadingSpinner size={16} />
						<Text style={{ ...typeStyle('caption'), color: theme.colors.muted }}>
							Waiting for the agent; it writes the digest in your neo session.
						</Text>
					</View>
					{#if assistant.state.error}
						<Text style={{ ...typeStyle('caption'), color: theme.colors.danger }}
							>{assistant.state.error}</Text
						>
					{/if}
				{/if}
				{#if digest.intro}
					<Text style={{ ...typeStyle('bodySmall'), color: theme.colors.muted }}
						>{digest.intro}</Text
					>
				{/if}
				{#each digest.groups as group, groupIndex (groupIndex)}
					<Text
						style={{
							...typeStyle('label'),
							uppercase: true,
							color: theme.colors.faint,
							marginTop: 12
						}}>{group.title}</Text
					>
					{#each group.items as item (item.threadId)}
						<DigestCard {item} {sidecar} {reader} />
					{/each}
				{/each}
			</View>
		</View>
	</Scroll>
{:else}
	<View style={{ flex: 1, align: 'center', justify: 'center', gap: 12 }}>
		<Text style={{ ...typeStyle('bodySmall'), color: theme.colors.faint }}
			>No digest written yet</Text
		>
		<Button
			size="sm"
			variant="secondary"
			disabled={!assistant.available}
			onpress={() => void assistant.generateDigest(false)}
		>
			<Text>Write digest</Text>
		</Button>
	</View>
{/if}
