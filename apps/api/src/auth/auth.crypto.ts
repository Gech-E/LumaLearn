import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';

export const token = () => randomBytes(32).toString('base64url');
export const tokenHash = (value: string) => createHash('sha256').update(value).digest('hex');
export const constantEqual = (left: string, right: string) => {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
};
function encryptionKey() {
  const key = process.env.MFA_ENCRYPTION_KEY;
  if (key && /^[a-fA-F0-9]{64}$/.test(key)) return Buffer.from(key, 'hex');
  if (process.env.NODE_ENV === 'production')
    throw new Error('MFA_ENCRYPTION_KEY must contain 64 hexadecimal characters');
  return createHash('sha256').update('pathway-local-development-only-mfa-key').digest();
}
export function sealSecret(value: string) {
  const nonce = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), nonce);
  const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return [nonce, cipher.getAuthTag(), ciphertext]
    .map((part) => part.toString('base64url'))
    .join('.');
}
export function openSecret(value: string) {
  const [nonce, tag, ciphertext] = value.split('.').map((part) => Buffer.from(part, 'base64url'));
  if (!nonce || !tag || !ciphertext) throw new Error('Invalid encrypted MFA secret');
  const cipher = createDecipheriv('aes-256-gcm', encryptionKey(), nonce);
  cipher.setAuthTag(tag);
  return Buffer.concat([cipher.update(ciphertext), cipher.final()]).toString('utf8');
}
