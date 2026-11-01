<!--
  One destination of the sidebar: an optional icon, the title and an optional count. Indented
  rows are the categories under an inbox, in a smaller type.
-->
<script lang="ts">
	import { Button, Icon, Text } from '@neoworks/svelte-gpui/ui'
	import type { Style } from '@neoworks/svelte-gpui/ui'
	import { currentTheme, typeStyle } from '@neoworks/svelte-gpui-ui'

	interface Props {
		title: string
		icon?: string
		count?: number
		selected: boolean
		indented?: boolean
		trailingIcon?: string
		onpress: () => void
	}

	let { title, icon, count = 0, selected, indented = false, trailingIcon, onpress }: Props = $props()

	const theme = $derived(currentTheme())

	function rowStyle(): Style {
		const style: Style = {
			direction: 'row',
			align: 'center',
			gap: 10,
			height: 32,
			paddingX: 12,
			radius: theme.radii.control,
			cursor: 'pointer',
			transition: 120,
			...typeStyle('caption'),
			fontSize: 13.5,
			color: theme.colors.muted,
			fontWeight: 400
		}
		if (indented) {
			style.height = 26
			style.paddingLeft = 36
			style.fontSize = 12.5
		}
		if (selected) {
			style.background = theme.colors.hover
			style.color = theme.colors.text
			style.fontWeight = 500
		}
		return style
	}
</script>

<Button style={rowStyle()} hover={{ background: theme.colors.hover, color: theme.colors.text }} active={{ background: theme.colors.pressed }} {onpress}>
	{#if icon}
		<Icon svg={icon} size={16} />
	{/if}
	<Text style={{ flex: 1, minWidth: 0, truncate: true }}>{title}</Text>
	{#if count > 0}
		<Text style={{ ...typeStyle('caption'), fontSize: 12, color: theme.colors.faint }}>{count}</Text>
	{/if}
	{#if trailingIcon}
		<Icon svg={trailingIcon} size={12} color={theme.colors.faint} />
	{/if}
</Button>
