<!--
  Adding an account: an IMAP login checked against the server before it is stored, or Gmail
  through the browser with the app's Google OAuth client, which is configured once.
-->
<script lang="ts">
	import { Text, View } from '@neoworks/svelte-gpui/ui'
	import {
		Button,
		Checkbox,
		LoadingSpinner,
		SegmentedButton,
		TextField,
		currentTheme,
		typeStyle
	} from '@neoworks/svelte-gpui-ui'
	import type { AccountActions } from './actions'
	import { guessFromEmail } from './guess'

	let { actions, ondone }: { actions: AccountActions; ondone?: () => void } = $props()

	type SetupMode = 'imap' | 'gmail'

	const theme = $derived(currentTheme())
	let mode = $state<SetupMode>('imap')
	let email = $state('')
	let imapHost = $state('')
	let imapPort = $state('993')
	let smtpHost = $state('')
	let smtpPort = $state('465')
	let imapUser = $state('')
	let imapPassword = $state('')
	let useTls = $state(true)
	let connecting = $state(false)
	let errorMessage = $state<string | null>(null)

	// Gmail needs one app-wide Google client; after that every sign-in is one press.
	let gmailConfigured = $state<boolean | null>(null)
	let gmailClientId = $state('')
	let gmailClientSecret = $state('')

	// Hosts and user follow the address until the user edits them.
	let hostTouched = false
	let smtpHostTouched = false
	let userTouched = false

	$effect(() => {
		if (mode !== 'gmail' || gmailConfigured !== null) return
		void actions.gmailClientConfigured().then((configured) => (gmailConfigured = configured))
	})

	function handleEmail(value: string): void {
		const guess = guessFromEmail(value)
		if (!userTouched) imapUser = guess.user
		if (guess.imapHost === null || guess.smtpHost === null) return
		if (!hostTouched) imapHost = guess.imapHost
		if (!smtpHostTouched) smtpHost = guess.smtpHost
	}

	async function run(task: () => Promise<void>): Promise<void> {
		connecting = true
		errorMessage = null
		try {
			await task()
			if (ondone) ondone()
		} catch (error) {
			errorMessage = error instanceof Error ? error.message : String(error)
		} finally {
			connecting = false
		}
	}

	function connectImap(): Promise<void> {
		return run(() =>
			actions.addImap({
				email: email.trim(),
				imapHost: imapHost.trim(),
				imapPort: Number(imapPort),
				imapUser: imapUser.trim(),
				imapPassword,
				useTls,
				smtpHost: smtpHost.trim(),
				smtpPort: Number(smtpPort)
			})
		)
	}

	function connectGmail(): Promise<void> {
		return run(async () => {
			if (gmailConfigured !== true) {
				await actions.setGmailClientConfig({
					clientId: gmailClientId,
					clientSecret: gmailClientSecret
				})
				gmailConfigured = true
			}
			await actions.addGmail()
		})
	}

	function chooseMode(selection: string | string[]): void {
		if (selection === 'gmail') {
			mode = 'gmail'
			return
		}
		mode = 'imap'
	}

	function introduction(): string {
		if (mode === 'imap') return 'IMAP credentials: the password or an app password.'
		return 'Sign in with Google through your own OAuth client.'
	}
</script>

<View style={{ gap: 16 }}>
	<Text style={{ ...typeStyle('bodySmall'), color: theme.colors.muted }}>{introduction()}</Text>
	<SegmentedButton
		full
		options={[
			{ value: 'imap', label: 'IMAP password' },
			{ value: 'gmail', label: 'Gmail (OAuth)' }
		]}
		value={mode}
		onchange={chooseMode}
	/>

	{#if mode === 'imap'}
		<TextField
			label="Email address"
			type="email"
			placeholder="you@example.com"
			bind:value={email}
			oninput={handleEmail}
		/>
		<View style={{ direction: 'row', gap: 12 }}>
			<TextField
				label="IMAP host"
				bind:value={imapHost}
				oninput={() => (hostTouched = true)}
				style={{ flex: 1 }}
			/>
			<TextField label="Port" type="number" bind:value={imapPort} style={{ width: 104 }} />
		</View>
		<View style={{ direction: 'row', gap: 12 }}>
			<TextField
				label="SMTP host"
				bind:value={smtpHost}
				oninput={() => (smtpHostTouched = true)}
				style={{ flex: 1 }}
			/>
			<TextField label="Port" type="number" bind:value={smtpPort} style={{ width: 104 }} />
		</View>
		<TextField label="Username" bind:value={imapUser} oninput={() => (userTouched = true)} />
		<TextField
			label="Password"
			type="password"
			bind:value={imapPassword}
			onsubmit={() => void connectImap()}
		/>
		<Checkbox
			label="Use TLS (port 993)"
			checked={useTls}
			onchange={(checked) => (useTls = checked)}
		/>
	{:else if gmailConfigured === null}
		<View style={{ align: 'center', paddingY: 16 }}><LoadingSpinner size={20} /></View>
	{:else if gmailConfigured === false}
		<Text style={{ ...typeStyle('caption'), color: theme.colors.muted }}>
			One-time setup: Google requires a registered OAuth client. Create one in the Google Cloud
			Console (type "Desktop app", Gmail API enabled) and paste it here. It is stored for the whole
			app, and every later sign-in is the button below.
		</Text>
		<TextField
			label="OAuth client ID"
			placeholder="….apps.googleusercontent.com"
			bind:value={gmailClientId}
		/>
		<TextField label="OAuth client secret" type="password" bind:value={gmailClientSecret} />
	{:else}
		<Text style={{ ...typeStyle('bodySmall'), color: theme.colors.muted }}>
			Your browser opens Google's sign-in page; pick the account and Mail does the rest. The address
			is detected automatically.
		</Text>
	{/if}

	{#if errorMessage !== null}
		<Text style={{ ...typeStyle('bodySmall'), color: theme.colors.danger }}>{errorMessage}</Text>
	{/if}

	{#if connecting}
		<View style={{ direction: 'row', align: 'center', justify: 'center', gap: 8, paddingY: 10 }}>
			<LoadingSpinner size={18} thickness={3} />
			<Text style={{ ...typeStyle('bodySmall'), color: theme.colors.muted }}>Connecting…</Text>
		</View>
	{:else if mode === 'imap'}
		<Button variant="primary" full onpress={() => void connectImap()}><Text>Connect</Text></Button>
	{:else if gmailConfigured !== null}
		<Button variant="primary" full onpress={() => void connectGmail()}
			><Text>Sign in with Google</Text></Button
		>
	{/if}
</View>
