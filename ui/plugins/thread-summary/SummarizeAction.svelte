<!--
  Asks the agent to summarize the thread; gone once a summary is there or on its way.
-->
<script lang="ts">
	import { IconButton } from '@neoworks/svelte-gpui-ui'
	import sparkleIcon from '@phosphor-icons/core/regular/sparkle.svg'
	import type { AssistantService } from '../assistant/service.svelte'
	import type { ReadingTab } from '../reader/service.svelte'
	import { threadOf } from './threadOf'

	let { tab, assistant }: { tab: ReadingTab; assistant: AssistantService } = $props()

	const threadId = $derived(threadOf(tab))
	const hasSummary = $derived(
		threadId !== null && assistant.state.summaries[threadId] !== undefined
	)
</script>

{#if assistant.available && threadId !== null && !hasSummary}
	{@const id = threadId}
	<IconButton
		icon={sparkleIcon}
		label="Summarize with AI"
		size="sm"
		onpress={() => void assistant.summarize(id)}
	/>
{/if}
