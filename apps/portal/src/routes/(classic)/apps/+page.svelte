<script lang="ts">
	import AppsSection from '$lib/components/AppsSection.svelte';
	import Deployments from '$lib/components/Deployments.svelte';
	import GatewayStatus from '$lib/components/GatewayStatus.svelte';
	import { site } from '$lib/site';

	let { data } = $props();
</script>

<svelte:head>
	<title>{site.title}</title>
	<meta name="description" content="Personal apps on {data.domain}. Pick a tile to open it." />
</svelte:head>

<section class="hero">
	<h1>Everything I build, one door.</h1>
	<p class="lede">Personal apps on {data.domain}. Pick a tile to open it.</p>
	<GatewayStatus healthUrl={data.healthUrl} liveCount={data.liveCount} />
</section>

<AppsSection tiles={data.tiles} />

<Deployments rows={data.rows} routingPending={data.routingPending} links={data.links} />
