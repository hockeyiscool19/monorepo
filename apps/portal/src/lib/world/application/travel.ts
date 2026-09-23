// Use case: step through a gate. Open gates in open mode, and gates without `access`, simply navigate.
// A warded gate first asks the gateway door for a session with a fresh ID token (so newly granted groups
// count), then navigates; the door, not this code, is what actually keeps Vale safe.

import { gateState, type AccessContext, type GateState } from '../domain/access';
import type { RealmGate } from '../domain/realm';
import type { AuthPort, DoorFailure, DoorPort, Navigator } from './ports';

export type TravelOutcome =
	| { kind: 'travelled'; href: string }
	| { kind: 'dormant' }
	| { kind: 'sealed'; state: GateState }
	| { kind: 'refused'; reason: DoorFailure };

export interface TravelDeps {
	auth: AuthPort;
	door: DoorPort;
	navigator: Navigator;
}

export async function enterGate(gate: RealmGate, ctx: AccessContext, deps: TravelDeps): Promise<TravelOutcome> {
	const state = gateState(gate, ctx);
	if (state.kind === 'dormant' || gate.href === null) return { kind: 'dormant' };
	if (state.kind === 'sealed') return { kind: 'sealed', state };
	if (ctx.mode === 'open' || !gate.access) {
		deps.navigator.go(gate.href);
		return { kind: 'travelled', href: gate.href };
	}
	const token = await deps.auth.idToken(true).catch(() => null);
	if (!token) return { kind: 'refused', reason: 'sign_in_required' };
	const result = await deps.door.open(gate, token);
	if (!result.ok) return { kind: 'refused', reason: result.reason };
	deps.navigator.go(gate.href);
	return { kind: 'travelled', href: gate.href };
}

/** Close every door session this browser holds (on sign-out), ignoring failures: the envelope expires anyway. */
export async function closeAllDoors(gates: RealmGate[], door: DoorPort): Promise<void> {
	await Promise.all(gates.filter((g) => g.access).map((g) => door.close(g).catch(() => undefined)));
}
