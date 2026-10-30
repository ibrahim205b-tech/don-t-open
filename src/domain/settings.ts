import type { DB } from '../db/index.ts';
import { normalizePhone } from '../lib/arabic.ts';
import { TYPE_KEYS, type PostType } from './types.ts';

export const OWNER_NAME = 'إبراهيم علي الشويلي';
export const COPYRIGHT = `جميع الحقوق محفوظة © ${OWNER_NAME}`;
export const OWNERSHIP_STATEMENT = `منصة دليل المعامل مشروع أُنشئ وطُوّر بواسطة ${OWNER_NAME}. جميع الحقوق محفوظة وفقاً للقوانين المعمول بها.`;
export const DEFAULT_SUPPORT_PHONE = '07763438000';

type Kind = 'text' | 'longtext' | 'phone' | 'url' | 'int' | 'sections';
interface Def { label: string; kind: Kind; def: string; max?: number; min?: number; help?: string }

const ABOUT = `دليل المعامل منصة محلية تجمع محلات منطقة المعامل في بغداد وخدماتها ووظائفها وعقاراتها وإعلاناتها في مكان واحد، حتى يلگى الناس اللي يحتاجوه بسرعة.

كل إعلان يوصلنا يمر بمراجعة قبل ما ينشر. هدفنا معلومات واضحة وصحيحة قدر الإمكان، ونرحب بتصحيح أي معلومة عن طريق زر الإبلاغ أو رقم الدعم.`;

const PRIVACY = `ما الذي نجمعه
- عند إنشاء حساب: الاسم ورقم الهاتف وكلمة المرور (تُخزَّن مشفّرة بخوارزمية تجزئة ولا يمكن لأحد قراءتها).
- عند نشر إعلان: محتوى الإعلان والصور ورقم التواصل الذي تختاره.
- لأغراض الحماية من الإساءة: بصمة مختصرة لعنوان IP مشفّرة باتجاه واحد عند الإبلاغ والتقييم.

ما الذي يظهر للعامة
- محتوى الإعلان بعد الموافقة عليه فقط.
- رقم التواصل فقط إذا اخترت إظهاره.
- لا نعرض رقم هاتف حسابك أو بيانات الدخول لأي زائر.

مدة الاحتفاظ
- الإعلانات المنتهية تبقى محفوظة داخلياً ولا تظهر للعامة، ويمكنك حذفها في أي وقت.
- سجلات الحماية والتدقيق الإدارية تُحفظ لمدة معقولة لأغراض الأمان ومعالجة البلاغات.

حذف الحساب
يمكنك حذف حسابك من صفحة إعدادات الحساب. عند الحذف تُزال إعلاناتك من العرض العام ويُستبدل اسمك ورقمك ببيانات مجهولة.

ملفات تعريف الارتباط (Cookies)
نستخدم ملفات ضرورية فقط لتسجيل الدخول والحماية من الطلبات المزوّرة. لا نستخدم أدوات تتبع أو إعلانات من جهات خارجية.

للاستفسار عن بياناتك تواصل معنا على رقم الدعم.`;

const TERMS = `باستخدامك منصة دليل المعامل فإنك توافق على ما يلي:
- تقديم معلومات صحيحة وعدم انتحال صفة أي شخص أو جهة.
- عدم نشر محتوى مخالف للقانون أو مضلل أو احتيالي أو مسيء.
- المنصة وسيط لعرض المعلومات، والتعامل بين المستخدمين يتم مباشرة بينهم وعلى مسؤوليتهم. ننصح بالتأكد من أي إعلان قبل دفع أي مبلغ.
- يحق لإدارة المنصة رفض أي محتوى أو إخفاؤه أو حذفه، وتعطيل الحسابات المخالفة.
- قد نعدّل هذه الشروط، وتُنشر النسخة المحدّثة في هذه الصفحة.`;

const POSTING = `- كل منشور جديد أو تعديل جوهري يخضع للمراجعة قبل ظهوره للعامة.
- يحق للإدارة رفض المحتوى المخالف أو إخفاؤه أو طلب تعديله، مع توضيح السبب لصاحب الإعلان.
- يُمنع: السلع والخدمات غير القانونية، الإعلانات المضللة أو الوهمية، طلب مبالغ مقدماً بطرق مشبوهة، المحتوى المسيء أو التشهيري، نشر بيانات شخصية لغيرك من دون موافقته.
- الإعلانات المكررة أو المزعجة تُرفض.
- لكل نوع إعلان مدة عرض، وبعدها ينتهي ويمكن تجديده بإرساله للمراجعة مرة ثانية.
- طلبات المساعدة: لا تنشر وثائق طبية أو رسمية، ولا رقم هاتف أي شخص من دون موافقته الصريحة.`;

const ADS = `- الإعلانات المميزة تُحدَّد يدوياً من الإدارة بعد الاتفاق مع صاحب الإعلان، ولها تاريخ بداية ونهاية واضح.
- الإعلان المميز يخضع لنفس قواعد المراجعة والنشر، ولا يعني أن المنصة تضمن صحته.
- لا تطلب المنصة معلومات بطاقات مصرفية عبر الموقع.`;

const REPORTS = `- يستطيع أي زائر الإبلاغ عن منشور أو تقييم عبر زر «إبلاغ».
- تراجع الإدارة البلاغات بأسرع وقت ممكن، وقد تخفي المحتوى مؤقتاً أثناء المراجعة.
- لا تُكشف هوية المبلِّغ لصاحب المنشور.
- البلاغات الكيدية المتكررة قد تؤدي إلى تقييد الحساب.`;

export const SETTINGS: Record<string, Def> = {
  site_name: { label: 'اسم الموقع', kind: 'text', def: 'دليل المعامل', max: 40 },
  tagline: { label: 'الوصف المختصر', kind: 'text', def: 'دليل محلات وخدمات وإعلانات منطقة المعامل في بغداد', max: 160 },
  support_phone: { label: 'رقم الدعم', kind: 'phone', def: DEFAULT_SUPPORT_PHONE },
  whatsapp_phone: { label: 'رقم واتساب الدعم', kind: 'phone', def: DEFAULT_SUPPORT_PHONE },
  facebook_url: { label: 'رابط فيسبوك', kind: 'url', def: '' },
  instagram_url: { label: 'رابط إنستغرام', kind: 'url', def: '' },
  telegram_url: { label: 'رابط تيليغرام', kind: 'url', def: '' },
  announcement: { label: 'شريط تنبيه أعلى الموقع', kind: 'text', def: '', max: 200, help: 'اتركه فارغاً لإخفائه' },
  footer_note: { label: 'نص إضافي في التذييل', kind: 'text', def: '', max: 300 },
  about_text: { label: 'نص «عن المنصة»', kind: 'longtext', def: ABOUT, max: 4000 },
  policy_privacy: { label: 'سياسة الخصوصية', kind: 'longtext', def: PRIVACY, max: 20000 },
  policy_terms: { label: 'شروط الاستخدام', kind: 'longtext', def: TERMS, max: 20000 },
  policy_posting: { label: 'سياسة النشر', kind: 'longtext', def: POSTING, max: 20000 },
  policy_ads: { label: 'سياسة الإعلانات', kind: 'longtext', def: ADS, max: 20000 },
  policy_reports: { label: 'سياسة البلاغات', kind: 'longtext', def: REPORTS, max: 20000 },
  max_posts_per_day: { label: 'الحد الأقصى للمنشورات لكل مستخدم يومياً', kind: 'int', def: '5', min: 1, max: 50 },
  review_min_account_age_hours: { label: 'عمر الحساب الأدنى (بالساعات) لكتابة تقييم', kind: 'int', def: '24', min: 0, max: 720 },
  sections_disabled: { label: 'أقسام موقوفة عن استقبال منشورات جديدة', kind: 'sections', def: '' },
};

export type SettingKey = keyof typeof SETTINGS;
export type Settings = Record<string, string>;

export function loadSettings(db: DB): Settings {
  const rows = db.prepare('SELECT key, value FROM site_settings').all() as { key: string; value: string }[];
  const out: Settings = {};
  for (const [k, d] of Object.entries(SETTINGS)) out[k] = d.def;
  for (const r of rows) if (r.key in SETTINGS) out[r.key] = r.value;
  return out;
}

/** يتحقق من قيمة إعداد واحد ويعيد القيمة المنظفة أو رسالة خطأ. */
export function cleanSetting(key: string, value: unknown): { value: string } | { error: string } {
  const d = SETTINGS[key];
  if (!d) return { error: 'إعداد غير معروف' };
  const v = typeof value === 'string' ? value.replace(/\r\n/g, '\n').trim() : Array.isArray(value) ? value.join(',') : '';
  switch (d.kind) {
    case 'phone': { const p = normalizePhone(v); return p ? { value: p } : { error: `${d.label}: رقم عراقي غير صحيح` }; }
    case 'url':
      if (!v) return { value: '' };
      try { const u = new URL(v); if (u.protocol !== 'https:') throw 0; return { value: u.toString() }; } catch { return { error: `${d.label}: يجب أن يبدأ الرابط بـ https://` }; }
    case 'int': { const n = Number(v); return Number.isInteger(n) && n >= (d.min ?? 0) && n <= (d.max ?? 1e9) ? { value: String(n) } : { error: `${d.label}: رقم بين ${d.min} و${d.max}` }; }
    case 'sections': return { value: v.split(',').filter((s) => (TYPE_KEYS as string[]).includes(s)).join(',') };
    default:
      if (v.length > (d.max ?? 200)) return { error: `${d.label}: النص أطول من المسموح` };
      if (d.kind === 'text' && /[\n<>]/.test(v)) return { error: `${d.label}: سطر واحد من دون الرموز < >` };
      return { value: v };
  }
}

export function saveSettings(db: DB, values: Record<string, string>, userId: number) {
  const stmt = db.prepare('INSERT INTO site_settings (key, value, updated_by, updated_at) VALUES (?, ?, ?, unixepoch()) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_by = excluded.updated_by, updated_at = excluded.updated_at');
  db.transaction(() => { for (const [k, v] of Object.entries(values)) stmt.run(k, v, userId); })();
}

export const sectionEnabled = (s: Settings, type: PostType) => !s.sections_disabled.split(',').includes(type);

export const POLICIES: Record<string, { key: string; title: string }> = {
  privacy: { key: 'policy_privacy', title: 'سياسة الخصوصية' },
  terms: { key: 'policy_terms', title: 'شروط الاستخدام' },
  posting: { key: 'policy_posting', title: 'سياسة النشر' },
  ads: { key: 'policy_ads', title: 'سياسة الإعلانات' },
  reports: { key: 'policy_reports', title: 'سياسة التعامل مع البلاغات' },
};
