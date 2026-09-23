<script lang="ts">
	// Your profile: signed out, the sign-in form; signed in, who you are, your guilds (the `groups` claim the
	// gateway also checks), and which gates and rooms that opens. In the open (local) realm nobody needs it.
	import { GETAWAY, gateState, memberGuilds, spaceState } from '../domain/access';
	import { gatePlaceName } from '../domain/lore';
	import SignInForm from './SignInForm.svelte';
	import type { WorldController } from './controller';
	import type { WorldUi } from './state.svelte';

	let { ui, ctl }: { ui: WorldUi; ctl: WorldController } = $props();

	let guilds = $derived(memberGuilds(ui.viewer, ctl.guilds));
	let initials = $derived((ui.viewer?.name ?? ui.viewer?.email ?? '?').split(/[\s@.]+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join(''));
	let since = $derived(ui.viewer?.createdAt ? new Date(ui.viewer.createdAt).toLocaleDateString('en', { year: 'numeric', month: 'long' }) : null);
	let places = $derived([
		...ctl.realm.gates.filter((g) => g.access).map((g) => ({ name: gatePlaceName(g.name), open: gateState(g, ctl.access).kind === 'open' })),
		{ name: GETAWAY.name, open: spaceState(GETAWAY, ctl.access).kind === 'open' }
	]);
	let refreshing = $state(false);

	async function refresh() {
		refreshing = true;
		try {
			await ctl.authPort.idToken(true);
			ui.toast('Your guilds were re-read from your sign-in.');
		} finally {
			refreshing = false;
		}
	}
</script>

<section class="profile" aria-labelledby="profile-heading">
	<h3 id="profile-heading" class="visually-hidden">Profile</h3>
	{#if ctl.mode === 'open'}
		<p class="alert" data-kind="info"><span class="alert-body"><strong>Local realm.</strong> Every gate and room is open while Eisenhold runs on this machine; signing in is optional.</span></p>
	{/if}

	{#if !ui.authReady}
		<p role="status">Checking who you are…</p>
	{:else if ui.viewer}
		<div class="card">
			{#if ui.viewer.photoUrl}
				<img class="portrait" src={ui.viewer.photoUrl} alt="" referrerpolicy="no-referrer" />
			{:else}
				<span class="portrait initials" aria-hidden="true">{initials}</span>
			{/if}
			<div>
				<p class="name">{ui.viewer.name ?? 'Traveller'}</p>
				<p class="meta">{ui.viewer.email ?? 'No email on this account'}{ui.viewer.emailVerified ? '' : ' · email not verified'}</p>
				<p class="meta">{ui.authLabel}{since ? ` · registered ${since}` : ''}</p>
			</div>
		</div>

		<h4>Your guilds</h4>
		{#if guilds.length === 0}
			<p>No guild has claimed you yet. The Jarl adds travellers to guilds by hand; until then warded gates stay sealed to you.</p>
		{:else}
			<ul class="guilds" role="list">
				{#each guilds as guild (guild.id)}
					<li><span aria-hidden="true">{guild.emblem}</span> <strong>{guild.name}</strong> — {guild.description}</li>
				{/each}
			</ul>
		{/if}

		<h4>Warded places</h4>
		<ul class="places" role="list">
			{#each places as place (place.name)}
				<li><span class="badge" data-kind={place.open ? 'live' : 'danger'}>{place.open ? 'Open' : 'Sealed'}</span> {place.name}</li>
			{/each}
		</ul>

		<div class="actions">
			<button type="button" class="btn btn-secondary" onclick={refresh} disabled={refreshing}>Refresh my guilds</button>
			<button type="button" class="btn btn-text" onclick={() => ctl.signOut()}>Sign out</button>
		</div>
	{:else if ui.authAvailable}
		<SignInForm {ui} {ctl} />
	{:else}
		<p>Sign-in is not configured on this build, so warded gates stay sealed. The steps are in <code>docs/runbooks/platform-auth.md</code>.</p>
	{/if}
</section>

<style>
	.profile {
		display: grid;
		gap: var(--space-3);
	}
	.visually-hidden {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip-path: inset(50%);
		white-space: nowrap;
	}
	.card {
		display: flex;
		gap: var(--space-4);
		align-items: center;
		padding: var(--space-4);
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
	}
	.portrait {
		width: var(--space-8);
		height: var(--space-8);
		border-radius: var(--radius-full);
		border: 2px solid var(--color-accent);
		object-fit: cover;
	}
	.initials {
		display: grid;
		place-items: center;
		font-family: var(--font-display);
		font-size: var(--text-xl);
		color: var(--color-on-accent-soft);
		background: var(--color-accent-soft);
	}
	.name {
		margin: 0;
		font-family: var(--font-display);
		font-size: var(--text-xl);
	}
	.meta {
		margin: var(--space-1) 0 0;
		font-size: var(--text-sm);
		color: var(--color-text-muted);
	}
	h4 {
		margin: var(--space-2) 0 0;
		font-family: var(--font-display);
		font-size: var(--text-lg);
	}
	.guilds,
	.places {
		display: grid;
		gap: var(--space-2);
		margin: 0;
		padding: 0;
		list-style: none;
	}
	.actions {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-3);
	}
</style>
