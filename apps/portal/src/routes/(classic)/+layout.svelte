<script lang="ts">
	// Page chrome, mirroring plugins/eisen-design/mockups/reference.html:
	// skip-link → header (wordmark, nav, theme toggle) → main → footer.
	// The two style imports are aliases set in vite.config.ts (the one-line style switch).
	import '$style/tokens.css';
	import '$style/components.css';
	import favicon from '$lib/assets/favicon.svg';
	import ThemeToggle from '$lib/components/ThemeToggle.svelte';
	import { site } from '$lib/site';

	let { children, data } = $props();
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

<a class="skip-link" href="#apps">Skip to apps</a>

<header class="site-header">
	<a class="wordmark" href="/" aria-label="eisensoftware home">eisensoftware</a>
	<nav class="site-nav" aria-label="Primary">
		<a href="#apps" aria-current="page">Apps</a>
		<a href={data.registryHref}>Registry</a>
		<!-- rel="external" when it targets the gateway: /api/* is served by a Hosting rewrite, not by this app,
		     so the prerender crawler must not follow it and the client router must not intercept it. -->
		<a href={data.statusHref} rel={data.statusHref.startsWith('#') ? undefined : 'external'}>Status</a>
	</nav>
	<ThemeToggle />
</header>

<main id="main">
	{@render children()}
</main>

<footer class="site-footer">
	<p>
		© {data.year}
		{site.owner} · <a href={site.sourceUrl}>Source</a> · <a href={data.registryHref}>registry.json</a>
	</p>
</footer>
