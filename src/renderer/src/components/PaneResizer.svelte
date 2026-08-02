<script lang="ts">
	// Resize handle in the gap between two floating panes, matching the
	// git-worktree-editor gutter style: invisible until hovered, a full-height
	// hairline pill that lights up while dragging. The parent owns the widths.

	interface Props {
		onResize: (deltaX: number) => void
	}

	let { onResize }: Props = $props()

	let dragging = $state(false)

	function startResize(event: PointerEvent): void {
		event.preventDefault()
		dragging = true
		let lastX = event.clientX

		const onMove = (moveEvent: PointerEvent): void => {
			onResize(moveEvent.clientX - lastX)
			lastX = moveEvent.clientX
		}
		const onUp = (): void => {
			dragging = false
			window.removeEventListener('pointermove', onMove)
			window.removeEventListener('pointerup', onUp)
		}
		window.addEventListener('pointermove', onMove)
		window.addEventListener('pointerup', onUp)
	}
</script>

<!-- Gutter element matching the body gap. The visible grab pill is centered in
     it so the highlight sits between panels, never on a border. A negative inset
     widens the pointer hit area past the gap without shifting layout. -->
<div
	class="group relative flex w-2 shrink-0 cursor-col-resize items-stretch justify-center"
	role="separator"
	aria-orientation="vertical"
	onpointerdown={startResize}
>
	<div class="absolute inset-y-0 -right-1 -left-1 z-10"></div>
	<div
		class="my-1.5 w-0.5 rounded-full transition-colors {dragging
			? 'bg-action'
			: 'bg-transparent group-hover:bg-line-strong'}"
	></div>
</div>
