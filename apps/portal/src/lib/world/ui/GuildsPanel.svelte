<script lang="ts">
	// Group profiles: every guild the registry declares (platform.auth.groups), what it opens, and whether you
	// belong. Membership is the `groups` custom claim, granted with scripts/grant-groups.mjs.
	import { GETAWAY } from '../domain/access';
	import { gatePlaceName } from '../domain/lore';
	import type { WorldController } from './controller';
	import type { WorldUi } from './state.svelte';

	let { ui, ctl }: { ui: WorldUi; ctl: WorldController } = $props();

	function opens(id: string): string[] {
		const gates = ctl.realm.gates.filter((g) => g.access && (g.access.groups.length === 0 || g.access.groups.includes(id))).map((g) => gatePlaceName(g.name));
		return GETAWAY.groups.includes(id) ? [...gates, GETAWAY.name] : gates;
	}
</script>

<section class="guilds" aria-labelledby="guilds-heading">
	<h3 id="guilds-heading">Guilds of Eisenhold</h3>
	{#if ctl.guilds.length === 0}
		<p>This realm declares no guilds.</p>
	{:else}
		<ul role="list">
			{#each ctl.guilds as guild (guild.id)}
				{@const member = ui.viewer?.groups.includes(guild.id) ?? false}
				<li class="guild">
					<span class="emblem" aria-hidden="true">{guild.emblem}</span>
					<div>
						<h4>{guild.name} <span class="badge" data-kind={member ? 'success' : 'planned'}>{member ? 'Member' : 'Not a member'}</span></h4>
						<p>{guild.description}</p>
						<p class="opens">Opens: {opens(guild.id).join(', ') || 'nothing warded yet'}</p>
					</div>
				</li>
			{/each}
		</ul>
	{/if}
	<p class="note">Anyone can register; only the Jarl grants guilds. Warded gates are checked twice: here, and by the gateway's door on the server.</p>
</section>

<style>
	.guilds {
		display: grid;
		gap: var(--space-3);
	}
	h3 {
		margin: 0;
		font-family: var(--font-display);
		font-size: var(--text-lg);
	}
	ul {
		display: grid;
		gap: var(--space-3);
		margin: 0;
		padding: 0;
		list-style: none;
	}
	.guild {
		display: grid;
		grid-template-columns: auto minmax(0, 1fr);
		gap: var(--space-3);
		padding: var(--space-4);
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
	}
	.emblem {
		font-size: var(--text-3xl);
		line-height: 1;
	}
	h4 {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-2);
		margin: 0;
		font-family: var(--font-display);
		font-size: var(--text-lg);
	}
	p {
		margin: var(--space-1) 0 0;
	}
	.opens,
	.note {
		font-size: var(--text-sm);
		color: var(--color-text-muted);
	}
</style>
