// How the automatic categories are named and coloured, shared by the sidebar and the list.

import type { Color } from '@neoworks/svelte-gpui/ui'
import type { Theme } from '@neoworks/svelte-gpui-ui'

const LABEL_TITLES: Record<string, string> = {
	__priority: 'Priority',
	newsletter: 'Newsletter',
	ad: 'Ads',
	notification: 'Updates',
	social: 'Social',
	spam: 'Spam'
}

export function labelTitle(label: string): string {
	const title = LABEL_TITLES[label]
	if (title) return title
	return label
}

export interface LabelColors {
	background: Color
	color: Color
}

export function labelColors(theme: Theme, label: string): LabelColors {
	const { colors } = theme
	if (label === 'spam') return { background: colors.dangerSoft, color: colors.danger }
	if (label === 'ad') return { background: colors.warningSoft, color: colors.warning }
	if (label === 'newsletter') return { background: colors.infoSoft, color: colors.info }
	if (label === 'social') return { background: colors.successSoft, color: colors.success }
	return { background: colors.sunken, color: colors.muted }
}
