import crypto from 'node:crypto';

/** رمز CSRF مشتق من معرّف الجلسة (أو معرّف الزائر) بمفتاح الخادم؛ لا يُخزَّن ولا يمكن تخمينه. */
export function csrfToken(secret: string, bindTo: string): string {
  return crypto.createHmac('sha256', secret).update('csrf:' + bindTo).digest('base64url');
}

export function csrfValid(secret: string, bindTo: string, token: unknown): boolean {
  if (typeof token !== 'string' || token.length > 100) return false;
  const expected = Buffer.from(csrfToken(secret, bindTo));
  const got = Buffer.from(token);
  return got.length === expected.length && crypto.timingSafeEqual(got, expected);
}

export function ipHash(secret: string, ip: string): string {
  return crypto.createHmac('sha256', secret).update('ip:' + ip).digest('hex').slice(0, 24);
}
