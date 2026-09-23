import { describe, expect, it } from 'vitest';
import { isLocalHost, realmMode } from '../../src/lib/world/domain/mode';

const input = (hostname: string, search = '', dev = false, override = '') => ({ hostname, search, dev, override });

describe('realm mode', () => {
	it('opens every door on local hosts and under vite dev', () => {
		for (const host of ['localhost', '127.0.0.1', '[::1]', 'realm.localhost']) expect(realmMode(input(host))).toBe('open');
		expect(realmMode(input('192.168.1.20', '', true))).toBe('open');
	});

	it('guards the real domains, and ?realm=open cannot unlock them', () => {
		for (const host of ['eisensoftware.com', 'eisensoftware.web.app', 'localhost.evil.com'])
			expect(realmMode(input(host, '?realm=open'))).toBe('guarded');
	});

	it('rehearses the guarded realm locally on request', () => {
		expect(realmMode(input('localhost', '?realm=guarded'))).toBe('guarded');
		expect(realmMode(input('localhost', '', true, 'guarded'))).toBe('guarded');
	});

	it('recognises loopback names only', () => {
		expect(isLocalHost('LOCALHOST')).toBe(true);
		expect(isLocalHost('notlocalhost')).toBe(false);
	});
});
