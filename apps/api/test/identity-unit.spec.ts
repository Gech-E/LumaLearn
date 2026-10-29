import { createServer } from 'node:net';
import type { AddressInfo } from 'node:net';
import { openSecret, sealSecret, constantEqual, token, tokenHash } from '../src/auth/auth.crypto';
import { validFileType } from '../src/media/media.service';
import { scanFile, scannerReady } from '../src/media/scanner';
import { quietNow, localDay } from '../src/jobs/outbox';
import { checkRoleAssignment } from '../src/memberships/memberships.service';
import type { AuthUser } from '../src/auth/auth.decorators';

describe('identity and media security rules', () => {
  test('MFA secret encryption authenticates ciphertext and creates distinct nonces', () => {
    const first = sealSecret('secret-to-protect');
    expect(first).not.toContain('secret-to-protect');
    expect(first).not.toBe(sealSecret('secret-to-protect'));
    expect(openSecret(first)).toBe('secret-to-protect');
    const parts = first.split('.');
    const bytes = Buffer.from(parts[2], 'base64url');
    bytes[0] ^= 1;
    parts[2] = bytes.toString('base64url');
    expect(() => openSecret(parts.join('.'))).toThrow();
    expect(token()).not.toBe(token());
    expect(tokenHash('raw')).not.toContain('raw');
    expect(constantEqual('same', 'same')).toBe(true);
    expect(constantEqual('same', 'other')).toBe(false);
  });
  test('spoofed executable and invalid UTF-8 uploads are rejected', () => {
    expect(validFileType(Buffer.from('MZ executable'), 'application/pdf')).toBe(false);
    expect(validFileType(Buffer.from('%PDF-1.7\n'), 'application/pdf')).toBe(true);
    expect(validFileType(Buffer.from([255, 254]), 'text/plain')).toBe(false);
    expect(validFileType(Buffer.from('text\0binary'), 'text/plain')).toBe(false);
    expect(validFileType(Buffer.from('ሰላም,hello'), 'text/csv')).toBe(true);
    expect(validFileType(Buffer.from('<svg/>'), 'image/svg+xml')).toBe(false);
  });
  test('an admin cannot grant academic access they do not hold or change themselves', () => {
    const actor = { id: 'admin', roles: ['ADMIN'] } as AuthUser;
    expect(() => checkRoleAssignment(actor, 'learner', ['ACADEMIC_ADMIN'])).toThrow();
    expect(() => checkRoleAssignment(actor, 'admin', ['ADMIN'])).toThrow();
    expect(() => checkRoleAssignment(actor, 'learner', ['INSTRUCTOR'])).not.toThrow();
    expect(() =>
      checkRoleAssignment({ ...actor, roles: ['SUPPORT'] }, 'learner', ['ADMIN']),
    ).toThrow();
  });
  test('quiet hours respect the learner timezone, midnight, and daytime intervals', () => {
    const preference = { timezone: 'Africa/Nairobi', quietStart: '21:00', quietEnd: '08:00' };
    expect(quietNow(preference, new Date('2026-10-26T19:00:00Z'))).toBe(true);
    expect(quietNow(preference, new Date('2026-10-26T06:00:00Z'))).toBe(false);
    expect(
      quietNow(
        { ...preference, quietStart: '12:00', quietEnd: '14:00' },
        new Date('2026-10-26T10:00:00Z'),
      ),
    ).toBe(true);
    expect(localDay(new Date('2026-10-26T22:00:00Z'), 'Africa/Nairobi')).toBe('2026-10-27');
  });
});

describe('ClamAV protocol adapter (protocol fixture, not antivirus integration)', () => {
  const previous = { host: process.env.CLAMAV_HOST, port: process.env.CLAMAV_PORT };
  afterAll(() => {
    if (previous.host) process.env.CLAMAV_HOST = previous.host;
    else delete process.env.CLAMAV_HOST;
    if (previous.port) process.env.CLAMAV_PORT = previous.port;
    else delete process.env.CLAMAV_PORT;
  });
  async function fixture(response: string | null, run: () => Promise<void>) {
    const server = createServer((socket) =>
      socket.once('data', () => {
        if (response === null) socket.end();
        else socket.end(response);
      }),
    );
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    process.env.CLAMAV_HOST = '127.0.0.1';
    process.env.CLAMAV_PORT = String((server.address() as AddressInfo).port);
    try {
      await run();
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  }
  test('only an explicit clean verdict releases a file', async () => {
    await fixture('stream: OK\0', async () => {
      await expect(scanFile(Buffer.from('hello'))).resolves.toBe('CLEAN');
    });
    await fixture('stream: Eicar-Signature FOUND\0', async () => {
      await expect(scanFile(Buffer.from('hello'))).resolves.toBe('REJECTED');
    });
  });
  test('unknown result, closed connection, and unavailable scanner fail closed', async () => {
    await fixture('stream: size limit exceeded ERROR\0', async () => {
      await expect(scanFile(Buffer.from('hello'))).rejects.toThrow();
    });
    await fixture(null, async () => {
      await expect(scanFile(Buffer.from('hello'))).rejects.toThrow();
    });
    await expect(scanFile(Buffer.from('hello'))).rejects.toThrow();
    await fixture(null, async () => {
      await expect(scannerReady()).rejects.toThrow();
    });
  });
});
