-- دليل المعامل: المخطط الأولي.
-- جميع الأوقات بثواني Unix (UTC). الأسعار بالدينار العراقي كأعداد صحيحة.

CREATE TABLE users (
  id             INTEGER PRIMARY KEY,
  name           TEXT    NOT NULL CHECK (length(name) BETWEEN 2 AND 60),
  -- رقم عراقي بصيغة 07XXXXXXXXX، أو معرّف حساب محذوف
  phone          TEXT    NOT NULL UNIQUE CHECK ((length(phone) = 11 AND phone GLOB '07[0-9]*') OR phone GLOB 'deleted-[0-9]*'),
  password_hash  TEXT    NOT NULL,
  role           TEXT    NOT NULL DEFAULT 'user'
                 CHECK (role IN ('super_admin', 'admin', 'moderator', 'business_owner', 'user')),
  status         TEXT    NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled', 'deleted')),
  failed_logins  INTEGER NOT NULL DEFAULT 0,
  locked_until   INTEGER,
  totp_secret    TEXT,
  totp_enabled   INTEGER NOT NULL DEFAULT 0 CHECK (totp_enabled IN (0, 1)),
  totp_last_step INTEGER,
  created_at     INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at     INTEGER NOT NULL DEFAULT (unixepoch()),
  last_login_at  INTEGER
);

CREATE TABLE sessions (
  id           TEXT    PRIMARY KEY,               -- SHA-256 للرمز؛ الرمز نفسه لا يُخزَّن
  user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  mfa_passed   INTEGER NOT NULL DEFAULT 1 CHECK (mfa_passed IN (0, 1)),
  created_at   INTEGER NOT NULL DEFAULT (unixepoch()),
  last_seen_at INTEGER NOT NULL DEFAULT (unixepoch()),
  expires_at   INTEGER NOT NULL
);
CREATE INDEX sessions_user ON sessions(user_id);
CREATE INDEX sessions_expires ON sessions(expires_at);

CREATE TABLE areas (
  id     INTEGER PRIMARY KEY,
  name   TEXT    NOT NULL UNIQUE CHECK (length(name) BETWEEN 2 AND 60),
  sort   INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1))
);

CREATE TABLE categories (
  id      INTEGER PRIMARY KEY,
  section TEXT    NOT NULL CHECK (section IN ('business', 'job', 'property', 'service', 'market', 'offer', 'community', 'help')),
  name    TEXT    NOT NULL CHECK (length(name) BETWEEN 2 AND 60),
  icon    TEXT    NOT NULL DEFAULT 'tag',
  is_food INTEGER NOT NULL DEFAULT 0 CHECK (is_food IN (0, 1)),
  sort    INTEGER NOT NULL DEFAULT 0,
  active  INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  UNIQUE (section, name)
);

-- كل محتوى عام (نشاط تجاري، وظيفة، عقار، خدمة، إعلان بيع، عرض، خبر، طلب مساعدة) صف واحد هنا.
-- الحقول الخاصة بكل نوع في details (JSON) ويتحقق منها الخادم بمخطط لكل نوع.
CREATE TABLE posts (
  id             INTEGER PRIMARY KEY,
  type           TEXT    NOT NULL CHECK (type IN ('business', 'job', 'property', 'service', 'market', 'offer', 'community', 'help')),
  user_id        INTEGER NOT NULL REFERENCES users(id),
  owner_id       INTEGER REFERENCES users(id),          -- مالك النشاط التجاري بعد اعتماد المطالبة
  business_id    INTEGER REFERENCES posts(id),          -- العرض التجاري المرتبط بنشاط
  category_id    INTEGER NOT NULL REFERENCES categories(id),
  area_id        INTEGER NOT NULL REFERENCES areas(id),
  title          TEXT    NOT NULL CHECK (length(title) BETWEEN 3 AND 100),
  body           TEXT    NOT NULL DEFAULT '' CHECK (length(body) <= 4000),
  price          INTEGER CHECK (price IS NULL OR price BETWEEN 0 AND 100000000000),
  contact_phone  TEXT    CHECK (contact_phone IS NULL OR (length(contact_phone) = 11 AND contact_phone GLOB '07[0-9]*')),
  show_phone     INTEGER NOT NULL DEFAULT 0 CHECK (show_phone IN (0, 1)),
  whatsapp       INTEGER NOT NULL DEFAULT 0 CHECK (whatsapp IN (0, 1)),
  details        TEXT    NOT NULL DEFAULT '{}' CHECK (json_valid(details) AND length(details) <= 6000),
  status         TEXT    NOT NULL DEFAULT 'draft'
                 CHECK (status IN ('draft', 'pending', 'changes_requested', 'rejected', 'published', 'hidden', 'expired', 'removed')),
  status_reason  TEXT    CHECK (status_reason IS NULL OR length(status_reason) <= 500),
  open_state     TEXT    NOT NULL DEFAULT 'unknown' CHECK (open_state IN ('open', 'closed', 'unknown')),
  verified       INTEGER NOT NULL DEFAULT 0 CHECK (verified IN (0, 1)),
  verified_by    INTEGER REFERENCES users(id),
  verified_at    INTEGER,
  is_official    INTEGER NOT NULL DEFAULT 0 CHECK (is_official IN (0, 1)),
  approved_by    INTEGER REFERENCES users(id),
  approved_at    INTEGER,
  published_at   INTEGER,
  expires_at     INTEGER,
  title_key      TEXT    NOT NULL DEFAULT '',          -- العنوان بعد التطبيع لاكتشاف التكرار
  created_at     INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at     INTEGER NOT NULL DEFAULT (unixepoch()),
  CHECK (verified = 0 OR (verified_by IS NOT NULL AND verified_at IS NOT NULL)),
  CHECK (business_id IS NULL OR type = 'offer'),
  CHECK (owner_id IS NULL OR type = 'business')
);
CREATE INDEX posts_public ON posts(type, status, published_at DESC);
CREATE INDEX posts_user ON posts(user_id, created_at DESC);
CREATE INDEX posts_owner ON posts(owner_id);
CREATE INDEX posts_queue ON posts(status, created_at);
CREATE INDEX posts_category ON posts(category_id, status);
CREATE INDEX posts_area ON posts(area_id, status);
CREATE INDEX posts_expiry ON posts(status, expires_at);
CREATE INDEX posts_dupe ON posts(user_id, title_key);

-- الانتقالات المسموح بها بين حالات المنشور. أي انتقال غير مدرج يرفضه المشغّل أدناه.
CREATE TABLE post_transitions (
  from_status TEXT NOT NULL,
  to_status   TEXT NOT NULL,
  PRIMARY KEY (from_status, to_status)
) WITHOUT ROWID;
INSERT INTO post_transitions VALUES
  ('draft', 'pending'), ('draft', 'removed'),
  ('pending', 'published'), ('pending', 'rejected'), ('pending', 'changes_requested'), ('pending', 'removed'),
  ('changes_requested', 'pending'), ('changes_requested', 'removed'),
  ('rejected', 'removed'),
  ('published', 'pending'), ('published', 'hidden'), ('published', 'expired'), ('published', 'removed'),
  ('hidden', 'published'), ('hidden', 'removed'),
  ('expired', 'pending'), ('expired', 'removed');

CREATE TRIGGER posts_insert_status BEFORE INSERT ON posts
WHEN NEW.status NOT IN ('draft', 'pending') OR NEW.approved_by IS NOT NULL OR NEW.verified <> 0
BEGIN
  SELECT RAISE(ABORT, 'new posts must start as draft or pending');
END;

CREATE TRIGGER posts_transition_guard BEFORE UPDATE OF status ON posts
WHEN NEW.status <> OLD.status
 AND NOT EXISTS (SELECT 1 FROM post_transitions WHERE from_status = OLD.status AND to_status = NEW.status)
BEGIN
  SELECT RAISE(ABORT, 'invalid status transition');
END;

-- النشر يتطلب موافقة من مشرف أو مدير ليس صاحب المنشور.
-- الاستثناء الوحيد: ما يضيفه المدير بنفسه من لوحة الإدارة (يُسجَّل في سجل التدقيق).
CREATE TRIGGER posts_publish_guard BEFORE UPDATE OF status ON posts
WHEN NEW.status = 'published' AND OLD.status <> 'published'
 AND (
   NEW.approved_by IS NULL OR NEW.approved_at IS NULL
   OR COALESCE((SELECT role FROM users WHERE id = NEW.approved_by AND status = 'active'), '') NOT IN ('super_admin', 'admin', 'moderator')
   OR ((NEW.approved_by = NEW.user_id OR NEW.approved_by IS NEW.owner_id)
       AND (SELECT role FROM users WHERE id = NEW.approved_by) NOT IN ('super_admin', 'admin'))
 )
BEGIN
  SELECT RAISE(ABORT, 'publishing requires approval by staff other than the author');
END;

CREATE TRIGGER posts_verify_guard BEFORE UPDATE OF verified, is_official ON posts
WHEN (NEW.verified = 1 AND OLD.verified = 0 OR NEW.is_official = 1 AND OLD.is_official = 0)
 AND COALESCE((SELECT role FROM users WHERE id = NEW.verified_by AND status = 'active'), '') NOT IN ('super_admin', 'admin', 'moderator')
BEGIN
  SELECT RAISE(ABORT, 'only staff can verify');
END;

-- العودة إلى المراجعة تمسح الموافقة السابقة، فلا يمكن إعادة النشر من دون موافقة جديدة.
CREATE TRIGGER posts_back_to_review AFTER UPDATE OF status ON posts
WHEN NEW.status = 'pending' AND OLD.status <> 'pending'
BEGIN
  UPDATE posts SET approved_by = NULL, approved_at = NULL WHERE id = NEW.id;
END;

CREATE TABLE post_images (
  id         INTEGER PRIMARY KEY,
  post_id    INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  file       TEXT    NOT NULL UNIQUE CHECK (file GLOB '[0-9a-f]*.webp'),
  thumb      TEXT    NOT NULL UNIQUE CHECK (thumb GLOB '[0-9a-f]*.webp'),
  width      INTEGER NOT NULL,
  height     INTEGER NOT NULL,
  sort       INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX post_images_post ON post_images(post_id, sort);

-- قائمة الطعام والمنتجات والأسعار لصفحة النشاط التجاري
CREATE TABLE post_items (
  id      INTEGER PRIMARY KEY,
  post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  name    TEXT    NOT NULL CHECK (length(name) BETWEEN 2 AND 80),
  price   INTEGER CHECK (price IS NULL OR price BETWEEN 0 AND 1000000000),
  note    TEXT    NOT NULL DEFAULT '' CHECK (length(note) <= 200),
  sort    INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX post_items_post ON post_items(post_id, sort);

CREATE TABLE post_revisions (
  id         INTEGER PRIMARY KEY,
  post_id    INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  editor_id  INTEGER REFERENCES users(id),
  snapshot   TEXT    NOT NULL CHECK (json_valid(snapshot)),
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX post_revisions_post ON post_revisions(post_id, created_at DESC);

CREATE TABLE moderation_actions (
  id          INTEGER PRIMARY KEY,
  post_id     INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  actor_id    INTEGER REFERENCES users(id),
  action      TEXT    NOT NULL,
  from_status TEXT    NOT NULL,
  to_status   TEXT    NOT NULL,
  reason      TEXT,
  created_at  INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX moderation_actions_post ON moderation_actions(post_id, created_at DESC);

CREATE TABLE business_claims (
  id            INTEGER PRIMARY KEY,
  post_id       INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  user_id       INTEGER NOT NULL REFERENCES users(id),
  message       TEXT    NOT NULL CHECK (length(message) BETWEEN 10 AND 1000),
  status        TEXT    NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  reviewed_by   INTEGER REFERENCES users(id),
  reviewed_at   INTEGER,
  note          TEXT    CHECK (note IS NULL OR length(note) <= 500),
  created_at    INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE UNIQUE INDEX business_claims_one_pending ON business_claims(post_id, user_id) WHERE status = 'pending';

CREATE TABLE reviews (
  id         INTEGER PRIMARY KEY,
  post_id    INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  user_id    INTEGER NOT NULL REFERENCES users(id),
  rating     INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment    TEXT    NOT NULL DEFAULT '' CHECK (length(comment) <= 600),
  status     TEXT    NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'published', 'hidden')),
  ip_hash    TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  UNIQUE (post_id, user_id)
);
CREATE INDEX reviews_post ON reviews(post_id, status);
CREATE INDEX reviews_user ON reviews(user_id, created_at);

CREATE TRIGGER reviews_not_own BEFORE INSERT ON reviews
WHEN EXISTS (SELECT 1 FROM posts WHERE id = NEW.post_id AND (user_id = NEW.user_id OR owner_id = NEW.user_id))
  OR NOT EXISTS (SELECT 1 FROM posts WHERE id = NEW.post_id AND type IN ('business', 'service') AND status = 'published')
BEGIN
  SELECT RAISE(ABORT, 'cannot review this post');
END;

CREATE TABLE reports (
  id              INTEGER PRIMARY KEY,
  post_id         INTEGER REFERENCES posts(id) ON DELETE CASCADE,
  review_id       INTEGER REFERENCES reviews(id) ON DELETE CASCADE,
  reporter_id     INTEGER REFERENCES users(id),
  reason          TEXT    NOT NULL CHECK (reason IN ('fraud', 'misleading', 'offensive', 'illegal', 'privacy', 'spam', 'other')),
  details         TEXT    NOT NULL DEFAULT '' CHECK (length(details) <= 600),
  status          TEXT    NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved', 'dismissed')),
  handled_by      INTEGER REFERENCES users(id),
  handled_at      INTEGER,
  resolution_note TEXT    CHECK (resolution_note IS NULL OR length(resolution_note) <= 500),
  ip_hash         TEXT,
  created_at      INTEGER NOT NULL DEFAULT (unixepoch()),
  CHECK ((post_id IS NULL) <> (review_id IS NULL))
);
CREATE INDEX reports_status ON reports(status, created_at);

CREATE TABLE featured_listings (
  id         INTEGER PRIMARY KEY,
  post_id    INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  placement  TEXT    NOT NULL CHECK (placement IN ('home', 'section')),
  starts_at  INTEGER NOT NULL,
  ends_at    INTEGER NOT NULL,
  note       TEXT    NOT NULL DEFAULT '' CHECK (length(note) <= 300),
  created_by INTEGER NOT NULL REFERENCES users(id),
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  CHECK (ends_at > starts_at)
);
CREATE INDEX featured_active ON featured_listings(placement, starts_at, ends_at);

CREATE TABLE site_settings (
  key        TEXT    PRIMARY KEY,
  value      TEXT    NOT NULL CHECK (length(value) <= 20000),
  updated_by INTEGER REFERENCES users(id),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE notifications (
  id         INTEGER PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  message    TEXT    NOT NULL CHECK (length(message) <= 600),
  post_id    INTEGER REFERENCES posts(id) ON DELETE SET NULL,
  read_at    INTEGER,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX notifications_user ON notifications(user_id, read_at, created_at DESC);

-- سجل التدقيق: إضافة فقط. لا تعديل ولا حذف حتى من داخل التطبيق.
CREATE TABLE audit_logs (
  id          INTEGER PRIMARY KEY,
  actor_id    INTEGER REFERENCES users(id),
  action      TEXT    NOT NULL,
  target_type TEXT,
  target_id   INTEGER,
  result      TEXT    NOT NULL CHECK (result IN ('ok', 'denied', 'error')),
  meta        TEXT    NOT NULL DEFAULT '{}' CHECK (json_valid(meta)),
  ip_hash     TEXT,
  created_at  INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX audit_logs_created ON audit_logs(created_at DESC);
CREATE INDEX audit_logs_actor ON audit_logs(actor_id, created_at DESC);

CREATE TRIGGER audit_logs_no_update BEFORE UPDATE ON audit_logs
BEGIN SELECT RAISE(ABORT, 'audit log is append-only'); END;
CREATE TRIGGER audit_logs_no_delete BEFORE DELETE ON audit_logs
BEGIN SELECT RAISE(ABORT, 'audit log is append-only'); END;

-- فهرس البحث: يحتوي المنشورات المنشورة فقط، بنص مُطبَّع (بلا تشكيل، وتوحيد الألف والياء والتاء المربوطة).
CREATE VIRTUAL TABLE search_index USING fts5(
  post_id UNINDEXED, title, body,
  tokenize = 'unicode61 remove_diacritics 2'
);

-- البيانات المرجعية الأساسية (ليست إعلانات): المنطقة الرئيسية والتصنيفات.
INSERT INTO areas (name, sort) VALUES ('المعامل', 1);

INSERT INTO categories (section, name, icon, is_food, sort) VALUES
  ('business', 'بقاليات وماركتات', 'cart', 0, 1),
  ('business', 'مطاعم', 'utensils', 1, 2),
  ('business', 'أفران ومحلات صمون', 'utensils', 1, 3),
  ('business', 'صيدليات', 'cross', 0, 4),
  ('business', 'أطباء وعيادات ومختبرات', 'cross', 0, 5),
  ('business', 'هواتف وصيانة', 'phone', 0, 6),
  ('business', 'ملابس', 'tag', 0, 7),
  ('business', 'أجهزة كهربائية ومنزلية', 'plug', 0, 8),
  ('business', 'مواد بناء', 'brick', 0, 9),
  ('business', 'حلاقة وصالونات تجميل', 'scissors', 0, 10),
  ('business', 'مخازن ومستودعات', 'box', 0, 11),
  ('business', 'خدمات منزلية', 'home', 0, 12),
  ('business', 'أنشطة تجارية أخرى', 'store', 0, 13),
  ('job', 'وظائف مطاعم', 'utensils', 0, 1),
  ('job', 'وظائف محلات', 'store', 0, 2),
  ('job', 'مخازن ومعامل', 'box', 0, 3),
  ('job', 'توصيل', 'bike', 0, 4),
  ('job', 'كاشير ومبيعات', 'tag', 0, 5),
  ('job', 'عمالة يومية', 'wrench', 0, 6),
  ('job', 'أصحاب مهن يبحثون عن عمل', 'user', 0, 7),
  ('job', 'دوام جزئي', 'clock', 0, 8),
  ('job', 'تدريب', 'book', 0, 9),
  ('property', 'بيوت للبيع', 'home', 0, 1),
  ('property', 'بيوت للإيجار', 'home', 0, 2),
  ('property', 'محلات تجارية', 'store', 0, 3),
  ('property', 'أراضٍ', 'map', 0, 4),
  ('property', 'مخازن ومستودعات', 'box', 0, 5),
  ('property', 'عقارات أخرى', 'building', 0, 6),
  ('service', 'كهربائيون', 'plug', 0, 1),
  ('service', 'سباكون', 'wrench', 0, 2),
  ('service', 'تبريد وتكييف', 'snow', 0, 3),
  ('service', 'صيانة موبايلات', 'phone', 0, 4),
  ('service', 'نجارون', 'wrench', 0, 5),
  ('service', 'حدادون', 'wrench', 0, 6),
  ('service', 'صباغون', 'brush', 0, 7),
  ('service', 'تنظيف', 'sparkle', 0, 8),
  ('service', 'نقل أثاث', 'truck', 0, 9),
  ('service', 'تصليح أجهزة منزلية', 'plug', 0, 10),
  ('service', 'خدمات منزلية أخرى', 'home', 0, 11),
  ('market', 'أثاث مستعمل', 'sofa', 0, 1),
  ('market', 'أجهزة كهربائية', 'plug', 0, 2),
  ('market', 'هواتف', 'phone', 0, 3),
  ('market', 'دراجات', 'bike', 0, 4),
  ('market', 'أدوات منزلية', 'home', 0, 5),
  ('market', 'معدات', 'wrench', 0, 6),
  ('market', 'مستلزمات أخرى', 'box', 0, 7),
  ('offer', 'عروض المحلات', 'tag', 0, 1),
  ('offer', 'عروض المطاعم', 'utensils', 1, 2),
  ('community', 'المدارس والدورات', 'book', 0, 1),
  ('community', 'مبادرات تطوعية', 'heart', 0, 2),
  ('community', 'حملات نظافة', 'sparkle', 0, 3),
  ('community', 'فعاليات محلية', 'calendar', 0, 4),
  ('community', 'تنبيهات الخدمات العامة', 'alert', 0, 5),
  ('community', 'أخبار المنطقة', 'megaphone', 0, 6),
  ('community', 'إعلانات عامة', 'megaphone', 0, 7),
  ('help', 'تبرع بالدم', 'drop', 0, 1),
  ('help', 'مساعدة إنسانية', 'heart', 0, 2),
  ('help', 'مبادرات خيرية', 'heart', 0, 3),
  ('help', 'طلبات دعم', 'hand', 0, 4);
