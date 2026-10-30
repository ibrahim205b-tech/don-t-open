# النشر

## لماذا لا يكفي GitHub Pages

GitHub Pages يستضيف ملفات ثابتة فقط. المنصة تحتاج خادماً (الحسابات، المراجعة، رفع الصور) وقاعدة بيانات على قرص دائم. لذلك أُزيل نشر Pages القديم، وبقي GitHub لاستضافة الكود وفحص CI.

## المتطلبات في أي استضافة

- Node.js 22.18 أو أحدث (أو Docker باستخدام `Dockerfile` الموجود).
- **قرص دائم** لملف SQLite ومجلد الصور. الاستضافات التي تمسح الملفات عند كل نشر (مثل الخطط المجانية بلا أقراص) ستفقد البيانات.
- HTTPS (إلزامي: الخادم يرفض العمل في الإنتاج إذا لم يبدأ `BASE_URL` بـ `https://`).
- نسخة واحدة فقط من التطبيق تكتب على قاعدة البيانات.

## الخيار الموصى به: خادم VPS صغير + Docker + Caddy

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

## خيار بديل: منصة تطبيقات بقرص دائم

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
