export type Role = 'super_admin' | 'admin' | 'moderator' | 'business_owner' | 'user';
export type PostType = 'business' | 'job' | 'property' | 'service' | 'market' | 'offer' | 'community' | 'help';
export type PostStatus = 'draft' | 'pending' | 'changes_requested' | 'rejected' | 'published' | 'hidden' | 'expired' | 'removed';

export interface User {
  id: number; name: string; phone: string; role: Role; status: 'active' | 'disabled' | 'deleted';
  totp_enabled: number; created_at: number;
}

export interface Post {
  id: number; type: PostType; user_id: number; owner_id: number | null; business_id: number | null;
  category_id: number; area_id: number; title: string; body: string; price: number | null;
  contact_phone: string | null; show_phone: number; whatsapp: number; details: string; status: PostStatus;
  status_reason: string | null; open_state: 'open' | 'closed' | 'unknown'; verified: number; is_official: number;
  verified_by: number | null; verified_at: number | null;
  approved_by: number | null; approved_at: number | null; published_at: number | null; expires_at: number | null;
  title_key: string; created_at: number; updated_at: number;
}

export interface TypeInfo { label: string; single: string; path: string; icon: string; expiryDays: number | null; blurb: string }

export const TYPES: Record<PostType, TypeInfo> = {
  business: { label: 'المحلات والأسواق', single: 'محل أو نشاط تجاري', path: '/businesses', icon: 'store', expiryDays: null, blurb: 'ماركتات، صيدليات، أفران، صيانة، وكل محلات المنطقة' },
  job: { label: 'الوظائف', single: 'وظيفة', path: '/jobs', icon: 'briefcase', expiryDays: 30, blurb: 'شغل بالمطاعم والمحلات والمخازن، دوام كامل أو جزئي' },
  property: { label: 'العقارات', single: 'عقار', path: '/properties', icon: 'building', expiryDays: 60, blurb: 'بيوت ومحلات وأراضٍ للبيع والإيجار' },
  service: { label: 'الخدمات والمهن', single: 'خدمة أو مهنة', path: '/services', icon: 'wrench', expiryDays: 365, blurb: 'كهربائي، سباك، تبريد، نجار، نقل أثاث' },
  market: { label: 'بيع وشراء', single: 'إعلان بيع', path: '/market', icon: 'tag', expiryDays: 30, blurb: 'أثاث وأجهزة وهواتف مستعملة وجديدة' },
  offer: { label: 'العروض', single: 'عرض تجاري', path: '/offers', icon: 'percent', expiryDays: 14, blurb: 'تخفيضات وعروض المحلات والمطاعم' },
  community: { label: 'أخبار ومبادرات', single: 'خبر أو فعالية', path: '/community', icon: 'megaphone', expiryDays: 30, blurb: 'مدارس ودورات، مبادرات، فعاليات وتنبيهات' },
  help: { label: 'المساعدات المجتمعية', single: 'طلب مساعدة', path: '/help', icon: 'heart', expiryDays: 30, blurb: 'تبرع بالدم ومبادرات خيرية بعد المراجعة' },
};

export const TYPE_KEYS = Object.keys(TYPES) as PostType[];
export const isPostType = (v: unknown): v is PostType => typeof v === 'string' && v in TYPES;

export const STATUS_LABEL: Record<PostStatus, string> = {
  draft: 'مسودة', pending: 'بانتظار المراجعة', changes_requested: 'مطلوب تعديل', rejected: 'مرفوض',
  published: 'منشور', hidden: 'مخفي', expired: 'منتهي', removed: 'محذوف',
};

export const ROLE_LABEL: Record<Role, string> = {
  super_admin: 'مدير عام', admin: 'مدير', moderator: 'مشرف', business_owner: 'صاحب نشاط', user: 'مستخدم',
};
