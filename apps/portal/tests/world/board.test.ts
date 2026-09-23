import { describe, expect, it } from 'vitest';
import {
	column,
	completes,
	createCard,
	editCard,
	emptyDraft,
	expFor,
	levelFor,
	levelProgress,
	neighbourStatus,
	nextNumber,
	parseLabels,
	totalExp,
	validateDraft,
	withStatus,
	type CardDraft
} from '../../src/lib/world/domain/board';

const T0 = '2026-09-23T10:00:00.000Z';
const T1 = '2026-09-23T11:00:00.000Z';
const draft = (over: Partial<CardDraft> = {}): CardDraft => ({ ...emptyDraft(), title: 'Sketch the cabin', ...over });

describe('drafts', () => {
	it('normalises whitespace and keeps valid enums', () => {
		const result = validateDraft(draft({ title: '  Sketch   the cabin ', description: ' notes ' }));
		expect(result).toEqual({ ok: true, value: expect.objectContaining({ title: 'Sketch the cabin', description: 'notes' }) });
	});

	it('explains how to fix a bad draft', () => {
		const result = validateDraft(draft({ title: '   ', labels: ['a', 'b', 'c', 'd', 'e', 'f'] }));
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.errors.title).toMatch(/Give the idea a title/);
			expect(result.errors.labels).toMatch(/at most 5/);
		}
		const long = validateDraft(draft({ title: 'x'.repeat(121) }));
		expect(long.ok).toBe(false);
	});

	it('parses comma-separated labels without duplicates', () => {
		expect(parseLabels('roadmap, ui ,  UI,, 3d  world')).toEqual(['roadmap', 'ui', '3d world']);
	});
});

describe('cards', () => {
	it('keys cards GET-n and numbers past the highest seen', () => {
		const a = createCard(draft(), 1, T0, 'uid');
		expect(a).toMatchObject({ id: 'GET-1', key: 'GET-1', number: 1, status: 'backlog', completedAt: null, createdBy: 'uid' });
		expect(nextNumber([])).toBe(1);
		expect(nextNumber([{ number: 1 }, { number: 7 }, { number: 3 }])).toBe(8);
	});

	it('stamps completion on entering Done and clears it on leaving', () => {
		const card = createCard(draft(), 2, T0, 'uid');
		const done = withStatus(card, 'done', T1);
		expect(done.completedAt).toBe(T1);
		expect(completes(card, done)).toBe(true);
		expect(completes(done, done)).toBe(false);
		const reopened = withStatus(done, 'doing', T1);
		expect(reopened.completedAt).toBeNull();
		expect(withStatus(card, 'backlog', T1)).toBe(card);
	});

	it('edits keep identity and follow the drafted status', () => {
		const card = createCard(draft(), 3, T0, 'uid');
		const edited = editCard(card, draft({ title: 'Paint Colorado', status: 'done' }), T1);
		expect(edited).toMatchObject({ key: 'GET-3', number: 3, createdAt: T0, createdBy: 'uid', title: 'Paint Colorado', completedAt: T1 });
	});

	it('walks the workflow one column at a time', () => {
		expect(neighbourStatus('backlog', -1)).toBeNull();
		expect(neighbourStatus('backlog', 1)).toBe('todo');
		expect(neighbourStatus('doing', 1)).toBe('done');
		expect(neighbourStatus('done', 1)).toBeNull();
	});

	it('orders columns by priority, and Done by latest completion', () => {
		const low = createCard(draft({ priority: 'low' }), 1, T0, 'u');
		const high = createCard(draft({ priority: 'highest' }), 2, T0, 'u');
		expect(column([low, high], 'backlog').map((c) => c.key)).toEqual(['GET-2', 'GET-1']);
		const first = withStatus(low, 'done', T0);
		const second = withStatus(high, 'done', T1);
		expect(column([first, second], 'done').map((c) => c.key)).toEqual(['GET-2', 'GET-1']);
	});
});

describe('EXP and levels', () => {
	it('earns EXP by priority and type, only for Done cards', () => {
		expect(expFor({ priority: 'medium', type: 'idea' })).toBe(35);
		const done = withStatus(createCard(draft({ priority: 'highest', type: 'feature' }), 1, T0, 'u'), 'done', T1);
		const open = createCard(draft(), 2, T0, 'u');
		expect(totalExp([done, open])).toBe(60);
	});

	it('follows the n³ curve', () => {
		expect(levelFor(0)).toBe(1);
		expect(levelFor(7)).toBe(1);
		expect(levelFor(8)).toBe(2);
		expect(levelFor(27)).toBe(3);
		expect(levelFor(63)).toBe(3);
		expect(levelFor(64)).toBe(4);
		const p = levelProgress(40);
		expect(p).toMatchObject({ level: 3, into: 13, span: 37 });
		expect(p.fraction).toBeCloseTo(13 / 37);
	});
});
