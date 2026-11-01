<!--
  Asks the agent for the action items in the thread, stored on its newest message.
-->
<script lang="ts">
	import { IconButton } from '@neoworks/svelte-gpui-ui'
	import checksIcon from '@phosphor-icons/core/regular/list-checks.svg'
	import type { AssistantService } from '../assistant/service.svelte'
	import type { ReadingTab } from '../reader/service.svelte'

	let { tab, assistant }: { tab: ReadingTab; assistant: AssistantService } = $props()

	const newest = $derived(tab.messages[tab.messages.length - 1])
	const working = $derived(
		newest !== undefined && assistant.state.extracting[newest.messageId] === 'actions'
	)
</script>

{#if assistant.available && newest}
	<IconButton
		icon={checksIcon}
		label="Extract action items"
		size="sm"
		disabled={working}
		onpress={() => void assistant.extractActions(newest)}
	/>
{/if}
