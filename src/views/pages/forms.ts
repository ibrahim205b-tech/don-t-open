import { html, type SafeHtml } from '../../lib/html.ts';
import { TYPES, type PostType } from '../../domain/types.ts';
import type { ImageRow } from '../../domain/posts.ts';
import { checkbox, errorList, field, mediaUrl, select, textarea } from '../components.ts';
import { icon } from '../layout.ts';

type Opt = [string | number, string][];
export type FormValues = Record<string, string | undefined>;

export interface PostFormData {
  type: PostType; action: string; values: FormValues; errors: string[]; csrf: SafeHtml;
  categories: Opt; areas: Opt; images: ImageRow[]; businesses: Opt; editing: boolean; status?: string;
}

const TITLE_LABEL: Record<PostType, string> = {
  business: 'اسم المحل أو النشاط', job: 'عنوان الوظيفة', property: 'عنوان الإعلان', service: 'اسمك أو اسم الخدمة',
  market: 'شنو تبيع؟', offer: 'عنوان العرض', community: 'العنوان', help: 'عنوان الطلب',
};
const BODY_LABEL: Record<PostType, string> = {
  business: 'وصف النشاط', job: 'وصف المهام', property: 'وصف العقار', service: 'وصف الخدمات اللي تقدمها',
  market: 'الوصف', offer: 'تفاصيل العرض', community: 'التفاصيل', help: 'تفاصيل الطلب',
};
const PRICE_LABEL: Partial<Record<PostType, [string, string]>> = {
  job: ['الراتب الشهري (د.ع)', 'اتركه فارغاً إذا يحدد عند التواصل'],
  property: ['السعر (د.ع)', 'للإيجار اكتب الإيجار الشهري. اتركه فارغاً إذا السعر عند التواصل.'],
  market: ['السعر (د.ع)', 'اتركه فارغاً إذا السعر عند التواصل'],
  offer: ['السعر بعد العرض (د.ع)', ''],
};

function detailFields(d: PostFormData): SafeHtml {
  const v = d.values;
  switch (d.type) {
    case 'business': return html`
      ${field({ name: 'd_address', label: 'العنوان التفصيلي', value: v.d_address, required: true, max: 200, hint: 'الشارع أو أقرب نقطة دالة' })}
      ${field({ name: 'd_hours', label: 'ساعات العمل', value: v.d_hours, max: 200, hint: 'مثال: يومياً من ٩ الصبح لـ ١١ بالليل، الجمعة عطلة' })}
      ${textarea({ name: 'd_services', label: 'الخدمات أو المنتجات الرئيسية', value: v.d_services, max: 1000, rows: 3 })}
      ${field({ name: 'd_delivery', label: 'مناطق التوصيل', value: v.d_delivery, max: 300, hint: 'إذا عندك توصيل' })}
      <fieldset class="group"><legend>الموقع على الخريطة <span class="opt">(اختياري)</span></legend>
        <p class="hint">انسخ الإحداثيات من خرائط Google أو استخدم زر «موقعي الحالي» وأنت داخل المحل.</p>
        <div class="two">${field({ name: 'd_lat', label: 'خط العرض', value: v.d_lat, dir: 'ltr', attrs: 'inputmode="decimal"' })}${field({ name: 'd_lng', label: 'خط الطول', value: v.d_lng, dir: 'ltr', attrs: 'inputmode="decimal"' })}</div>
        <button class="btn" type="button" data-geo hidden>${icon('pin')}موقعي الحالي</button>
      </fieldset>
      ${d.editing ? '' : checkbox({ name: 'd_iam_owner', label: 'أنا صاحب هذا النشاط وأريد إدارته', checked: v.d_iam_owner === 'on', hint: 'الإدارة راح تتحقق قبل اعتمادك مالكاً.' })}`;
    case 'job': return html`
      ${field({ name: 'd_workplace', label: 'مكان العمل', value: v.d_workplace, required: true, max: 150, hint: 'اسم المحل أو المطعم أو المعمل' })}
      ${select({ name: 'd_employment', label: 'نوع الدوام', value: v.d_employment, required: true, placeholder: 'اختر', options: [['full', 'دوام كامل'], ['part', 'دوام جزئي'], ['daily', 'عمل يومي'], ['training', 'تدريب'], ['freelance', 'عمل حر']] })}
      ${field({ name: 'd_work_hours', label: 'ساعات العمل', value: v.d_work_hours, max: 100 })}
      ${textarea({ name: 'd_requirements', label: 'الشروط', value: v.d_requirements, max: 1000, rows: 3 })}`;
    case 'property': return html`
      ${select({ name: 'd_offer', label: 'نوع العرض', value: v.d_offer, required: true, placeholder: 'اختر', options: [['sale', 'بيع'], ['rent', 'إيجار']] })}
      ${field({ name: 'd_size', label: 'المساحة (م²)', value: v.d_size, attrs: 'inputmode="numeric"' })}
      ${field({ name: 'd_landmark', label: 'أقرب نقطة دالة', value: v.d_landmark, max: 100, hint: 'لا تكتب رقم الدار أو العنوان الدقيق. يكفي اسم الشارع أو أقرب معلم.' })}`;
    case 'service': return html`
      ${field({ name: 'd_work_areas', label: 'المناطق اللي تشتغل بيها', value: v.d_work_areas, max: 300 })}
      ${field({ name: 'd_hours', label: 'أوقات العمل', value: v.d_hours, max: 200 })}
      ${field({ name: 'd_experience', label: 'الخبرة', value: v.d_experience, max: 300, hint: 'مثال: ١٠ سنوات بصيانة المكيفات' })}`;
    case 'market': return select({ name: 'd_condition', label: 'الحالة', value: v.d_condition, required: true, placeholder: 'اختر', options: [['used', 'مستعمل'], ['new', 'جديد']] });
    case 'offer': return html`
      ${d.businesses.length ? select({ name: 'd_business_id', label: 'المحل صاحب العرض', value: v.d_business_id, options: d.businesses, placeholder: 'بدون ربط' }) : ''}
      ${field({ name: 'd_valid_days', label: 'مدة العرض بالأيام', value: v.d_valid_days ?? '7', required: true, attrs: 'inputmode="numeric" min="1" max="30"', hint: 'من ١ إلى ٣٠ يوماً، تبدأ من تاريخ الموافقة' })}`;
    case 'community': return html`
      <p class="note">${icon('info', 'i i-sm')}المنشورات من المستخدمين تظهر بوسم «غير مؤكد رسمياً» إلى أن تتحقق منها الإدارة. لا تنشر ادعاءات أو اتهامات غير مثبتة.</p>
      ${field({ name: 'd_event_date', label: 'تاريخ الفعالية', value: v.d_event_date, type: 'date' })}
      ${field({ name: 'd_location', label: 'المكان', value: v.d_location, max: 150 })}
      ${field({ name: 'd_organizer', label: 'الجهة المنظمة', value: v.d_organizer, max: 100 })}`;
    case 'help': return html`
      <div class="note note-warn">${icon('shield', 'i i-sm')}<div><strong>قبل ما ترسل:</strong> لا ترفع صور وثائق طبية أو رسمية، ولا تكتب اسم المريض الكامل أو عنوان بيته. اكتب فقط اللي يحتاجه الناس حتى يساعدون.</div></div>
      ${select({ name: 'd_blood_type', label: 'فصيلة الدم المطلوبة', value: v.d_blood_type, placeholder: 'لا ينطبق', options: ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'].map((b) => [b, b]) })}
      ${field({ name: 'd_location', label: 'المكان العام', value: v.d_location, max: 150, hint: 'مثال: اسم المستشفى، بدون رقم الردهة أو الغرفة' })}
      ${checkbox({ name: 'd_consent', label: 'أؤكد أن صاحب الحالة (أو ولي أمره) وافق على نشر هذا الطلب', checked: v.d_consent === 'on' })}`;
  }
}

export function postForm(d: PostFormData): SafeHtml {
  const v = d.values;
  const t = TYPES[d.type];
  const price = PRICE_LABEL[d.type];
  const remaining = 6 - d.images.length;
  return html`<div class="wrap narrow">
    <nav class="crumbs" aria-label="مسار التنقل"><a href="/account">حسابي</a><span aria-hidden="true">/</span><span aria-current="page">${d.editing ? 'تعديل' : 'إضافة'} ${t.single}</span></nav>
    <h1>${d.editing ? 'تعديل' : 'إضافة'} ${t.single}</h1>
    <p class="note">${icon('shield', 'i i-sm')}${d.editing && d.status === 'published' ? 'المنشور راح يختفي مؤقتاً ويرجع للمراجعة بعد التعديل.' : 'المنشور ما يظهر للناس إلا بعد موافقة الإدارة.'} اقرأ <a href="/policies/posting" target="_blank">سياسة النشر</a>.</p>
    ${errorList(d.errors)}
    <form method="post" action="${d.action}" enctype="multipart/form-data" class="form" novalidate data-post-form>
      ${d.csrf}
      ${field({ name: 'title', label: TITLE_LABEL[d.type], value: v.title, required: true, max: 100 })}
      ${select({ name: 'category_id', label: 'التصنيف', options: d.categories, value: v.category_id, required: true, placeholder: 'اختر التصنيف' })}
      ${select({ name: 'area_id', label: 'المنطقة', options: d.areas, value: v.area_id ?? (d.areas.length === 1 ? String(d.areas[0][0]) : ''), required: true, placeholder: 'اختر المنطقة' })}
      ${detailFields(d)}
      ${price ? field({ name: 'price', label: price[0], value: v.price, hint: price[1] || undefined, attrs: 'inputmode="numeric"' }) : ''}
      ${textarea({ name: 'body', label: BODY_LABEL[d.type], value: v.body, max: 4000, rows: 6, required: false })}

      <fieldset class="group"><legend>التواصل</legend>
        ${field({ name: 'contact_phone', label: 'رقم التواصل', value: v.contact_phone, type: 'tel', dir: 'ltr', required: !['community', 'help'].includes(d.type), attrs: 'inputmode="tel"', hint: 'رقم عراقي يبدأ بـ 07' })}
        ${checkbox({ name: 'show_phone', label: 'إظهار الرقم للزوار', checked: v.show_phone === 'on' })}
        ${d.type === 'help' ? checkbox({ name: 'd_phone_consent', label: 'صاحب الرقم وافق على عرضه علناً', checked: v.d_phone_consent === 'on' }) : ''}
        ${checkbox({ name: 'whatsapp', label: 'الرقم عليه واتساب', checked: v.whatsapp === 'on' })}
      </fieldset>

      <fieldset class="group"><legend>الصور <span class="opt">(اختياري، حتى ٦ صور)</span></legend>
        ${d.images.length ? html`<ul class="thumbs">${d.images.map((im) => html`<li><img src="${mediaUrl(im.thumb)}" alt="" width="120" height="90"><label class="check-inline"><input type="checkbox" name="remove_image" value="${im.id}"> حذف</label></li>`)}</ul>` : ''}
        ${remaining > 0 ? html`<label for="f-images">إضافة صور</label><span class="hint" id="f-images-h">JPG أو PNG أو WebP، كل صورة أقل من ٥ ميغابايت. نزيل معلومات الموقع من الصور تلقائياً.${d.type === 'help' ? ' لا ترفع وثائق.' : ''}</span>
        <input id="f-images" type="file" name="images" accept="image/jpeg,image/png,image/webp" multiple aria-describedby="f-images-h" data-max="${remaining}">
        <ul class="thumbs" data-preview aria-live="polite"></ul>` : html`<p class="hint">وصلت للحد الأقصى. احذف صورة حتى تضيف غيرها.</p>`}
      </fieldset>

      <div class="form-actions">
        <button class="btn btn-primary btn-lg" type="submit" name="action" value="submit">${d.editing && d.status === 'pending' ? 'حفظ التعديل' : 'إرسال للمراجعة'}</button>
        ${!d.editing || d.status === 'draft' ? html`<button class="btn" type="submit" name="action" value="draft">حفظ كمسودة</button>` : ''}
      </div>
    </form>
  </div>`;
}

export function chooseTypePage(enabled: PostType[]): SafeHtml {
  return html`<div class="wrap narrow">
    <h1>أضف إعلانك</h1>
    <p class="lede">اختار نوع المنشور. كل منشور يمر بمراجعة الإدارة قبل ما يظهر.</p>
    <ul class="tiles tiles-choose">${enabled.map((t) => html`<li><a class="tile" href="/submit/${t}"><span class="tile-icon">${icon(TYPES[t].icon)}</span><span class="tile-text"><span class="tile-label">${TYPES[t].single}</span><span class="tile-blurb">${TYPES[t].blurb}</span></span></a></li>`)}</ul>
  </div>`;
}

export const valuesFromRow = (row: Record<string, unknown>, details: Record<string, unknown>): FormValues => {
  const v: FormValues = {};
  for (const k of ['title', 'body', 'category_id', 'area_id', 'price', 'contact_phone']) if (row[k] !== null && row[k] !== undefined) v[k] = String(row[k]);
  if (row.show_phone) v.show_phone = 'on';
  if (row.whatsapp) v.whatsapp = 'on';
  if (row.business_id) v.d_business_id = String(row.business_id);
  for (const [k, val] of Object.entries(details)) if (k !== 'consent_at') v['d_' + k] = String(val);
  if (details.consent_at) v.d_consent = 'on';
  return v;
};

