<script lang="ts">
	// One app tile. Markup mirrors plugins/eisen-design/mockups/reference.html:
	// li.tile[data-status] > .tile-link > .tile-icon / .tile-body / .tile-foot.
	// Planned apps render the same structure as a <div> (not a link) so they are dimmed, not clickable.
	import type { TileModel } from '$lib/server/registry';

	let { tile }: { tile: TileModel } = $props();

	const labels = { live: 'Live', beta: 'Beta', planned: 'Planned' } as const;
</script>

{#snippet body()}
	<span class="tile-icon" aria-hidden="true">{tile.icon}</span>
	<span class="tile-body">
		<span class="tile-title">{tile.name}</span>
		<span class="tile-desc">{tile.description}</span>
	</span>
	<span class="tile-foot">
		<span class="badge" data-kind={tile.status}>{labels[tile.status]}</span>
		<span class="version">{tile.version ? `v${tile.version}` : '—'}</span>
		{#if tile.href}<span class="tile-cta" aria-hidden="true">Open →</span>{/if}
	</span>
{/snippet}

<li class="tile" data-status={tile.status}>
	{#if tile.href}
		<a class="tile-link" href={tile.href}>{@render body()}</a>
	{:else}
		<div class="tile-link">{@render body()}</div>
	{/if}
</li>
