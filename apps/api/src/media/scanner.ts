import { connect } from 'node:net';
import { MAX_FILE_BYTES } from './storage';

export function scanFile(data: Buffer): Promise<'CLEAN' | 'REJECTED'> {
  if (data.length === 0 || data.length > MAX_FILE_BYTES)
    return Promise.reject(new Error('File is empty or too large'));
  return new Promise((resolve, reject) => {
    const socket = connect({
      host: process.env.CLAMAV_HOST ?? 'localhost',
      port: Number(process.env.CLAMAV_PORT ?? 3310),
    });
    let response = '';
    let settled = false;
    const finish = (error?: Error, result?: 'CLEAN' | 'REJECTED') => {
      if (settled) return;
      settled = true;
      socket.destroy();
      if (error) reject(error);
      else resolve(result!);
    };
    socket.setTimeout(30000, () =>
      finish(new Error('File scanner timed out; file remains quarantined')),
    );
    socket.on('error', () =>
      finish(new Error('File scanner unavailable; file remains quarantined')),
    );
    socket.on('connect', () => {
      socket.write('zINSTREAM\0');
      for (let offset = 0; offset < data.length; offset += 65536) {
        const part = data.subarray(offset, Math.min(offset + 65536, data.length));
        const length = Buffer.alloc(4);
        length.writeUInt32BE(part.length);
        socket.write(length);
        socket.write(part);
      }
      socket.write(Buffer.alloc(4));
    });
    socket.on('data', (part: Buffer) => {
      response += part.toString('utf8');
      if (response.length > 4096) finish(new Error('Invalid file-scanner response'));
      if (!response.includes('\0') && !response.includes('\n')) return;
      const status = response.replace(/[\0\r\n]/g, '').trim();
      if (status === 'stream: OK') finish(undefined, 'CLEAN');
      else if (/^stream: .+ FOUND$/.test(status)) finish(undefined, 'REJECTED');
      else
        finish(new Error('File scanner did not confirm a clean result; file remains quarantined'));
    });
    socket.on('close', () => {
      if (!settled) finish(new Error('File scanner closed without a verdict'));
    });
  });
}

export function scannerReady(): Promise<void> {
  return new Promise((resolve, reject) => {
    const socket = connect({
      host: process.env.CLAMAV_HOST ?? 'localhost',
      port: Number(process.env.CLAMAV_PORT ?? 3310),
    });
    let response = '';
    let settled = false;
    const finish = (ok: boolean) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      if (ok) resolve();
      else reject(new Error('scanner unavailable'));
    };
    socket.setTimeout(1500, () => finish(false));
    socket.on('error', () => finish(false));
    socket.on('connect', () => socket.write('zPING\0'));
    socket.on('data', (chunk: Buffer) => {
      response += chunk.toString();
      if (response.length > 4096) finish(false);
      if (response.includes('\0') || response.includes('\n'))
        finish(response.replace(/[\0\r\n]/g, '') === 'PONG');
    });
    socket.on('close', () => finish(false));
  });
}
