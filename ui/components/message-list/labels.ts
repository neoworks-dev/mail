// How the automatic categories are named, coloured and drawn, shared by the sidebar and the list.
// Their icons are filled and each has a colour of its own, as Notion Mail draws its views.

import type { Color } from '@neoworks/svelte-gpui/ui'
import type { ScaleName, Theme } from '@neoworks/svelte-gpui-ui'
import bellIcon from '@phosphor-icons/core/fill/bell-fill.svg'
import lightningIcon from '@phosphor-icons/core/fill/lightning-fill.svg'
import megaphoneIcon from '@phosphor-icons/core/fill/megaphone-fill.svg'
import newspaperIcon from '@phosphor-icons/core/fill/newspaper-fill.svg'
import tagIcon from '@phosphor-icons/core/fill/tag-fill.svg'
import usersIcon from '@phosphor-icons/core/fill/users-fill.svg'
import warningOctagonIcon from '@phosphor-icons/core/fill/warning-octagon-fill.svg'

const LABEL_TITLES: Record<string, string> = {
	__priority: 'Priority',
	newsletter: 'Newsletter',
	ad: 'Ads',
	notification: 'Updates',
	social: 'Social',
	spam: 'Spam'
}

const LABEL_ICONS: Record<string, string> = {
	__priority: lightningIcon,
	newsletter: newspaperIcon,
	ad: megaphoneIcon,
	notification: bellIcon,
	social: usersIcon,
	spam: warningOctagonIcon
}

export function labelIcon(label: string): string {
	const icon = LABEL_ICONS[label]
	if (icon) return icon
	return tagIcon
}

/** Which of the theme's colour scales a category's icon is drawn in. */
const LABEL_SCALES: Record<string, ScaleName> = {
	__priority: 'larch',
	newsletter: 'rock',
	ad: 'pine',
	notification: 'lake',
	social: 'larch',
	spam: 'rock'
}

export function labelIconColor(theme: Theme, label: string): Color {
	const scale = LABEL_SCALES[label]
	if (!scale) return theme.colors.muted
	return theme.scales[scale][9]
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
