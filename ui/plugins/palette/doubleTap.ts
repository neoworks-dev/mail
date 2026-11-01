// Two presses of the same key close together, such as Space twice to open the command bar.

export interface DoubleTap {
	/** Records a press at `now` (ms); true when it completes a double tap. */
	press(now: number): boolean
}

export function createDoubleTap(windowMs: number): DoubleTap {
	let lastPressAt: number | null = null
	return {
		press(now) {
			if (lastPressAt !== null && now - lastPressAt < windowMs) {
				lastPressAt = null
				return true
			}
			lastPressAt = now
			return false
		}
	}
}
