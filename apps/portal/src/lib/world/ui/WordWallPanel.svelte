<script lang="ts">
	// The Word Wall, read up close: every app's words of power — the version that is running, its commit and
	// when it arrived — and whether the gateway hears it breathing. The deployments table, carved in stone.
	import { gatePlaceName } from '../domain/lore';
	import Dialog from './Dialog.svelte';
	import type { WorldController } from './controller';
	import type { WorldUi } from './state.svelte';

	let { ui, ctl }: { ui: WorldUi; ctl: WorldController } = $props();

	const when = (iso: string | null) => (iso ? iso.replace('T', ' ').replace(/:\d\dZ$/, ' UTC') : '—');
	const health = (id: string) => ui.health[id] ?? 'unknown';
	const HEALTH = { ok: { kind: 'live', text: 'Answering' }, down: { kind: 'danger', text: 'Silent' }, unknown: { kind: 'planned', text: 'Unknown' } } as const;
</script>

<Dialog labelledby="wall-title" onclose={() => ctl.close()} width="lg">
	<div class="wall">
		<header class="head">
			<h2 id="wall-title">The Word Wall</h2>
			<button type="button" class="btn btn-secondary" onclick={() => ctl.close()}>Close</button>
		</header>
		<p class="lede">Words of power: what each gate opens onto, as recorded in the registry.</p>
		<!-- A labelled, focusable scroll region: keyboard users can reach columns hidden at phone widths. -->
		<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
		<div class="table-wrap" role="region" aria-labelledby="wall-title" tabindex="0">
			<table class="table">
				<caption class="visually-hidden">Running version of each app</caption>
				<thead>
					<tr>
						<th scope="col">Gate</th>
						<th scope="col" class="num">Version</th>
						<th scope="col">Commit</th>
						<th scope="col">Arrived</th>
						<th scope="col">Gateway</th>
					</tr>
				</thead>
				<tbody>
					{#each ctl.realm.gates as gate (gate.id)}
						{@const h = HEALTH[health(gate.id)]}
						<tr>
							<th scope="row" data-label="Gate">{gate.icon} {gatePlaceName(gate.name)}</th>
							<td data-label="Version" class="num">{gate.version ?? '—'}</td>
							<td data-label="Commit">{#if gate.sha}<code>{gate.sha}</code>{:else}—{/if}</td>
							<td data-label="Arrived">{#if gate.deployedAt}<time datetime={gate.deployedAt}>{when(gate.deployedAt)}</time>{:else}—{/if}</td>
							<td data-label="Gateway"><span class="badge" data-kind={h.kind}>{h.text}</span></td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
		<p class="foot"><a href={ctl.realm.registryHref}>registry.json</a> · <a href={ctl.realm.classicHref}>classic view</a></p>
	</div>
</Dialog>

<style>
	.wall {
		display: grid;
		gap: var(--space-3);
	}
	.head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-3);
	}
	h2 {
		margin: 0;
		font-family: var(--font-display);
		font-size: var(--text-2xl);
		letter-spacing: 0.06em;
	}
	.lede,
	.foot {
		margin: 0;
		color: var(--color-text-muted);
	}
	th[scope='row'] {
		text-align: left;
		font-weight: var(--weight-medium);
	}
	.visually-hidden {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip-path: inset(50%);
		white-space: nowrap;
	}
</style>
