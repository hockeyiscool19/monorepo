<script lang="ts">
	// The front door of eisensoftware: the realm of Eisenhold, one gate per app in the registry.
	import World from '$lib/world/ui/World.svelte';

	let { data } = $props();
</script>

<World realm={data.realm} />
