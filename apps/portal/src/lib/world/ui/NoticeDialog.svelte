<script lang="ts">
	// Why a gate or door would not open, in one sentence, with the next step: sign in (when that could help),
	// read the guilds, or walk away.
	import Dialog from './Dialog.svelte';
	import SignInForm from './SignInForm.svelte';
	import type { WorldController } from './controller';
	import type { Notice, WorldUi } from './state.svelte';

	let { ui, ctl, notice }: { ui: WorldUi; ctl: WorldController; notice: Notice } = $props();

	let signingIn = $state(false);

	$effect(() => {
		// Signing in from the notice closes it: the gates redraw for who you now are.
		if (signingIn && ui.viewer) ctl.close();
	});
</script>

<Dialog labelledby="notice-title" onclose={() => ctl.close()} width="sm">
	<div class="notice">
		<p class="seal" aria-hidden="true">🜨</p>
		<h2 id="notice-title">{notice.title}</h2>
		<p>{notice.message}</p>
		{#if signingIn}
			<SignInForm {ui} {ctl} />
		{/if}
		<div class="actions">
			{#if notice.signIn && !signingIn}
				<button type="button" class="btn btn-primary" onclick={() => (signingIn = true)}>Sign in</button>
			{/if}
			<button type="button" class="btn btn-secondary" onclick={() => ((ui.journalTab = 'guilds'), ctl.open('journal'))}>About the guilds</button>
			<button type="button" class="btn btn-text" onclick={() => ctl.close()}>Walk away</button>
		</div>
	</div>
</Dialog>

<style>
	.notice {
		display: grid;
		gap: var(--space-3);
	}
	.seal {
		margin: 0;
		font-size: var(--text-3xl);
		line-height: 1;
		color: var(--color-danger);
	}
	h2 {
		margin: 0;
		font-family: var(--font-display);
		font-size: var(--text-2xl);
	}
	p {
		margin: 0;
	}
	.actions {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
	}
</style>
