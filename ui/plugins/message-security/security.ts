// Which authentication results count as failures, and how they are written.

import type { MessageSecurity } from '../../../shared/mail'

const FAILING_VERDICTS = ['fail', 'softfail', 'permerror']

export function authFailures(security: MessageSecurity): string[] {
	const auth = security.auth
	if (!auth) return []
	const failures: string[] = []
	if (auth.spf && FAILING_VERDICTS.includes(auth.spf)) failures.push(`SPF ${auth.spf}`)
	if (auth.dkim && FAILING_VERDICTS.includes(auth.dkim)) failures.push(`DKIM ${auth.dkim}`)
	if (auth.dmarc && FAILING_VERDICTS.includes(auth.dmarc)) failures.push(`DMARC ${auth.dmarc}`)
	return failures
}
