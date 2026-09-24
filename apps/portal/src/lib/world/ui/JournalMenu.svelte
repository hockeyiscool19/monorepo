<script lang="ts">
	// The journal: who you are (sign-in and your guilds), every guild's profile, your quests (the cork board
	// as a quest log, with your level), the tidbits of the Jarl's story you have found, and settings. Tabs follow
	// the WAI-ARIA pattern: arrow keys move between tabs, Home/End jump, Tab moves into the panel.
	import Dialog from './Dialog.svelte';
	import GuildsPanel from './GuildsPanel.svelte';
	import ProfilePanel from './ProfilePanel.svelte';
	import QuestsPanel from './QuestsPanel.svelte';
	import SettingsPanel from './SettingsPanel.svelte';
	import TidbitsPanel from './TidbitsPanel.svelte';
	import type { WorldController } from './controller';
	import type { JournalTab, WorldUi } from './state.svelte';

	let { ui, ctl }: { ui: WorldUi; ctl: WorldController } = $props();

	const TABS: { id: JournalTab; label: string }[] = [
		{ id: 'profile', label: 'Profile' },
		{ id: 'guilds', label: 'Guilds' },
		{ id: 'quests', label: 'Quests' },
		{ id: 'tidbits', label: 'Tidbits' },
		{ id: 'settings', label: 'Settings' }
	];
	const buttons: HTMLButtonElement[] = [];

	function keydown(event: KeyboardEvent, index: number) {
		const last = TABS.length - 1;
		const next =
			event.key === 'ArrowRight' ? (index === last ? 0 : index + 1) : event.key === 'ArrowLeft' ? (index === 0 ? last : index - 1) : event.key === 'Home' ? 0 : event.key === 'End' ? last : null;
		if (next === null) return;
		event.preventDefault();
		ui.journalTab = TABS[next].id;
		buttons[next]?.focus();
	}
</script>

<Dialog labelledby="journal-title" onclose={() => ctl.close()} width="lg">
	<div class="journal">
		<header class="head">
			<h2 id="journal-title">Journal</h2>
			<button type="button" class="btn btn-secondary" onclick={() => ctl.close()}>Close</button>
		</header>
		<div class="tabs" role="tablist" aria-label="Journal sections">
			{#each TABS as tab, i (tab.id)}
				<button
					bind:this={buttons[i]}
					type="button"
					role="tab"
					id="tab-{tab.id}"
					aria-selected={ui.journalTab === tab.id}
					aria-controls="panel-{tab.id}"
					tabindex={ui.journalTab === tab.id ? 0 : -1}
					onclick={() => (ui.journalTab = tab.id)}
					onkeydown={(e) => keydown(e, i)}>{tab.label}</button
				>
			{/each}
		</div>
		<div class="panel" role="tabpanel" id="panel-{ui.journalTab}" aria-labelledby="tab-{ui.journalTab}" tabindex="0">
			{#if ui.journalTab === 'profile'}
				<ProfilePanel {ui} {ctl} />
			{:else if ui.journalTab === 'guilds'}
				<GuildsPanel {ui} {ctl} />
			{:else if ui.journalTab === 'quests'}
				<QuestsPanel {ui} {ctl} />
			{:else if ui.journalTab === 'tidbits'}
				<TidbitsPanel {ui} {ctl} />
			{:else}
				<SettingsPanel {ui} {ctl} />
			{/if}
		</div>
	</div>
</Dialog>

<style>
	.journal {
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
	.tabs {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-1);
		border-bottom: 1px solid var(--color-border-strong);
	}
	[role='tab'] {
		min-height: var(--control-height);
		padding: 0 var(--space-4);
		font: inherit;
		font-family: var(--font-display);
		letter-spacing: 0.06em;
		color: var(--color-text-muted);
		background: none;
		border: 0;
		border-bottom: var(--space-1) solid transparent;
		cursor: pointer;
	}
	[role='tab'][aria-selected='true'] {
		color: var(--color-text);
		border-bottom-color: var(--color-accent);
	}
	[role='tab']:hover {
		color: var(--color-text);
		background: var(--color-surface-hover);
	}
	.panel {
		min-height: calc(var(--space-8) * 4);
	}
</style>
