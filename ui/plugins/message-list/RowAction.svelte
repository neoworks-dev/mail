<!--
  A small icon button on a hovered row, sized to fit the row without making it taller.
-->
<script lang="ts">
	import { Button, Icon } from '@neoworks/svelte-gpui/ui'
	import { currentTheme, Tooltip } from '@neoworks/svelte-gpui-ui'

	interface Props {
		icon: string
		/** What the tooltip says, with the key that does the same. */
		label: string
		onpress: () => void
	}

	let { icon, label, onpress }: Props = $props()

	const theme = $derived(currentTheme())
</script>

<Tooltip text={label} placement="bottom">
	<Button
		style={{
			size: 26,
			marginY: -4,
			radius: 6,
			align: 'center',
			justify: 'center',
			color: theme.colors.muted
		}}
		hover={{ background: theme.colors.pressed, color: theme.colors.text }}
		{onpress}
	>
		<Icon svg={icon} size={15} />
	</Button>
</Tooltip>
