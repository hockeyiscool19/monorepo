import { describe, expect, it } from 'vitest';
import {
	GETAWAY,
	gateState,
	guildNames,
	memberGuilds,
	reasonFromDoor,
	sealMessage,
	spaceState,
	type AccessContext
} from '../../src/lib/world/domain/access';
import { gate, guilds, vale, viewer } from './fixtures';

const guarded = (groups: string[] | null, signInAvailable = true): AccessContext => ({
	mode: 'guarded',
	viewer: groups === null ? null : viewer(groups),
	signInAvailable
});

describe('gate state', () => {
	it('opens every gate and space in open (local) mode, even for nobody', () => {
		const ctx: AccessContext = { mode: 'open', viewer: null, signInAvailable: false };
		expect(gateState(vale, ctx)).toEqual({ kind: 'open' });
		expect(spaceState(GETAWAY, ctx)).toEqual({ kind: 'open' });
	});

	it('planned apps are dormant in every mode', () => {
		const planned = gate({ status: 'planned', href: null });
		expect(gateState(planned, { mode: 'open', viewer: null, signInAvailable: true }).kind).toBe('dormant');
		expect(gateState(planned, guarded(['owner'])).kind).toBe('dormant');
	});

	it('apps without access are open to everyone when guarded', () => {
		expect(gateState(gate(), guarded(null))).toEqual({ kind: 'open' });
	});

	it('seals Vale for strangers and for members of other guilds; opens it for its groups', () => {
		expect(gateState(vale, guarded(null))).toEqual({ kind: 'sealed', reason: 'sign_in_required', groups: ['owner', 'vale'] });
		expect(gateState(vale, guarded(null, false))).toMatchObject({ reason: 'sign_in_unavailable' });
		expect(gateState(vale, guarded([]))).toMatchObject({ kind: 'sealed', reason: 'group_required' });
		expect(gateState(vale, guarded(['friends']))).toMatchObject({ kind: 'sealed', reason: 'group_required' });
		expect(gateState(vale, guarded(['vale']))).toEqual({ kind: 'open' });
		expect(gateState(vale, guarded(['owner']))).toEqual({ kind: 'open' });
	});

	it('an empty group list means any signed-in traveller', () => {
		const anyone = gate({ access: { groups: [] } });
		expect(gateState(anyone, guarded(null)).kind).toBe('sealed');
		expect(gateState(anyone, guarded([])).kind).toBe('open');
	});

	it('My Get-a-way belongs to the owner when guarded', () => {
		expect(spaceState(GETAWAY, guarded(['vale']))).toMatchObject({ kind: 'sealed', reason: 'group_required' });
		expect(spaceState(GETAWAY, guarded(['owner']))).toEqual({ kind: 'open' });
	});
});

describe('messages', () => {
	it('names the guilds that pass', () => {
		expect(guildNames(['vale'], guilds)).toBe('Vale Circle');
		expect(guildNames(['owner', 'vale'], guilds)).toBe('Jarl’s Court or Vale Circle');
		expect(guildNames(['mystery'], guilds)).toBe('mystery');
	});

	it('explains each seal in one sentence', () => {
		expect(sealMessage(gateState(vale, guarded(null)), 'The Vale Gate', guilds)).toMatch(/Sign in/);
		expect(sealMessage(gateState(vale, guarded([])), 'The Vale Gate', guilds)).toMatch(/Only the Jarl’s Court or Vale Circle may pass/);
		expect(sealMessage({ kind: 'dormant' }, 'X', guilds)).toMatch(/dormant/);
	});

	it('lists member guilds, keeping unknown claim values visible', () => {
		expect(memberGuilds(viewer(['vale', 'beta-testers']), guilds).map((g) => g.name)).toEqual(['Vale Circle', 'beta-testers']);
		expect(memberGuilds(null, guilds)).toEqual([]);
	});

	it('only trusts door reasons it knows', () => {
		expect(reasonFromDoor('group_required')).toBe('group_required');
		expect(reasonFromDoor('session_expired')).toBe('session_expired');
		expect(reasonFromDoor('<script>')).toBeNull();
		expect(reasonFromDoor(null)).toBeNull();
	});
});
