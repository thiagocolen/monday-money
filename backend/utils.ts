import crypto from 'crypto';

export function getSha256(inputString: string): string {
  return crypto.createHash('sha256').update(inputString, 'utf8').digest('hex').toLowerCase();
}
