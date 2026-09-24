// The traveller's log of tidbits: E on a sign or keepsake opens its tidbit, the first reading chimes and is
// remembered in this browser (a per-viewer convenience, like discovered places), and the journal counts them.

import { tidbitById, tidbitProgress } from '../domain/tidbits';
import { saveFound, type Overlay, type WorldUi } from './state.svelte';

export interface TidbitHooks {
	open(overlay: Exclude<Overlay, null>): void;
	chime(): void;
}

export class TidbitLog {
	constructor(
		private readonly ui: WorldUi,
		private readonly hooks: TidbitHooks
	) {}

	/** Open a tidbit by id (`heartcell`, or `tidbit:heartcell` as the world names it). Unknown ids do nothing. */
	read(id: string): void {
		const tidbit = tidbitById(id.replace(/^tidbit:/, ''));
		if (!tidbit) return;
		const fresh = !this.ui.found.includes(tidbit.id);
		if (fresh) {
			this.ui.found = [...this.ui.found, tidbit.id];
			saveFound(this.ui.found);
			this.hooks.chime();
			const { found, total } = tidbitProgress(this.ui.found);
			this.ui.announcement = `Tidbit found: ${tidbit.title}. ${found} of ${total}.`;
		}
		this.ui.reading = { id: tidbit.id, fresh };
		this.hooks.open('tidbit');
	}

	/** What the prompt says: `[E] Read · The Legend of the Panel`. */
	describe(id: string): { verb: string; name: string } {
		const tidbit = tidbitById(id.replace(/^tidbit:/, ''));
		return tidbit ? { verb: tidbit.verb, name: tidbit.title } : { verb: 'Look at', name: 'Something' };
	}
}
