<!-- The small heading over a group of sidebar rows. -->
<script lang="ts">
	import { Text } from '@neoworks/svelte-gpui/ui'
	import { currentTheme, typeStyle } from '@neoworks/svelte-gpui-ui'

	let { title }: { title: string } = $props()

	const theme = $derived(currentTheme())
</script>

<Text
	style={{
		...typeStyle('caption'),
		fontSize: 12,
		fontWeight: 500,
		color: theme.colors.faint,
		paddingX: 10,
		paddingTop: 16,
		paddingBottom: 4,
		truncate: true
	}}>{title}</Text
>
