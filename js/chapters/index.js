// Chapter registry. To add a chapter: create chapterN.js exporting the same
// shape as chapter1.js (stages, secrets, clues, endings, resolve, reasonLines),
// import it here and replace its "coming soon" placeholder.

import { L } from '../i18n.js';
import chapter1 from './chapter1.js';

const comingSoon = (id, title, blurb) => ({
  id,
  playable: false,
  title,
  blurb,
  stages: [],
  secrets: [],
  clues: {},
  endings: {},
});

export const CHAPTERS = [
  chapter1,
  comingSoon(2, L('الطابق اللي ما موجود', 'The Floor That Isn’t There'),
    L('المصعد يوگف بطابق ما مكتوب بالأزرار. وكل الأبواب بيه تعرف اسمك.', 'The lift stops at a floor with no button. Every door on it knows your name.')),
  comingSoon(3, L('؟؟؟', '???'), L('ما نگدر نحچي عنه بعد.', 'We can’t talk about it yet.')),
];

export const getChapter = (id) => CHAPTERS.find((c) => c.id === id);
