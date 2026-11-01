<!--
  The pane itself: a resizer on its left edge, then a surface with the agent's status, the chat
  and the input. Its width is kept in settings once a drag ends.
-->
<script lang="ts">
	import { View } from '@neoworks/svelte-gpui/ui'
	import { currentTheme } from '@neoworks/svelte-gpui-ui'
	import PaneResizer from '../../components/PaneResizer.svelte'
	import type { SettingsService } from '../../kernel/settings/service'
	import type { SidecarService } from '../../kernel/sidecar/service'
	import type { AssistantService } from '../assistant/service.svelte'
	import { surfaceStyle } from '../frame/layout'
	import AskBox from './AskBox.svelte'
	import Chat from './Chat.svelte'
	import PaneHeader from './PaneHeader.svelte'

	interface Props {
		assistant: AssistantService
		settings: SettingsService
		sidecar: SidecarService
	}

	let { assistant, settings, sidecar }: Props = $props()

	const WIDTH = { initial: 380, minimum: 300, maximum: 720 }

	const theme = $derived(currentTheme())
	const open = $derived(settings.get('assistant.open', false))
	const storedWidth = $derived(settings.get('assistant.width', WIDTH.initial))
	let draggedWidth = $state<number | null>(null)

	const shownWidth = $derived.by(() => {
		if (draggedWidth !== null) return draggedWidth
		return storedWidth
	})

	/** The resizer is on the pane's left edge, so dragging left makes it wider. */
	function resize(deltaX: number): void {
		const next = shownWidth - deltaX
		draggedWidth = Math.min(Math.max(next, WIDTH.minimum), WIDTH.maximum)
	}

	function saveWidth(): void {
		if (draggedWidth === null) return
		settings.set('assistant.width', Math.round(draggedWidth))
		draggedWidth = null
	}

	function openLink(href: string): void {
		void sidecar.call('system.openUrl', href).catch(() => {})
	}
</script>

{#if open}
	<PaneResizer onresize={resize} onend={saveWidth} />
	<View style={{ ...surfaceStyle(theme), width: shownWidth, minHeight: 0 }}>
		<PaneHeader {assistant} />
		<Chat {assistant} onopenlink={openLink} />
		<AskBox {assistant} />
	</View>
{/if}
