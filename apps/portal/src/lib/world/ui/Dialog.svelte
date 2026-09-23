<script lang="ts">
	// Every menu in Eisenhold is a native modal <dialog>: the browser makes the world behind it inert, keeps
	// focus inside, and turns Escape into `cancel`, which closes it. Focus goes back to the world on close.
	import type { Snippet } from 'svelte';

	let {
		labelledby,
		onclose,
		variant = 'panel',
		width = 'md',
		children
	}: {
		labelledby: string;
		onclose: () => void;
		variant?: 'panel' | 'paper' | 'cork' | 'bare';
		width?: 'sm' | 'md' | 'lg' | 'full';
		children: Snippet;
	} = $props();

	let dialog: HTMLDialogElement | undefined = $state();

	$effect(() => {
		if (dialog && !dialog.open) dialog.showModal();
		return () => dialog?.close();
	});

	function cancel(event: Event) {
		event.preventDefault();
		onclose();
	}
</script>

<dialog bind:this={dialog} class="dialog" data-variant={variant} data-width={width} aria-labelledby={labelledby} oncancel={cancel}>
	{@render children()}
</dialog>

<style>
	.dialog {
		box-sizing: border-box;
		width: min(100% - 2 * var(--space-4), var(--x-dialog-width, calc(var(--content-max) * 0.56)));
		max-height: calc(100% - 2 * var(--space-4));
		margin: auto;
		padding: var(--space-5);
		overflow: auto;
		color: var(--color-text);
		background: var(--color-bg-elevated);
		border: 1px solid var(--color-border-strong);
		border-radius: var(--radius-md);
		box-shadow: var(--shadow-lg);
		font-family: var(--font-sans);
	}
	/* Widths are fractions of the layout token, so a style that changes --content-max resizes every menu. */
	.dialog[data-width='sm'] {
		--x-dialog-width: calc(var(--content-max) * 0.4);
	}
	.dialog[data-width='lg'] {
		--x-dialog-width: calc(var(--content-max) * 0.9);
	}
	.dialog[data-width='full'] {
		--x-dialog-width: var(--content-max);
	}
	.dialog::backdrop {
		background: color-mix(in srgb, var(--color-bg) 55%, transparent);
		backdrop-filter: blur(2px);
	}
	.dialog[data-variant='panel'] {
		outline: 1px solid var(--color-border);
		outline-offset: calc(-1 * var(--space-2));
	}
	.dialog[data-variant='paper'] {
		background-color: var(--color-surface);
		background-image:
			linear-gradient(color-mix(in srgb, var(--color-info) 12%, transparent) 1px, transparent 1px),
			linear-gradient(90deg, color-mix(in srgb, var(--color-info) 12%, transparent) 1px, transparent 1px);
		background-size: var(--space-5) var(--space-5);
	}
	.dialog[data-variant='cork'] {
		background-color: var(--color-warning-soft);
		background-image: radial-gradient(color-mix(in srgb, var(--color-warning) 22%, transparent) 1px, transparent 1.5px);
		background-size: var(--space-2) var(--space-2);
		border: var(--space-2) solid var(--color-border-strong);
	}
	.dialog[data-variant='bare'] {
		padding: 0;
		background: transparent;
		border: 0;
		box-shadow: none;
		overflow: visible;
	}
	.dialog[data-variant='bare']::backdrop {
		background: color-mix(in srgb, var(--color-bg) 88%, transparent);
	}
	@media (max-width: 599px) {
		.dialog {
			padding: var(--space-4);
		}
	}
</style>
