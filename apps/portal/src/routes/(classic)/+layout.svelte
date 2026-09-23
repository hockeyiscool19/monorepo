<script lang="ts">
	// Page chrome for the classic pages, mirroring plugins/eisen-design/mockups/reference.html:
	// skip-link → header (wordmark, nav, theme toggle) → main → footer. The style is imported by the root layout.
	import ThemeToggle from '$lib/components/ThemeToggle.svelte';
	import { site } from '$lib/site';

	let { children, data } = $props();
</script>

<a class="skip-link" href="#apps">Skip to apps</a>

<header class="site-header">
	<a class="wordmark" href="/" aria-label="eisensoftware home">eisensoftware</a>
	<nav class="site-nav" aria-label="Primary">
		<a href="/">Realm</a>
		<a href="/apps" aria-current="page">Apps</a>
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
