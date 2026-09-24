<script lang="ts">
	// The map: a parchment sketch of the hold for the eye, and — the part that matters — a list of every gate
	// and landmark with its state and buttons to fast travel or step straight through. This list is the full,
	// accessible way to use Eisenhold without walking anywhere.
	import { GETAWAY, gateState, sealMessage, spaceState } from '../domain/access';
	import { HEARTCELL } from '../domain/landmarks';
	import { gatePlaceName, PLACE_NAMES } from '../domain/lore';
	import Dialog from './Dialog.svelte';
	import type { WorldController } from './controller';
	import type { WorldUi } from './state.svelte';

	let { ui, ctl, worldReady }: { ui: WorldUi; ctl: WorldController; worldReady: boolean } = $props();

	let layout = $derived(ctl.layout);
	const scale = 1.6;
	const x = (v: number) => 100 + v * scale;
	const y = (v: number) => 100 + v * scale;

	function stateLine(gateId: string): { text: string; kind: 'live' | 'warning' | 'planned' | 'danger' } {
		const gate = ctl.realm.gates.find((g) => g.id === gateId);
		if (!gate) return { text: '', kind: 'planned' };
		const state = gateState(gate, ctl.access);
		if (state.kind === 'dormant') return { text: 'Dormant — not built yet', kind: 'planned' };
		if (state.kind === 'sealed') return { text: sealMessage(state, gatePlaceName(gate.name), ctl.guilds), kind: 'danger' };
		if (ui.health[gate.id] === 'down') return { text: 'Open, but the app is not answering the gateway', kind: 'warning' };
		if (!gate.access) return { text: 'Open', kind: 'live' };
		return ctl.mode === 'open'
			? { text: 'Open here (local realm). On the real domain only its guild passes.', kind: 'live' }
			: { text: 'Open to you. The gateway checks your guild again at the door.', kind: 'live' };
	}

	let getaway = $derived(spaceState(GETAWAY, ctl.access));
</script>

<Dialog labelledby="map-title" onclose={() => ctl.close()} width="lg">
	<div class="map">
		<header class="head">
			<h2 id="map-title">Map of Eisenhold</h2>
			<button type="button" class="btn btn-secondary" onclick={() => ctl.close()}>Close</button>
		</header>
		<div class="layout">
			<svg class="sketch" viewBox="0 0 200 200" aria-hidden="true">
				<circle class="valley" cx="100" cy="100" r="96" />
				<circle class="square" cx="100" cy="100" r={layout.hubRadius * scale} />
				{#each layout.gates as g (g.gate.id)}
					<line class="road" x1="100" y1="100" x2={x(g.spot.x)} y2={y(g.spot.z)} />
					<text class="pin" x={x(g.spot.x)} y={y(g.spot.z)}>{g.gate.icon || '✦'}</text>
				{/each}
				<text class="pin" x={x(layout.cabin.x)} y={y(layout.cabin.z)}>🏠</text>
				<text class="pin" x={x(layout.wordWall.x)} y={y(layout.wordWall.z)}>📜</text>
				<text class="pin" x={x(layout.campfire.x)} y={y(layout.campfire.z)}>🔥</text>
				<text class="pin" x={x(layout.heartcell.x)} y={y(layout.heartcell.z)}>{HEARTCELL.icon}</text>
				{#each layout.landmarks as l (l.id)}
					<text class="pin" x={x(l.spot.x)} y={y(l.spot.z)}>{l.icon}</text>
				{/each}
				<text class="compass" x="100" y="12">N</text>
			</svg>
			<ul class="places" role="list">
				{#each ctl.realm.gates as gate (gate.id)}
					{@const line = stateLine(gate.id)}
					<li>
						<span class="icon" aria-hidden="true">{gate.icon || '✦'}</span>
						<div class="body">
							<h3>{gatePlaceName(gate.name)}</h3>
							<p class="desc">{gate.description}</p>
							<p class="state"><span class="badge" data-kind={line.kind}>{line.kind === 'danger' ? 'Sealed' : line.kind === 'planned' ? 'Dormant' : line.kind === 'warning' ? 'Unwell' : 'Open'}</span> {line.text}</p>
						</div>
						<div class="go">
							{#if worldReady}
								<button type="button" class="btn btn-secondary" onclick={() => ctl.fastTravel(`gate:${gate.id}`)} aria-label="Travel to {gatePlaceName(gate.name)}">Travel</button>
							{/if}
							{#if gate.href}
								<button type="button" class="btn btn-primary" onclick={() => ctl.tryGate(gate.id)} aria-label="Enter {gate.name}">Enter</button>
							{/if}
						</div>
					</li>
				{/each}
				<li>
					<span class="icon" aria-hidden="true">🏠</span>
					<div class="body">
						<h3>{PLACE_NAMES.cabin}</h3>
						<p class="desc">A small cabin with Colorado inside: the drawing board and the cork board of plans.</p>
						<p class="state">
							<span class="badge" data-kind={getaway.kind === 'open' ? 'live' : 'danger'}>{getaway.kind === 'open' ? 'Open' : 'Locked'}</span>
							{getaway.kind === 'open' ? 'Open to you' : sealMessage(getaway, GETAWAY.name, ctl.guilds)}
						</p>
					</div>
					{#if worldReady}
						<div class="go">
							<button type="button" class="btn btn-secondary" onclick={() => ctl.fastTravel('cabin')} aria-label="Travel to {PLACE_NAMES.cabin}">Travel</button>
						</div>
					{/if}
				</li>
				{#if worldReady}
					<li>
						<span class="icon" aria-hidden="true">📜</span>
						<div class="body">
							<h3>{PLACE_NAMES.wordWall}</h3>
							<p class="desc">Every app's running version and when it arrived, carved in stone.</p>
						</div>
						<div class="go">
							<button type="button" class="btn btn-secondary" onclick={() => ctl.fastTravel('word-wall')} aria-label="Travel to {PLACE_NAMES.wordWall}">Travel</button>
							<button type="button" class="btn btn-secondary" onclick={() => ctl.open('wordwall')}>Read</button>
						</div>
					</li>
					<li>
						<span class="icon" aria-hidden="true">{HEARTCELL.icon}</span>
						<div class="body">
							<h3>{HEARTCELL.name}</h3>
							<p class="desc">{HEARTCELL.blurb} Before it, a lectern tells the legend of the panel.</p>
						</div>
						<div class="go">
							<button type="button" class="btn btn-secondary" onclick={() => ctl.fastTravel(HEARTCELL.id)} aria-label="Travel to {HEARTCELL.name}">Travel</button>
						</div>
					</li>
					{#each layout.landmarks as l (l.id)}
						<li>
							<span class="icon" aria-hidden="true">{l.icon}</span>
							<div class="body">
								<h3>{l.name}</h3>
								<p class="desc">{l.blurb}</p>
							</div>
							<div class="go">
								<button type="button" class="btn btn-secondary" onclick={() => ctl.fastTravel(`landmark:${l.id}`)} aria-label="Travel to {l.name}">Travel</button>
							</div>
						</li>
					{/each}
				{/if}
			</ul>
		</div>
		<p class="foot">Prefer a plain page? <a href={ctl.realm.classicHref}>Open the classic list of apps</a>.</p>
	</div>
</Dialog>

<style>
	.map {
		display: grid;
		gap: var(--space-4);
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
	.layout {
		display: grid;
		gap: var(--space-5);
		grid-template-columns: minmax(0, 2fr) minmax(0, 3fr);
		align-items: start;
	}
	.sketch {
		width: 100%;
		background: var(--color-surface);
		border: 1px solid var(--color-border-strong);
		border-radius: var(--radius-sm);
	}
	.valley {
		fill: none;
		stroke: var(--color-border-strong);
		stroke-dasharray: 3 3;
	}
	.square {
		fill: var(--color-surface-hover);
		stroke: var(--color-border-strong);
	}
	.road {
		stroke: var(--color-text-muted);
		stroke-width: 1.5;
		stroke-dasharray: 4 2;
	}
	.pin {
		font-size: 12px;
		text-anchor: middle;
		dominant-baseline: middle;
	}
	.compass {
		font-family: var(--font-display);
		font-size: 10px;
		text-anchor: middle;
		fill: var(--color-text);
	}
	.places {
		display: grid;
		gap: var(--space-3);
		margin: 0;
		padding: 0;
		list-style: none;
	}
	.places li {
		display: grid;
		grid-template-columns: auto minmax(0, 1fr);
		gap: var(--space-2) var(--space-3);
		padding: var(--space-3);
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
	}
	.icon {
		font-size: var(--text-2xl);
		line-height: 1;
	}
	h3 {
		margin: 0;
		font-family: var(--font-display);
		font-size: var(--text-lg);
	}
	.desc,
	.state {
		margin: var(--space-1) 0 0;
		font-size: var(--text-sm);
	}
	.desc {
		color: var(--color-text-muted);
	}
	.go {
		grid-column: 2;
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
	}
	.foot {
		margin: 0;
		font-size: var(--text-sm);
	}
	@media (max-width: 767px) {
		.layout {
			grid-template-columns: 1fr;
		}
		.sketch {
			max-width: calc(var(--content-max) * 0.3);
			justify-self: center;
		}
	}
</style>
