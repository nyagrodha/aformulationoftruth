/**
 * Questions: Dakṣiṇa Parva Anuvādam
 * (Southern Chapter Translation)
 *
 * The 35 Proust Questionnaire questions rendered in Tamil,
 * with ISO 15919 transliteration and English translation.
 *
 * Structure inspired by Tamil Sangam literary conventions,
 * particularly the introspective themes found in Tirukkuṟaḷ
 * and the akam (inner/love) poetry tradition.
 *
 * Transliteration follows ISO 15919 standard:
 *   ழ = ḻ (retroflex approximant, unique to Tamil)
 *   ற = ṟ (alveolar trill)
 *   ன = ṉ (alveolar nasal)
 *   ண = ṇ (retroflex nasal)
 *   ஞ = ñ (palatal nasal)
 *   ங = ṅ (velar nasal)
 *   Long vowels: ā, ī, ū, ē, ō
 */

export interface Question {
  id: number;
  /** Tamil numeral for display (௧, ௨, ௩...) */
  tamilNumeral: string;
  /** Original Tamil script */
  tamil: string;
  /** ISO 15919 romanization */
  transliteration: string;
  /** English translation (Proust original) */
  english: string;
  /** Optional Sangam/classical Tamil literary reference */
  sangamRef?: string;
  /** Gate question (shown on landing) vs main questionnaire */
  isGate: boolean;
}

// Tamil numerals ௦-௯ for reference
const TAMIL_NUMERALS = ['௦', '௧', '௨', '௩', '௪', '௫', '௬', '௭', '௮', '௯'];

function toTamilNumeral(n: number): string {
  if (!Number.isInteger(n) || n < 0) {
    throw new RangeError(
      `toTamilNumeral requires a non-negative integer, got: ${n}`
    );
  }
  if (n === 0) return TAMIL_NUMERALS[0];
  let result = '';
  let num = n;
  while (num > 0) {
    result = TAMIL_NUMERALS[num % 10] + result;
    num = Math.floor(num / 10);
  }
  return result;
}

/**
 * The 35 Questions — Dakṣiṇa Parva Anuvādam
 *
 * Questions 0-1: வாயில் (Vāyil) — The Gate
 * Questions 2-34: Main questionnaire (shuffled per session)
 */
export const QUESTIONS: Question[] = [
  // ═══════════════════════════════════════════════════════════════
  // வாயில் — THE GATE (Questions 0-1)
  // These are shown on the landing page, in order, before entry.
  // ═══════════════════════════════════════════════════════════════
  {
    id: 0,
    tamilNumeral: '௧',
    tamil: 'முழுமையான மகிழ்ச்சி என்றால் உனக்கு என்ன?',
    transliteration: 'Muḻumaiyāṉa makiḻcci eṉṟāl uṉakku eṉṉa?',
    english: 'What is your idea of perfect happiness?',
    sangamRef: 'cf. Tirukkuṟaḷ 66: இன்பம் விழையாதவர் இல்லை',
    isGate: true,
  },
  {
    id: 1,
    tamilNumeral: '௨',
    tamil: 'உன்னுடைய மிகப்பெரிய அச்சம் யாது?',
    transliteration: 'Uṉṉuṭaiya mikapperiya accam yātu?',
    english: 'What is your greatest fear?',
    sangamRef: 'cf. Tirukkuṟaḷ 428: அஞ்சுவது அஞ்சாமை பேதைமை',
    isGate: true,
  },

  // ═══════════════════════════════════════════════════════════════
  // MAIN QUESTIONNAIRE (Questions 2-34)
  // These are shuffled via Fisher-Yates for each session.
  // ═══════════════════════════════════════════════════════════════
  {
    id: 2,
    tamilNumeral: '௩',
    tamil: 'உன்னிடம் நீ மிகவும் வெறுக்கும் குணம் எது?',
    transliteration: 'Uṉṉiṭam nī mikavum veṟukkum kuṇam etu?',
    english: 'What is the trait you most deplore in yourself?',
    isGate: false,
  },
  {
    id: 3,
    tamilNumeral: '௪',
    tamil: 'பிறரிடம் நீ மிகவும் வெறுக்கும் குணம் எது?',
    transliteration: 'Piṟariṭam nī mikavum veṟukkum kuṇam etu?',
    english: 'What is the trait you most deplore in others?',
    isGate: false,
  },
  {
    id: 4,
    tamilNumeral: '௫',
    tamil: 'இன்று உயிருடன் இருப்பவர்களில் நீ மிகவும் போற்றுபவர் யார்?',
    transliteration: 'Iṉṟu uyiruṭaṉ iruppavar̲kaḷil nī mikavum pōṟṟupavar yār?',
    english: 'Which living person do you most admire?',
    isGate: false,
  },
  {
    id: 5,
    tamilNumeral: '௬',
    tamil: 'உன்னுடைய மிகப்பெரிய ஆடம்பரம் என்ன?',
    transliteration: 'Uṉṉuṭaiya mikapperiya āṭamparam eṉṉa?',
    english: 'What is your greatest extravagance?',
    isGate: false,
  },
  {
    id: 6,
    tamilNumeral: '௭',
    tamil: 'இப்போது உன் மன நிலை எப்படி இருக்கிறது?',
    transliteration: 'Ippōtu uṉ maṉa nilai eppaṭi irukkiṟatu?',
    english: 'What is your current state of mind?',
    sangamRef: 'cf. Akam poetry: உள்ளம் (uḷḷam) — the inner landscape',
    isGate: false,
  },
  {
    id: 7,
    tamilNumeral: '௮',
    tamil: 'மிகைப்படுத்தப்பட்ட நற்குணம் எது என்று நினைக்கிறாய்?',
    transliteration: 'Mikaipaṭuttappaṭṭa naṟkuṇam etu eṉṟu niṉaikkiṟāy?',
    english: 'What do you consider the most overrated virtue?',
    isGate: false,
  },
  {
    id: 8,
    tamilNumeral: '௯',
    tamil: 'எந்த சூழ்நிலையில் நீ பொய் சொல்வாய்?',
    transliteration: 'Enta cūḻnilaiyil nī poy colvāy?',
    english: 'On what occasion do you lie?',
    sangamRef: 'cf. Tirukkuṟaḷ 292: பொய்யாமை பொய்யாமை ஆற்றின்',
    isGate: false,
  },
  {
    id: 9,
    tamilNumeral: '௧௦',
    tamil: 'உன் தோற்றத்தில் உனக்கு மிகவும் பிடிக்காதது என்ன?',
    transliteration: 'Uṉ tōṟṟattil uṉakku mikavum piṭikkātatu eṉṉa?',
    english: 'What do you most dislike about your appearance?',
    isGate: false,
  },
  {
    id: 10,
    tamilNumeral: '௧௧',
    tamil: 'இன்று உயிருடன் இருப்பவர்களில் நீ மிகவும் வெறுப்பவர் யார்?',
    transliteration: 'Iṉṟu uyiruṭaṉ iruppavar̲kaḷil nī mikavum veṟuppavar yār?',
    english: 'Which living person do you most despise?',
    isGate: false,
  },
  {
    id: 11,
    tamilNumeral: '௧௨',
    tamil: 'ஆணிடம் நீ மிகவும் விரும்பும் குணம் எது?',
    transliteration: 'Āṇiṭam nī mikavum virumpum kuṇam etu?',
    english: 'What is the quality you most like in a man?',
    isGate: false,
  },
  {
    id: 12,
    tamilNumeral: '௧௩',
    tamil: 'பெண்ணிடம் நீ மிகவும் விரும்பும் குணம் எது?',
    transliteration: 'Peṇṇiṭam nī mikavum virumpum kuṇam etu?',
    english: 'What is the quality you most like in a woman?',
    isGate: false,
  },
  {
    id: 13,
    tamilNumeral: '௧௪',
    tamil: 'நீ அடிக்கடி பயன்படுத்தும் சொற்கள் அல்லது சொற்றொடர்கள் என்ன?',
    transliteration: 'Nī aṭikkaṭi payaṉpaṭuttum coṟkaḷ allatu coṟṟoṭarkaḷ eṉṉa?',
    english: 'Which words or phrases do you most overuse?',
    isGate: false,
  },
  {
    id: 14,
    tamilNumeral: '௧௫',
    tamil: 'உன் வாழ்வின் மிகப்பெரிய காதல் யார் அல்லது எது?',
    transliteration: 'Uṉ vāḻviṉ mikapperiya kātal yār allatu etu?',
    english: 'What or who is the greatest love of your life?',
    sangamRef: 'cf. Kuṟuntokai: காதல் (kātal) — love as life-force',
    isGate: false,
  },
  {
    id: 15,
    tamilNumeral: '௧௬',
    tamil: 'நீ எப்போது, எங்கே மிகவும் மகிழ்ச்சியாக இருந்தாய்?',
    transliteration: 'Nī eppōtu, eṅkē mikavum makiḻcciyāka iruntāy?',
    english: 'When and where were you happiest?',
    isGate: false,
  },
  {
    id: 16,
    tamilNumeral: '௧௭',
    tamil: 'எந்த திறமையை நீ மிகவும் பெற விரும்புவாய்?',
    transliteration: 'Enta tiṟamaiyai nī mikavum peṟa virumpuvāy?',
    english: 'Which talent would you most like to have?',
    isGate: false,
  },
  {
    id: 17,
    tamilNumeral: '௧௮',
    tamil: 'உன்னில் ஒன்றை மாற்ற முடிந்தால், அது என்னவாக இருக்கும்?',
    transliteration: 'Uṉṉil oṉṟai māṟṟa muṭintāl, atu eṉṉavāka irukkum?',
    english: 'If you could change one thing about yourself, what would it be?',
    isGate: false,
  },
  {
    id: 18,
    tamilNumeral: '௧௯',
    tamil: 'உன்னுடைய மிகப்பெரிய சாதனை என்ன என்று நினைக்கிறாய்?',
    transliteration: 'Uṉṉuṭaiya mikapperiya cātaṉai eṉṉa eṉṟu niṉaikkiṟāy?',
    english: 'What do you consider your greatest achievement?',
    isGate: false,
  },
  {
    id: 19,
    tamilNumeral: '௨௦',
    tamil: 'நீ இறந்து மீண்டும் வந்தால், யாராக அல்லது எதுவாக வர விரும்புவாய்?',
    transliteration: 'Nī iṟantu mīṇṭum vantāl, yārāka allatu etuvāka vara virumpuvāy?',
    english: 'If you were to die and come back as a person or a thing, what would it be?',
    sangamRef: 'cf. புனர்ஜன்மம் (puṉarjaṉmam) — rebirth',
    isGate: false,
  },
  {
    id: 20,
    tamilNumeral: '௨௧',
    tamil: 'நீ மிகவும் வாழ விரும்பும் இடம் எது?',
    transliteration: 'Nī mikavum vāḻa virumpum iṭam etu?',
    english: 'Where would you most like to live?',
    isGate: false,
  },
  {
    id: 21,
    tamilNumeral: '௨௨',
    tamil: 'உன்னுடைய மிகவும் பொக்கிஷமான உடைமை என்ன?',
    transliteration: 'Uṉṉuṭaiya mikavum pokkiṣamāṉa uṭaimai eṉṉa?',
    english: 'What is your most treasured possession?',
    isGate: false,
  },
  {
    id: 22,
    tamilNumeral: '௨௩',
    tamil: 'துன்பத்தின் மிக ஆழமான நிலை எது என்று நினைக்கிறாய்?',
    transliteration: 'Tuṉppattiṉ mika āḻamāṉa nilai etu eṉṟu niṉaikkiṟāy?',
    english: 'What do you regard as the lowest depth of misery?',
    sangamRef: 'cf. Tirukkuṟaḷ: துன்பம் (tuṉpam) — suffering',
    isGate: false,
  },
  {
    id: 23,
    tamilNumeral: '௨௪',
    tamil: 'உனக்கு மிகவும் பிடித்த தொழில் அல்லது செயல் என்ன?',
    transliteration: 'Uṉakku mikavum piṭitta toḻil allatu ceyal eṉṉa?',
    english: 'What is your favorite occupation?',
    isGate: false,
  },
  {
    id: 24,
    tamilNumeral: '௨௫',
    tamil: 'உன்னுடைய மிகவும் தனித்துவமான குணம் என்ன?',
    transliteration: 'Uṉṉuṭaiya mikavum taṉittuvamāṉa kuṇam eṉṉa?',
    english: 'What is your most marked characteristic?',
    isGate: false,
  },
  {
    id: 25,
    tamilNumeral: '௨௬',
    tamil: 'நண்பர்களிடம் நீ மிகவும் மதிப்பது என்ன?',
    transliteration: 'Naṇparkaḷiṭam nī mikavum matippatu eṉṉa?',
    english: 'What do you most value in your friends?',
    sangamRef: 'cf. Tirukkuṟaḷ 781-790: நட்பு (naṭpu) — friendship',
    isGate: false,
  },
  {
    id: 26,
    tamilNumeral: '௨௭',
    tamil: 'உனக்கு பிடித்த எழுத்தாளர்கள் யார்?',
    transliteration: 'Uṉakku piṭitta eḻuttāḷarkaḷ yār?',
    english: 'Who are your favorite writers?',
    isGate: false,
  },
  {
    id: 27,
    tamilNumeral: '௨௮',
    tamil: 'கற்பனையில் உன் நாயகன் யார்?',
    transliteration: 'Kaṟpaṉaiyil uṉ nāyakaṉ yār?',
    english: 'Who is your hero of fiction?',
    isGate: false,
  },
  {
    id: 28,
    tamilNumeral: '௨௯',
    tamil: 'எந்த வரலாற்று நபருடன் நீ மிகவும் ஒத்திருப்பதாக உணர்கிறாய்?',
    transliteration: 'Enta varalāṟṟu naparuṭaṉ nī mikavum ottiruppataāka uṇarkiṟāy?',
    english: 'Which historical figure do you most identify with?',
    isGate: false,
  },
  {
    id: 29,
    tamilNumeral: '௩௦',
    tamil: 'நிஜ வாழ்க்கையில் உன் நாயகர்கள் யார்?',
    transliteration: 'Nija vāḻkkaiyil uṉ nāyakarkaḷ yār?',
    english: 'Who are your heroes in real life?',
    isGate: false,
  },
  {
    id: 30,
    tamilNumeral: '௩௧',
    tamil: 'உனக்கு பிடித்த பெயர்கள் என்ன?',
    transliteration: 'Uṉakku piṭitta peyarkaḷ eṉṉa?',
    english: 'What are your favorite names?',
    isGate: false,
  },
  {
    id: 31,
    tamilNumeral: '௩௨',
    tamil: 'உனக்கு மிகவும் பிடிக்காதது என்ன?',
    transliteration: 'Uṉakku mikavum piṭikkātatu eṉṉa?',
    english: 'What is it that you most dislike?',
    sangamRef: 'Proust: "என் சொந்த மோசமான குணங்கள்"',
    isGate: false,
  },
  {
    id: 32,
    tamilNumeral: '௩௩',
    tamil: 'உன்னுடைய மிகப்பெரிய வருத்தம் என்ன?',
    transliteration: 'Uṉṉuṭaiya mikapperiya varuttam eṉṉa?',
    english: 'What is your greatest regret?',
    isGate: false,
  },
  {
    id: 33,
    tamilNumeral: '௩௪',
    tamil: 'நீ எப்படி இறக்க விரும்புவாய்?',
    transliteration: 'Nī eppaṭi iṟakka virumpuvāy?',
    english: 'How would you like to die?',
    sangamRef: 'cf. Puṟanāṉūṟu: சாவு (cāvu) — death as transition',
    isGate: false,
  },
  {
    id: 34,
    tamilNumeral: '௩௫',
    tamil: 'உன் வாழ்க்கை தாரக மந்திரம் என்ன?',
    transliteration: 'Uṉ vāḻkkai tāraka mantiram eṉṉa?',
    english: 'What is your motto?',
    sangamRef: 'தாரக மந்திரம் (tāraka mantiram) — the liberating utterance',
    isGate: false,
  },
];

/**
 * Get gate questions (for landing page)
 */
export function getGateQuestions(): Question[] {
  return QUESTIONS.filter((q) => q.isGate);
}

/**
 * Get shuffleable questions (for main questionnaire)
 */
export function getShuffleableQuestions(): Question[] {
  return QUESTIONS.filter((q) => !q.isGate);
}

/**
 * Get question by ID
 */
export function getQuestionById(id: number): Question | undefined {
  return QUESTIONS.find((q) => q.id === id);
}

/**
 * Get all questions in a specific language layer
 */
export function getQuestionsInLanguage(
  lang: 'tamil' | 'transliteration' | 'english'
): string[] {
  return QUESTIONS.map((q) => q[lang]);
}

// Re-export the Tamil numeral converter for use elsewhere
export { toTamilNumeral };
