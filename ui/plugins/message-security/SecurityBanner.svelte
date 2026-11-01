<!--
  The security notes for one message: red for a spoofed name or failed authentication, a quiet
  note for a first-time sender.
-->
<script lang="ts">
	import { Text } from '@neoworks/svelte-gpui/ui'
	import { typeStyle } from '@neoworks/svelte-gpui-ui'
	import warningIcon from '@phosphor-icons/core/regular/shield-warning.svg'
	import userIcon from '@phosphor-icons/core/regular/user-circle-plus.svg'
	import type { MessageBody } from '../../../shared/mail'
	import Banner from '../reading-pane/Banner.svelte'
	import { authFailures } from './security'

	let { body }: { body: MessageBody } = $props()

	const security = $derived(body.security)
	const failures = $derived(authFailures(security))
	const alarming = $derived(security.nameSpoof !== null || failures.length > 0)
</script>

{#if alarming}
	<Banner tone="danger" icon={warningIcon}>
		{#if security.nameSpoof}
			<Text style={{ ...typeStyle('caption'), fontWeight: 600 }}>
				Sender name claims {security.nameSpoof.claimedDomain}, but the message came from {security
					.nameSpoof.actualDomain}
			</Text>
		{/if}
		{#if failures.length > 0}
			<Text style={typeStyle('caption')}>Authentication failed: {failures.join(', ')}</Text>
		{/if}
		{#if security.firstTimeSender}
			<Text style={typeStyle('caption')}>First message from this sender</Text>
		{/if}
	</Banner>
{:else if security.firstTimeSender}
	<Banner icon={userIcon}>
		<Text style={typeStyle('caption')}>First message from this sender</Text>
	</Banner>
{/if}
