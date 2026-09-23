// Who may pass which gate or enter which space — the client's mirror of the gateway door's policy.
// The door on the server is the real lock; this only decides what the world shows and offers.
// Pure: no DOM, no I/O.

import type { GuildProfile, RealmGate } from './realm';

/**
 * `open` — local runs (localhost, dev server): every gate and space opens, nobody signs in.
 * `guarded` — anywhere else: gates with `access` and private spaces need a signed-in member.
 */
export type RealmMode = 'open' | 'guarded';

/** The signed-in traveller, as far as access is concerned. */
export interface Viewer {
	uid: string;
	email: string | null;
	name: string | null;
	photoUrl: string | null;
	provider: string | null;
	emailVerified: boolean;
	/** Custom-claim groups from the ID token (`groups`), set only by scripts/grant-groups.mjs. */
	groups: string[];
	createdAt: string | null;
}

export type SealReason = 'sign_in_required' | 'group_required' | 'sign_in_unavailable';

export type GateState =
	| { kind: 'open' }
	| { kind: 'dormant' }
	| { kind: 'sealed'; reason: SealReason; groups: string[] };

/** Spaces are rooms of the world itself (not apps). My Get-a-way belongs to the owner. */
export interface SpacePolicy {
	id: 'getaway';
	name: string;
	groups: string[];
}

export const GETAWAY: SpacePolicy = { id: 'getaway', name: 'My Get-a-way', groups: ['owner'] };

export interface AccessContext {
	mode: RealmMode;
	viewer: Viewer | null;
	/** False when this build has no Firebase configuration, so nobody can sign in. */
	signInAvailable: boolean;
}

function decide(groups: string[], ctx: AccessContext): GateState {
	if (ctx.mode === 'open') return { kind: 'open' };
	if (!ctx.viewer) {
		return { kind: 'sealed', reason: ctx.signInAvailable ? 'sign_in_required' : 'sign_in_unavailable', groups };
	}
	if (groups.length === 0) return { kind: 'open' };
	const member = ctx.viewer.groups.some((g) => groups.includes(g));
	return member ? { kind: 'open' } : { kind: 'sealed', reason: 'group_required', groups };
}

/** The state a gate shows: dormant (planned), open, or sealed with the reason and the groups that pass. */
export function gateState(gate: RealmGate, ctx: AccessContext): GateState {
	if (gate.status === 'planned' || gate.href === null) return { kind: 'dormant' };
	if (!gate.access) return { kind: 'open' };
	return decide(gate.access.groups, ctx);
}

export function spaceState(space: SpacePolicy, ctx: AccessContext): GateState {
	return decide(space.groups, ctx);
}

/** "Vale Circle or Jarl's Court" — the groups that pass, by their profile names. */
export function guildNames(ids: string[], guilds: GuildProfile[]): string {
	const names = ids.map((id) => guilds.find((g) => g.id === id)?.name ?? id);
	if (names.length <= 1) return names[0] ?? '';
	return `${names.slice(0, -1).join(', ')} or ${names[names.length - 1]}`;
}

/** One sentence explaining a sealed gate, for the HUD, the notice and screen readers. */
export function sealMessage(state: GateState, placeName: string, guilds: GuildProfile[]): string {
	if (state.kind === 'open') return `${placeName} is open.`;
	if (state.kind === 'dormant') return `${placeName} is dormant — it has not been built yet.`;
	switch (state.reason) {
		case 'sign_in_required':
			return `${placeName} is sealed. Sign in, then return as a member of the ${guildNames(state.groups, guilds)}.`;
		case 'group_required':
			return `${placeName} is sealed to you. Only the ${guildNames(state.groups, guilds)} may pass.`;
		case 'sign_in_unavailable':
			return `${placeName} is sealed, and sign-in is not configured on this build.`;
	}
}

/** Guild profiles the viewer belongs to, in registry order. Unknown claim values are kept as bare ids. */
export function memberGuilds(viewer: Viewer | null, guilds: GuildProfile[]): GuildProfile[] {
	if (!viewer) return [];
	const known = guilds.filter((g) => viewer.groups.includes(g.id));
	const unknown = viewer.groups
		.filter((id) => !guilds.some((g) => g.id === id))
		.map((id) => ({ id, name: id, emblem: '✦', description: 'A group this realm does not describe yet.' }));
	return [...known, ...unknown];
}

/** Why the door refused (from the gateway's JSON or the 303 redirect), as a SealReason or null. */
export function reasonFromDoor(value: string | null | undefined): SealReason | 'session_expired' | 'door_unconfigured' | null {
	switch (value) {
		case 'sign_in_required':
		case 'group_required':
		case 'session_expired':
		case 'door_unconfigured':
			return value;
		default:
			return null;
	}
}
