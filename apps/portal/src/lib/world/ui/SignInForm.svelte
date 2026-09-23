<script lang="ts">
	// Sign in or register with the platform's Firebase project: Google, or email and password. Registering
	// makes you a traveller; guilds (and with them Vale) are granted by the Jarl, never by this form.
	// Accessible form rules: visible labels, autocomplete, errors next to their field and summarised on submit.
	import { AuthError } from '../application/ports';
	import type { WorldController } from './controller';
	import type { WorldUi } from './state.svelte';

	let { ui, ctl }: { ui: WorldUi; ctl: WorldController } = $props();

	let mode = $state<'sign-in' | 'register'>('sign-in');
	let name = $state('');
	let email = $state('');
	let password = $state('');
	let reveal = $state(false);
	let busy = $state(false);
	let error = $state<{ field: 'email' | 'password' | 'form'; text: string } | null>(null);
	let summary: HTMLParagraphElement | undefined = $state();

	function fieldOf(e: AuthError): 'email' | 'password' | 'form' {
		if (e.code === 'invalid_email' || e.code === 'email_in_use') return 'email';
		if (e.code === 'weak_password' || e.code === 'invalid_credentials') return 'password';
		return 'form';
	}

	async function run(action: () => Promise<void>, done: string) {
		busy = true;
		error = null;
		try {
			await action();
			ui.toast(done);
			password = '';
		} catch (e) {
			const err = e instanceof AuthError ? e : new AuthError('unknown', 'Sign-in failed. Try again in a moment.');
			error = { field: fieldOf(err), text: err.message };
			queueMicrotask(() => summary?.focus());
		} finally {
			busy = false;
		}
	}

	function submit(event: SubmitEvent) {
		event.preventDefault();
		if (!email.trim()) {
			error = { field: 'email', text: 'Enter your email address, for example name@example.com.' };
			queueMicrotask(() => summary?.focus());
			return;
		}
		if (mode === 'register') void run(() => ctl.authPort.register({ name, email, password }), 'Welcome, traveller. Check your inbox to verify your email.');
		else void run(() => ctl.authPort.signInWithEmail(email, password), 'Signed in.');
	}

	function reset() {
		if (!email.trim()) {
			error = { field: 'email', text: 'Enter your email address first, then choose “Forgot password”.' };
			return;
		}
		void run(() => ctl.authPort.resetPassword(email), `If an account uses ${email.trim()}, a reset link is on its way.`);
	}
</script>

<div class="signin">
	<p>Sign in to see your guilds. Warded gates, like Vale's, open only for their guild; the gateway checks again at the door.</p>

	<button type="button" class="btn btn-primary google" disabled={busy} onclick={() => run(() => ctl.authPort.signInWithGoogle(), 'Signed in with Google.')}>
		Continue with Google
	</button>

	<form class="form" onsubmit={submit} novalidate>
		<fieldset class="mode">
			<legend>With email</legend>
			<label><input type="radio" name="auth-mode" value="sign-in" bind:group={mode} /> Sign in</label>
			<label><input type="radio" name="auth-mode" value="register" bind:group={mode} /> Register</label>
		</fieldset>

		{#if error}
			<p class="alert" data-kind="danger" role="alert" tabindex="-1" bind:this={summary}><span class="alert-body">{error.text}</span></p>
		{/if}

		{#if mode === 'register'}
			<div class="field">
				<label for="auth-name">Name</label>
				<input id="auth-name" type="text" autocomplete="name" bind:value={name} />
			</div>
		{/if}
		<div class="field">
			<label for="auth-email">Email (required)</label>
			<input
				id="auth-email"
				type="email"
				autocomplete="email"
				required
				bind:value={email}
				aria-invalid={error?.field === 'email' ? 'true' : undefined}
				aria-describedby={error?.field === 'email' ? 'auth-error' : undefined}
			/>
		</div>
		<div class="field">
			<label for="auth-password">Password (required{mode === 'register' ? ', at least 8 characters' : ''})</label>
			<div class="password">
				<input
					id="auth-password"
					type={reveal ? 'text' : 'password'}
					autocomplete={mode === 'register' ? 'new-password' : 'current-password'}
					required
					minlength={mode === 'register' ? 8 : undefined}
					bind:value={password}
					aria-invalid={error?.field === 'password' ? 'true' : undefined}
					aria-describedby={error?.field === 'password' ? 'auth-error' : undefined}
				/>
				<button type="button" class="btn btn-text" aria-pressed={reveal} onclick={() => (reveal = !reveal)}>Show password</button>
			</div>
		</div>
		{#if error && error.field !== 'form'}
			<p id="auth-error" class="field-error">{error.text}</p>
		{/if}
		<div class="actions">
			<button type="submit" class="btn btn-secondary" disabled={busy}>{mode === 'register' ? 'Register' : 'Sign in'}</button>
			{#if mode === 'sign-in'}
				<button type="button" class="btn btn-text" disabled={busy} onclick={reset}>Forgot password</button>
			{/if}
		</div>
	</form>
</div>

<style>
	.signin {
		display: grid;
		gap: var(--space-4);
		max-width: calc(var(--content-max) * 0.5);
	}
	.signin > p {
		margin: 0;
	}
	.google {
		justify-self: start;
	}
	.form {
		display: grid;
		gap: var(--space-3);
	}
	.mode {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-4);
		margin: 0;
		padding: var(--space-3);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
	}
	.mode legend {
		padding: 0 var(--space-1);
		font-family: var(--font-display);
	}
	.mode label {
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
		min-height: var(--control-height);
	}
	.field {
		display: grid;
		gap: var(--space-1);
	}
	.field label {
		font-weight: var(--weight-medium);
	}
	.field input {
		min-height: var(--control-height);
		padding: 0 var(--space-3);
		font: inherit;
		color: var(--color-text);
		background: var(--color-surface);
		border: 1px solid var(--color-border-strong);
		border-radius: var(--radius-sm);
	}
	.field input[aria-invalid='true'] {
		border-color: var(--color-danger);
	}
	.password {
		display: flex;
		gap: var(--space-2);
		align-items: center;
	}
	.password input {
		flex: 1;
	}
	.field-error {
		margin: 0;
		font-size: var(--text-sm);
		color: var(--color-danger);
	}
	.actions {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-3);
	}
</style>
