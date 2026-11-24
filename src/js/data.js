// Ham radio reference data, word lists and practice text generator.
(function () {
  'use strict';
  const MT = (window.MT = window.MT || {});

  const QCODES = [
    ['QRA', 'The name of my station is …', 'What is the name of your station?'],
    ['QRG', 'Your exact frequency is … kHz', 'Will you tell me my exact frequency?'],
    ['QRH', 'Your frequency varies', 'Does my frequency vary?'],
    ['QRI', 'The tone of your transmission is … (1 good, 2 variable, 3 bad)', 'How is the tone of my transmission?'],
    ['QRK', 'The readability of your signals is … (1–5)', 'What is the readability of my signals?'],
    ['QRL', 'I am busy / this frequency is in use', 'Are you busy? Is this frequency in use?'],
    ['QRM', 'I am getting interference (man-made)', 'Are you being interfered with?'],
    ['QRN', 'I am troubled by static (natural noise)', 'Are you troubled by static?'],
    ['QRO', 'Increase power', 'Shall I increase power?'],
    ['QRP', 'Decrease power / I am running low power', 'Shall I decrease power?'],
    ['QRQ', 'Send faster (… WPM)', 'Shall I send faster?'],
    ['QRS', 'Send more slowly (… WPM)', 'Shall I send more slowly?'],
    ['QRT', 'Stop sending / I am closing down', 'Shall I stop sending?'],
    ['QRU', 'I have nothing for you', 'Have you anything for me?'],
    ['QRV', 'I am ready', 'Are you ready?'],
    ['QRX', 'Stand by / I will call you again at …', 'When will you call me again?'],
    ['QRZ', 'You are being called by …', 'Who is calling me?'],
    ['QSA', 'The strength of your signals is … (1–5)', 'What is the strength of my signals?'],
    ['QSB', 'Your signals are fading', 'Are my signals fading?'],
    ['QSD', 'Your keying is defective', 'Is my keying defective?'],
    ['QSK', 'I can hear you between my signals (full break-in)', 'Can you hear me between your signals?'],
    ['QSL', 'I acknowledge receipt (also: a QSL confirmation card)', 'Can you acknowledge receipt?'],
    ['QSM', 'Repeat the last message', 'Shall I repeat the last message?'],
    ['QSN', 'I heard you on … kHz', 'Did you hear me?'],
    ['QSO', 'I can communicate with … (a contact)', 'Can you communicate with …?'],
    ['QSP', 'I will relay to …', 'Will you relay to …?'],
    ['QST', 'General call to all amateurs (bulletin)', '—'],
    ['QSX', 'I am listening to … on … kHz', 'Will you listen to … on … kHz?'],
    ['QSY', 'Change frequency to … kHz', 'Shall I change frequency?'],
    ['QTA', 'Cancel message number …', 'Shall I cancel message number …?'],
    ['QTC', 'I have … messages for you', 'How many messages have you to send?'],
    ['QTH', 'My location is …', 'What is your location?'],
    ['QTR', 'The correct time is … UTC', 'What is the correct time?'],
  ];

  const ABBR = [
    ['AA', 'All after'], ['AB', 'All before'], ['ABT', 'About'], ['ADR', 'Address'], ['AGN', 'Again'],
    ['ANT', 'Antenna'], ['BCNU', 'Be seeing you'], ['BK', 'Break / back to you'], ['B4', 'Before'],
    ['C', 'Yes / correct'], ['CFM', 'Confirm'], ['CL', 'Closing station'], ['CPY', 'Copy'],
    ['CQ', 'Calling any station'], ['CUL', 'See you later'], ['DE', 'From / this is'], ['DR', 'Dear'],
    ['DX', 'Distance, foreign station'], ['ES', 'And'], ['FB', 'Fine business (excellent)'],
    ['FER', 'For'], ['FM', 'From'], ['GA', 'Good afternoon / go ahead'], ['GB', 'Goodbye'],
    ['GD', 'Good day'], ['GE', 'Good evening'], ['GL', 'Good luck'], ['GM', 'Good morning'],
    ['GN', 'Good night'], ['GUD', 'Good'], ['HI', 'Laughter'], ['HPE', 'Hope'], ['HR', 'Here / hear'],
    ['HV', 'Have'], ['HW', 'How (how copy?)'], ['K', 'Go ahead (any station)'], ['LID', 'Poor operator'],
    ['MSG', 'Message'], ['N', 'No'], ['NR', 'Number / near'], ['NW', 'Now'], ['OB', 'Old boy'],
    ['OM', 'Old man (any male operator)'], ['OP', 'Operator'], ['PSE', 'Please'], ['PWR', 'Power'],
    ['R', 'Received / roger'], ['RIG', 'Station equipment'], ['RPT', 'Repeat / report'],
    ['RST', 'Readability-Strength-Tone report'], ['RX', 'Receiver'], ['SIG', 'Signal'],
    ['SKED', 'Schedule'], ['SN', 'Soon'], ['SRI', 'Sorry'], ['TEMP', 'Temperature'], ['TKS', 'Thanks'],
    ['TNX', 'Thanks'], ['TMW', 'Tomorrow'], ['TU', 'Thank you'], ['TX', 'Transmitter'], ['U', 'You'],
    ['UR', 'Your / you are'], ['VY', 'Very'], ['WID', 'With'], ['WKD', 'Worked'], ['WL', 'Will / well'],
    ['WX', 'Weather'], ['XCVR', 'Transceiver'], ['XYL', 'Wife'], ['YL', 'Young lady (female operator)'],
    ['5NN', '599 report using cut numbers'], ['599', 'Perfect signal report'], ['72', 'Best regards (QRP)'],
    ['73', 'Best regards'], ['88', 'Love and kisses'],
  ];

  const PROSIGN_INFO = [
    ['<AR>', 'End of message'],
    ['<AS>', 'Wait / stand by'],
    ['<BT>', 'Break / separator (new paragraph), same as ='],
    ['<KN>', 'Go ahead — only the station I am working'],
    ['<SK>', 'End of contact'],
    ['<BK>', 'Break-in / back to you'],
    ['<CT>', 'Start of transmission (also KA)'],
    ['<VE>', 'Understood (also SN)'],
    ['<SOS>', 'Distress signal'],
    ['<HH>', 'Error — 8 dits, ignore last word'],
  ];

  const CUT_NUMBERS = [
    ['1', 'A'], ['2', 'U'], ['5', 'E'], ['7', 'B'], ['8', 'D'], ['9', 'N'], ['0', 'T or O'],
  ];

  const WORDS = (
    'THE OF AND TO IN IS YOU THAT IT HE WAS FOR ON ARE AS WITH HIS THEY AT BE THIS HAVE FROM OR ONE HAD BY ' +
    'WORD BUT NOT WHAT ALL WERE WE WHEN YOUR CAN SAID THERE USE AN EACH WHICH SHE DO HOW THEIR IF WILL UP ' +
    'OTHER ABOUT OUT MANY THEN THEM THESE SO SOME HER WOULD MAKE LIKE HIM INTO TIME HAS LOOK TWO MORE WRITE ' +
    'GO SEE NUMBER NO WAY COULD PEOPLE MY THAN FIRST WATER BEEN CALL WHO OIL ITS NOW FIND LONG DOWN DAY DID ' +
    'GET COME MADE MAY PART OVER NEW SOUND TAKE ONLY LITTLE WORK KNOW PLACE YEAR LIVE ME BACK GIVE MOST VERY ' +
    'AFTER THING OUR JUST NAME GOOD SENTENCE MAN THINK SAY GREAT WHERE HELP THROUGH MUCH BEFORE LINE RIGHT ' +
    'RADIO SIGNAL ANTENNA POWER BAND KEY TONE CODE SPEED COPY STATION OPERATOR WAVE NIGHT MORNING WEATHER ' +
    'SUNNY RAIN WIND COLD WARM HOME CLUB FRIEND HOUR NEAR CITY RIVER TREE HOUSE FIELD LIGHT SHORT CONTACT'
  ).split(' ');

  const NAMES = ['JOHN', 'BOB', 'MIKE', 'ANN', 'SUE', 'TOM', 'BILL', 'JIM', 'RAJ', 'ANIL', 'PRIYA', 'HANS',
    'YUKI', 'LUIS', 'MARIA', 'PETE', 'DAVE', 'KEN', 'AL', 'ED', 'RAVI', 'MEERA', 'OLE', 'SVEN', 'PAUL', 'JOE'];
  const QTHS = ['LONDON', 'BOSTON', 'DENVER', 'TOKYO', 'BERLIN', 'CHENNAI', 'MUMBAI', 'DELHI', 'SYDNEY',
    'PARIS', 'MADRID', 'OSLO', 'DALLAS', 'SEATTLE', 'PUNE', 'SINGAPORE', 'TORONTO', 'ROME', 'DUBLIN', 'BANGALORE'];
  const RIGS = ['IC7300', 'FT991A', 'K3', 'KX2', 'TS590', 'FT817', 'IC705', 'FTDX10', 'K4', 'QCX'];
  const ANTS = ['DIPOLE', 'VERTICAL', 'YAGI', 'EFHW', 'LOOP', 'G5RV', 'INV V', 'WIRE'];
  const WXS = ['SUNNY', 'CLOUDY', 'RAIN', 'WARM', 'COLD', 'HOT', 'SNOW', 'WINDY', 'FOGGY', 'CLEAR'];
  const RSTS = ['599', '579', '559', '449', '589', '569', '5NN', '339', '479'];

  const PREFIXES = ['W', 'K', 'N', 'AA', 'AB', 'KD', 'KE', 'WA', 'WB', 'VE', 'VA', 'G', 'M', '2E', 'DL', 'DJ',
    'F', 'I', 'IZ', 'JA', 'JH', 'VU2', 'VU3', 'EA', 'ON', 'PA', 'OH', 'SM', 'LA', 'OK', 'SP', 'UA', 'R', 'YB',
    'ZS', 'PY', 'LU', 'XE', 'HL', 'BY', 'BA', '9V1', '9M2', '4X', 'VK', 'ZL', 'EI', 'OE', 'HB9', 'YO', 'LZ', 'S5'];

  const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const DIGITS = '0123456789';
  const PUNCT = '.,?/=+-';

  const rnd = (n) => Math.floor(Math.random() * n);
  const pick = (a) => a[rnd(a.length)];

  function callsign() {
    const p = pick(PREFIXES);
    let c = p;
    if (!/\d$/.test(p)) c += rnd(10);
    const n = 1 + rnd(3);
    for (let i = 0; i < n; i++) c += LETTERS[rnd(26)];
    const r = Math.random();
    if (r < 0.04) c += '/P';
    else if (r < 0.07) c += '/M';
    else if (r < 0.09) c += '/QRP';
    return c;
  }

  const QSO_TEMPLATES = [
    () => { const c = callsign(); return `CQ CQ CQ DE ${c} ${c} ${c} K`; },
    () => { const a = callsign(); const b = callsign(); return `${a} DE ${b} ${b} K`; },
    () => {
      const a = callsign(); const b = callsign(); const r = pick(RSTS); const n = pick(NAMES); const q = pick(QTHS);
      return `${a} DE ${b} GM OM TNX FER CALL <BT> UR RST ${r} ${r} <BT> NAME ${n} ${n} <BT> QTH ${q} ${q} <BT> HW CPY? <AR> ${a} DE ${b} KN`;
    },
    () => {
      const a = callsign(); const b = callsign();
      return `R R ${a} DE ${b} FB ${pick(NAMES)} <BT> RIG ${pick(RIGS)} ES ANT ${pick(ANTS)} <BT> WX ${pick(WXS)} TEMP ${10 + rnd(25)}C <BT> HW? <AR> ${a} DE ${b} KN`;
    },
    () => { const a = callsign(); const b = callsign(); return `${a} DE ${b} TNX FER FB QSO ${pick(NAMES)} <BT> HPE CUL 73 <SK> ${a} DE ${b} TU`; },
    () => `QRL?`,
    () => `QRZ? DE ${callsign()} K`,
    () => `${callsign()} 5NN ${1 + rnd(40)} TU`,
    () => `PSE QRS ${pick(NAMES)} QRM HR`,
    () => `SRI QSB <BT> PSE AGN UR NAME?`,
    () => `QSY ${7000 + rnd(60)}?`,
    () => `UR SIG ${pick(RSTS)} IN ${pick(QTHS)} <BT> GL ES 73`,
  ];

  function charset(S) {
    const custom = (S.customChars || '').toUpperCase().replace(/\s+/g, '');
    if (custom) return [...new Set(custom)].filter((c) => MT.patternOf(c)).join('');
    let s = '';
    if (S.content.letters) s += LETTERS;
    if (S.content.numbers) s += DIGITS;
    if (S.content.punctuation) s += PUNCT;
    return s;
  }

  function group(cs, size) {
    let g = '';
    for (let i = 0; i < size; i++) g += cs[rnd(cs.length)];
    return g;
  }

  function generateItem(pool, S) {
    switch (pool) {
      case 'group': return group(charset(S) || LETTERS, Math.max(1, S.groupSize | 0));
      case 'words': return pick(WORDS);
      case 'qcodes': { const q = pick(QCODES)[0]; return Math.random() < 0.3 ? q + '?' : q; }
      case 'abbr': return pick(ABBR)[0];
      case 'callsigns': return callsign();
      case 'prosigns': return pick(PROSIGN_INFO.slice(0, 7))[0];
      case 'qso': return pick(QSO_TEMPLATES)();
      default: return group(LETTERS, 5);
    }
  }

  function pools(S) {
    const c = S.content;
    const p = [];
    if (charset(S)) p.push('group');
    for (const k of ['words', 'qcodes', 'abbr', 'callsigns', 'prosigns', 'qso']) if (c[k]) p.push(k);
    return p.length ? p : ['group'];
  }

  function generate(S, countOverride) {
    const ps = pools(S);
    const n = Math.max(1, countOverride || S.count | 0);
    const items = [];
    for (let i = 0; i < n; i++) {
      const pool = pick(ps);
      items.push(generateItem(pool, S));
      if (pool === 'qso') i += 3; // QSO lines are long; count them as several items
    }
    return items.join(' ');
  }

  // Practice targets for rhythm training.
  function rhythmTarget(unit, S) {
    if (unit === 'char') {
      const cs = charset(S) || LETTERS;
      return cs[rnd(cs.length)];
    }
    if (unit === 'word') {
      const r = Math.random();
      if (S.content.qcodes && r < 0.25) return pick(QCODES)[0];
      if (S.content.abbr && r < 0.5) return pick(ABBR)[0];
      if (S.content.callsigns && r < 0.65) return callsign();
      return pick(WORDS);
    }
    const shorts = [
      () => `CQ DE ${callsign()} K`,
      () => `TNX FER CALL`,
      () => `${pick(WORDS)} ${pick(WORDS)} ${pick(WORDS)}`,
      () => `UR RST ${pick(RSTS)}`,
      () => `NAME ${pick(NAMES)}`,
      () => `QTH ${pick(QTHS)}`,
      () => `GM OM ES TU`,
      () => `73 ES GL`,
    ];
    return pick(shorts)();
  }

  const LOOKUP = new Map();
  for (const [c, m, q] of QCODES) LOOKUP.set(c, { code: c, kind: 'Q code', meaning: m, question: q });
  for (const [c, m] of ABBR) if (!LOOKUP.has(c)) LOOKUP.set(c, { code: c, kind: 'Abbreviation', meaning: m });
  for (const [c, m] of PROSIGN_INFO) LOOKUP.set(c, { code: c, kind: 'Prosign', meaning: m });

  // Explain codes found in a piece of text.
  function glossary(text) {
    const seen = new Set();
    const out = [];
    for (const raw of String(text).toUpperCase().split(/\s+/)) {
      const w = raw.replace(/\?$/, '');
      if (seen.has(w)) continue;
      const hit = LOOKUP.get(w);
      if (hit && w.length > 1) {
        seen.add(w);
        out.push({ ...hit, asked: raw.endsWith('?') });
      }
    }
    return out;
  }

  // ---- Exam mode practice text ----
  const IN_CITIES = ['CHENNAI', 'MUMBAI', 'DELHI', 'KOLKATA', 'BANGALORE', 'HYDERABAD', 'PUNE', 'KOCHI',
    'JAIPUR', 'LUCKNOW', 'MADURAI', 'COIMBATORE', 'NAGPUR', 'BHOPAL', 'PATNA', 'GOA', 'MYSORE', 'TRICHY'];
  const IN_NAMES = ['RAVI', 'ANIL', 'PRIYA', 'MEERA', 'ARUN', 'KUMAR', 'SURESH', 'LAKSHMI', 'VIJAY', 'DEEPA',
    'RAMESH', 'KAVYA', 'SANJAY', 'ANAND', 'GITA', 'MOHAN', 'RAHUL', 'SITA'];
  const SENTENCES = [
    'THE QUICK BROWN FOX JUMPS OVER THE LAZY DOG',
    'AMATEUR RADIO IS A HOBBY AND A SERVICE',
    'PLEASE SEND YOUR REPORT AND NAME',
    'THE WEATHER HERE IS WARM AND SUNNY TODAY',
    'MY ANTENNA IS A SIMPLE WIRE DIPOLE',
    'WE MET ON THE FORTY METRE BAND LAST NIGHT',
    'GOOD OPERATORS LISTEN BEFORE THEY TRANSMIT',
    'THE CLUB MEETS EVERY SUNDAY MORNING',
    'HAM RADIO HELPS DURING FLOODS AND CYCLONES',
    'KEEP YOUR KEYING SMOOTH AND EVEN',
    'THE SIGNAL WAS WEAK BUT VERY CLEAR',
    'I HOPE TO WORK YOU AGAIN SOON',
    'THE RIVER IS NEAR MY HOUSE',
    'MORSE CODE CAN BE HEARD THROUGH NOISE',
    'THANK YOU FOR THE NICE CONTACT',
    'THE STATION USES LOW POWER FROM A BATTERY',
  ];

  function inCall() {
    const p = pick(['VU2', 'VU2', 'VU3', 'VU3', 'VU4', 'VU7']);
    const n = 2 + rnd(2);
    let c = p;
    for (let i = 0; i < n; i++) c += LETTERS[rnd(26)];
    return c;
  }

  function plainSentence() {
    if (Math.random() < 0.45) return pick(SENTENCES);
    const n = 5 + rnd(5);
    const w = [];
    for (let i = 0; i < n; i++) w.push(pick(WORDS));
    return w.join(' ');
  }

  // style: 'plain' | 'mixed' | 'ham'. Returns roughly `chars` characters of text.
  function examText(style, chars) {
    const parts = [];
    let len = 0;
    while (len < chars) {
      let s;
      if (style === 'ham') {
        const a = inCall();
        const b = inCall();
        s = pick([
          () => `CQ CQ DE ${a} ${a} K`,
          () => `${a} DE ${b} GM OM UR RST ${pick(RSTS)} NAME ${pick(IN_NAMES)} QTH ${pick(IN_CITIES)} HW? ${a} DE ${b} K`,
          () => `${a} DE ${b} R TNX FER RPT RIG ${pick(RIGS)} ANT ${pick(ANTS)} WX ${pick(WXS)} TEMP ${20 + rnd(18)}C`,
          () => `QTH ${pick(IN_CITIES)} QTH ${pick(IN_CITIES)}`,
          () => `PSE QRS QRM HR`,
          () => `${b} DE ${a} TNX FER QSO 73 GL`,
          () => `QSL VIA BUREAU`,
          () => plainSentence() + '.',
        ])();
      } else if (style === 'mixed') {
        s = plainSentence();
        const words = s.split(' ');
        const extra = pick([
          () => String(10 + rnd(990)),
          () => `${1 + rnd(28)}/${1 + rnd(12)}/${2020 + rnd(10)}`,
          () => pick(IN_CITIES),
          () => inCall(),
          () => `${100 + rnd(900)} KM`,
        ])();
        words.splice(rnd(words.length + 1), 0, extra);
        s = words.join(' ') + pick(['.', '.', ',', '?']);
      } else {
        s = plainSentence() + '.';
      }
      parts.push(s);
      len += s.length + 1;
    }
    return parts.join(' ');
  }

  Object.assign(MT, {
    QCODES, ABBR, PROSIGN_INFO, CUT_NUMBERS, WORDS, generate, rhythmTarget, glossary, callsign, examText,
  });
})();
