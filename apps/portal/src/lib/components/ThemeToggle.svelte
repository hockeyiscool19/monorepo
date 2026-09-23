<script lang="ts">
	// Theme toggle per the design-tokens contract: sets data-theme="light|dark" on <html>.
	// The persisted choice is applied before first paint by the inline script in app.html.
	// The label stays constant and aria-pressed carries the state, so screen readers hear one
	// consistent control ("Dark mode, toggle button, pressed") rather than a flipping name.
	import { onMount } from 'svelte';

	const STORAGE_KEY = 'theme';
	let dark = $state(false);

	function apply(next: boolean) {
		dark = next;
		document.documentElement.dataset.theme = next ? 'dark' : 'light';
		try {
			localStorage.setItem(STORAGE_KEY, next ? 'dark' : 'light');
		} catch {
			// Storage unavailable: the choice still applies for this page view.
		}
	}

	onMount(() => {
		const current = document.documentElement.dataset.theme;
		if (current === 'dark' || current === 'light') dark = current === 'dark';
		else dark = window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
	});
</script>

<button class="theme-toggle" type="button" aria-pressed={dark} data-theme-toggle onclick={() => apply(!dark)}>
	Dark mode
</button>
