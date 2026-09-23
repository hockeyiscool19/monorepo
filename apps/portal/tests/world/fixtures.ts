import type { GuildProfile, RealmGate } from '../../src/lib/world/domain/realm';
import type { Viewer } from '../../src/lib/world/domain/access';

export const guilds: GuildProfile[] = [
	{ id: 'owner', name: 'Jarl’s Court', emblem: '👑', description: 'Every gate.' },
	{ id: 'vale', name: 'Vale Circle', emblem: '🌿', description: 'The Vale gate.' }
];

export function gate(overrides: Partial<RealmGate> = {}): RealmGate {
	return {
		id: 'topology',
		name: 'Topology',
		description: 'Topology optimization.',
		icon: '🕸️',
		status: 'live',
		href: '/topology/',
		path: '/topology',
		version: '1.0.0',
		sha: 'abc1234',
		deployedAt: '2026-09-23T15:48:15Z',
		access: null,
		...overrides
	};
}

export const vale = gate({ id: 'vale', name: 'Vale', href: '/vale/', path: '/vale', access: { groups: ['owner', 'vale'] } });

export function viewer(groups: string[] = []): Viewer {
	return {
		uid: 'uid-1',
		email: 'traveller@example.com',
		name: 'Traveller',
		photoUrl: null,
		provider: 'password',
		emailVerified: true,
		groups,
		createdAt: null
	};
}
