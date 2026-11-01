<!--
  A person as a quiet grey circle with their initials, as the NeoWorks website draws its account.
  With `logo`, mail from an organization's domain shows the icon its website serves instead,
  once it has loaded; the initials stay when there is none.
-->
<script lang="ts" module>
	/** Every domain's outcome so far, shared by all avatars: the candidate that loaded, or -1. */
	const knownLogos = new Map<string, number>()
</script>

<script lang="ts">
	import { Image, Text, View } from '@neoworks/svelte-gpui/ui'
	import type { Style } from '@neoworks/svelte-gpui/ui'
	import { currentTheme } from '@neoworks/svelte-gpui-ui'
	import { avatarInitials } from '../lib/avatar'
	import { logoCandidates, logoDomain } from '../lib/senderLogo'

	interface Props {
		name: string
		address: string
		size?: number
		/** Whether to look for the sender's logo. */
		logo?: boolean
		/** Layout only, such as margins. */
		style?: Style
	}

	let { name, address, size = 32, logo = false, style }: Props = $props()

	const theme = $derived(currentTheme())
	const domain = $derived.by(() => {
		if (!logo) return null
		return logoDomain(address)
	})

	let candidateIndex = $state(0)
	let loaded = $state(false)

	$effect.pre(() => {
		loaded = false
		candidateIndex = 0
		if (domain === null) return
		const known = knownLogos.get(domain)
		if (known !== undefined) candidateIndex = known
	})

	const logoSource = $derived.by(() => {
		if (domain === null) return null
		const candidates = logoCandidates(domain)
		if (candidateIndex < 0 || candidateIndex >= candidates.length) return null
		return candidates[candidateIndex]
	})

	function logoLoaded(): void {
		if (domain !== null) knownLogos.set(domain, candidateIndex)
		loaded = true
	}

	function logoFailed(): void {
		if (domain === null) return
		const next = candidateIndex + 1
		if (next >= logoCandidates(domain).length) {
			knownLogos.set(domain, -1)
			candidateIndex = -1
			return
		}
		candidateIndex = next
	}

	function circleBackground(): string {
		if (loaded) return '#ffffff'
		return theme.colors.pressed
	}
</script>

<View
	style={{
		size,
		shrink: 0,
		radius: size / 2,
		align: 'center',
		justify: 'center',
		overflow: 'hidden',
		background: circleBackground(),
		...style
	}}
>
	{#if !loaded}
		<Text
			style={{
				fontFamily: 'sans',
				fontSize: Math.round(size * 0.36),
				fontWeight: 500,
				color: theme.colors.text
			}}>{avatarInitials(name, address)}</Text
		>
	{/if}
	{#if logoSource}
		{#key logoSource}
			<Image
				src={logoSource}
				fit="cover"
				style={{ position: 'absolute', top: 0, left: 0, size, radius: size / 2 }}
				onload={logoLoaded}
				onerror={logoFailed}
			/>
		{/key}
	{/if}
</View>
