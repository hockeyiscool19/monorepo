<script lang="ts">
	// Hero status line. Server-rendered with the registry's live count; on the client it probes the
	// gateway once (6 s budget: the gateway waits up to 3 s per cold upstream). Any failure degrades to "Status unavailable" — never an error state.
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
			const signal = typeof AbortSignal.timeout === 'function' ? AbortSignal.timeout(6000) : undefined;
			// no-store: a status probe must never be answered from a cache (a browser that saw /api/health
			// before the gateway existed would otherwise keep replaying that 404 for the cached lifetime).
			const res = await fetch(healthUrl, { signal, cache: 'no-store', headers: { accept: 'application/json' } });
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
