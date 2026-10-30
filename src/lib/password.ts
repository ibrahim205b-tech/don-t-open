import crypto from 'node:crypto';

// scrypt (RFC 7914) من مكتبة Node المدمجة. التنسيق: scrypt$N$r$p$salt$hash
const N = 1 << 15, R = 8, P = 1, KEYLEN = 64;
const MAXMEM = 64 * 1024 * 1024;

function derive(password: string, salt: Buffer, n: number, r: number, p: number): Promise<Buffer> {
  return new Promise((resolve, reject) =>
    crypto.scrypt(password.normalize('NFKC'), salt, KEYLEN, { N: n, r, p, maxmem: MAXMEM }, (err, key) => (err ? reject(err) : resolve(key))));
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.randomBytes(16);
  const key = await derive(password, salt, N, R, P);
  return `scrypt$${N}$${R}$${P}$${salt.toString('base64')}$${key.toString('base64')}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [alg, n, r, p, salt, hash] = stored.split('$');
  if (alg !== 'scrypt' || !hash) return false;
  const expected = Buffer.from(hash, 'base64');
  const key = await derive(password, Buffer.from(salt, 'base64'), Number(n), Number(r), Number(p));
  return key.length === expected.length && crypto.timingSafeEqual(key, expected);
}

/** هاش ثابت يُستخدم عند عدم وجود الحساب، حتى يستغرق الرد الوقت نفسه (يقلل تعداد الحسابات). */
let dummy: Promise<string> | null = null;
export const dummyHash = () => (dummy ??= hashPassword(crypto.randomBytes(16).toString('hex')));

const COMMON = new Set(['12345678', '123456789', '1234567890', 'password', 'password1', 'qwertyui', '11111111', '00000000', '12341234', 'iloveyou', 'admin123', 'abcd1234']);

/** يعيد رسالة خطأ بالعربية أو null إذا كانت كلمة المرور مقبولة. */
export function passwordProblem(password: string, phone?: string): string | null {
  if (password.length < 10) return 'كلمة المرور لازم تكون ١٠ أحرف على الأقل.';
  if (password.length > 128) return 'كلمة المرور طويلة جداً (الحد ١٢٨ حرفاً).';
  if (COMMON.has(password.toLowerCase())) return 'كلمة المرور هذه شائعة جداً، اختر غيرها.';
  if (phone && password.includes(phone.slice(1))) return 'لا تستخدم رقم هاتفك ضمن كلمة المرور.';
  if (/^(.)\1+$/.test(password)) return 'كلمة المرور ضعيفة، اختر غيرها.';
  return null;
}
