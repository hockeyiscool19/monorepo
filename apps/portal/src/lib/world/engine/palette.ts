// The one place scene colours live — the WebGL counterpart of tokens.css. UI components read design
// tokens; the 3D scene reads this. Change the look of Eisenhold or the Get-a-way here and nowhere else.
// Values are sRGB hex numbers (three.js converts them to linear on use).

export const NIGHT = {
	zenith: 0x070d1c,
	horizon: 0x2c4262,
	fog: 0x4a5f7d,
	ground: 0x1a2130,
	moonlight: 0x9db6ff,
	hemiSky: 0x5d7bb8,
	hemiGround: 0x232a38,
	snow: 0xdfe7f3,
	snowShadow: 0xaebbd0,
	/** Grain multiplied over the ground: a pale base and the specks scattered on it. */
	grainBase: 0xeceef2,
	grain: [0xc8ced8, 0xffffff, 0xb4bcc8],
	trodden: 0x8d93a0,
	rock: 0x5d6570,
	rockDark: 0x3c424c,
	aurora: [0x4dffb1, 0x39c6ff, 0x9a6bff],
	masser: 0xd9b8a8,
	secunda: 0xf1f3ff,
	stars: 0xe8efff
} as const;

export const STONE = {
	light: 0x9aa0a8,
	mid: 0x767c86,
	dark: 0x4a4f58,
	mortar: 0x2e3238,
	flagstone: 0x7d8189,
	iron: 0x2a2c30,
	gold: 0xd9b45e,
	runeIdle: 0x3b4d66
} as const;

export const FIRE = {
	core: 0xfff1c1,
	flame: 0xffa43a,
	ember: 0xff5a1f,
	smoke: 0x5a5a60,
	light: 0xff9446
} as const;

export const WOOD = {
	log: 0x7a5234,
	logDark: 0x4e321f,
	plank: 0x8a603c,
	plankDark: 0x5a3b24,
	bark: 0x3f2c1f,
	pine: 0x1f3a2c,
	pineDark: 0x142a20,
	windowGlow: 0xffc978
} as const;

export const CLOTH = {
	guardTabard: 0x7e2a24,
	guardMail: 0x6e737c,
	leather: 0x5b3a26,
	skin: 0xd9a58a,
	dragon: 0x2b2522,
	dragonWing: 0x3a2e2a
} as const;

export const WARD = {
	sealed: 0xff3b5c,
	sealedDeep: 0x7a1030,
	open: 0xffd479,
	unconfigured: 0x9a8cff
} as const;

export const GETAWAY = {
	logWall: 0x9b6a42,
	logWallDark: 0x6e472a,
	floor: 0x7a5233,
	floorDark: 0x5a3a22,
	ceiling: 0x6b4a30,
	rugRed: 0x8c3a2e,
	rugCream: 0xe3cc98,
	rugBlue: 0x355a73,
	lamp: 0xffd08a,
	sun: 0xffe2b0,
	stoveIron: 0x26262a,
	couch: 0x5e6b4a,
	blanket: 0xb5553d,
	cork: 0xb88a57,
	corkDark: 0x8f6639,
	corkLight: 0xd8b07c,
	corkShadow: 0x6e4a28,
	cardRule: 0xd06a6a,
	cardLine: 0x7aa0d0,
	gilt: 0xd9b45a,
	frame: 0x4e3521,
	paper: 0xf4efe1,
	blueprint: 0x234a7a,
	graphite: 0x3a3a40,
	book: [0x7a2f2a, 0x2f4f6a, 0x496b3a, 0xb58a2e, 0x5a3d6e, 0x8a5a3a]
} as const;

export const COLORADO = {
	skyTop: 0x4f9cf0,
	skyHorizon: 0xdcefff,
	sun: 0xfff2cf,
	maroon: 0x74323c,
	maroonDark: 0x4d1f2a,
	scree: 0x8c7e78,
	snow: 0xf6f4ef,
	aspenGold: [0xf8d23a, 0xf1bd2a, 0xfbe066, 0xe8a820],
	aspenTrunk: 0xebe6dc,
	spruce: 0x1e3b2b,
	meadow: 0x7f9a3e,
	meadowDry: 0xb5a24a,
	lake: 0x2b6f8c,
	columbine: [0x8fb4ff, 0xf6f1ff, 0xc9a8ff],
	distant: [0x7d93b8, 0x9fb3cf, 0xbfcde0],
	cloud: 0xffffff,
	/** The state flag: blue, white, red C, gold disc. */
	flag: { blue: 0x002868, white: 0xffffff, red: 0xbf0a30, gold: 0xffd700 }
} as const;

/** Sticky-note paper by card type, in 3D. The 2D board uses the matching *-soft tokens. */
export const STICKY = {
	idea: 0xffe57a,
	feature: 0xa6d8ff,
	fix: 0xffb3c9,
	chore: 0xb3ebab,
	ink: 0x1f2430,
	star: 0xe0a321,
	pins: [0xd8413a, 0x2f6fd6, 0x2e9e5b, 0xe0a321]
} as const;

// ---- The Jarl's story: the Heartcell, the landmarks around the square and the keepsakes in the room ---------

/** The Heartcell, the mythical battery over the dais, and the relic panel on the legend's lectern. */
export const CELL = {
	steel: 0xc3cbd4,
	steelDark: 0x68717d,
	wrap: 0x121f38,
	charge: 0x5ef6ff,
	chargeDeep: 0x1d8fd0,
	spark: 0xd9fbff,
	relic: 0x1b2d58,
	relicLine: 0xa9bddc
} as const;

export const RINK = {
	ice: 0xbfe4f4,
	boards: 0xe8e3d6,
	kick: 0xd8b13c,
	post: 0xc8202b,
	mesh: 0xf1f4f8,
	puck: 0x16161a,
	tape: 0x1d2330,
	bulb: 0xffd48a,
	wire: 0x2a2724,
	/** A blond-ash stick shaft. */
	stick: 0xd9bc8c
} as const;

export const TESLA = {
	paint: 0xb3121d,
	glass: 0x0d1117,
	trim: 0x1b1d22,
	tyre: 0x16171a,
	rim: 0x8d949c,
	head: 0xeef6ff,
	tail: 0xff2a36,
	port: 0x48ff8a,
	stall: 0xeceef1,
	stallRed: 0xe31937,
	pad: 0x2b2f36,
	line: 0xd9dde3
} as const;

export const VERMONT = {
	barn: 0x8e2a20,
	barnDark: 0x5a1912,
	roof: 0x3a3f47,
	deck: 0x6b5238,
	trim: 0xefe9dc,
	signboard: 0x1c1c1e,
	maple: 0x4b3a2e,
	bucket: 0xa9b2ba,
	syrup: 0xb8661d,
	bbaGreen: 0x1d5a38,
	bbaGold: 0xd9a92b,
	brookIce: 0x9fcde3,
	sky: 0x9fc3e6,
	dusk: 0xf2c38b,
	mountains: [0x3f6b3a, 0x5c8a4f, 0x7fa66a],
	leaves: [0xd9531e, 0xe8a33d, 0xb8321f, 0xf0c24b],
	river: 0x5f8fb0
} as const;

export const CUENCA = {
	domeBlue: 0x2c73c4,
	domeWhite: 0xe8eef6,
	brick: 0xa5563b,
	brickDark: 0x6e3524,
	stone: 0xd6c7ae,
	plaza: 0x8d4a38,
	red: 0xd0161e,
	yellow: 0xf5c400,
	ink: 0x141416,
	goal: 0xf2f4f7,
	ball: 0xf4f4f0,
	patch: 0x1b1b1f,
	glass: 0xffc46b
} as const;

export const DAVIDSON = {
	red: 0xc8102e,
	ink: 0x151517,
	brick: 0x8f3f2c,
	column: 0xeee9df,
	roof: 0x39414b,
	window: 0xffcf85,
	rim: 0xf26a21,
	backboard: 0xf3f3f1
} as const;

export const NREL = {
	panel: 0x16305c,
	cell: 0x2c4f8c,
	grid: 0xaebcd0,
	frame: 0xc3cad3,
	tower: 0xe4e8ed,
	blade: 0xf0f2f5,
	beacon: 0xff2b2b,
	badge: 0x2f6db5
} as const;

/** Eisenhold's own team colours, for the jersey in the Get-a-way. */
export const JERSEY = { body: 0x8c1f24, stripe: 0xd9b45e, trim: 0xf1ead8 } as const;

/** sRGB hex → CSS colour string, for canvas textures. */
export function css(hex: number, alpha = 1): string {
	const r = (hex >> 16) & 255;
	const g = (hex >> 8) & 255;
	const b = hex & 255;
	return alpha >= 1 ? `rgb(${r} ${g} ${b})` : `rgb(${r} ${g} ${b} / ${alpha})`;
}

/** Hue (0–1) → a saturated sRGB hex for gate portals, banners and runes. */
export function hueHex(hue: number, saturation = 0.75, lightness = 0.55): number {
	const a = saturation * Math.min(lightness, 1 - lightness);
	const f = (n: number) => {
		const k = (n + hue * 12) % 12;
		return Math.round(255 * (lightness - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))));
	};
	return (f(0) << 16) | (f(8) << 8) | f(4);
}
