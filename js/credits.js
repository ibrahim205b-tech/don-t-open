// Project ownership and credits — the single place to edit them.
// Used by the intro screen, the site footer, the share card and page metadata.

export const CREDITS = {
  ownerEn: 'Ibrahim Ali',
  ownerAr: 'إبراهيم علي',
  project: "DON'T OPEN",
  projectAr: 'لا تفتح',
  year: 2026,

  intro: {
    createdBy: 'Created by Ibrahim Ali',
    line: 'بعض الأفكار تبدأ بفضول... وبعضها لا يُنسى بعد اكتشافه',
    signature: 'تجربة من تصميم وتطوير إبراهيم علي',
  },
};

export const copyright = () => `© ${CREDITS.year} ${CREDITS.ownerEn} — ${CREDITS.project}`;
