<script lang="ts">
	// Root layout: the style (two aliases set in vite.config.ts — the one-line style switch) and the favicon.
	// The classic pages add their own chrome in (classic)/+layout.svelte; the world at / is full-bleed.
	import '$style/tokens.css';
	import '$style/components.css';
	import favicon from '$lib/assets/favicon.svg';

	let { children } = $props();
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

{@render children()}
