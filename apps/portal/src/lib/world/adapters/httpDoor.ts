// DoorPort over HTTP: the gateway door lives under each warded app's own path, e.g. POST /vale/__door/session
// with the ID token as a Bearer credential. Same origin, so the door's HttpOnly `__session` cookie (Path=/vale)
// lands in this browser without any script ever reading it.

import { reasonFromDoor } from '../domain/access';
import type { RealmGate } from '../domain/realm';
import type { DoorFailure, DoorPort, DoorResult } from '../application/ports';

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export function doorUrl(gate: Pick<RealmGate, 'path'>): string {
	return `${gate.path}/__door/session`;
}

function failureFor(status: number, error: unknown): DoorFailure {
	const known = reasonFromDoor(typeof error === 'string' ? error : null);
	if (known && known !== 'sign_in_unavailable') return known;
	if (status === 401) return 'sign_in_required';
	if (status === 403) return 'group_required';
	if (status === 503) return 'door_unconfigured';
	return 'unavailable';
}

export class HttpDoor implements DoorPort {
	private readonly fetchFn: FetchLike;

	constructor(fetchFn: FetchLike) {
		this.fetchFn = fetchFn;
	}

	async open(gate: RealmGate, idToken: string): Promise<DoorResult> {
		let res: Response;
		try {
			res = await this.fetchFn(doorUrl(gate), {
				method: 'POST',
				credentials: 'same-origin',
				cache: 'no-store',
				headers: { authorization: `Bearer ${idToken}`, accept: 'application/json' }
			});
		} catch {
			return { ok: false, reason: 'unavailable' };
		}
		const body = (await res.json().catch(() => ({}))) as { error?: unknown; expiresAt?: unknown };
		if (res.ok) return { ok: true, expiresAt: typeof body.expiresAt === 'string' ? body.expiresAt : null };
		return { ok: false, reason: failureFor(res.status, body.error) };
	}

	async close(gate: RealmGate): Promise<void> {
		await this.fetchFn(doorUrl(gate), { method: 'DELETE', credentials: 'same-origin', cache: 'no-store' });
	}
}
