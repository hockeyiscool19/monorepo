import { realmData } from '$lib/server/realm';

// Runs once at build time (the root layout prerenders everything): the world's gates, baked into index.html.
export function load() {
	return { realm: realmData() };
}
