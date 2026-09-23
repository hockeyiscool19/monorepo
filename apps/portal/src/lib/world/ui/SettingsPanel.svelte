<script lang="ts">
	// Settings: sound, look sensitivity, invert Y, motion (Reduced holds flames, snow and aurora still), and
	// graphics quality. Saved in this browser only.
	import ThemeToggle from '$lib/components/ThemeToggle.svelte';
	import type { Quality } from '../engine/space';
	import type { WorldController } from './controller';
	import type { Settings, WorldUi } from './state.svelte';

	let { ui, ctl }: { ui: WorldUi; ctl: WorldController } = $props();

	function set<K extends keyof Settings>(key: K, value: Settings[K]) {
		ctl.applySettings({ ...ui.settings, [key]: value });
	}
</script>

<section class="settings" aria-labelledby="settings-heading">
	<h3 id="settings-heading">Settings</h3>
	<div class="row">
		<label><input type="checkbox" checked={ui.settings.sound} onchange={(e) => set('sound', e.currentTarget.checked)} /> Sound</label>
	</div>
	<div class="row">
		<label for="set-volume">Volume</label>
		<input id="set-volume" type="range" min="0" max="1" step="0.05" value={ui.settings.volume} oninput={(e) => set('volume', Number(e.currentTarget.value))} />
	</div>
	<div class="row">
		<label for="set-sensitivity">Look sensitivity</label>
		<input id="set-sensitivity" type="range" min="0.2" max="3" step="0.1" value={ui.settings.sensitivity} oninput={(e) => set('sensitivity', Number(e.currentTarget.value))} />
	</div>
	<div class="row">
		<label><input type="checkbox" checked={ui.settings.invertY} onchange={(e) => set('invertY', e.currentTarget.checked)} /> Invert look up and down</label>
	</div>
	<fieldset class="row">
		<legend>Motion</legend>
		{#each [['system', 'Follow my system'], ['full', 'Full'], ['reduced', 'Reduced (hold flames, snow and aurora still)']] as [value, label] (value)}
			<label><input type="radio" name="motion" {value} checked={ui.settings.motion === value} onchange={() => set('motion', value as Settings['motion'])} /> {label}</label>
		{/each}
	</fieldset>
	<div class="row">
		<label for="set-quality">Graphics quality</label>
		<select id="set-quality" value={ui.settings.quality} onchange={(e) => set('quality', e.currentTarget.value as Quality)}>
			<option value="low">Low (phones, older laptops)</option>
			<option value="medium">Medium</option>
			<option value="high">High (shadows, reflections, more trees)</option>
		</select>
	</div>
	<div class="row">
		<span>Theme</span>
		<ThemeToggle />
	</div>
	<p class="note">Controls: W A S D or arrows to walk, mouse or arrow keys to turn, Shift to run, Space to hop, E to use, M map, J journal, Esc menu. On touch, drag the left half to walk and the right half to look.</p>
</section>

<style>
	.settings {
		display: grid;
		gap: var(--space-3);
		max-width: calc(var(--content-max) * 0.56);
	}
	h3 {
		margin: 0;
		font-family: var(--font-display);
		font-size: var(--text-lg);
	}
	.row {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-2) var(--space-4);
		min-height: var(--control-height);
		margin: 0;
		padding: 0;
		border: 0;
	}
	fieldset.row {
		display: grid;
		gap: var(--space-1);
	}
	legend {
		font-weight: var(--weight-medium);
		margin-bottom: var(--space-1);
	}
	label {
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
	}
	input[type='range'] {
		accent-color: var(--color-accent);
		min-width: calc(var(--space-8) * 3);
	}
	select {
		min-height: var(--control-height);
		padding: 0 var(--space-3);
		font: inherit;
		color: var(--color-text);
		background: var(--color-surface);
		border: 1px solid var(--color-border-strong);
		border-radius: var(--radius-sm);
	}
	.note {
		margin: 0;
		font-size: var(--text-sm);
		color: var(--color-text-muted);
	}
</style>
