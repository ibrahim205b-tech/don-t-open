// Chapter 1 — الشقة رقم ٧ / Apartment 7
// Seven stages, seven secrets, four endings. Each stage is a render function
// that receives the engine context (see app.js → makeStageContext).

import { L, t, num, normalize, getLang } from '../i18n.js';
import { h } from '../dom.js';

/* ------------------------------------------------------------------ */
/* Secrets, clues and endings                                          */
/* ------------------------------------------------------------------ */

const secrets = [
  {
    id: 'eye',
    title: L('العين خلف الباب', 'The eye behind the door'),
    desc: L('قبل ما تدخل، أحد من جوّه جان يباوع عليك من العين السحرية.', 'Before you went in, someone inside was looking back through the peephole.'),
    hint: L('قبل ما تفتح أي باب… باوع منه.', 'Before you open a door… look through it.'),
  },
  {
    id: 'watermark',
    title: L('العلامة المائية', 'The watermark'),
    desc: L('رسالة سلمى بيها رسالة ثانية ما تبين إلا بالضوء.', 'Salma’s letter hides a second message that only shows against the light.'),
    hint: L('بعض الأوراق تحچي أكثر لمّا يعبر الضوء من خلالها.', 'Some papers say more when light passes through them.'),
  },
  {
    id: 'date',
    title: L('التاريخ المستحيل', 'The impossible date'),
    desc: L('أحد سجّل اسمه بدفتر الزوار… بتاريخ باچر.', 'Someone signed the visitors’ book… dated tomorrow.'),
    hint: L('اقرأ دفتر الزوار سطر سطر.', 'Read the visitors’ book line by line.'),
  },
  {
    id: 'room',
    title: L('غرفة الرسوم', 'The drawing room'),
    desc: L('ثلطعش شخص ماسكين إيد بعض، والرابع عشر بلا وجه.', 'Thirteen figures holding hands. The fourteenth has no face.'),
    hint: L('مو كل الأبواب بالسرداب واضحة.', 'Not every door in the cellar is obvious.'),
  },
  {
    id: 'candle',
    title: L('الشمعة المكسورة', 'The broken candle'),
    desc: L('تشتعل مرة وحدة بس، وبضوّها اسم محفور.', 'It burns only once, and its light shows a carved name.'),
    hint: L('بعد ما تشتعل الشموع كلها، أكو وحدة بعدها تنتظر.', 'After every candle is lit, one is still waiting.'),
  },
  {
    id: 'patience',
    title: L('الصمت الطويل', 'The long silence'),
    desc: L('اللي يصبر أكثر من اللازم يسمع سلمى تهمس.', 'Whoever waits longer than they should hears Salma whisper.'),
    hint: L('لمّا يجيك السؤال بالصمت، لا تجاوب بسرعة.', 'When the question comes in the silence, don’t answer quickly.'),
  },
  {
    id: 'number',
    title: L('رقمك', 'Your number'),
    desc: L('الصندوق يعرف رقمك… بس ما ينفتح بيه.', 'The box knows your number… but won’t open for it.'),
    hint: L('جرّب رقمك أنت على الصندوق.', 'Try your own number on the box.'),
  },
];

const clues = {
  time: L('ورقة المفتاح: <b>٣:١٧</b>', 'Key tag: <b>3:17</b>'),
  down: L('سلمى: «الطريق الصحيح ينزل.»', 'Salma: “The right way goes down.”'),
  visitor: L('دفتر الزوار: أنت الزائر رقم <b>١٤</b>.', 'Visitors’ book: you are visitor number <b>14</b>.'),
  reverse: L('الحايط: «بهذا البيت، حتى الوقت يمشي بالعكس.»', 'The wall: “In this house, even time runs backwards.”'),
  name: L('اسم الباب الحقيقي: <b>سِدرة</b>', 'The door’s true name: <b>SIDRA</b>'),
  mirror: L('همسة سلمى: «الوقت هو المفتاح… بس مثل ما تشوفه المراية.»', 'Salma’s whisper: “Time is the key… as a mirror sees it.”'),
};

const LEDGER_TEXT = {
  sign: L('كتبت «الزائر ١٤» بدفتر الزوار.', 'You signed “Visitor 14” in the visitors’ book.'),
  tear: L('مزّقت صفحة الأسماء وأخذتها وياك.', 'You tore out the page of names and kept it.'),
  ignore: L('تركت الدفتر وتبعت الصوت.', 'You left the book and followed the voice.'),
};

const reasonText = {
  sign: LEDGER_TEXT.sign,
  tear: LEDGER_TEXT.tear,
  ignore: LEDGER_TEXT.ignore,
  patient: L('صبرت بالصمت من أول مرة.', 'You held the silence on the first try.'),
  rushed: L('كسرت الصمت {n} مرة.', 'You broke the silence {n} time(s).'),
  stay: L('اخترت تبقى وتراقب الباب.', 'You chose to stay and watch the door.'),
  leave: L('اخترت ترجع من الباب اللي جيت منه.', 'You chose to leave the way you came.'),
  bound: L('…بس اسمك بالدفتر ربطك بالبيت، فكل باب رجّعك له.', '…but your name in the book bound you to the house, so every door led back.'),
  open: L('فتحت الباب الأحمر اللي مكتوب عليه «لا تفتح».', 'You opened the red door marked “Don’t open”.'),
  name: L('ناديت الباب باسمه الحقيقي — وهذا ما ينعرف إلا من سر.', 'You called the door by its true name — something only a secret could tell you.'),
  secrets: L('لگيت {n} من {total} أسرار بهالجولة.', 'You found {n} of {total} secrets this run.'),
  hints: L('استعملت {n} تلميح.', 'You used {n} hint(s).'),
  nohints: L('ما استعملت ولا تلميح.', 'You used no hints.'),
};

const endings = {
  observer: {
    title: L('المراقب', 'The Observer'),
    en: 'THE OBSERVER',
    tagline: L('ما طلعت. صرت أنت العين.', 'You never left. You became the eye.'),
    share: L('ما طلعت من الشقة رقم ٧… صرت أنا اللي أراقب الباب.', 'I never left Apartment 7… now I’m the one watching the door.'),
    accent: '#9fb2c4',
    body(r) {
      const intro = r.variant === 'bound'
        ? [
          L('فتحت الباب اللي جيت منه… ولگيت نفسك بنفس الممر، گبال نفس الباب، رقم ٧.', 'You opened the door you came in through… and found yourself in the same corridor, facing the same door, number 7.'),
          L('جرّبت مرة، ومرتين، وعشرة. كل باب يرجّعك هنا. اسمك مكتوب بالدفتر، والبيت ما ينسى اللي يكتبون أسماءهم.', 'Once, twice, ten times. Every door brings you back. Your name is in the book, and the house never forgets those who sign.'),
        ]
        : [
          L('سحبت الكرسي وگعدت گبال الباب. ما تدري شگد مرّ وقت؛ الساعة هنا ترجع لورا، فما يفيد تحسب.', 'You pulled the chair over and sat facing the door. You can’t tell how long passed; the clock here runs backwards, so counting is useless.'),
          L('سلمى مرّت من يمّك وهي طالعة، وحطّت إيدها على كتفك. «شكراً»، گالت، وما رجعت.', 'Salma passed you on her way out and touched your shoulder. “Thank you,” she said, and never came back.'),
        ];
      return [
        ...intro,
        L('بعد فترة، سمعت خطوات على الدرج. أحد واقف برّه، يقرأ «لا تفتح»، ويتردد.', 'After a while you hear footsteps on the stairs. Someone stands outside, reads “Don’t open”, and hesitates.'),
        L('قرّبت عينك من العين السحرية. نفس الشي اللي صار وياك بأول ليلة… بس هالمرة، أنت اللي جوّه.', 'You lean in to the peephole. The same thing that happened to you on your first night… only this time, you’re the one inside.'),
      ];
    },
  },
  escaped: {
    title: L('الناجي', 'The Escaped'),
    en: 'THE ESCAPED',
    tagline: L('طلعت. بس شي منك بقى هناك.', 'You got out. But something of you stayed behind.'),
    share: L('طلعت من الشقة رقم ٧ قبل الفجر… تقريباً كامل.', 'I got out of Apartment 7 before dawn… almost whole.'),
    accent: '#e7b46a',
    body(r) {
      const middle = r.variant === 'tear'
        ? L('بجيبك الصفحة الممزقة. لمّا وصلت للرصيف، الأسماء بيها بدت تختفي، اسم ورا اسم… كأن أصحابها طلعوا وياك. آخر اسم اختفى: سلمى.', 'The torn page is in your pocket. When you reach the pavement, the names start fading one by one… as if their owners walked out with you. The last to fade: Salma.')
        : L('التفتّ مرة وحدة للعمارة. بشبّاك الطابق الرابع، أحد يأشّرلك. ما تدري إذا جان يودّعك… لو يطلب منك ترجع.', 'You look back at the building once. In a fourth-floor window, someone is waving. You can’t tell if it’s goodbye… or a plea to come back.');
      return [
        L('نزلت الدرج بسرعة، وكل خطوة تحسها أخف من اللي گبلها. برّه، شارع الرشيد فاضي، والفجر يبيّن من ورا البنايات.', 'You take the stairs fast, each step lighter than the last. Outside, al-Rasheed Street is empty and dawn is breaking behind the buildings.'),
        middle,
        L('رجعت للبيت ونمت. بالصبح، لگيت بجيبك مفتاح نحاسي ما تتذكر أخذته. عليه ورقة صغيرة: ٣:١٧.', 'You go home and sleep. In the morning there is a brass key in your pocket you don’t remember taking. A small tag on it reads: 3:17.'),
      ];
    },
  },
  lastdoor: {
    title: L('الباب الأخير', 'The Last Door'),
    en: 'THE LAST DOOR',
    tagline: L('فتحت الباب اللي ما ينفتح.', 'You opened the door that is never opened.'),
    share: L('فتحت الباب الأخير بالشقة رقم ٧… ووراه أبواب أكثر.', 'I opened the last door in Apartment 7… and behind it were more doors.'),
    accent: '#ff4646',
    body(r) {
      const line = {
        sign: L('الرقم ١٤ هو رقمك. الدفتر ما جذب.', 'Fourteen is your number. The book didn’t lie.'),
        tear: L('الصفحة الممزقة بجيبك صارت دافية، كأنها تدلّك على الطريق.', 'The torn page in your pocket grows warm, as if pointing the way.'),
        ignore: L('الصوت اللي تبعته طول الليل صار گدّامك، مو وراك.', 'The voice you followed all night is in front of you now, not behind.'),
      }[r.ctx.ledger] || L('', '');
      return [
        L('مدّيت إيدك للباب الأحمر. ما جان مقفول. يمكن عمره ما انقفل؛ يمكن الكلمة المكتوبة عليه هي جانت القفل.', 'You reach for the red door. It isn’t locked. Maybe it never was; maybe the words on it were the lock.'),
        L('وراه ممر طويل، والممر كله أبواب. على كل باب نفس الكلمتين: «لا تفتح». وعلى واحد منها رقم بحبر بعده مبلول: ١٤.', 'Behind it, a long corridor lined with doors. Every one says the same thing: “Don’t open”. One bears a number in ink that is still wet: 14.'),
        line,
        L('سمعت وراك صوت سلمى، واضح لأول مرة: «هذا مو آخر باب… هذا أول باب.» — الفصل الثاني يبدأ من هنا.', 'Behind you, Salma’s voice, clear for the first time: “This isn’t the last door… it’s the first.” — Chapter Two begins here.'),
      ].filter((x) => t(x));
    },
  },
  unknown: {
    title: L('المجهول', 'The Unknown'),
    en: 'THE UNKNOWN',
    tagline: L('ناديت الباب باسمه… فنساك.', 'You called the door by its name… and it forgot you.'),
    share: L('ناديت الباب باسمه الحقيقي. ما أتذكر شنو صار بعدها.', 'I called the door by its true name. I don’t remember what happened next.'),
    accent: '#6a6a6a',
    light: true,
    body() {
      return [
        L('همست: «سِدرة». الشموع كلها انطفت مرة وحدة، والساعة وگفت لأول مرة من سنين.', 'You whisper: “Sidra.” Every candle dies at once, and the clock stops for the first time in years.'),
        L('الباب ما انفتح. الباب اختفى. والممر، والدفتر، والعمارة كلها صارت بيضة مثل ورقة ما انكتب عليها شي.', 'The door doesn’t open. The door is gone. The corridor, the book, the whole building turn white as an unwritten page.'),
        L('صحيت بالشارع، وبإيدك ورقة فاضية. ما تتذكر شلون وصلت، ولا ليش جيت. بس عندك إحساس غريب إنك سوّيت شي محّد سوّاه گبلك.', 'You wake in the street holding a blank sheet. You don’t remember how you got there, or why you came. Only a strange feeling that you did something no one has done before.'),
        L('بالدفتر، ما بقى غير ثلطعش اسم. ومكان الرقم ١٤… فاضي. محّد دخل. ومحّد طلع.', 'The book now holds only thirteen names. Where number 14 should be… nothing. No one went in. No one came out.'),
      ];
    },
  },
};

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

const P = (...lines) => h('div', { class: 'narration' }, lines.map((l) => h('p', { html: t(l) })));

const objective = (text) =>
  h('div', { class: 'objective' }, h('b', null, t(L('المطلوب:', 'Goal:'))), h('span', { html: t(text) }));

const isAnswer = (value, list) => list.map(normalize).includes(normalize(value));

/* ------------------------------------------------------------------ */
/* Stage 1 — THE DOOR                                                  */
/* ------------------------------------------------------------------ */

function stageDoor(ctx) {
  const F = ctx.flags;
  ctx.root.append(
    P(
      L('عمارة قديمة بشارع الرشيد. الطابق الرابع. الگلوب بالممر يرجف كأنه خايف.', 'An old building on al-Rasheed Street. Fourth floor. The bulb in the corridor trembles as if it were afraid.'),
      L('گدّامك باب خشب عليه رقم ٧، ومكتوب عليه بخط أحمر مستعجل: <b>«لا تفتح»</b>. ومن تحت الباب يطلع ضوء أحمر خفيف.', 'In front of you, a wooden door marked 7, and across it in hurried red letters: <b>“DON’T OPEN”</b>. A faint red light leaks from under it.'),
    ),
    objective(L('الباب مقفول. دوّر على المفتاح، وافتحه. اضغط على أجزاء المشهد حتى تفحصها.', 'The door is locked. Find the key and open it. Tap parts of the scene to inspect them.')),
  );

  const scene = h('div', { class: `scene${F.lamp ? ' lamp-on' : ''}`, role: 'group', 'aria-label': t(L('مشهد الباب', 'The door scene')) },
    h('div', { class: 'door' }), h('div', { class: 'door__warning', 'aria-hidden': 'true' }, t(L('لا تفتح', "DON'T OPEN"))),
    h('div', { class: 'under-light', 'aria-hidden': 'true' }), h('div', { class: 'floor', 'aria-hidden': 'true' }));
  const fb = ctx.feedback();
  const inv = h('div', { class: 'inventory', role: 'group', 'aria-label': t(L('الأشياء اللي وياك', 'What you carry')) });
  const useKey = h('button', { class: 'btn btn--primary', type: 'button', hidden: !F.key, onclick: () => openDoor() }, t(L('استعمل المفتاح', 'Use the key')));

  const spot = (cls, label, fn, used) => {
    const b = h('button', { class: `hotspot ${cls}${used ? ' is-used' : ''}`, type: 'button', onclick: () => { ctx.sfx('tap'); b.classList.add('is-used'); fn(); } },
      h('span', { class: 'hotspot__mark', 'aria-hidden': 'true' }), h('span', { class: 'hotspot__label' }, t(label)));
    scene.append(b);
    return b;
  };

  const renderInv = () => {
    inv.replaceChildren();
    if (F.key) inv.append(h('span', { class: 'inv-item' }, '🗝 ', t(L('مفتاح نحاسي — ورقته: ٣:١٧', 'Brass key — tag: 3:17'))));
  };

  spot('hs-lamp', L('الگلوب', 'The bulb'), () => {
    if (!F.lamp) {
      ctx.set('lamp', true);
      scene.classList.add('lamp-on');
      ctx.say(fb, L('نقرت الگلوب بإصبعك. رجف… وثبت. ضوّه صار أقوى، وشفت لمعة صغيرة فوگ إطار الباب.', 'You flick the bulb. It trembles… and steadies. In the stronger light, something glints above the door frame.'));
    } else {
      ctx.say(fb, L('الگلوب ثابت هسه. أول مرة من زمان، على ما يبدو.', 'The bulb is steady now. For the first time in a long while, it seems.'));
    }
  }, F.lamp);

  spot('hs-frame', L('فوگ الإطار', 'Top of the frame'), () => {
    if (F.key) return ctx.say(fb, L('ماكو شي ثاني فوگ. بس تراب، وأثر أصابع مو مالتك.', 'Nothing else up there. Just dust, and fingerprints that aren’t yours.'));
    if (!F.lamp) return ctx.say(fb, L('ظلمة. مدّيت إيدك وما لمست غير تراب. لو بس أكو ضوء أحسن…', 'Darkness. Your hand finds only dust. If only there were more light…'), 'error');
    ctx.set('key', true);
    ctx.sfx('ok');
    ctx.clue('time');
    renderInv();
    useKey.hidden = false;
    ctx.say(fb, L('مدّيت إيدك فوگ الإطار… ولگيت مفتاح نحاسي بارد. مربوطة بيه ورقة صغيرة مكتوب عليها: <b>٣:١٧</b>.', 'You reach above the frame… and find a cold brass key. A small tag tied to it reads: <b>3:17</b>.'), 'ok');
  });

  spot('hs-peep', L('العين السحرية', 'Peephole'), () => {
    ctx.say(fb, L('قرّبت عينك من العين السحرية… وشفت عين ثانية تباوع عليك من الجهة الثانية. رمشت — واختفت. الضوء الأحمر انطفى لحظة، ورجع.', 'You lean to the peephole… and another eye is looking back from the other side. You blink — it’s gone. The red light dies for a moment, then returns.'));
    ctx.secret('eye');
  });

  spot('hs-lock', L('القفل', 'The lock'), () => {
    if (!F.key) {
      ctx.say(fb, L('مقفول. والقفل بارد كأنه بنص الشتا، رغم إن الممر حار.', 'Locked. The lock is winter-cold, though the corridor is warm.'), 'error');
      return;
    }
    openDoor();
  });

  spot('hs-mat', L('ممسحة الباب', 'Doormat'), () => {
    ctx.say(fb, L('رفعت الممسحة. ماكو مفتاح — بس أثر رجلين بالتراب، ماشية لجوّه… وماكو ولا أثر طالع.', 'You lift the mat. No key — only footprints in the dust, walking in… and none walking out.'));
  });

  function openDoor() {
    if (F.opening) return;
    ctx.set('opening', true);
    ctx.sfx('door');
    scene.classList.add('door-open');
    useKey.disabled = true;
    ctx.say(fb, L('المفتاح دار بسهولة، كأن القفل جان ينتظره.', 'The key turns easily, as if the lock had been waiting for it.'), 'ok');
    ctx.later(() => ctx.next(), 1500);
  }

  renderInv();
  ctx.root.append(scene, inv, fb, h('div', { class: 'stage-actions' }, useKey, ctx.hints([
    L('الضوء يكشف أشياء. جرّب تتعامل ويّا الگلوب.', 'Light reveals things. Try the bulb.'),
    L('وين الناس دائماً يخبّون المفتاح الاحتياطي؟ مو تحت الممسحة… فوگ.', 'Where do people always hide a spare key? Not under the mat… above.'),
  ])));
  if (F.opening) { scene.classList.add('door-open'); ctx.later(() => ctx.next(), 300); }
}

/* ------------------------------------------------------------------ */
/* Stage 2 — THE MESSAGE                                               */
/* ------------------------------------------------------------------ */

const LETTER = {
  ar: [
    'سامحني، ما جان لازم تجي. بس دام وصلت، اسمعني زين.',
    'رحت أدوّر على أختي بهالبيت، وكل ما فتحت باب، لگيت باب ثاني.',
    'دائماً الساعة ٣:١٧ يصير هدوء غريب، كأن البيت يتنفّس.',
    'الأبواب هنا تحسب الداخلين. وآني جنت رقم ١٣.',
    'بس لا تصدّق الدرج اللي يصعد. الطريق الصحيح ينزل.',
  ],
  en: [
    'Come no further — you should never have come. But since you’re here, listen.',
    'Every door I opened in this house led me to another door.',
    'Long silences fall at exactly 3:17, as if the house is breathing.',
    'Learn this: the doors here count whoever enters. I was number 13.',
    'And don’t trust the stairs that climb. The right way goes down.',
    'Remember my name.',
  ],
};

function stageMessage(ctx) {
  const F = ctx.flags;
  ctx.root.append(
    P(
      L('جوّه، الشقة فارغة إلا من ميز، وكرسي، وگلوب معلّق. ريحة ورق قديم وشمع.', 'Inside, the flat is empty except for a table, a chair and a hanging bulb. It smells of old paper and wax.'),
      L('على الميز ورقة مطوية مكتوب عليها: «للزائر اللي بعدي». والباب الثاني بالغرفة عليه قفل غريب: بدل الأرقام، حروف.', 'On the table, a folded note: “For the visitor after me.” The only other door has a strange lock: letters instead of numbers.'),
    ),
  );
  const lines = LETTER[getLang()] || LETTER.ar;
  const letter = h('article', { class: `letter${F.backlit ? ' backlit' : ''}`, 'aria-label': t(L('رسالة سلمى', 'Salma’s letter')) },
    h('div', { class: 'letter__head' }, t(L('للزائر اللي بعدي،', 'To the visitor after me,'))),
    lines.map((l) => h('p', { class: 'letter__line' }, l)),
    h('p', { class: 'letter__sig' }, t(L('— سلمى', '— Salma'))),
    h('div', { class: 'letter__watermark', 'aria-hidden': F.backlit ? 'false' : 'true' },
      t(L('إذا وصلت للنهاية، لا تختار. نادِ الباب باسمه الحقيقي: «سِدرة».', 'If you reach the end, don’t choose. Call the door by its true name: “SIDRA”.'))),
  );
  const fb = ctx.feedback();
  const lightBtn = h('button', { class: 'btn btn--ghost', type: 'button', 'aria-pressed': F.backlit ? 'true' : 'false', onclick: () => {
    const on = !letter.classList.contains('backlit');
    letter.classList.toggle('backlit', on);
    lightBtn.setAttribute('aria-pressed', on ? 'true' : 'false');
    letter.querySelector('.letter__watermark').setAttribute('aria-hidden', on ? 'false' : 'true');
    ctx.set('backlit', on);
    ctx.sfx('tap');
    if (on) {
      ctx.say(fb, L('رفعت الورقة گبال الگلوب. الحبر صار باهت… وطلعت من ورا الكلام جملة ثانية، مكتوبة بحبر شفاف: «إذا وصلت للنهاية، لا تختار. نادِ الباب باسمه الحقيقي: <b>سِدرة</b>».', 'You hold the paper up to the bulb. The ink fades… and behind it appears another sentence in clear ink: “If you reach the end, don’t choose. Call the door by its true name: <b>SIDRA</b>.”'));
      ctx.secret('watermark');
      ctx.clue('name');
    } else {
      ctx.say(fb, '');
    }
  } }, t(L('قرّب الورقة من الگلوب', 'Hold the paper to the bulb')));

  const input = h('input', { class: 'field', id: 's2-answer', type: 'text', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', placeholder: t(L('اكتب الكلمة…', 'Type the word…')), disabled: F.solved });
  const lockFb = ctx.feedback();
  const go = h('button', { class: 'btn btn--primary', type: 'submit', disabled: F.solved }, t(L('دوّر القفل', 'Turn the lock')));
  const cont = ctx.continueBtn(L('انزل', 'Go down'));
  cont.hidden = !F.solved;
  const form = h('form', { class: 'word-lock', novalidate: true, onsubmit: (e) => {
    e.preventDefault();
    const v = input.value.trim();
    if (!v) return ctx.say(lockFb, t(L('اكتب شي أول.', 'Type something first.')), 'error');
    if (isAnswer(v, ['سرداب', 'السرداب', 'cellar', 'basement', 'the cellar'])) {
      ctx.set('solved', true);
      ctx.clue('down');
      ctx.sfx('ok');
      input.disabled = true;
      go.disabled = true;
      cont.hidden = false;
      ctx.say(lockFb, L('الحروف تحرّكت وحدها وتصفّطت. القفل انفتح… وورا الباب درج حجر ينزل لتحت، للظلمة.', 'The letters shift on their own and click into place. The lock opens… behind the door, stone steps lead down into the dark.'), 'ok');
      cont.focus();
      return;
    }
    const tries = ctx.set('tries', (F.tries || 0) + 1);
    ctx.sfx('error');
    let msg;
    if (isAnswer(v, ['سلمى', 'salma'])) msg = L('سلمى مو مكان. هي اللي كتبت الرسالة.', 'Salma isn’t a place. She wrote the letter.');
    else if (isAnswer(v, ['سدره', 'sidra'])) msg = L('القفل ارتجف… بس هذا الاسم مو إله. احتفظ بيه للنهاية.', 'The lock shivers… but that name isn’t for it. Keep it for the end.');
    else if (tries >= 3) msg = L('القفل ما يتحرك. ما تريد تجرّب «تلميح»؟ الرسالة تحچي أكثر مما تقرأ.', 'The lock won’t move. Why not try a hint? The letter says more than you are reading.');
    else msg = L('القفل ما يتحرك. القفل يسأل «وين أروح؟» — والجواب مخبّى بالرسالة نفسها.', 'The lock won’t move. It asks “Where do I go?” — the answer hides in the letter itself.');
    ctx.say(lockFb, msg, 'error');
    ctx.shake(input);
  } }, input, go);

  ctx.root.append(
    letter,
    h('div', { class: 'btn-row' }, lightBtn),
    fb,
    objective(L('القفل يسأل: <b>«وين أروح؟»</b> — لگّي الكلمة المخبّاية بالرسالة.', 'The lock asks: <b>“Where do I go?”</b> — find the word hidden in the letter.')),
    h('label', { class: 'lbl', for: 's2-answer' }, t(L('الكلمة', 'The word'))),
    form,
    lockFb,
    h('div', { class: 'stage-actions' }, cont, ctx.hints([
      L('لا تقرأ الأسطر بالعرض. اقرأها بالطول.', 'Don’t read the lines across. Read them down.'),
      getLang() === 'en'
        ? L('', 'Take the first letter of every line, top to bottom.')
        : L('خذ أول حرف من كل سطر، من فوگ لجوّه: «س»، «ر»… كمّل.', ''),
      L('أول الحروف تكوّن مكان تحت البيت.', 'The first letters spell a place beneath the house.'),
    ])),
  );
}

/* ------------------------------------------------------------------ */
/* Stage 3 — THE CHOICE                                                */
/* ------------------------------------------------------------------ */

const LEDGER = [
  ['حجي عبود', 'Hajji Abboud', '١٩٥٨', '1958'],
  ['أم قاسم', 'Umm Qasim', '١٩٦٣', '1963'],
  ['مجهول', 'Unknown', '١٩٧١', '1971'],
  ['نوري', 'Nouri', '١٩٧٩', '1979'],
  ['سعاد', 'Suad', '١٩٨٤', '1984'],
  ['أبو زينب', 'Abu Zainab', '١٩٩١', '1991'],
  ['بلا اسم', 'No name', '١٩٩٧', '1997'],
  ['فراس', 'Firas', '٢٠٠٣', '2003'],
  ['— — —', '— — —', 'باچر', 'tomorrow'],
  ['هدى', 'Huda', '٢٠١١', '2011'],
  ['علي', 'Ali', '٢٠١٤', '2014'],
  ['مريم', 'Maryam', '٢٠١٩', '2019'],
  ['سلمى', 'Salma', '٢٠٢٤', '2024'],
];

function stageChoice(ctx) {
  const F = ctx.flags;
  const choice = ctx.run.choices.ledger;

  if (F.inRoom) return renderRoom(ctx);

  ctx.root.append(P(
    L('نزلت للسرداب. ريحة رطوبة وشمع محروق. بنص السرداب منضدة عليها دفتر زوّار جلده متشقق، وقلم حبر بعده مبلول.', 'You go down into the cellar. Damp, and burnt wax. In the middle, a stand holds a cracked leather visitors’ book and a pen whose ink is still wet.'),
    L('من ورا الحايط، صوت واطي يدندن أغنية قديمة. وبزاوية السرداب باب صغير، مفتوح شوية.', 'Behind the wall, a low voice hums an old song. In a corner of the cellar, a small door stands ajar.'),
  ));

  const fb = ctx.feedback();
  const lang = getLang();
  const list = h('ol', null, LEDGER.map((row, i) => {
    const n = h('span', { class: 'n' }, num(i + 1));
    const name = lang === 'en' ? row[1] : row[0];
    const date = lang === 'en' ? row[3] : row[2];
    if (i === 8) {
      return h('li', { class: `is-blank${choice === 'tear' ? ' is-torn' : ''}` }, h('button', { type: 'button', 'aria-label': t(L('السطر ٩: اسم مشطوب، التاريخ باچر', 'Line 9: name scratched out, dated tomorrow')), onclick: () => {
        ctx.sfx('tap');
        ctx.say(fb, L('الحبر بهذا السطر بعده مبلول. الاسم مشخوط لحد ما تمزّقت الورقة. التاريخ: <b>باچر</b>. يمكن الدفتر ما يسجّل اللي دخلوا… يسجّل اللي راح يدخلون.', 'The ink on this line is still wet. The name is scratched until the paper tore. The date: <b>tomorrow</b>. Maybe the book doesn’t record who came… but who will.'));
        ctx.secret('date');
      } }, h('span', null, n, ' ', name), h('span', { class: 'd' }, date)));
    }
    return h('li', { class: choice === 'tear' ? 'is-torn' : '' }, h('span', null, n, ' ', name), h('span', { class: 'd' }, date));
  }));
  if (choice === 'sign') list.append(h('li', { class: 'is-yours' }, h('span', null, h('span', { class: 'n' }, num(14)), ' ', t(L('الزائر ١٤', 'Visitor 14'))), h('span', { class: 'd' }, t(L('هسه', 'now')))));
  else list.append(h('li', null, h('span', null, h('span', { class: 'n' }, num(14)), ' ', '……………'), h('span', { class: 'd' }, '')));

  ctx.root.append(h('section', { class: 'ledger', 'aria-label': t(L('دفتر الزوار', 'Visitors’ book')) },
    h('div', { class: 'ledger__title' }, t(L('دفتر الزوار — الشقة رقم ٧', 'Visitors’ book — Apartment 7'))), list));
  ctx.clue('visitor');

  ctx.root.append(fb, h('div', { class: 'side-door' }, h('button', { class: 'btn btn--link', type: 'button', onclick: () => {
    ctx.sfx('tap');
    ctx.set('inRoom', true);
    ctx.rerender();
  } }, t(L('ادخل الباب الصغير بالزاوية (اختياري)', 'Step through the small corner door (optional)')))));

  if (!choice) {
    ctx.root.append(objective(L('ثلطعش اسم، وسطر فارغ رقمه ١٤ — رقمك. شتسوي بالدفتر؟ <b>اختيارك راح يأثر على اللي جاي.</b>', 'Thirteen names, and an empty line numbered 14 — yours. What do you do with the book? <b>Your choice will shape what follows.</b>')));
    const opt = (id, title, desc) => h('button', { class: 'choice', type: 'button', onclick: () => {
      ctx.choose('ledger', id);
      ctx.sfx(id === 'tear' ? 'error' : 'ok');
      ctx.rerender();
    } }, h('span', { class: 'choice__t' }, t(title)), h('span', { class: 'choice__d' }, t(desc)));
    ctx.root.append(h('div', { class: 'choices' },
      opt('sign', L('اكتب «الزائر ١٤» بالدفتر', 'Write “Visitor 14” in the book'), L('البيت يحب اللي يحترمون قوانينه.', 'The house likes those who respect its rules.')),
      opt('tear', L('مزّق صفحة الأسماء', 'Tear out the page of names'), L('محّد لازم ينحسب. ولا حتى أنت.', 'No one should be counted. Not even you.')),
      opt('ignore', L('اترك الدفتر واتبع الصوت', 'Leave the book and follow the voice'), L('أحد يدندن ورا الحايط. يمكن يحتاجك.', 'Someone is humming behind the wall. Maybe they need you.')),
    ));
  } else {
    const after = {
      sign: L('كتبت. الحبر دخل بالورقة كأنها شربته. بمكان ما فوگ، باب انسدّ بهدوء.', 'You write. The paper drinks the ink. Somewhere above, a door closes softly.'),
      tear: L('مزّقت الصفحة. ثلطعش اسم صاروا بإيدك. السرداب كله ارتجف، والشموع انطفت مرة وحدة.', 'You tear the page. Thirteen names are in your hand. The whole cellar shudders, and every candle goes out at once.'),
      ignore: L('تركت الدفتر. الصوت يدندن أغنية قديمة… ويبتعد كل ما تقرّب، لحد ما وصلت لحايط عليه شموع.', 'You leave the book. The voice hums an old song… drifting away as you approach, until you reach a wall of candles.'),
    }[choice];
    ctx.root.append(h('div', { class: 'feedback feedback-box is-story' }, h('p', { html: t(after) })),
      h('div', { class: 'stage-actions' }, ctx.continueBtn()));
  }
}

function renderRoom(ctx) {
  ctx.root.append(P(
    L('غرفة ضيقة، حيطانها مليانة رسوم أطفال بالطباشير. نفس الرسمة مكررة مئات المرات:', 'A narrow room, its walls covered in chalk drawings. The same picture, repeated hundreds of times:'),
  ));
  const figures = h('div', { class: 'drawing', role: 'img', 'aria-label': t(L('ثلطعش شخص ماسكين إيد بعض، والرابع عشر مرسوم بس نصّه وبلا وجه', 'Thirteen stick figures holding hands; the fourteenth is half-drawn with no face')) });
  for (let i = 0; i < 14; i++) figures.append(h('span', { class: `stick${i === 13 ? ' stick--half' : ''}` }, h('i'), h('b')));
  ctx.root.append(figures, P(
    L('ثلطعش شخص ماسكين إيد بعض. والرابع عشر… مرسوم بس نصّه، بلا وجه. كأن اللي رسمه ينتظر يشوف شكله.', 'Thirteen figures holding hands. The fourteenth… only half drawn, faceless. As if whoever drew it is still waiting to see what it looks like.'),
  ));
  ctx.secret('room');
  ctx.root.append(h('div', { class: 'stage-actions' }, h('button', { class: 'btn', type: 'button', onclick: () => {
    ctx.set('inRoom', false);
    ctx.rerender();
  } }, t(L('ارجع للدفتر', 'Back to the book')))));
}

/* ------------------------------------------------------------------ */
/* Stage 4 — THE PATTERN (lights-out with candles)                     */
/* ------------------------------------------------------------------ */

const NEIGHBOURS = Array.from({ length: 9 }, (_, i) => {
  const r = Math.floor(i / 3);
  const c = i % 3;
  const out = [i];
  if (r > 0) out.push(i - 3);
  if (r < 2) out.push(i + 3);
  if (c > 0) out.push(i - 1);
  if (c < 2) out.push(i + 1);
  return out;
});

function press(grid, i) {
  const g = grid.slice();
  for (const j of NEIGHBOURS[i]) g[j] = !g[j];
  return g;
}

/** Smallest set of presses that lights every candle (3×3 is always solvable). */
export function solveCandles(grid) {
  let best = null;
  for (let mask = 0; mask < 512; mask++) {
    let g = grid;
    const presses = [];
    for (let i = 0; i < 9; i++) if (mask & (1 << i)) { g = press(g, i); presses.push(i); }
    if (g.every(Boolean) && (!best || presses.length < best.length)) best = presses;
  }
  return best || [];
}

function startGrid(ledger) {
  if (ledger === 'tear') return Array(9).fill(false); // the tear blew every candle out
  const presses = ledger === 'sign' ? [1, 5, 6] : [0, 4, 8];
  return presses.reduce((g, i) => press(g, i), Array(9).fill(true));
}

function stagePattern(ctx) {
  const F = ctx.flags;
  const ledger = ctx.run.choices.ledger;
  if (!Array.isArray(F.grid) || F.grid.length !== 9) ctx.set('grid', startGrid(ledger));
  if (typeof F.moves !== 'number') ctx.set('moves', 0);

  ctx.root.append(P(
    ledger === 'tear'
      ? L('بالظلمة، تحسست الحايط لحد ما لگيت تسع شموع، كلها مطفية من الهزّة. محفور تحتها:', 'In the dark you feel along the wall until you find nine candles, all blown out by the tremor. Carved beneath them:')
      : L('على الحايط تسع شموع مرتبة بمربع، بعضها شاعل وبعضها مطفي. محفور تحتها:', 'Nine candles in a square on the wall, some lit, some not. Carved beneath them:'),
    L('<b>«لمّا يشتعلن كلهن، الحايط يحچي.»</b>', '<b>“When all of them burn, the wall will speak.”</b>'),
  ), objective(L('ولّع الشموع التسعة كلها. كل لمسة تبدّل الشمعة نفسها واللي يمها مباشرة (فوگ، جوّه، يمين، يسار) — اللي شاعلة تنطفي، واللي مطفية تشتعل.', 'Light all nine candles. Each touch flips that candle and the ones directly beside it (up, down, left, right) — lit ones go out, dark ones light.')));

  const wall = h('div', { class: `wall${F.solved ? ' is-solved' : ''}` });
  const gridEl = h('div', { class: 'candles', role: 'group', 'aria-label': t(L('شبكة الشموع ٣×٣', '3×3 candle grid')) });
  const moves = h('p', { class: 'moves', 'aria-live': 'polite' });
  const fb = ctx.feedback();
  const buttons = [];

  const label = (i, lit) => t(L('شمعة {n}، {s}', 'Candle {n}, {s}'), { n: num(i + 1), s: t(lit ? L('شاعلة', 'lit') : L('مطفية', 'out')) });

  const paint = () => {
    F.grid.forEach((lit, i) => {
      buttons[i].classList.toggle('is-lit', lit);
      buttons[i].setAttribute('aria-pressed', lit ? 'true' : 'false');
      buttons[i].setAttribute('aria-label', label(i, lit));
      buttons[i].disabled = Boolean(F.solved);
    });
    moves.textContent = t(L('اللمسات: {n} · الشاعلة: {l} من ٩', 'Touches: {n} · Lit: {l} of 9'), { n: num(F.moves), l: num(F.grid.filter(Boolean).length) });
  };

  for (let i = 0; i < 9; i++) {
    const b = h('button', { class: 'candle', type: 'button', onclick: () => {
      if (F.solved) return;
      buttons.forEach((x) => x.classList.remove('is-hint'));
      ctx.set('grid', press(F.grid, i));
      ctx.set('moves', F.moves + 1);
      ctx.sfx('tap');
      paint();
      if (F.grid.every(Boolean)) solved(true);
    } }, h('span', { class: 'candle__flame', 'aria-hidden': 'true' }), h('span', { class: 'candle__body', 'aria-hidden': 'true' }));
    buttons.push(b);
    gridEl.append(b);
  }
  wall.append(gridEl);
  const wallText = h('p', { class: 'wall-text', hidden: !F.solved }, t(L('«بهذا البيت، حتى الوقت يمشي بالعكس.»', '“In this house, even time runs backwards.”')));
  wall.append(wallText);

  const reset = h('button', { class: 'btn btn--ghost', type: 'button', onclick: () => {
    ctx.set('grid', startGrid(ledger));
    ctx.set('moves', 0);
    buttons.forEach((x) => x.classList.remove('is-hint'));
    paint();
    ctx.say(fb, L('رجّعت الشموع مثل ما جانت.', 'The candles are back as they were.'));
  } }, t(L('رجّع الشموع', 'Reset candles')));

  const broken = h('button', { class: 'btn btn--link broken-candle', type: 'button', onclick: () => {
    ctx.sfx('tap');
    if (!F.solved) return ctx.say(fb, L('شمعة صغيرة مكسورة بالزاوية. حاولت تولّعها… ما تشتعل. كأنها تنتظر الباقيات.', 'A small broken candle in the corner. You try to light it… nothing. As if it’s waiting for the others.'));
    if (F.broken) return ctx.say(fb, L('الشمعة المكسورة ذابت. بس الاسم بعده محفور: سِدرة.', 'The broken candle has melted away. The name is still carved: Sidra.'));
    ctx.set('broken', true);
    ctx.say(fb, L('قرّبتها من الشموع الشاعلة… واشتعلت لحظة وحدة، وبضوّها شفت اسم محفور بالحايط، صغير جداً: <b>«سِدرة»</b>. بعدين ذابت كلها.', 'You touch it to the burning candles… it flares for a single moment, and in its light you see a tiny name carved in the wall: <b>“SIDRA”</b>. Then it melts away.'));
    ctx.secret('candle');
    ctx.clue('name');
  } }, h('span', { class: 'broken-candle__icon', 'aria-hidden': 'true' }), t(L('الشمعة المكسورة بالزاوية', 'The broken candle in the corner')));

  const cont = ctx.continueBtn();
  cont.hidden = !F.solved;

  function solved(fresh) {
    ctx.set('solved', true);
    wall.classList.add('is-solved');
    wallText.hidden = false;
    reset.hidden = true;
    cont.hidden = false;
    paint();
    if (fresh) {
      ctx.sfx('ok');
      ctx.clue('reverse');
      ctx.say(fb, L('آخر شمعة اشتعلت، والحروف المحفورة بالحايط بدت تلمع بضو الشموع.', 'The last candle catches, and letters carved in the wall begin to glow in the candlelight.'), 'ok');
      cont.focus();
    }
  }

  ctx.root.append(wall, moves, h('div', { class: 'btn-row btn-row--center' }, broken), fb,
    h('div', { class: 'stage-actions' }, h('div', { class: 'btn-row' }, cont, reset), ctx.hints([
      L('لمس نفس الشمعة مرتين يلغي اللمسة الأولى. فكّر بكل شمعة: تلمسها، لو لا.', 'Touching the same candle twice cancels out. For each candle, decide: touch it or not.'),
      L('هسه راح يضوي لك مكان لمسة صحيحة. اتبعه وشوف شنو يصير.', 'A correct touch will glow for you now. Follow it and watch.'),
      L('كل ما تريد، اضغط «تلميح» مرة ثانية حتى يأشّر على اللمسة الجاية.', 'Whenever you like, press hint again to mark the next touch.'),
    ], (idx) => {
      if (idx >= 1 && !F.solved) {
        const sol = solveCandles(F.grid);
        buttons.forEach((x) => x.classList.remove('is-hint'));
        if (sol.length) buttons[sol[0]].classList.add('is-hint');
      }
    }, { repeatLast: true })));
  paint();
  if (F.solved) solved(false);
}

/* ------------------------------------------------------------------ */
/* Stage 5 — THE SILENCE                                               */
/* ------------------------------------------------------------------ */

const CLOCK_SVG = (() => {
  let ticks = '';
  for (let i = 0; i < 60; i++) {
    const major = i % 5 === 0;
    ticks += `<line class="tick${major ? ' major' : ''}" x1="100" y1="${major ? 16 : 20}" x2="100" y2="26" transform="rotate(${i * 6} 100 100)"/>`;
  }
  return `<svg viewBox="0 0 200 200" class="clock" role="img"><circle class="face" cx="100" cy="100" r="92"/>${ticks}
    <line class="hand-h" x1="100" y1="100" x2="100" y2="58"/>
    <line class="hand-m" x1="100" y1="104" x2="100" y2="34"/>
    <line class="hand-s" x1="100" y1="112" x2="100" y2="28"/>
    <circle class="pin" cx="100" cy="100" r="4"/></svg>`;
})();

const SILENCE_SECONDS = 12;
const PATIENCE_SECONDS = 15;

function stageSilence(ctx) {
  const F = ctx.flags;
  const ledger = ctx.run.choices.ledger;
  ctx.silent(true);

  const wrap = h('div', { class: 'silence' });
  const line = h('p', { class: 'silence__line', 'aria-live': 'polite' });
  const clockWrap = h('div', { html: CLOCK_SVG });
  const svg = clockWrap.firstElementChild;
  svg.setAttribute('aria-label', t(L('ساعة حايط قديمة', 'An old wall clock')));
  const meter = h('div', { class: 'silence__meter', 'aria-hidden': 'true' }, h('span'));
  const area = h('div', { style: { width: '100%' } });
  wrap.append(line, clockWrap, meter, area);
  ctx.root.append(wrap);

  // The clock starts at 3:17 and runs backwards, one second at a time.
  let secs = 3 * 3600 + 17 * 60;
  const draw = () => {
    const s = secs % 60;
    const m = Math.floor(secs / 60) % 60;
    const hr = Math.floor(secs / 3600) % 12;
    svg.querySelector('.hand-s').setAttribute('transform', `rotate(${s * 6} 100 100)`);
    svg.querySelector('.hand-m').setAttribute('transform', `rotate(${(m + s / 60) * 6} 100 100)`);
    svg.querySelector('.hand-h').setAttribute('transform', `rotate(${(hr + m / 60) * 30} 100 100)`);
  };
  draw();
  ctx.every(() => { secs = (secs - 1 + 43200) % 43200; draw(); }, 1000);

  const say = (txt) => { line.textContent = t(txt); };
  let phase = 'waiting';
  let waited = 0;
  let idle = 0;
  const bar = meter.firstElementChild;

  if (F.solved) return showSolved();

  const whisper = {
    sign: L('من مكان قريب، همسة: «أهلاً بيك بالبيت… يا ١٤.»', 'From somewhere close, a whisper: “Welcome home… fourteen.”'),
    tear: L('الحيطان تتشقق بصمت. البيت زعلان منك.', 'The walls crack in silence. The house is angry with you.'),
    ignore: L('الصوت اللي جنت تتبعه… صار وراك تماماً.', 'The voice you were following… is right behind you now.'),
  }[ledger];

  const begin = () => {
    phase = 'waiting';
    waited = 0;
    bar.style.width = '0%';
    area.replaceChildren();
    say(L('فجأة… كل شي سكت.', 'Suddenly… everything goes quiet.'));
    ctx.later(() => phase === 'waiting' && say(L('لا تلمس أي شي. بس انتبه.', 'Don’t touch anything. Just pay attention.')), 2600);
  };

  ctx.every(() => {
    if (phase === 'waiting') {
      waited += 1;
      bar.style.width = `${Math.min(100, (waited / SILENCE_SECONDS) * 100)}%`;
      if (waited === 7) say(whisper);
      if (waited >= SILENCE_SECONDS) ask();
    } else if (phase === 'asking') {
      idle += 1;
      if (idle >= PATIENCE_SECONDS && !ctx.hasSecretThisRun('patience')) {
        ctx.secret('patience');
        ctx.clue('mirror');
        say(L('بالصمت الطويل، سمعت سلمى تهمس: «الوقت هو المفتاح… بس مثل ما تشوفه المراية.»', 'In the long silence, Salma whispers: “Time is the key… as a mirror sees it.”'));
      }
    }
  }, 1000);

  const breakSilence = (e) => {
    if (e.type === 'keydown' && ['Tab', 'Shift', 'Alt', 'Control', 'Meta'].includes(e.key)) return;
    if (phase === 'waiting') {
      ctx.run.rushed += 1;
      ctx.save();
      ctx.sfx('error');
      phase = 'broken';
      say(L('استعجلت… الصمت انكسر. نعيد من جديد.', 'Too soon… the silence broke. Again.'));
      ctx.later(begin, 2200);
    } else if (phase === 'asking') {
      idle = 0;
    }
  };
  ctx.on(ctx.root, 'pointerdown', breakSilence);
  ctx.on(document, 'keydown', breakSilence);

  function ask() {
    phase = 'asking';
    idle = 0;
    bar.style.width = '100%';
    say(L('شنو لاحظت؟', 'What did you notice?'));
    const fb = ctx.feedback();
    const opt = (id, text) => h('button', { class: 'choice', type: 'button', onclick: () => {
      if (id === 'backwards') {
        ctx.set('solved', true);
        ctx.sfx('ok');
        showSolved(true);
        return;
      }
      ctx.sfx('error');
      const why = {
        candle: L('لا، الشموع بعدها شاعلة. ركّز على الشي الوحيد اللي يتحرّك.', 'No — the candles still burn. Watch the only thing that moves.'),
        nothing: L('دائماً أكو شي يتغيّر بالصمت. بس لازم تشوفه.', 'Something always changes in silence. You just have to see it.'),
        door: L('الباب بمكانه. بس شي ثاني مو بمكانه.', 'The door is where it was. Something else isn’t.'),
      }[id];
      ctx.say(fb, why, 'error');
    } }, h('span', { class: 'choice__t' }, t(text)));
    area.replaceChildren(
      h('div', { class: 'choices' },
        opt('candle', L('الشموع انطفت', 'The candles went out')),
        opt('backwards', L('الساعة تمشي بالعكس', 'The clock runs backwards')),
        opt('door', L('الباب انفتح وحده', 'The door opened by itself')),
        opt('nothing', L('ما تغيّر أي شي', 'Nothing changed')),
      ),
      fb,
      h('div', { class: 'btn-row btn-row--center' }, h('button', { class: 'btn btn--link', type: 'button', onclick: (e) => { e.stopPropagation(); begin(); } }, t(L('اسمع الصمت مرة ثانية', 'Listen to the silence again')))),
    );
    area.querySelector('.choice').focus({ preventScroll: true });
  }

  function showSolved(fresh) {
    phase = 'done';
    meter.hidden = true;
    say(L('صح. عقرب الثواني يدور بالعكس، والساعة ترجع من ٣:١٧ لورا.', 'Yes. The second hand turns the wrong way, and the clock is running back from 3:17.'));
    const cont = ctx.continueBtn();
    area.replaceChildren(h('div', { class: 'btn-row btn-row--center', style: { marginTop: '18px' } }, cont));
    if (fresh) cont.focus();
  }

  begin();
}

/* ------------------------------------------------------------------ */
/* Stage 6 — THE SECRET                                                */
/* ------------------------------------------------------------------ */

function stageSecret(ctx) {
  const F = ctx.flags;
  const ledger = ctx.run.choices.ledger;
  if (!Array.isArray(F.dials) || F.dials.length !== 3) ctx.set('dials', [0, 0, 0]);

  ctx.root.append(P(
    L('ورا الساعة، بالحايط، صندوق حديد صغير. عليه ثلاث أقراص أرقام، ومحفور فوگها:', 'Behind the clock, set into the wall, is a small iron box with three number dials. Engraved above them:'),
    L('<b>«الوقت اللي فتحت بيه الباب… مثل ما يشوفه هذا البيت.»</b>', '<b>“The time you opened the door… as this house sees it.”</b>'),
  ), objective(L('اجمع اللي لگيته بالدفتر، ودوّر الأقراص للرقم الصحيح. تگدر تستعمل الأسهم أو الكيبورد.', 'Combine what’s in your notebook and turn the dials to the right number. Use the arrows or your keyboard.')));

  const box = h('div', { class: `box${F.open ? ' is-open' : ''}` }, h('p', { class: 'box__label' }, t(L('ثلاث أقراص', 'Three dials'))));
  const dials = h('div', { class: 'dials' });
  const vals = [];
  const up = 'M6 15l6-6 6 6';
  const down = 'M6 9l6 6 6-6';
  const icon = (d) => {
    const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    s.setAttribute('viewBox', '0 0 24 24');
    s.setAttribute('aria-hidden', 'true');
    const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    p.setAttribute('d', d);
    s.append(p);
    return s;
  };
  const setDial = (i, v) => {
    const d = F.dials.slice();
    d[i] = (v + 10) % 10;
    ctx.set('dials', d);
    vals[i].textContent = num(d[i]);
    vals[i].setAttribute('aria-valuenow', String(d[i]));
    vals[i].setAttribute('aria-valuetext', num(d[i]));
    ctx.sfx('tap');
  };
  for (let i = 0; i < 3; i++) {
    const label = t(L('القرص {n}', 'Dial {n}'), { n: num(i + 1) });
    const v = h('div', { class: 'dial__val', role: 'spinbutton', tabindex: '0', 'aria-label': label, 'aria-valuemin': '0', 'aria-valuemax': '9', 'aria-valuenow': String(F.dials[i]), onkeydown: (e) => {
      if (F.open) return;
      if (e.key === 'ArrowUp') { e.preventDefault(); setDial(i, F.dials[i] + 1); }
      else if (e.key === 'ArrowDown') { e.preventDefault(); setDial(i, F.dials[i] - 1); }
      else if (/^[0-9٠-٩]$/.test(e.key)) { e.preventDefault(); setDial(i, Number(normalize(e.key))); const nx = vals[i + 1]; if (nx) nx.focus(); }
      else if (e.key === 'Enter') { e.preventDefault(); tryBtn.click(); }
    } }, num(F.dials[i]));
    vals.push(v);
    dials.append(h('div', { class: 'dial' },
      h('button', { class: 'dial__btn', type: 'button', 'aria-label': t(L('زيد {d}', 'Increase {d}'), { d: label }), onclick: () => !F.open && setDial(i, F.dials[i] + 1) }, icon(up)),
      v,
      h('button', { class: 'dial__btn', type: 'button', 'aria-label': t(L('نقّص {d}', 'Decrease {d}'), { d: label }), onclick: () => !F.open && setDial(i, F.dials[i] - 1) }, icon(down)),
    ));
  }
  box.append(dials);
  const fb = ctx.feedback();
  const tryBtn = h('button', { class: 'btn btn--primary', type: 'button', disabled: F.open, onclick: () => {
    const code = F.dials.join('');
    if (code === '713') return open(true);
    ctx.set('tries', (F.tries || 0) + 1);
    ctx.sfx('error');
    ctx.shake(box);
    if (code === '317') return ctx.say(fb, L('گريب… بس هذا الوقت مثل ما تشوفه أنت، مو مثل ما يشوفه البيت. تذكّر شنو مكتوب على الحايط.', 'Close… but that is the time as you see it, not as the house does. Remember what the wall said.'), 'error');
    if (code === '014') {
      ctx.secret('number');
      return ctx.say(fb, L('الصندوق ارتجف. همسة من جوّه: «هذا رقمك… مو رقم الباب.» ما انفتح، بس شي بالبيت عرفك.', 'The box shudders. A whisper from inside: “That’s your number… not the door’s.” It stays shut, but something in the house knows you now.'), 'error');
    }
    if (code === '013') return ctx.say(fb, L('ثلطعش… رقم سلمى. الصندوق ما يفتح لغير الوقت.', 'Thirteen… Salma’s number. The box opens only for time.'), 'error');
    return ctx.say(fb, L('القفل ما يتحرك. الجواب وقت — ارجع للدفتر.', 'The lock won’t budge. The answer is a time — check your notebook.'), 'error');
  } }, t(L('افتح الصندوق', 'Open the box')));
  box.append(h('div', { style: { marginTop: '18px' } }, tryBtn));

  const noteWrap = h('div');
  const cont = ctx.continueBtn(L('ارجع للممر', 'Back to the corridor'));
  cont.hidden = !F.open;

  function open(fresh) {
    ctx.set('open', true);
    box.classList.add('is-open');
    tryBtn.disabled = true;
    cont.hidden = false;
    if (fresh) { ctx.sfx('ok'); ctx.say(fb, L('٧ — ١ — ٣. الصندوق انفتح بصوت ناعم، كأنه تنهّد.', '7 — 1 — 3. The box opens with a soft sound, almost a sigh.'), 'ok'); }
    const extra = {
      sign: L('وانتبه: اسمك صار بالدفتر. والبيت ما ينسى اللي يكتبون أسماءهم. إذا حاولت تطلع من نفس الباب… راح يرجّعك.', 'And beware: your name is in the book now. The house never forgets those who sign. If you try to leave the way you came… it will bring you back.'),
      tear: L('والصفحة اللي بجيبك… هي أسماءنا. يمكن إذا طلعت بيها، نطلع وياك.', 'And the page in your pocket… those are our names. If you leave with it, maybe we leave with you.'),
      ignore: L('والصوت اللي جنت تتبعه… جان صوتي. شكراً لأنك ما تركتني وحدي.', 'And the voice you were following… was mine. Thank you for not leaving me alone.'),
    }[ledger];
    noteWrap.replaceChildren(h('div', { class: 'note', role: 'note' },
      h('p', null, t(L('إذا تقرأ هذا، يعني وصلت أبعد مني.', 'If you’re reading this, you made it further than I did.'))),
      h('p', null, t(L('البيت ما يأذي أحد. هو بس يحتاج أحد يراقب الباب، حتى ما يفتحه الغريب. آني جنت المراقبة. وهسه… الدور عليك. أو يمكن لا.', 'The house hurts no one. It only needs someone to watch the door, so strangers don’t open it. I was the watcher. Now… it’s your turn. Or maybe not.'))),
      h('p', null, t(extra)),
      h('p', null, t(L('بالممر راح تلگى ثلاث طرق. كل وحدة تطلّعك لمكان. اختار زين.', 'In the corridor you’ll find three ways. Each leads somewhere. Choose well.'))),
      h('p', { class: 'sig' }, t(L('— سلمى، رقم ١٣', '— Salma, number 13'))),
    ));
    if (fresh) cont.focus();
  }

  ctx.root.append(box, fb, noteWrap, h('div', { class: 'stage-actions' }, cont, ctx.hints([
    L('افتح الدفتر (فوگ). عندك وقت من ورقة المفتاح، وجملة عن الوقت من الحايط.', 'Open your notebook (top). You have a time from the key tag, and a line about time from the wall.'),
    L('بهذا البيت الوقت ينعكس. شلون يبيّن ٣:١٧ بالمراية؟', 'In this house, time is reversed. How does 3:17 look in a mirror?'),
    L('اقلب ترتيب الأرقام: ٣ ١ ٧ ← ؟ ؟ ؟', 'Reverse the digits: 3 1 7 → ? ? ?'),
  ])));
  if (F.open) open(false);
}

/* ------------------------------------------------------------------ */
/* Stage 7 — THE FINAL DECISION                                        */
/* ------------------------------------------------------------------ */

function stageFinal(ctx) {
  const F = ctx.flags;
  const knowsName = ctx.hasSecret('watermark') || ctx.hasSecret('candle');

  ctx.root.append(P(
    L('رجعت للممر. لأول مرة الضوء ثابت، والهوا ساكت.', 'You return to the corridor. For the first time the light is steady and the air is still.'),
    L('بنهاية الممر، باب أحمر ما شفته گبل، مكتوب عليه بنفس الخط المستعجل: <b>«لا تفتح»</b>. وراك، الباب اللي جيت منه. وبالنص، الكرسي.', 'At the end, a red door you never saw before, marked in the same hurried hand: <b>“DON’T OPEN”</b>. Behind you, the door you came in through. Between them, the chair.'),
  ), h('div', { class: 'corridor', 'aria-hidden': 'true' }, h('div', { class: 'corridor__floor' }), h('div', { class: 'corridor__door' })),
  objective(L('اختار. <b>ما تگدر ترجع بهذي الجولة.</b>', 'Choose. <b>There is no going back this run.</b>')));

  const pick = async (final, title) => {
    ctx.sfx('tap');
    const ok = await ctx.confirm({
      title: L('متأكد؟', 'Are you sure?'),
      body: title,
      ok: L('متأكد', 'I’m sure'),
      cancel: L('لا، خلّيني أفكّر', 'No, let me think'),
    });
    if (ok) ctx.finish(final);
  };

  const opt = (id, title, desc, cls = '') => h('button', { class: `choice ${cls}`, type: 'button', onclick: () => pick(id, title) },
    h('span', { class: 'choice__t' }, t(title)), h('span', { class: 'choice__d' }, t(desc)));

  const choices = h('div', { class: 'choices' },
    opt('leave', L('ارجع من الباب اللي جيت منه', 'Leave through the door you came in'), L('الشارع، الفجر، وحياتك العادية… إذا البيت يسمح.', 'The street, the dawn, your ordinary life… if the house allows it.')),
    opt('open', L('افتح الباب الأحمر', 'Open the red door'), L('الشي الوحيد اللي گالولك لا تسويه.', 'The one thing you were told not to do.')),
    opt('stay', L('ابقَ هنا، وراقب الباب', 'Stay here, and watch the door'), L('حتى سلمى تگدر تطلع.', 'So that Salma can leave.')),
  );
  ctx.root.append(choices);

  if (knowsName) {
    const fb = ctx.feedback();
    const input = h('input', { class: 'field', id: 's7-name', type: 'text', autocomplete: 'off', spellcheck: 'false', placeholder: t(L('الاسم…', 'The name…')) });
    const form = h('form', { class: 'word-lock', hidden: !F.calling, novalidate: true, onsubmit: (e) => {
      e.preventDefault();
      const v = input.value.trim();
      if (!v) return ctx.say(fb, t(L('اكتب شي أول.', 'Type something first.')), 'error');
      if (isAnswer(v, ['سدره', 'سدرة', 'sidra', 'sidrah', 'sedra'])) return ctx.finish('name');
      ctx.sfx('error');
      ctx.shake(input);
      if (isAnswer(v, ['سلمى', 'salma'])) return ctx.say(fb, L('سلمى مو اسم الباب. سلمى اسم اللي جانت تراقبه.', 'Salma isn’t the door’s name. Salma is the one who watched it.'), 'error');
      return ctx.say(fb, L('الباب ما يعرف هذا الاسم. يمكن قريته بمكان ما… بضوء خافت.', 'The door doesn’t know that name. Perhaps you read it somewhere… in dim light.'), 'error');
    } }, input, h('button', { class: 'btn btn--primary', type: 'submit' }, t(L('نادِ', 'Call'))));
    const lbl = h('label', { class: 'lbl', for: 's7-name', hidden: !F.calling }, t(L('اسم الباب الحقيقي', 'The door’s true name')));
    const reveal = h('button', { class: 'choice choice--faint', type: 'button', 'aria-expanded': F.calling ? 'true' : 'false', 'aria-controls': 's7-name', onclick: () => {
      ctx.set('calling', true);
      ctx.sfx('tap');
      form.hidden = false;
      lbl.hidden = false;
      reveal.setAttribute('aria-expanded', 'true');
      input.focus();
    } }, h('span', { class: 'choice__t' }, t(L('…أو، لا تختار. نادِ الباب باسمه', '…or don’t choose. Call the door by its name'))),
    h('span', { class: 'choice__d' }, t(L('همسة تذكّرتها من مكان ما.', 'A whisper you remember from somewhere.'))));
    choices.append(reveal);
    ctx.root.append(lbl, form, fb);
  }

  ctx.root.append(h('div', { class: 'stage-actions' }, ctx.hints([
    L('كل اختيار يوديك لنهاية مختلفة، واختياراتك القديمة تأثر عليها — خصوصاً الدفتر.', 'Each choice leads to a different ending, and earlier choices matter — especially the book.'),
    knowsName
      ? L('تتذكر الاسم اللي شفته بالضوء؟ هذا وقته.', 'Remember the name you saw in the light? Now is the time.')
      : L('أكو طريق رابع، بس يحتاج اسم ما تعرفه بعد. دوّر عليه بالجولة الجاية — بضوء الگلوب أو بضوء الشموع.', 'There is a fourth way, but it needs a name you don’t know yet. Look for it next run — by the light of the bulb, or of the candles.'),
  ])));
}

/* ------------------------------------------------------------------ */
/* Ending resolution                                                   */
/* ------------------------------------------------------------------ */

function resolve(run, final) {
  const ledger = run.choices.ledger || 'ignore';
  const reasons = [ledger, run.rushed ? 'rushed' : 'patient'];
  let ending;
  let variant = 'a';
  if (final === 'name') { ending = 'unknown'; reasons.push('name'); }
  else if (final === 'open') { ending = 'lastdoor'; reasons.push('open'); }
  else if (final === 'stay') { ending = 'observer'; reasons.push('stay'); }
  else if (ledger === 'sign') { ending = 'observer'; variant = 'bound'; reasons.push('leave', 'bound'); }
  else { ending = 'escaped'; variant = ledger === 'tear' ? 'tear' : 'a'; reasons.push('leave'); }
  reasons.push('secrets', run.hints ? 'hints' : 'nohints');
  return { ending, variant, reasons, ctx: { ledger, rushed: run.rushed, hints: run.hints } };
}

function reasonLines(result, found, total) {
  return result.reasons.map((id) => {
    const vars = { n: num(id === 'secrets' ? found : id === 'rushed' ? result.ctx.rushed : result.ctx.hints), total: num(total) };
    return t(reasonText[id], vars);
  });
}

export default {
  id: 1,
  playable: true,
  title: L('الشقة رقم ٧', 'Apartment 7'),
  blurb: L('عمارة قديمة بشارع الرشيد، باب مكتوب عليه «لا تفتح»، ورسالة من زائرة ما رجعت.', 'An old building on al-Rasheed Street, a door marked “Don’t open”, and a letter from a visitor who never came back.'),
  stages: [
    { key: 'door', title: L('الباب', 'The Door'), render: stageDoor },
    { key: 'message', title: L('الرسالة', 'The Message'), render: stageMessage },
    { key: 'choice', title: L('الاختيار', 'The Choice'), render: stageChoice },
    { key: 'pattern', title: L('النمط', 'The Pattern'), render: stagePattern },
    { key: 'silence', title: L('الصمت', 'The Silence'), render: stageSilence, silent: true },
    { key: 'secret', title: L('السر', 'The Secret'), render: stageSecret },
    { key: 'final', title: L('القرار الأخير', 'The Final Decision'), render: stageFinal },
  ],
  secrets,
  clues,
  endings,
  resolve,
  reasonLines,
};

// Exposed for automated tests.
export const __test = { startGrid, press, solveCandles, resolve };
