import fs from 'node:fs';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { canPreview, getPost } from '../domain/posts.ts';

/**
 * الصور المرفوعة تُخزَّن خارج المجلد العام وتُقدَّم من هنا فقط.
 * صورة منشور غير منشور لا يراها إلا صاحبه وفريق الإدارة.
 */
export async function mediaRoutes(app: FastifyInstance) {
  const db = app.db;
  app.get('/media/:file', (req, reply) => {
    const file = (req.params as { file: string }).file;
    if (!/^[0-9a-f]{32,33}\.webp$/.test(file)) return reply.callNotFound();
    const row = db.prepare('SELECT post_id FROM post_images WHERE file = ? OR thumb = ?').get(file, file) as { post_id: number } | undefined;
    const post = row ? getPost(db, row.post_id) : undefined;
    if (!post) return reply.callNotFound();
    const isPublic = post.status === 'published' && (!post.expires_at || post.expires_at > Date.now() / 1000);
    if (!isPublic && !canPreview(post, req.user)) return reply.callNotFound();
    const full = path.join(app.cfg.uploadDir, file);
    if (!fs.existsSync(full)) return reply.callNotFound();
    reply.header('Content-Type', 'image/webp');
    reply.header('Content-Disposition', 'inline');
    reply.header('Cache-Control', isPublic ? 'public, max-age=86400' : 'private, no-store');
    return reply.send(fs.createReadStream(full));
  });
}
