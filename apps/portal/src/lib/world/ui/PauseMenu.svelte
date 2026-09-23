<script lang="ts">
	// The pause menu (Esc): resume, the map, the journal, the classic list, and a reminder of the controls.
	import Dialog from './Dialog.svelte';
	import type { WorldController } from './controller';
	import type { WorldUi } from './state.svelte';

	let { ui, ctl }: { ui: WorldUi; ctl: WorldController } = $props();
</script>

<Dialog labelledby="pause-title" onclose={() => ctl.resume()} width="sm">
	<div class="pause">
		<h2 id="pause-title">Paused</h2>
		<p class="where">{ui.hud?.space === 'getaway' ? 'My Get-a-way' : 'Eisenhold'} · {ctl.mode === 'open' ? 'local realm, every door open' : 'guarded realm'}</p>
		<div class="items">
			<button type="button" class="btn btn-primary" onclick={() => ctl.resume()}>Resume</button>
			<button type="button" class="btn btn-secondary" onclick={() => ctl.open('map')}>Map</button>
			<button type="button" class="btn btn-secondary" onclick={() => ((ui.journalTab = 'profile'), ctl.open('journal'))}>{ui.viewer ? 'Profile and guilds' : 'Sign in'}</button>
			<button type="button" class="btn btn-secondary" onclick={() => ((ui.journalTab = 'settings'), ctl.open('journal'))}>Settings</button>
			<a class="btn btn-text" href={ctl.realm.classicHref}>Classic list of apps</a>
		</div>
		<dl class="keys">
			<div><dt>W A S D</dt><dd>walk</dd></div>
			<div><dt>Mouse · ← →</dt><dd>look, turn</dd></div>
			<div><dt>Shift</dt><dd>run</dd></div>
			<div><dt>E</dt><dd>use, enter</dd></div>
			<div><dt>M · J</dt><dd>map, journal</dd></div>
		</dl>
	</div>
</Dialog>

<style>
	.pause {
		display: grid;
		gap: var(--space-4);
		text-align: center;
	}
	h2 {
		margin: 0;
		font-family: var(--font-display);
		font-size: var(--text-3xl);
		letter-spacing: 0.12em;
		text-transform: uppercase;
	}
	.where {
		margin: 0;
		color: var(--color-text-muted);
	}
	.items {
		display: grid;
		gap: var(--space-2);
	}
	.keys {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(calc(var(--space-8) * 1.8), 1fr));
		gap: var(--space-2);
		margin: 0;
		font-size: var(--text-sm);
	}
	.keys div {
		padding: var(--space-2);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
	}
	dt {
		font-weight: var(--weight-bold);
	}
	dd {
		margin: 0;
		color: var(--color-text-muted);
	}
</style>
