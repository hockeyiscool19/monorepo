// The places of the Jarl's story that stand in Eisenhold, around the square: Stillwater Pond Rink (hockey), a
// Supercharger (Tesla), a Vermont covered bridge (Burr and Burton), the blue domes of Cuenca (Deportivo Cuenca),
// Davidson's portico and NREL's turbine — and the Heartcell, the mythical battery over the dais. Pure data: names,
// icons and where each stands. layoutRealm() turns them into spots; the terrain flattens and clears them, the
// engine builds them, and the map lists them.

export type LandmarkId = 'rink' | 'supercharger' | 'vermont' | 'cuenca' | 'davidson' | 'nrel';

export interface LandmarkInfo {
	id: LandmarkId;
	name: string;
	icon: string;
	/** Degrees clockwise from north, and metres from the centre of the square. */
	angle: number;
	radius: number;
	/** Compass heading the landmark faces (0 north, 90 east). Omitted: it faces the square. */
	faces?: number;
	/** Radius kept flat and free of trees. */
	clear: number;
	/** Metres in front of it where the trodden path ends and fast travel sets you down. */
	approach: number;
	/** Where its path starts: the edge of the square (default) or the south road, when the square's way is blocked. */
	via?: 'road';
	/** Gaze on arrival by fast travel, radians above level, for something tall; omitted = level. */
	gaze?: number;
	/** One line for the map. */
	blurb: string;
}

/**
 * Every landmark keeps to the southern half or beyond the gate ring: gates never spread past ±95° and stay near
 * 23 m out for any registry of ten apps or fewer, so these places never collide with a new gate.
 */
export const LANDMARKS: readonly LandmarkInfo[] = [
	{
		id: 'rink',
		name: 'Stillwater Pond Rink',
		icon: '🏒',
		angle: -150,
		radius: 34,
		clear: 11,
		approach: 10,
		blurb: 'Pond hockey under string lights, where Stillwater freezes hardest.'
	},
	{
		id: 'supercharger',
		name: 'Eisenhold Supercharger',
		icon: '⚡',
		angle: 164,
		radius: 40,
		faces: 270,
		clear: 9,
		approach: 7.5,
		via: 'road',
		blurb: 'Red-and-white charging stalls by the south road, and a car that is always nearly full.'
	},
	{
		id: 'vermont',
		name: 'Green Mountain Crossing',
		icon: '🍁',
		angle: -160,
		radius: 58,
		clear: 13,
		approach: 15,
		// Beyond the rink: its path forks off the south road rather than crossing the ice.
		via: 'road',
		blurb: 'A Vermont covered bridge over a frozen brook, a sugarbush, and the Bulldogs’ green and gold.'
	},
	{
		id: 'cuenca',
		name: 'Cuenca',
		icon: '⛪',
		angle: 132,
		radius: 50,
		clear: 12,
		approach: 16,
		blurb: 'The blue-tiled domes of Cuenca, Ecuador, and a goal for Deportivo Cuenca.'
	},
	{
		id: 'davidson',
		name: 'Davidson College',
		icon: '🎓',
		angle: -104,
		radius: 44,
		clear: 11,
		approach: 15,
		blurb: 'A red-brick portico under a white dome, Wildcats banners and a hoop.'
	},
	{
		id: 'nrel',
		name: 'NREL, Golden',
		icon: '☀️',
		angle: 100,
		radius: 58,
		clear: 15,
		approach: 16,
		// Look up at the turbine over the panels.
		gaze: 0.32,
		blurb: 'Rows of solar panels under a turning wind turbine, after the lab in Golden, Colorado.'
	}
];

/** The mythical battery over the dais, and the stone lectern that tells the legend of the panel. */
export const HEARTCELL = { id: 'heartcell', name: 'The Heartcell', icon: '🔋', blurb: 'The mythical battery at the heart of the square.' } as const;

/**
 * The covered bridge runs along the Vermont landmark's facing (you walk through it on the way in); the frozen brook
 * crosses under it at right angles. Metres; `deck` is the walking height inside the bridge.
 */
export const BRIDGE = { length: 11, width: 4.2, deck: 0.24, brookHalf: 19, brookWidth: 3.4, brookDepth: 1.25 } as const;

export function landmarkInfo(id: string): LandmarkInfo | undefined {
	return LANDMARKS.find((l) => l.id === id);
}
