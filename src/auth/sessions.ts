import crypto from 'node:crypto';
import type { DB } from '../db/index.ts';
import { now } from '../db/index.ts';
import type { User } from '../domain/types.ts';
import { isStaff } from './rbac.ts';

export const SESSION_COOKIE = 'sid';
const USER_TTL = 30 * 86400;
const STAFF_TTL = 12 * 3600;

export const hashToken = (token: string) => crypto.createHash('sha256').update(token).digest('hex');

export interface SessionRow { id: string; user_id: number; mfa_passed: number; expires_at: number; last_seen_at: number }

export function createSession(db: DB, user: Pick<User, 'id' | 'role'>, mfaPassed: boolean): { token: string; maxAge: number } {
  const token = crypto.randomBytes(32).toString('base64url');
  const ttl = mfaPassed ? (isStaff(user.role) ? STAFF_TTL : USER_TTL) : 600;
  db.prepare('INSERT INTO sessions (id, user_id, mfa_passed, expires_at) VALUES (?, ?, ?, ?)')
    .run(hashToken(token), user.id, mfaPassed ? 1 : 0, now() + ttl);
  return { token, maxAge: ttl };
}

export function loadSession(db: DB, token: string | undefined): { session: SessionRow; user: User } | null {
  if (!token || token.length > 100) return null;
  const id = hashToken(token);
  const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(id) as SessionRow | undefined;
  if (!session) return null;
  const t = now();
  if (session.expires_at <= t) { db.prepare('DELETE FROM sessions WHERE id = ?').run(id); return null; }
  const user = db.prepare("SELECT id, name, phone, role, status, totp_enabled, created_at FROM users WHERE id = ?").get(session.user_id) as User | undefined;
  if (!user || user.status !== 'active') { db.prepare('DELETE FROM sessions WHERE id = ?').run(id); return null; }
  if (t - session.last_seen_at > 300) db.prepare('UPDATE sessions SET last_seen_at = ? WHERE id = ?').run(t, id);
  return { session, user };
}

export const destroySession = (db: DB, sessionId: string) => db.prepare('DELETE FROM sessions WHERE id = ?').run(sessionId);
export const destroyUserSessions = (db: DB, userId: number) => db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId);
export const purgeExpiredSessions = (db: DB) => db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(now());
