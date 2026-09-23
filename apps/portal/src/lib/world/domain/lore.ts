// Words the realm speaks: loading-screen tips, the guard's lines and place names. Content only, no logic
// beyond picking a line; kept apart so the voice of Eisenhold can be edited in one place.

export const REALM_NAME = 'Eisenhold';

export const LOADING_TIPS: readonly string[] = [
	'Every gate in Eisenhold is drawn from registry.json. Add an app to the registry and a new gate rises.',
	'A gate hums while its app answers the gateway. A silent gate means the service is asleep or unwell.',
	'The Vale gate is warded. Vale reaches a real grocery account and card, so only its circle may pass.',
	'Press M for the map. Every gate on it is also a button, for travellers who prefer lists to legs.',
	'The Jarl plans new works at the drawing board in My Get-a-way. Finished works evolve.',
	'Run Eisenhold locally and every door stands open. The wards only wake on the real domain.',
	'Sign-in proves who you are; guilds decide where you may go. The gateway checks both at every door.',
	'Hold Shift to run. Stamina returns while you walk.',
	'The Word Wall remembers which version of each app is running, and when it arrived.',
	'Never deploy :latest. Every gate here was built from an immutable tag.',
	'Colorado lies inside the cabin. Nobody asks how.'
];

export const GUARD_LINES: readonly string[] = [
	'I used to ship on Fridays like you. Then I took a hotfix to the knee.',
	'Mind the Vale gate, traveller. It guards real coin. Only the Vale Circle passes.',
	'The Jarl keeps a cabin by the pines. Plans the whole realm on a drawing board, they say.',
	'A gate that hums is a gate that answers. The quiet ones are sleeping services.',
	'Three gates today. Tomorrow? The registry decides, not me.',
	'Snow on the road, rollbacks on the mind. Stay warm.',
	'Read the Word Wall if you want to know what is running. It never lies about versions.',
	'You look like someone who reads release notes. Respect.'
];

/** Deterministic pick so tests and screenshots are stable: the n-th line, wrapping around. */
export function lineAt<T>(lines: readonly T[], n: number): T {
	return lines[((n % lines.length) + lines.length) % lines.length];
}

export const PLACE_NAMES = {
	cabin: 'My Get-a-way',
	wordWall: 'The Word Wall',
	campfire: 'Travellers’ Fire',
	pond: 'Stillwater Pond',
	hub: 'Eisenhold Square'
} as const;

export function gatePlaceName(appName: string): string {
	return `${appName} Gate`;
}
