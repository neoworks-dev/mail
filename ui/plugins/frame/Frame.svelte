<!--
  The window's layout, and nothing in it of its own: a header bar of three slots on the canvas,
  then the navigation (sidebar and message list), the reading area and whatever sits aside it
  (the assistant), each running to the window's edges and parted by a hairline that resizes
  them. Overlays draw above everything. Until an
  account exists the `onboarding` slot takes the whole window.
-->
<script lang="ts">
	import { View } from '@neoworks/svelte-gpui/ui'
	import { currentTheme } from '@neoworks/svelte-gpui-ui'
	import PaneResizer from '../../components/PaneResizer.svelte'
	import { useKernel } from '../../kernel/kernel'
	import Slot from '../../kernel/slots/Slot.svelte'
	import type { AccountsService } from '../accounts/service.svelte'
	import { NAVIGATION_WIDTH, paneStyle } from './layout'

	let { accounts }: { accounts: AccountsService } = $props()

	const kernel = useKernel()
	const theme = $derived(currentTheme())

	const navigationWidth = $derived(
		kernel.settings.get('frame.navigationWidth', NAVIGATION_WIDTH.initial)
	)
	let draggedWidth = $state<number | null>(null)
	const shownWidth = $derived.by(() => {
		if (draggedWidth !== null) return draggedWidth
		return navigationWidth
	})

	function resizeNavigation(deltaX: number): void {
		const next = shownWidth + deltaX
		draggedWidth = Math.min(Math.max(next, NAVIGATION_WIDTH.minimum), NAVIGATION_WIDTH.maximum)
	}

	function saveNavigationWidth(): void {
		if (draggedWidth === null) return
		kernel.settings.set('frame.navigationWidth', Math.round(draggedWidth))
		draggedWidth = null
	}

	const hasAccounts = $derived(accounts.state.accounts.length > 0)
</script>

{#if !accounts.state.loaded}
	<View style={{ flex: 1 }} />
{:else if !hasAccounts}
	<View style={{ flex: 1 }}>
		<Slot name="onboarding" />
	</View>
{:else}
	<View style={{ flex: 1 }}>
		<View
			style={{
				direction: 'row',
				align: 'center',
				paddingX: 8,
				minHeight: 48,
				gap: 8,
				borderBottomWidth: 1,
				borderColor: theme.colors.line
			}}
		>
			<View style={{ flex: 1, direction: 'row', align: 'center', gap: 2 }}>
				<Slot name="header.start" />
			</View>
			<View style={{ direction: 'row', align: 'center', justify: 'center' }}>
				<Slot name="header.center" />
			</View>
			<View style={{ flex: 1, direction: 'row', align: 'center', justify: 'end', gap: 2 }}>
				<Slot name="header.end" />
			</View>
		</View>
		<View style={{ flex: 1, direction: 'row', minHeight: 0, background: theme.colors.surface }}>
			<View style={{ ...paneStyle(theme), width: shownWidth, direction: 'row' }}>
				<Slot name="navigation" />
			</View>
			<PaneResizer onresize={resizeNavigation} onend={saveNavigationWidth} />
			<View style={{ flex: 1, minWidth: 0, direction: 'row' }}>
				<Slot name="content" />
			</View>
			<Slot name="aside" />
		</View>
	</View>
{/if}
<Slot name="overlays" />
