// Sound, synthesised with Web Audio — no files. Wind over the snowfields, a warm crackling hush in the
// cabin, fires and portals that grow louder as you approach, a chime for discoveries, a door, and the
// completion fanfares. Starts only after a user gesture (autoplay rules) and can be muted from the menu.

type Bed = 'wind' | 'cabin' | 'none';

export class RealmAudio {
	private ctx: AudioContext | null = null;
	private master: GainNode | null = null;
	private beds = new Map<Bed, GainNode>();
	private sources = new Map<string, GainNode>();
	private noise: AudioBuffer | null = null;
	private volume = 0.7;
	private enabled = true;

	/** Create the context; call from a click or key handler. Safe to call more than once. */
	start(): void {
		if (this.ctx) {
			void this.ctx.resume();
			return;
		}
		const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
		if (!Ctor) return;
		this.ctx = new Ctor();
		this.master = this.ctx.createGain();
		this.master.gain.value = this.enabled ? this.volume : 0;
		this.master.connect(this.ctx.destination);
		this.noise = this.makeNoise(4);
		this.beds.set('wind', this.windBed());
		this.beds.set('cabin', this.cabinBed());
	}

	setEnabled(enabled: boolean): void {
		this.enabled = enabled;
		this.master?.gain.setTargetAtTime(enabled ? this.volume : 0, this.now(), 0.2);
	}

	setVolume(volume: number): void {
		this.volume = Math.max(0, Math.min(1, volume));
		if (this.enabled) this.master?.gain.setTargetAtTime(this.volume, this.now(), 0.1);
	}

	/** Cross-fade to the ambience of the current space. */
	setBed(bed: Bed): void {
		for (const [name, gain] of this.beds) gain.gain.setTargetAtTime(name === bed ? 1 : 0, this.now(), 0.8);
	}

	/** A looping positional-ish source (fire crackle or portal hum) whose loudness follows distance. */
	setSource(key: string, kind: 'fire' | 'portal', distance: number): void {
		if (!this.ctx || !this.master) return;
		let gain = this.sources.get(key);
		if (!gain) {
			gain = kind === 'fire' ? this.fireSource() : this.portalSource(key);
			this.sources.set(key, gain);
		}
		const reach = kind === 'fire' ? 9 : 11;
		const level = Math.max(0, 1 - distance / reach) ** 2 * (kind === 'fire' ? 0.5 : 0.35);
		gain.gain.setTargetAtTime(level, this.now(), 0.25);
	}

	silenceSources(): void {
		for (const gain of this.sources.values()) gain.gain.setTargetAtTime(0, this.now(), 0.3);
	}

	/** Discovery: a soft bell (inharmonic partials, slow decay). */
	chime(): void {
		this.tones([523.25, 1318.5, 2093], 0, 2.6, 'sine', 0.16);
	}

	/** A heavy door: a low thump and a creak. */
	door(): void {
		if (!this.ctx || !this.master) return;
		const t = this.now();
		const thump = this.ctx.createOscillator();
		const g = this.ctx.createGain();
		thump.frequency.setValueAtTime(90, t);
		thump.frequency.exponentialRampToValueAtTime(40, t + 0.3);
		g.gain.setValueAtTime(0.5, t);
		g.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
		thump.connect(g).connect(this.master);
		thump.start(t);
		thump.stop(t + 0.45);
		this.noiseBurst(t + 0.05, 0.5, 600, 1400, 0.08);
	}

	/** A short UI tick for menus. */
	tick(): void {
		this.tones([880], 0, 0.08, 'triangle', 0.05);
	}

	/**
	 * Completion fanfare, in the spirit of 8-bit level-ups (an original tune, not a copy): a rising
	 * arpeggio and a held chord on square waves.
	 */
	fanfare(): void {
		const notes = [523.25, 659.25, 783.99, 1046.5, 783.99, 1046.5, 1318.5];
		notes.forEach((f, i) => this.tones([f], i * 0.11, 0.1, 'square', 0.06));
		this.tones([1046.5, 1318.5, 1568], notes.length * 0.11, 0.9, 'square', 0.045);
	}

	/** The rising shimmer that plays while a card "evolves". */
	shimmer(duration: number): void {
		if (!this.ctx || !this.master) return;
		const t = this.now();
		const osc = this.ctx.createOscillator();
		const g = this.ctx.createGain();
		osc.type = 'triangle';
		osc.frequency.setValueAtTime(220, t);
		osc.frequency.exponentialRampToValueAtTime(1760, t + duration);
		g.gain.setValueAtTime(0.0001, t);
		g.gain.exponentialRampToValueAtTime(0.06, t + 0.3);
		g.gain.setValueAtTime(0.06, t + duration - 0.2);
		g.gain.exponentialRampToValueAtTime(0.0001, t + duration);
		osc.connect(g).connect(this.master);
		osc.start(t);
		osc.stop(t + duration + 0.05);
	}

	dispose(): void {
		void this.ctx?.close();
		this.ctx = null;
		this.sources.clear();
		this.beds.clear();
	}

	// ---- building blocks -------------------------------------------------------------------------------

	private now(): number {
		return this.ctx?.currentTime ?? 0;
	}

	private makeNoise(seconds: number): AudioBuffer {
		const ctx = this.ctx as AudioContext;
		const buffer = ctx.createBuffer(1, ctx.sampleRate * seconds, ctx.sampleRate);
		const data = buffer.getChannelData(0);
		let brown = 0;
		for (let i = 0; i < data.length; i++) {
			brown = (brown + 0.02 * (Math.random() * 2 - 1)) / 1.02;
			data[i] = brown * 3.5;
		}
		return buffer;
	}

	private loop(): AudioBufferSourceNode {
		const ctx = this.ctx as AudioContext;
		const src = ctx.createBufferSource();
		src.buffer = this.noise;
		src.loop = true;
		src.start();
		return src;
	}

	private windBed(): GainNode {
		const ctx = this.ctx as AudioContext;
		const out = ctx.createGain();
		out.gain.value = 0;
		const filter = ctx.createBiquadFilter();
		filter.type = 'bandpass';
		filter.frequency.value = 420;
		filter.Q.value = 0.7;
		const lfo = ctx.createOscillator();
		const lfoGain = ctx.createGain();
		lfo.frequency.value = 0.07;
		lfoGain.gain.value = 260;
		lfo.connect(lfoGain).connect(filter.frequency);
		lfo.start();
		const level = ctx.createGain();
		level.gain.value = 0.55;
		this.loop().connect(filter).connect(level).connect(out).connect(this.master as GainNode);
		return out;
	}

	private cabinBed(): GainNode {
		const ctx = this.ctx as AudioContext;
		const out = ctx.createGain();
		out.gain.value = 0;
		out.connect(this.master as GainNode);
		// A low, warm pad: two detuned triangles through a soft low-pass, slowly breathing.
		const pad = ctx.createBiquadFilter();
		pad.type = 'lowpass';
		pad.frequency.value = 700;
		const padGain = ctx.createGain();
		padGain.gain.value = 0.05;
		for (const f of [130.81, 196.0, 261.63 * 1.003]) {
			const osc = ctx.createOscillator();
			osc.type = 'triangle';
			osc.frequency.value = f;
			osc.connect(pad);
			osc.start();
		}
		const breathe = ctx.createOscillator();
		const breatheGain = ctx.createGain();
		breathe.frequency.value = 0.09;
		breatheGain.gain.value = 0.025;
		breathe.connect(breatheGain).connect(padGain.gain);
		breathe.start();
		pad.connect(padGain).connect(out);
		// Vinyl hiss and crackle.
		const hiss = ctx.createBiquadFilter();
		hiss.type = 'highpass';
		hiss.frequency.value = 3000;
		const hissGain = ctx.createGain();
		hissGain.gain.value = 0.05;
		this.loop().connect(hiss).connect(hissGain).connect(out);
		const crackle = () => {
			if (!this.ctx) return;
			if (out.gain.value > 0.05) this.noiseBurst(this.now(), 0.02, 2500, 6000, 0.05 * Math.random(), out);
			setTimeout(crackle, 60 + Math.random() * 400);
		};
		crackle();
		return out;
	}

	private fireSource(): GainNode {
		const ctx = this.ctx as AudioContext;
		const out = ctx.createGain();
		out.gain.value = 0;
		const filter = ctx.createBiquadFilter();
		filter.type = 'lowpass';
		filter.frequency.value = 900;
		this.loop().connect(filter).connect(out).connect(this.master as GainNode);
		const pop = () => {
			if (!this.ctx) return;
			if (out.gain.value > 0.02) this.noiseBurst(this.now(), 0.03, 1200, 4000, 0.3 * Math.random(), out);
			setTimeout(pop, 90 + Math.random() * 500);
		};
		pop();
		return out;
	}

	private portalSource(key: string): GainNode {
		const ctx = this.ctx as AudioContext;
		const out = ctx.createGain();
		out.gain.value = 0;
		const base = 55 + (key.length % 5) * 7;
		for (const [f, g] of [[base, 0.5], [base * 1.5, 0.25], [base * 2.01, 0.2]]) {
			const osc = ctx.createOscillator();
			osc.type = 'sine';
			osc.frequency.value = f;
			const gain = ctx.createGain();
			gain.gain.value = g;
			osc.connect(gain).connect(out);
			osc.start();
		}
		out.connect(this.master as GainNode);
		return out;
	}

	private noiseBurst(at: number, length: number, low: number, high: number, level: number, dest?: AudioNode): void {
		if (!this.ctx || !this.master || !this.noise) return;
		const src = this.ctx.createBufferSource();
		src.buffer = this.noise;
		const bp = this.ctx.createBiquadFilter();
		bp.type = 'bandpass';
		bp.frequency.value = low + Math.random() * (high - low);
		const g = this.ctx.createGain();
		g.gain.setValueAtTime(level, at);
		g.gain.exponentialRampToValueAtTime(0.0001, at + length);
		src.connect(bp).connect(g).connect(dest ?? this.master);
		src.start(at, Math.random() * 3);
		src.stop(at + length + 0.02);
	}

	private tones(freqs: number[], delay: number, length: number, type: OscillatorType, level: number): void {
		if (!this.ctx || !this.master) return;
		const t = this.now() + delay;
		for (const f of freqs) {
			const osc = this.ctx.createOscillator();
			const g = this.ctx.createGain();
			osc.type = type;
			osc.frequency.value = f;
			g.gain.setValueAtTime(0.0001, t);
			g.gain.exponentialRampToValueAtTime(level, t + 0.01);
			g.gain.exponentialRampToValueAtTime(0.0001, t + length);
			osc.connect(g).connect(this.master);
			osc.start(t);
			osc.stop(t + length + 0.05);
		}
	}
}
