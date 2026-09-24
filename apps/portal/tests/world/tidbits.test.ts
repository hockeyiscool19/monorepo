import { describe, expect, it } from 'vitest';
import { LANDMARKS } from '../../src/lib/world/domain/landmarks';
import { TIDBITS, TOPICS, tidbitById, tidbitProgress, tidbitsByTopic } from '../../src/lib/world/domain/tidbits';

describe('tidbits', () => {
	it('have unique ids and say something', () => {
		expect(new Set(TIDBITS.map((t) => t.id)).size).toBe(TIDBITS.length);
		for (const t of TIDBITS) {
			expect(t.id, t.id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
			expect(t.title.trim(), t.id).not.toBe('');
			expect(t.where.trim(), t.id).not.toBe('');
			expect(t.emblem.trim(), t.id).not.toBe('');
			// Short enough to read in one breath in a small dialog.
			expect(t.text.length, t.id).toBeGreaterThan(40);
			expect(t.text.length, t.id).toBeLessThanOrEqual(330);
		}
	});

	it('cover every part of the story the Jarl asked for', () => {
		const text = TIDBITS.map((t) => `${t.title} ${t.text}`).join(' ');
		for (const needle of ['hockey', 'Tesla', 'Vermont', 'Burr and Burton', 'Deportivo Cuenca', 'Ecuador', 'Davidson', 'NREL']) {
			expect(text, needle).toContain(needle);
		}
		// The message at the heart of the square.
		const legend = tidbitById('legend-of-the-panel');
		expect(legend?.site).toBe('square');
		expect(legend?.text).toMatch(/Bush invented the solar panel/);
		expect(legend?.text).toMatch(/NREL/);
		expect(tidbitById('heartcell')?.site).toBe('square');
	});

	it('leave something at every landmark, and keepsakes in My Get-a-way', () => {
		for (const landmark of LANDMARKS) {
			expect(TIDBITS.some((t) => t.site === landmark.id), landmark.id).toBe(true);
		}
		expect(TIDBITS.filter((t) => t.site === 'getaway').length).toBeGreaterThanOrEqual(8);
	});

	it('group by topic in the order of the topics, losing none', () => {
		const groups = tidbitsByTopic();
		expect(groups.map((g) => g.topic)).toEqual(Object.keys(TOPICS));
		expect(groups.flatMap((g) => g.tidbits)).toHaveLength(TIDBITS.length);
		for (const g of groups) expect(g.tidbits.every((t) => t.topic === g.topic)).toBe(true);
	});

	it('count what has been found, overall and in the room, ignoring unknown ids', () => {
		const room = TIDBITS.filter((t) => t.site === 'getaway');
		expect(tidbitProgress([])).toEqual({ found: 0, total: TIDBITS.length, room: 0, roomTotal: room.length });
		const p = tidbitProgress(['heartcell', room[0].id, room[0].id, 'not-a-tidbit']);
		expect(p.found).toBe(2);
		expect(p.room).toBe(1);
		expect(tidbitProgress(TIDBITS.map((t) => t.id)).found).toBe(TIDBITS.length);
	});
});
