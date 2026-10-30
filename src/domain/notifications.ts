import type { DB } from '../db/index.ts';

export function notify(db: DB, userId: number, message: string, postId: number | null = null) {
  db.prepare('INSERT INTO notifications (user_id, message, post_id) VALUES (?, ?, ?)').run(userId, message.slice(0, 600), postId);
}

export const unreadCount = (db: DB, userId: number) =>
  db.prepare('SELECT count(*) FROM notifications WHERE user_id = ? AND read_at IS NULL').pluck().get(userId) as number;
