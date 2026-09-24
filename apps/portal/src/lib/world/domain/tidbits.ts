// Tidbits: the little signs, plaques and keepsakes that tell the Jarl's story — hockey, Vermont and Burr and
// Burton, club soccer for Deportivo Cuenca, Davidson College, Tesla and NREL — plus the legends of the hold.
// Content only, kept in one place so the story can be edited without touching the world. Each tidbit is placed
// by the engine at its `site` and read with E; the journal keeps count of the ones found.

import type { LandmarkId } from './landmarks';

export type TidbitTopic = 'legend' | 'hockey' | 'vermont' | 'cuenca' | 'davidson' | 'tesla' | 'nrel';

/** Where a tidbit stands: a landmark, the square, the south road, or inside My Get-a-way. */
export type TidbitSite = LandmarkId | 'square' | 'road' | 'getaway';

export interface Tidbit {
	id: string;
	title: string;
	emblem: string;
	topic: TidbitTopic;
	site: TidbitSite;
	/** The prompt's verb: `[E] Read · Memory Lane`. */
	verb: 'Read' | 'Look at' | 'Behold';
	/** A hint shown in the journal until it is found. */
	where: string;
	text: string;
}

export const TOPICS: Record<TidbitTopic, string> = {
	legend: 'Legends of the hold',
	hockey: 'Hockey',
	vermont: 'Vermont and Burr and Burton',
	cuenca: 'Cuenca and Deportivo Cuenca',
	davidson: 'Davidson College',
	tesla: 'Tesla',
	nrel: 'NREL and Colorado'
};

export const TIDBITS: readonly Tidbit[] = [
	// ---- the square and the road -------------------------------------------------------------------------
	{
		id: 'heartcell',
		title: 'The Heartcell',
		emblem: '🔋',
		topic: 'legend',
		site: 'square',
		verb: 'Behold',
		where: 'Floating over the dais in the middle of the square.',
		text: 'The mythical battery at the heart of Eisenhold: a 4680 cell grown taller than the hold guard, humming over the rune dais. Every gate draws on it, and nobody has ever seen it below 100%. Folk say it was forged from Tesla batteries and NREL sunlight, the Jarl’s two old trades.'
	},
	{
		id: 'legend-of-the-panel',
		title: 'The Legend of the Panel',
		emblem: '☀️',
		topic: 'legend',
		site: 'square',
		verb: 'Read',
		where: 'The stone lectern in front of the Heartcell.',
		text: 'Hear the legend, carved in stone: at NREL, in Golden, Colorado, Bush invented the solar panel. The scribes add small print. Solar cells are older than the lab. One Bush made NREL a national laboratory in 1991; another toured it in 2006. The legend has not changed a word.'
	},
	{
		id: 'memory-lane',
		title: 'Memory Lane',
		emblem: '🪧',
		topic: 'legend',
		site: 'road',
		verb: 'Read',
		where: 'The painted signpost by the south road.',
		text: 'Every arrow on this post points at a place in the Jarl’s story, and every one of them stands somewhere in Eisenhold: a pond rink, a Vermont covered bridge, the blue domes of Cuenca, Davidson’s portico, NREL’s turbine and a Supercharger. Tidbits hide at each, and in My Get-a-way. The journal keeps count.'
	},
	// ---- hockey ------------------------------------------------------------------------------------------
	{
		id: 'pond-rink',
		title: 'Stillwater Pond Rink',
		emblem: '🏒',
		topic: 'hockey',
		site: 'rink',
		verb: 'Read',
		where: 'The sign at the gap in the rink boards on Stillwater Pond.',
		text: 'Stillwater freezes hard enough for pond hockey: two nets, plywood boards, string lights, and the game ends when nobody can find the puck. Hockey is the thread through the Jarl’s whole story. It led all the way to Vermont.'
	},
	{
		id: 'lost-puck',
		title: 'The Lost Puck',
		emblem: '🥅',
		topic: 'hockey',
		site: 'rink',
		verb: 'Look at',
		where: 'Somewhere in the snow beyond the far net.',
		text: 'Frozen into a snowdrift a long way past the far net: the puck that cleared the boards and was never found. Every pond keeps one for itself.'
	},
	// ---- Tesla -------------------------------------------------------------------------------------------
	{
		id: 'supercharger',
		title: 'Eisenhold Supercharger',
		emblem: '⚡',
		topic: 'tesla',
		site: 'supercharger',
		verb: 'Read',
		where: 'The sign by the charging stalls on the south road.',
		text: 'Red-and-white stalls by the south road. The Jarl spent time working at Tesla, where a battery can be a car, a wall in the garage or a slice of the grid. Charging here is free: the Heartcell insists.'
	},
	{
		id: 'charging-car',
		title: 'Stall Two',
		emblem: '🚗',
		topic: 'tesla',
		site: 'supercharger',
		verb: 'Look at',
		where: 'The red car plugged in at the Supercharger.',
		text: 'A red sedan, plugged in, its charge port pulsing green. The screen says 80% and twelve minutes to go. It has said twelve minutes since the realm was raised.'
	},
	// ---- Vermont and Burr and Burton ----------------------------------------------------------------------
	{
		id: 'covered-bridge',
		title: 'Green Mountain Crossing',
		emblem: '🌉',
		topic: 'vermont',
		site: 'vermont',
		verb: 'Read',
		where: 'The sign at the red covered bridge.',
		text: 'A red covered bridge over a frozen brook, because Vermont has more covered bridges per square mile than any other state. The Jarl lived in Vermont, the Green Mountain State. Mind the old sign: one dollar fine for crossing faster than a walk.'
	},
	{
		id: 'sugarbush',
		title: 'The Sugarbush',
		emblem: '🍁',
		topic: 'vermont',
		site: 'vermont',
		verb: 'Look at',
		where: 'A sap bucket on the maples past the covered bridge.',
		text: 'Taps in the maples and buckets on the taps: sugaring season. Vermont makes more maple syrup than any other state, and it takes about forty gallons of sap to boil down one gallon of syrup.'
	},
	{
		id: 'burr-and-burton',
		title: 'Burr and Burton Academy',
		emblem: '🐾',
		topic: 'vermont',
		site: 'vermont',
		verb: 'Read',
		where: 'The green-and-gold banner beside the covered bridge.',
		text: 'Green and gold for the Bulldogs of Burr and Burton Academy in Manchester, Vermont, under Mount Equinox. The Jarl moved to Vermont to play there.'
	},
	// ---- Cuenca and Deportivo Cuenca ----------------------------------------------------------------------
	{
		id: 'cuenca-domes',
		title: 'The Blue Domes of Cuenca',
		emblem: '⛪',
		topic: 'cuenca',
		site: 'cuenca',
		verb: 'Read',
		where: 'The sign on the plaza under the blue domes.',
		text: 'Cuenca sits more than 2,500 metres up in Ecuador’s Andes, and its New Cathedral wears three domes of blue and white glazed tile. The towers stop short: the architect’s sums showed the foundations could not carry them to full height. The old town is a UNESCO World Heritage Site.'
	},
	{
		id: 'deportivo-cuenca',
		title: 'Deportivo Cuenca',
		emblem: '⚽',
		topic: 'cuenca',
		site: 'cuenca',
		verb: 'Read',
		where: 'The red banner by the goal on the plaza.',
		text: 'The Jarl played club soccer for Deportivo Cuenca: red shirts, a lion on the crest and a nickname the national press gave the club in the 1970s, el Expreso Austral, the Southern Express. Home games are at the Estadio Alejandro Serrano Aguilar. Champions of Ecuador in 2004.'
	},
	// ---- Davidson ----------------------------------------------------------------------------------------
	{
		id: 'davidson',
		title: 'Davidson College',
		emblem: '🎓',
		topic: 'davidson',
		site: 'davidson',
		verb: 'Read',
		where: 'The sign in front of the red-brick portico.',
		text: 'Davidson College, North Carolina, founded 1837: red and black, the Wildcats, and an honor code trusted enough that exams are self-scheduled and unproctored. The Jarl’s college.'
	},
	{
		id: 'wildcats-hoop',
		title: 'The Wildcats’ Hoop',
		emblem: '🏀',
		topic: 'davidson',
		site: 'davidson',
		verb: 'Look at',
		where: 'The hoop beside the portico.',
		text: 'In 2008 a Davidson guard named Stephen Curry carried the Wildcats, a 10 seed, all the way to the Elite Eight. They fell to Kansas, the eventual champions, 59–57.'
	},
	// ---- NREL ------------------------------------------------------------------------------------------
	{
		id: 'nrel',
		title: 'NREL, Golden',
		emblem: '☀️',
		topic: 'nrel',
		site: 'nrel',
		verb: 'Read',
		where: 'The sign at the edge of the solar field.',
		text: 'The National Renewable Energy Laboratory in Golden, Colorado, under South Table Mountain. It opened in 1977 as the Solar Energy Research Institute and became NREL in 1991. The Jarl spent time here, among the solar arrays and the wind turbines.'
	},
	// ---- My Get-a-way ------------------------------------------------------------------------------------
	{
		id: 'postcard',
		title: 'Greetings from Colorado',
		emblem: '🏔️',
		topic: 'nrel',
		site: 'getaway',
		verb: 'Look at',
		where: 'My Get-a-way: the postcard by the door.',
		text: 'Twin maroon peaks over a mirror lake, aspens gone to gold. Colorado is home to NREL, and the view this window has always kept.'
	},
	{
		id: 'desk-solar',
		title: 'Windowsill Solar Panel',
		emblem: '☀️',
		topic: 'nrel',
		site: 'getaway',
		verb: 'Look at',
		where: 'My Get-a-way: on the window sill, in the sun.',
		text: 'A palm-sized solar panel soaking up the Colorado sun on the sill, an NREL visitor badge propped beside it. It powers exactly nothing and does it with conviction.'
	},
	{
		id: 'jersey-19',
		title: 'Number 19',
		emblem: '🏒',
		topic: 'hockey',
		site: 'getaway',
		verb: 'Look at',
		where: 'My Get-a-way: on the wall above the side table.',
		text: 'A hockey jersey in Eisenhold red and gold, number 19: the same 19 the Jarl signs code with, as hockeyiscool19. The handle says it plainly.'
	},
	{
		id: 'hockey-sticks',
		title: 'Two Old Sticks',
		emblem: '🏒',
		topic: 'hockey',
		site: 'getaway',
		verb: 'Look at',
		where: 'My Get-a-way: high on the wall, over the window.',
		text: 'Two sticks crossed over the window, their blades taped and re-taped past counting. A hockey career goes through a lot of sticks; these are the two that came home.'
	},
	{
		id: 'bba-pennant',
		title: 'Bulldogs Pennant',
		emblem: '🐾',
		topic: 'vermont',
		site: 'getaway',
		verb: 'Look at',
		where: 'My Get-a-way: high on the west wall, by the window.',
		text: 'Green and gold: Burr and Burton Academy, Manchester, Vermont. A pennant from the years the Jarl spent in Vermont to play for the Bulldogs.'
	},
	{
		id: 'vermont-painting',
		title: 'Green Mountain Painting',
		emblem: '🖼️',
		topic: 'vermont',
		site: 'getaway',
		verb: 'Look at',
		where: 'My Get-a-way: the painting beside the window.',
		text: 'An oil sketch of Vermont in October: a red covered bridge, sugar maples on fire, the Green Mountains behind. The name Vermont itself was made from the French for green mountains.'
	},
	{
		id: 'maple-syrup',
		title: 'Maple Syrup',
		emblem: '🍁',
		topic: 'vermont',
		site: 'getaway',
		verb: 'Look at',
		where: 'My Get-a-way: on the window sill.',
		text: 'A jug of Vermont maple syrup, grade A amber. Pancakes are not required, but they are strongly encouraged.'
	},
	{
		id: 'cuenca-scarf',
		title: 'Supporters’ Scarf',
		emblem: '🧣',
		topic: 'cuenca',
		site: 'getaway',
		verb: 'Look at',
		where: 'My Get-a-way: hung over the door.',
		text: 'Red, yellow and black, the colours of Deportivo Cuenca, taken from the city’s own flag. It hangs over the door, ready for match day. ¡Vamos, Expreso Austral!'
	},
	{
		id: 'match-ball',
		title: 'Match Ball',
		emblem: '⚽',
		topic: 'cuenca',
		site: 'getaway',
		verb: 'Look at',
		where: 'My Get-a-way: on the floor by the armchair.',
		text: 'A scuffed match ball. In Cuenca, more than 2,500 metres up, a good strike carries farther and a sprint costs twice the breath.'
	},
	{
		id: 'cuenca-poster',
		title: 'Poster of Cuenca',
		emblem: '🗺️',
		topic: 'cuenca',
		site: 'getaway',
		verb: 'Look at',
		where: 'My Get-a-way: on the east wall.',
		text: 'Cuenca’s New Cathedral and its sky-blue domes. Building began in 1885 and took ninety years; the glazed tiles came from Czechoslovakia.'
	},
	{
		id: 'davidson-pennant',
		title: 'Wildcats Pennant',
		emblem: '🐾',
		topic: 'davidson',
		site: 'getaway',
		verb: 'Look at',
		where: 'My Get-a-way: on the west wall, above the armchair.',
		text: 'Red and black for the Davidson Wildcats, from the Jarl’s college years in North Carolina.'
	},
	{
		id: 'model-car',
		title: 'Red Model Car',
		emblem: '🚗',
		topic: 'tesla',
		site: 'getaway',
		verb: 'Look at',
		where: 'My Get-a-way: on top of the bookshelf.',
		text: 'A little red model on the shelf, from the Jarl’s time at Tesla. The Heartcell in the square borrows the shape of Tesla’s 4680 cell, 46 millimetres wide and 80 tall. The Heartcell rounded up.'
	}
];

const BY_ID = new Map(TIDBITS.map((t) => [t.id, t]));

export function tidbitById(id: string): Tidbit | undefined {
	return BY_ID.get(id);
}

/** Tidbits in topic order (the order of TOPICS), each topic in the order written above. */
export function tidbitsByTopic(): { topic: TidbitTopic; label: string; tidbits: Tidbit[] }[] {
	return (Object.keys(TOPICS) as TidbitTopic[])
		.map((topic) => ({ topic, label: TOPICS[topic], tidbits: TIDBITS.filter((t) => t.topic === topic) }))
		.filter((group) => group.tidbits.length > 0);
}

/** How many tidbits have been found, overall and inside My Get-a-way; unknown ids are ignored. */
export function tidbitProgress(found: Iterable<string>): { found: number; total: number; room: number; roomTotal: number } {
	const seen = new Set([...found].filter((id) => BY_ID.has(id)));
	const room = TIDBITS.filter((t) => t.site === 'getaway');
	return {
		found: seen.size,
		total: TIDBITS.length,
		room: room.filter((t) => seen.has(t.id)).length,
		roomTotal: room.length
	};
}
