import type { DB } from '../db/index.ts';

export interface AuditEntry {
  actorId: number | null; action: string; targetType?: string; targetId?: number | null;
  result?: 'ok' | 'denied' | 'error'; meta?: Record<string, unknown>; ipHash?: string | null;
}

export function audit(db: DB, e: AuditEntry) {
  db.prepare('INSERT INTO audit_logs (actor_id, action, target_type, target_id, result, meta, ip_hash) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(e.actorId, e.action, e.targetType ?? null, e.targetId ?? null, e.result ?? 'ok', JSON.stringify(e.meta ?? {}), e.ipHash ?? null);
}

export const AUDIT_LABEL: Record<string, string> = {
  'post.approve': 'موافقة على منشور', 'post.reject': 'رفض منشور', 'post.request_changes': 'طلب تعديل منشور',
  'post.hide': 'إخفاء منشور', 'post.unhide': 'إعادة إظهار منشور', 'post.remove': 'حذف منشور',
  'post.verify': 'توثيق نشاط', 'post.unverify': 'إلغاء توثيق نشاط', 'post.official': 'وسم خبر كمؤكد', 'post.unofficial': 'إلغاء وسم خبر مؤكد',
  'post.create_by_admin': 'إضافة منشور من الإدارة',
  'user.disable': 'تعطيل حساب', 'user.enable': 'تفعيل حساب', 'user.role': 'تغيير دور', 'user.reset_password': 'إعادة تعيين كلمة مرور',
  'claim.approve': 'اعتماد مطالبة ملكية', 'claim.reject': 'رفض مطالبة ملكية',
  'review.publish': 'نشر تقييم', 'review.hide': 'إخفاء تقييم',
  'report.resolve': 'معالجة بلاغ', 'report.dismiss': 'رفض بلاغ',
  'settings.update': 'تعديل إعدادات الموقع', 'category.save': 'حفظ تصنيف', 'area.save': 'حفظ منطقة',
  'featured.create': 'إضافة إعلان مميز', 'featured.end': 'إنهاء إعلان مميز',
  'admin.access_denied': 'محاولة دخول غير مصرح بها للإدارة', 'auth.login_admin': 'دخول حساب إداري', 'auth.mfa_enabled': 'تفعيل التحقق بخطوتين',
};
