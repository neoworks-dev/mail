<!--
  A note above or below a message's body, in the look every reading-area plugin shares. The tone
  colours it by meaning; `actions` sit at its end.
-->
<script lang="ts" module>
	export type BannerTone = 'neutral' | 'danger' | 'warning' | 'success' | 'info'
</script>

<script lang="ts">
	import type { Snippet } from 'svelte'
	import { Icon, View } from '@neoworks/svelte-gpui/ui'
	import type { Color } from '@neoworks/svelte-gpui/ui'
	import { currentTheme } from '@neoworks/svelte-gpui-ui'

	interface Props {
		tone?: BannerTone
		icon?: string
		children: Snippet
		actions?: Snippet
	}

	let { tone = 'neutral', icon, children, actions }: Props = $props()

	const theme = $derived(currentTheme())

	const colors = $derived.by((): { background: Color; color: Color } => {
		const palette = theme.colors
		if (tone === 'danger') return { background: palette.dangerSoft, color: palette.danger }
		if (tone === 'warning') return { background: palette.warningSoft, color: palette.warning }
		if (tone === 'success') return { background: palette.successSoft, color: palette.success }
		if (tone === 'info') return { background: palette.infoSoft, color: palette.info }
		return { background: palette.sunken, color: palette.muted }
	})
</script>

<View
	style={{
		direction: 'row',
		align: 'center',
		gap: 8,
		marginX: 20,
		marginTop: 6,
		paddingLeft: 12,
		paddingRight: 6,
		paddingY: 6,
		minHeight: 32,
		radius: theme.radii.control,
		background: colors.background,
		color: colors.color
	}}
>
	{#if icon}
		<Icon svg={icon} size={14} />
	{/if}
	<View style={{ flex: 1, minWidth: 0, gap: 2 }}>
		{@render children()}
	</View>
	{#if actions}
		<View style={{ direction: 'row', align: 'center', gap: 4 }}>
			{@render actions()}
		</View>
	{/if}
</View>
