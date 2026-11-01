<!--
  One destination of the sidebar: an optional icon, the title and an optional count. Indented
  rows sit under the row they belong to.
-->
<script lang="ts">
	import { Button, Icon, Text } from '@neoworks/svelte-gpui/ui'
	import type { Style } from '@neoworks/svelte-gpui/ui'
	import { currentTheme, typeStyle } from '@neoworks/svelte-gpui-ui'

	interface Props {
		title: string
		icon?: string
		/** The icon's own colour, else the row's text colour. */
		iconColor?: string
		count?: number
		selected: boolean
		indented?: boolean
		trailingIcon?: string
		onpress: () => void
	}

	let {
		title,
		icon,
		iconColor,
		count = 0,
		selected,
		indented = false,
		trailingIcon,
		onpress
	}: Props = $props()

	const theme = $derived(currentTheme())

	function rowStyle(): Style {
		const style: Style = {
			direction: 'row',
			align: 'center',
			gap: 10,
			height: 32,
			paddingX: 10,
			radius: theme.radii.control,
			cursor: 'pointer',
			transition: 120,
			...typeStyle('nav'),
			color: theme.colors.muted,
			fontWeight: 400
		}
		if (indented) {
			style.height = 30
			style.paddingLeft = 24
		}
		if (selected) {
			style.background = theme.colors.hover
			style.color = theme.colors.text
			style.fontWeight = 500
		}
		return style
	}
</script>

<Button
	style={rowStyle()}
	hover={{ background: theme.colors.hover, color: theme.colors.text }}
	active={{ background: theme.colors.pressed }}
	{onpress}
>
	{#if icon}
		<Icon svg={icon} size={16} color={iconColor} />
	{/if}
	<Text style={{ flex: 1, minWidth: 0, truncate: true }}>{title}</Text>
	{#if count > 0}
		<Text style={{ ...typeStyle('caption'), fontSize: 12, color: theme.colors.faint }}>{count}</Text
		>
	{/if}
	{#if trailingIcon}
		<Icon svg={trailingIcon} size={12} color={theme.colors.faint} />
	{/if}
</Button>
