// Tiny bilingual layer. Every user-facing string is either a plain string
// or an { ar, en } pair created with L(). Arabic is the primary language.

export const L = (ar, en) => ({ ar, en });

const SUPPORTED = ['ar', 'en'];
let lang = 'ar';

export const getLang = () => lang;

export function setLang(next) {
  lang = SUPPORTED.includes(next) ? next : 'ar';
  const root = document.documentElement;
  root.lang = lang;
  root.dir = lang === 'ar' ? 'rtl' : 'ltr';
}

/** Resolve a string or {ar,en} pair, then fill {placeholders}. */
export function t(value, vars) {
  if (value == null) return '';
  let s = typeof value === 'object' ? (value[lang] ?? value.ar ?? '') : value;
  if (typeof s === 'function') s = s(vars || {});
  if (vars) s = String(s).replace(/\{(\w+)\}/g, (m, k) => (k in vars ? vars[k] : m));
  return String(s);
}

const arDigits = '٠١٢٣٤٥٦٧٨٩';
/** Numbers in Eastern Arabic digits for Arabic, Western for English. */
export function num(n) {
  const s = String(n);
  return lang === 'ar' ? s.replace(/\d/g, (d) => arDigits[d]) : s;
}

/** Normalise free-text answers so small spelling variants are accepted. */
export function normalize(input) {
  return String(input || '')
    .toLowerCase()
    .replace(/[ً-ٰٟـ]/g, '') // harakat + tatweel
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/[٠-٩]/g, (d) => String(arDigits.indexOf(d)))
    .replace(/[^\p{L}\p{N}]+/gu, '')
    .replace(/^ال/, '')
    .replace(/^the/, '');
}

// Shared interface strings. Story text lives with each chapter.
export const UI = {
  notebook: L('الدفتر', 'Notebook'),
  menu: L('القائمة', 'Menu'),
  home: L('الرئيسية', 'Home'),
  skip: L('تخطَّ إلى المحتوى', 'Skip to content'),
  soundOn: L('تشغيل الصوت', 'Turn sound on'),
  soundOff: L('إيقاف الصوت', 'Turn sound off'),
  switchLang: L('Switch to English', 'التبديل إلى العربية'),
  langBtn: L('EN', 'ع'),

  tagline: L('بعض الأبواب من الأفضل أن تبقى مغلقة.', 'Some doors are better left closed.'),
  lead: L('إذا وصلت إلى هنا، فربما يجب أن تعرف لماذا…', 'If you made it here, maybe you should know why…'),
  openDoor: L('افتح الباب', 'Open the door'),
  continueRun: L('كمّل من وين وقفت', 'Continue where you stopped'),
  newRun: L('ابدأ جولة جديدة', 'Start a new run'),
  chapters: L('الفصول', 'Chapters'),
  secrets: L('الأسرار والنهايات', 'Secrets & endings'),
  privacy: L('الخصوصية', 'Privacy'),
  footNote: L('بلا تسجيل. بلا بيانات شخصية. كل شي محفوظ على جهازك بس.', 'No sign-up. No personal data. Everything stays on your device.'),
  enterIfDare: L('ادخل إذا تتجرأ', 'Enter if you dare'),

  challengeTitle: L('وصلك تحدّي', 'You have been challenged'),
  challengeBody: L('صديقك وصل لنهاية <strong>«{ending}»</strong> ولگى <strong>{s} من {total}</strong> أسرار. تگدر تسوي أحسن؟', 'A friend reached the ending <strong>“{ending}”</strong> and found <strong>{s} of {total}</strong> secrets. Can you do better?'),
  challengeNote: L('هذا التحدي انصنع على جهاز صديقك. الموقع ما يتحقق من نتيجته.', 'This challenge was created on your friend’s device. The site does not verify their result.'),
  acceptChallenge: L('اقبل التحدي', 'Accept the challenge'),

  stageOf: L('المرحلة {n} من {total}', 'Stage {n} of {total}'),
  continue: L('كمّل', 'Continue'),
  tryIt: L('جرّب', 'Try'),
  hint: L('تلميح', 'Hint'),
  anotherHint: L('تلميح ثاني', 'Another hint'),
  noMoreHints: L('ماكو تلميحات بعد. أنت قريب.', 'No more hints. You are close.'),
  back: L('ارجع', 'Back'),
  close: L('سكّر', 'Close'),
  cancel: L('لا، ارجع', 'No, go back'),
  confirm: L('متأكد', 'I’m sure'),
  emptyAnswer: L('اكتب شي أول.', 'Type something first.'),

  notebookEmpty: L('الدفتر فارغ. بعد ما لگيت أي دليل.', 'The notebook is empty. You haven’t found any clues yet.'),
  notebookTitle: L('دفتر الأدلة', 'Clue notebook'),
  menuTitle: L('القائمة', 'Menu'),
  restartChapter: L('أعد الفصل من البداية', 'Restart this chapter'),
  restartConfirmTitle: L('تعيد الفصل؟', 'Restart the chapter?'),
  restartConfirmBody: L('راح تبدأ جولة جديدة من المرحلة الأولى. الأسرار والنهايات اللي لگيتها تبقى محفوظة.', 'You will start a new run from stage one. Secrets and endings you found stay saved.'),

  secretFound: L('سرّ جديد: <b>{title}</b> ({n}/{total})', 'Secret found: <b>{title}</b> ({n}/{total})'),
  clueAdded: L('انضاف للدفتر: {text}', 'Added to notebook: {text}'),

  endingLabel: L('النهاية', 'Ending'),
  whyTitle: L('ليش وصلت هنا؟', 'How you got here'),
  share: L('شارك نتيجتك', 'Share your result'),
  copyLink: L('انسخ رابط التحدي', 'Copy challenge link'),
  card: L('حمّل بطاقة النتيجة', 'Download result card'),
  replay: L('العب مرة ثانية', 'Play again'),
  copied: L('انسخ الرابط. ابعثه لصديقك.', 'Link copied. Send it to a friend.'),
  shared: L('انشارك.', 'Shared.'),
  cardReady: L('البطاقة جاهزة.', 'Card ready.'),
  copyFail: L('ما گدرنا ننسخ تلقائياً. انسخ الرابط من هنا:', 'Couldn’t copy automatically. Copy the link here:'),
  shareLocalNote: L('رابط التحدي ينصنع على جهازك وبيه بس اسم النهاية وعدد الأسرار. الموقع ما يتحقق من نتائج أي أحد.', 'The challenge link is made on your device and only carries the ending name and secret count. The site does not verify anyone’s result.'),
  shareText: L('وصلت لنهاية «{ending}» بـ«لا تفتح» ولگيت {s} من {total} أسرار. تتجرأ تفتح الباب؟', 'I reached the ending “{ending}” in DON’T OPEN and found {s} of {total} secrets. Do you dare open the door?'),
  shareTitle: L('لا تفتح — DON\'T OPEN', 'DON\'T OPEN — لا تفتح'),
  cardMine: L('نهايتي', 'My ending'),
  cardSecrets: L('{s} من {total} أسرار', '{s} of {total} secrets'),
  cardDare: L('تتجرأ تفتح الباب؟', 'Do you dare open the door?'),

  chaptersTitle: L('الفصول', 'Chapters'),
  chaptersLead: L('كل فصل باب. وكل باب يفتح على غيره.', 'Every chapter is a door. Every door opens onto another.'),
  chapterN: L('الفصل {n}', 'Chapter {n}'),
  play: L('العب', 'Play'),
  resume: L('كمّل', 'Resume'),
  completed: L('مكتمل', 'Completed'),
  inProgress: L('بالنص', 'In progress'),
  comingSoon: L('قريباً', 'Coming soon'),
  comingSoonNote: L('ما عندنا موعد ثابت. لمّا ينفتح، راح تلگاه هنا.', 'No fixed date yet. When it opens, you’ll find it here.'),
  endingsCount: L('النهايات {n}/{total}', 'Endings {n}/{total}'),
  secretsCount: L('الأسرار {n}/{total}', 'Secrets {n}/{total}'),

  collectionTitle: L('الأسرار والنهايات', 'Secrets & endings'),
  collectionLead: L('كل شي هنا محفوظ على جهازك بس.', 'Everything here is saved on this device only.'),
  secretsHeading: L('الأسرار', 'Secrets'),
  endingsHeading: L('النهايات', 'Endings'),
  historyHeading: L('آخر الجولات', 'Recent runs'),
  noHistory: L('بعد ما خلصت أي جولة.', 'No finished runs yet.'),
  hiddenSecret: L('؟ ؟ ؟', '? ? ?'),
  lockedEnding: L('نهاية ما انكشفت بعد', 'An ending not yet revealed'),
  resetAll: L('امسح كل التقدّم', 'Erase all progress'),
  resetTitle: L('تمسح كل شي؟', 'Erase everything?'),
  resetBody: L('راح تنمسح الجولة الحالية، الأسرار، النهايات، والسجل من هذا الجهاز. ما تگدر ترجعها.', 'This removes the current run, secrets, endings and history from this device. It cannot be undone.'),
  resetDone: L('انمسح كل شي. البيت نساك… مؤقتاً.', 'Everything erased. The house forgot you… for now.'),
  erase: L('امسح', 'Erase'),

  privacyTitle: L('الخصوصية', 'Privacy'),
  storageWarn: L('التخزين المحلي مو متاح بهذا المتصفح، فالتقدّم ما راح ينحفظ بعد ما تسكّر الصفحة.', 'Local storage is unavailable in this browser, so progress won’t be kept after you close the page.'),
};

export const PRIVACY = {
  ar: `
    <p>«لا تفتح» قصة خيالية. ما تگدر تقرأ أفكارك، ولا تشوف كاميرتك، ولا تعرف مكانك، ولا تراقبك. كل التأثيرات النفسية جاية من الكتابة والألغاز واختياراتك.</p>
    <h2>شنو ينحفظ؟</h2>
    <ul>
      <li>تقدّمك بالقصة، الأسرار والنهايات اللي لگيتها، آخر الجولات، واللغة اللي اخترتها.</li>
      <li>كل هذا ينحفظ بـ<b>التخزين المحلي (localStorage)</b> بمتصفحك على هذا الجهاز بس. ما ينبعث لأي سيرفر.</li>
      <li>تگدر تمسحه بأي وقت من صفحة «الأسرار والنهايات» ← «امسح كل التقدّم».</li>
    </ul>
    <h2>شنو ما نطلبه؟</h2>
    <ul>
      <li>ما أكو تسجيل، ولا اسم، ولا رقم، ولا إيميل.</li>
      <li>ما نطلب كاميرا، مايكروفون، موقع، أو جهات اتصال.</li>
      <li>ما أكو تحليلات (analytics)، ولا إعلانات، ولا ملفات تتبّع، ولا بصمة جهاز.</li>
      <li>الخطوط محفوظة ويّا الموقع نفسه، فما ينطلب شي من مواقع ثانية.</li>
    </ul>
    <h2>شنو ينشارك لمّا تضغط «شارك»؟</h2>
    <ul>
      <li>رابط الموقع ويّا اسم النهاية (مثل <code>observer</code>) وعدد الأسرار اللي لگيتها. بس هذا.</li>
      <li>المشاركة تصير عن طريق تطبيقات جهازك، وأنت تختار وين تبعثها.</li>
      <li>التحدي ينصنع على جهازك، والموقع ما يتحقق من نتائج أي أحد.</li>
    </ul>
    <h2>الصوت</h2>
    <p>الصوت مطفي بالبداية. إذا شغّلته، ينولّد داخل المتصفح (Web Audio) بدون ملفات صوتية خارجية.</p>
  `,
  en: `
    <p>DON’T OPEN is fiction. It cannot read your mind, see your camera, know your location, or watch you. Every psychological effect comes from the writing, the puzzles and your choices.</p>
    <h2>What is stored?</h2>
    <ul>
      <li>Your story progress, the secrets and endings you found, your recent runs and your language choice.</li>
      <li>All of it lives in your browser’s <b>localStorage</b> on this device only. Nothing is sent to a server.</li>
      <li>You can erase it any time from “Secrets &amp; endings” → “Erase all progress”.</li>
    </ul>
    <h2>What we never ask for</h2>
    <ul>
      <li>No sign-up, name, phone number or email.</li>
      <li>No camera, microphone, location or contacts.</li>
      <li>No analytics, ads, trackers or device fingerprinting.</li>
      <li>Fonts are served with the site itself; no third-party requests.</li>
    </ul>
    <h2>What is shared when you press “Share”?</h2>
    <ul>
      <li>The site link plus the ending id (e.g. <code>observer</code>) and how many secrets you found. Nothing else.</li>
      <li>Sharing goes through your own device’s apps, and you choose where it goes.</li>
      <li>Challenges are created on your device; the site does not verify anyone’s result.</li>
    </ul>
    <h2>Sound</h2>
    <p>Sound is off by default. If you turn it on, it is synthesised in your browser (Web Audio) with no external audio files.</p>
  `,
};
