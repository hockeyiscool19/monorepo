<script lang="ts">
	// Hero status line. Server-rendered with the registry's live count; on the client it probes the
	// gateway once (3 s budget). Any failure degrades to "Status unavailable" — never an error state.
	import { onMount } from 'svelte';

	let { healthUrl, liveCount }: { healthUrl: string; liveCount: number } = $props();

	type Probe = 'pending' | 'ok' | 'unknown';
	let probe = $state<Probe>('pending');

	let appsLive = $derived(`${liveCount} ${liveCount === 1 ? 'app' : 'apps'} live`);
	let text = $derived.by(() => {
		if (probe === 'ok') return `Gateway healthy · ${appsLive}`;
		if (probe === 'unknown') return 'Status unavailable';
		return appsLive;
	});

	onMount(async () => {
		try {
			const signal = typeof AbortSignal.timeout === 'function' ? AbortSignal.timeout(3000) : undefined;
			const res = await fetch(healthUrl, { signal, headers: { accept: 'application/json' } });
			probe = res.ok ? 'ok' : 'unknown';
		} catch {
			probe = 'unknown';
		}
	});
</script>

<p class="meta" aria-live="polite">
	<span class="status-dot" data-state={probe} aria-hidden="true"></span>
	{text}
</p>
