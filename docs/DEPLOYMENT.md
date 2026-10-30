# النشر

## لماذا لا يكفي GitHub Pages

GitHub Pages يستضيف ملفات ثابتة فقط. المنصة تحتاج خادماً (الحسابات، المراجعة، رفع الصور) وقاعدة بيانات على قرص دائم. لذلك أُزيل نشر Pages القديم، وبقي GitHub لاستضافة الكود وفحص CI.

## المتطلبات في أي استضافة

- Node.js 22.18 أو أحدث (أو Docker باستخدام `Dockerfile` الموجود).
- **قرص دائم** لملف SQLite ومجلد الصور. الاستضافات التي تمسح الملفات عند كل نشر (مثل الخطط المجانية بلا أقراص) ستفقد البيانات.
- HTTPS (إلزامي: الخادم يرفض العمل في الإنتاج إذا لم يبدأ `BASE_URL` بـ `https://`).
- نسخة واحدة فقط من التطبيق تكتب على قاعدة البيانات.

## الطريقة الأسهل: Render (بلا أوامر طرفية)

المستودع فيه ملف `render.yaml` يجهّز كل شيء: الخادم، والقرص الدائم على `/data`، و`SESSION_SECRET` عشوائي، وفحص الصحة.

**التكلفة:** الخطة المجانية في Render لا تحتوي قرصاً دائماً، فتضيع البيانات والصور مع كل تحديث. لذلك الملف يستخدم خطة Starter مع قرص ١ غيغابايت (مدفوعة شهرياً، وتحتاج بطاقة دفع دولية). تحقق من السعر الحالي في صفحة الأسعار عند Render قبل التأكيد.

1. أنشئ حساباً في render.com وسجّل الدخول بحساب GitHub نفسه.
2. من لوحة Render: **New ← Blueprint**، واختر المستودع `ibrahim205b-tech/don-t-open`.
3. Render يقرأ `render.yaml` ويطلب ثلاث قيم:
   - `ADMIN_NAME`: اسمك.
   - `ADMIN_PHONE`: رقمك الذي ستدخل به لوحة الإدارة (07XXXXXXXXX).
   - `ADMIN_PASSWORD`: كلمة مرور قوية (١٠ أحرف على الأقل، ولا تحتوي رقم هاتفك).
4. اضغط **Apply** وانتظر حتى تصير الحالة **Live** (عدة دقائق في أول مرة).
5. افتح الرابط الذي يظهر (مثل `https://dalil-al-maamil.onrender.com`) وتأكد أن `/healthz` يرجع `{"ok":true}`.
6. ادخل من `/login` بالرقم وكلمة المرور، وفعّل التحقق بخطوتين عندما يُطلب منك (تطبيق Google Authenticator).
7. **مهم:** ارجع إلى إعدادات الخدمة في Render ← **Environment** واحذف `ADMIN_PASSWORD`. الحساب باقٍ، ولن يُنشأ مدير آخر.

### ربط نطاق خاص (اختياري)

من إعدادات الخدمة ← **Custom Domains** أضف نطاقك (مثل `dalil-almaamil.com`) واتبع تعليمات DNS. بعدها أضف متغير `BASE_URL=https://نطاقك` في **Environment**. Render يصدر شهادة HTTPS تلقائياً.

### التحديثات والنسخ الاحتياطي

كل دمج في فرع `main` يُنشر تلقائياً. للنسخ الاحتياطي افتح **Shell** في Render وشغّل `node scripts/backup.ts`، ثم نزّل المجلد `/data/backups` دورياً. راجع [BACKUP.md](BACKUP.md).

## بديل: خادم VPS صغير + Docker + Caddy

خادم بذاكرة ١ غيغابايت يكفي للبداية. Caddy يصدر شهادة HTTPS مجانية تلقائياً.

```bash
# على الخادم
git clone https://github.com/ibrahim205b-tech/don-t-open.git /srv/dalil && cd /srv/dalil
docker build -t dalil .
docker volume create dalil-data
docker run -d --name dalil --restart unless-stopped -p 127.0.0.1:3000:3000 -v dalil-data:/data \
  -e BASE_URL=https://example.iq -e TRUST_PROXY=true -e ADMIN_REQUIRE_MFA=true \
  -e SESSION_SECRET="$(node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))")" dalil
docker exec -it dalil env ADMIN_NAME="إبراهيم علي الشويلي" ADMIN_PHONE=07XXXXXXXXX node scripts/create-admin.ts
```

> احفظ قيمة `SESSION_SECRET` في مدير أسرار أو ملف `.env` على الخادم بصلاحيات 600، وليس في GitHub. تغييرها يُنهي كل الجلسات.

ملف `/etc/caddy/Caddyfile`:

```
example.iq {
  encode zstd gzip
  reverse_proxy 127.0.0.1:3000
  request_body {
    max_size 40MB
  }
}
```

ثم: `systemctl reload caddy`. تحقق من `https://example.iq/healthz`.

### التحديث

```bash
cd /srv/dalil && git pull && docker build -t dalil . && docker rm -f dalil && docker run ... (نفس الأمر السابق)
```

الترحيلات تُطبَّق تلقائياً عند الإقلاع. خذ نسخة احتياطية قبل أي تحديث.

## بديل آخر: أي منصة تطبيقات بقرص دائم

أي منصة تدعم Docker أو Node مع قرص دائم (Persistent Disk/Volume) تعمل: اربط القرص على `/data`، واضبط المتغيرات أعلاه، وشغّل `node scripts/create-admin.ts` من وحدة التحكم (Shell) الخاصة بالمنصة. تحقق من حدود الخطة المجانية الحالية بنفسك قبل الاختيار؛ معظم الخطط المجانية لا توفر أقراصاً دائمة.

## متغيرات البيئة

راجع `.env.example`. الإلزامية في الإنتاج: `NODE_ENV=production`، `BASE_URL`، `SESSION_SECRET`. اضبط `TRUST_PROXY=true` فقط خلف وكيل عكسي موثوق (وإلا تُحسب حدود المعدل على عنوان الوكيل).

## بعد النشر

- [ ] `/healthz` يرجع `{"ok":true}`.
- [ ] الصفحة الرئيسية تعمل على الهاتف، والقفل الأخضر (HTTPS) ظاهر.
- [ ] إنشاء المدير الأول وتفعيل التحقق بخطوتين.
- [ ] إرسال منشور تجريبي من حساب عادي، والتأكد أنه لا يظهر قبل الموافقة، ثم حذفه.
- [ ] جدولة `npm run backup` يومياً ونسخ النسخ خارج الخادم.
- [ ] إضافة الموقع إلى Google Search Console وإرسال `sitemap.xml`.
