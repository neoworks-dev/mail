<!--
  Asks the agent to find shipment tracking in the thread's newest message.
-->
<script lang="ts">
	import { IconButton } from '@neoworks/svelte-gpui-ui'
	import packageIcon from '@phosphor-icons/core/regular/package.svg'
	import type { AssistantService } from '../assistant/service.svelte'
	import type { ReadingTab } from '../reader/service.svelte'

	let { tab, assistant }: { tab: ReadingTab; assistant: AssistantService } = $props()

	const newest = $derived(tab.messages[tab.messages.length - 1])
	const working = $derived(newest !== undefined && assistant.state.extracting[newest.messageId] === 'shipment')
</script>

{#if assistant.available && newest}
	<IconButton
		icon={packageIcon}
		label="Find shipment tracking"
		size="sm"
		disabled={working}
		onpress={() => void assistant.extractShipment(newest)}
	/>
{/if}
