import type { NeomailApi } from '../shared/bridge'

declare global {
	interface Window {
		neomail: NeomailApi
	}
}

export {}
