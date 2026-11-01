<!--
  The buttons of one chat item, such as a permission question's answers. A `copy:` action copies
  its text here; every other action goes back to neo.
-->
<script lang="ts">
	import { clipboard } from '@neoworks/svelte-gpui'
	import { Text, View } from '@neoworks/svelte-gpui/ui'
	import { Button } from '@neoworks/svelte-gpui-ui'
	import type { AssistantButton, AssistantItem } from '../../../shared/assistant'
	import type { AssistantService } from '../assistant/service.svelte'

	let { item, assistant }: { item: AssistantItem; assistant: AssistantService } = $props()

	const COPY_PREFIX = 'copy:'

	function press(button: AssistantButton): void {
		if (button.action.startsWith(COPY_PREFIX)) {
			void clipboard.write(button.action.slice(COPY_PREFIX.length))
			return
		}
		void assistant.press(item.ref, button.action, button.args).catch(() => {})
	}

	function variantOf(button: AssistantButton): 'primary' | 'secondary' {
		if (button.current) return 'primary'
		return 'secondary'
	}
</script>

<View style={{ direction: 'row', wrap: true, gap: 6 }}>
	{#each item.buttons as button, index (index)}
		<Button variant={variantOf(button)} size="sm" onpress={() => press(button)}>
			<Text>{button.label}</Text>
		</Button>
	{/each}
</View>
