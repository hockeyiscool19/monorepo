<script lang="ts">
	// The tiles section with its client-side filter. Progressive enhancement: the server renders
	// every tile; with JS the input narrows the list by name/description. Without JS the form is
	// inert (no `name`, so submitting just reloads the same page) and the full list stays visible.
	import Tile from './Tile.svelte';
	import type { TileModel } from '$lib/server/registry';

	let { tiles }: { tiles: TileModel[] } = $props();

	let query = $state('');
	const norm = (s: string) => s.toLocaleLowerCase('en').trim();
	let shown = $derived.by(() => {
		const q = norm(query);
		return q ? tiles.filter((t) => norm(`${t.name} ${t.description}`).includes(q)) : tiles;
	});
	let announcement = $derived(
		norm(query) ? `${shown.length} of ${tiles.length} apps match` : `${tiles.length} apps`
	);
</script>

<section id="apps" class="apps" aria-labelledby="apps-heading">
	<div class="section-head">
		<h2 id="apps-heading">Apps</h2>
		<form class="filter" role="search" onsubmit={(e) => e.preventDefault()}>
			<label for="q">Filter</label>
			<input id="q" type="search" placeholder="Search apps" autocomplete="off" bind:value={query} />
		</form>
	</div>

	<p class="visually-hidden" role="status">{announcement}</p>

	<ul class="tiles" role="list">
		{#each shown as tile (tile.id)}
			<Tile {tile} />
		{/each}
	</ul>

	{#if shown.length === 0}
		<div class="alert" data-kind="info"><span class="alert-body">No apps match “{query.trim()}”.</span></div>
	{/if}
</section>

<style>
	/* Screen-reader-only live region. Scoped here (not in components.css) so it survives a style swap;
	   the 1px box is the standard clipping technique, not a design size. */
	.visually-hidden {
		position: absolute;
		width: 1px;
		height: 1px;
		margin: -1px;
		padding: 0;
		border: 0;
		overflow: hidden;
		clip-path: inset(50%);
		white-space: nowrap;
	}
</style>
