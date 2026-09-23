// Keyboard, mouse and touch, read only while the world has focus (WCAG 2.1.4: single-key shortcuts are
// active only on their component). Mouse look uses pointer lock when granted and drag-to-look otherwise;
// touch gets a virtual stick on the left half and look-drag on the right half.

export type Command = 'interact' | 'map' | 'journal' | 'menu';

export interface InputState {
	/** Strafe (−1 left … 1 right) and forward (−1 back … 1 forward). */
	move: { x: number; y: number };
	/** Keyboard turning, −1 … 1 (arrow keys). */
	turn: number;
	sprint: boolean;
	jump: boolean;
	/** Accumulated look deltas in pixels since the last frame. */
	look: { x: number; y: number };
}

const MOVE_KEYS: Record<string, [number, number]> = {
	KeyW: [0, 1],
	KeyS: [0, -1],
	KeyA: [-1, 0],
	KeyD: [1, 0],
	ArrowUp: [0, 1],
	ArrowDown: [0, -1]
};

export class Input {
	readonly state: InputState = { move: { x: 0, y: 0 }, turn: 0, sprint: false, jump: false, look: { x: 0, y: 0 } };
	enabled = true;
	private readonly held = new Set<string>();
	private dragging = false;
	private lastX = 0;
	private lastY = 0;
	private stick: { id: number; x0: number; y0: number } | null = null;
	private lookTouch: { id: number; x: number; y: number } | null = null;
	private touchMoveVector = { x: 0, y: 0 };
	private touchSprint = false;
	private readonly cleanups: (() => void)[] = [];

	constructor(
		private readonly element: HTMLElement,
		private readonly onCommand: (command: Command) => void,
		private readonly onPointerLock: (locked: boolean) => void
	) {
		const on = (target: EventTarget, type: string, fn: (e: Event) => void, opts?: AddEventListenerOptions) => {
			target.addEventListener(type, fn, opts);
			this.cleanups.push(() => target.removeEventListener(type, fn, opts));
		};
		on(element, 'keydown', (e) => this.keyDown(e as KeyboardEvent));
		on(element, 'keyup', (e) => this.held.delete((e as KeyboardEvent).code));
		on(element, 'blur', () => this.held.clear());
		on(element, 'mousedown', (e) => {
			const m = e as MouseEvent;
			if (m.button !== 0) return;
			this.dragging = true;
			this.lastX = m.clientX;
			this.lastY = m.clientY;
		});
		on(document, 'mouseup', () => (this.dragging = false));
		on(document, 'mousemove', (e) => {
			const m = e as MouseEvent;
			if (!this.enabled) return;
			if (document.pointerLockElement === element) {
				this.state.look.x += m.movementX;
				this.state.look.y += m.movementY;
			} else if (this.dragging) {
				this.state.look.x += m.clientX - this.lastX;
				this.state.look.y += m.clientY - this.lastY;
				this.lastX = m.clientX;
				this.lastY = m.clientY;
			}
		});
		on(document, 'pointerlockchange', () => this.onPointerLock(document.pointerLockElement === element));
		on(element, 'touchstart', (e) => this.touchStart(e as TouchEvent), { passive: false });
		on(element, 'touchmove', (e) => this.touchMove(e as TouchEvent), { passive: false });
		on(element, 'touchend', (e) => this.touchEnd(e as TouchEvent));
		on(element, 'touchcancel', (e) => this.touchEnd(e as TouchEvent));
	}

	private keyDown(e: KeyboardEvent): void {
		if (!this.enabled || e.altKey || e.ctrlKey || e.metaKey) return;
		const command: Command | null =
			e.code === 'KeyE' || e.code === 'Enter' ? 'interact' : e.code === 'KeyM' ? 'map' : e.code === 'KeyJ' ? 'journal' : e.code === 'Escape' ? 'menu' : null;
		if (command) {
			e.preventDefault();
			if (!e.repeat) this.onCommand(command);
			return;
		}
		if (e.code in MOVE_KEYS || e.code === 'ArrowLeft' || e.code === 'ArrowRight' || e.code === 'Space' || e.code.startsWith('Shift')) {
			e.preventDefault();
			this.held.add(e.code);
			if (e.code === 'Space') this.state.jump = true;
		}
	}

	private touchStart(e: TouchEvent): void {
		if (!this.enabled) return;
		e.preventDefault();
		const half = this.element.clientWidth / 2;
		for (const t of Array.from(e.changedTouches)) {
			if (t.clientX < half && !this.stick) this.stick = { id: t.identifier, x0: t.clientX, y0: t.clientY };
			else if (!this.lookTouch) this.lookTouch = { id: t.identifier, x: t.clientX, y: t.clientY };
		}
	}

	private touchMove(e: TouchEvent): void {
		e.preventDefault();
		for (const t of Array.from(e.changedTouches)) {
			if (this.stick?.id === t.identifier) {
				const dx = (t.clientX - this.stick.x0) / 60;
				const dy = (t.clientY - this.stick.y0) / 60;
				const len = Math.hypot(dx, dy);
				const k = len > 1 ? 1 / len : 1;
				this.touchMoveVector = { x: dx * k, y: -dy * k };
				this.touchSprint = len > 1.6;
			} else if (this.lookTouch?.id === t.identifier) {
				this.state.look.x += (t.clientX - this.lookTouch.x) * 1.4;
				this.state.look.y += (t.clientY - this.lookTouch.y) * 1.4;
				this.lookTouch.x = t.clientX;
				this.lookTouch.y = t.clientY;
			}
		}
	}

	private touchEnd(e: TouchEvent): void {
		for (const t of Array.from(e.changedTouches)) {
			if (this.stick?.id === t.identifier) {
				this.stick = null;
				this.touchMoveVector = { x: 0, y: 0 };
				this.touchSprint = false;
			}
			if (this.lookTouch?.id === t.identifier) this.lookTouch = null;
		}
	}

	/** Where the virtual stick is being held (for drawing it), or null. */
	get stickOrigin(): { x: number; y: number } | null {
		return this.stick ? { x: this.stick.x0, y: this.stick.y0 } : null;
	}

	/** Fold held keys and touch into `state`; call once per frame before reading it. */
	poll(): InputState {
		let x = 0;
		let y = 0;
		for (const code of this.held) {
			const v = MOVE_KEYS[code];
			if (v) {
				x += v[0];
				y += v[1];
			}
		}
		x += this.touchMoveVector.x;
		y += this.touchMoveVector.y;
		const len = Math.hypot(x, y);
		this.state.move.x = len > 1 ? x / len : x;
		this.state.move.y = len > 1 ? y / len : y;
		this.state.turn = (this.held.has('ArrowLeft') ? 1 : 0) - (this.held.has('ArrowRight') ? 1 : 0);
		this.state.sprint = this.held.has('ShiftLeft') || this.held.has('ShiftRight') || this.touchSprint;
		return this.state;
	}

	/** Look deltas are consumed once per frame. */
	consumeLook(): { x: number; y: number } {
		const look = { ...this.state.look };
		this.state.look.x = 0;
		this.state.look.y = 0;
		return look;
	}

	consumeJump(): boolean {
		const jump = this.state.jump;
		this.state.jump = false;
		return jump;
	}

	release(): void {
		this.held.clear();
		this.dragging = false;
		this.stick = null;
		this.lookTouch = null;
		this.touchMoveVector = { x: 0, y: 0 };
		this.state.look.x = 0;
		this.state.look.y = 0;
	}

	requestPointerLock(): void {
		if (matchMedia('(pointer: coarse)').matches) return;
		const request = this.element.requestPointerLock?.bind(this.element);
		try {
			const result = request?.() as unknown;
			if (result instanceof Promise) result.catch(() => undefined);
		} catch {
			// Pointer lock can be refused (iframes, some browsers); drag-to-look still works.
		}
	}

	dispose(): void {
		for (const c of this.cleanups) c();
		if (document.pointerLockElement === this.element) document.exitPointerLock();
	}
}
