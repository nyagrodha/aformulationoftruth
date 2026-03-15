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
    tamil: 'முழுமையான சந்தோஷம்ன்னா உனக்கு என்ன?',
    transliteration: 'Muḻumaiyāṉa cantōṣamṉṉā uṉakku eṉṉa?',
    english: 'What is your idea of perfect happiness?',
    sangamRef: 'cf. Tirukkuṟaḷ 66: இன்பம் விழையாதவர் இல்லை',
    isGate: true,
  },
  {
    id: 1,
    tamilNumeral: '௨',
    tamil: 'உன்னோட ரொம்பப் பெரிய பயம் என்ன?',
    transliteration: 'Uṉṉōṭa rompap periya payam eṉṉa?',
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
    tamil: 'உன்னிட்ட நீ ரொம்ப வெறுக்குற குணம் எது?',
    transliteration: 'Uṉṉiṭṭa nī rompa veṟukkuṟa kuṇam etu?',
    english: 'What is the trait you most deplore in yourself?',
    isGate: false,
  },
  {
    id: 3,
    tamilNumeral: '௪',
    tamil: 'மத்தவங்ககிட்ட நீ ரொம்ப வெறுக்குற குணம் எது?',
    transliteration: 'Mattavaṅkakiṭṭa nī rompa veṟukkuṟa kuṇam etu?',
    english: 'What is the trait you most deplore in others?',
    isGate: false,
  },
  {
    id: 4,
    tamilNumeral: '௫',
    tamil: 'உயிரோட இருக்குறவங்கள்ல நீ ரொம்ப மதிக்குறது யாரு?',
    transliteration: 'Uyirōṭa irukkuṟavaṅkaḷla nī rompa matikkuṟatu yāru?',
    english: 'Which living person do you most admire?',
    isGate: false,
  },
  {
    id: 5,
    tamilNumeral: '௬',
    tamil: 'உன்னோட ரொம்பப் பெரிய ஆடம்பரம் என்ன?',
    transliteration: 'Uṉṉōṭa rompap periya āṭamparam eṉṉa?',
    english: 'What is your greatest extravagance?',
    isGate: false,
  },
  {
    id: 6,
    tamilNumeral: '௭',
    tamil: 'இப்ப உன் மனசு எப்படி இருக்கு?',
    transliteration: 'Ippa uṉ maṉacu eppaṭi irukku?',
    english: 'What is your current state of mind?',
    sangamRef: 'cf. Akam poetry: உள்ளம் (uḷḷam) — the inner landscape',
    isGate: false,
  },
  {
    id: 7,
    tamilNumeral: '௮',
    tamil: 'ஓவரா மதிக்கப்படுற நல்ல குணம் எதுன்னு நெனைக்க?',
    transliteration: 'Ōvarā matikkappaṭuṟa nalla kuṇam etuṉṉu neṉaikka?',
    english: 'What do you consider the most overrated virtue?',
    isGate: false,
  },
  {
    id: 8,
    tamilNumeral: '௯',
    tamil: 'எப்ப நீ பொய் சொல்லுவ?',
    transliteration: 'Eppa nī poy colluvā?',
    english: 'On what occasion do you lie?',
    sangamRef: 'cf. Tirukkuṟaḷ 292: பொய்யாமை பொய்யாமை ஆற்றின்',
    isGate: false,
  },
  {
    id: 9,
    tamilNumeral: '௧௦',
    tamil: 'உன் தோற்றத்துல உனக்கு ரொம்ப புடிக்காதது என்ன?',
    transliteration: 'Uṉ tōṟṟattula uṉakku rompa puṭikkātatu eṉṉa?',
    english: 'What do you most dislike about your appearance?',
    isGate: false,
  },
  {
    id: 10,
    tamilNumeral: '௧௧',
    tamil: 'உயிரோட இருக்குறவங்கள்ல நீ ரொம்ப வெறுக்குறது யாரு?',
    transliteration: 'Uyirōṭa irukkuṟavaṅkaḷla nī rompa veṟukkuṟatu yāru?',
    english: 'Which living person do you most despise?',
    isGate: false,
  },
  {
    id: 11,
    tamilNumeral: '௧௨',
    tamil: 'ஆம்பிளைகிட்ட நீ ரொம்ப புடிக்குற குணம் என்ன?',
    transliteration: 'Āmpiḷaikiṭṭa nī rompa puṭikkuṟa kuṇam eṉṉa?',
    english: 'What is the quality you most like in a man?',
    isGate: false,
  },
  {
    id: 12,
    tamilNumeral: '௧௩',
    tamil: 'பொண்ணுகிட்ட நீ ரொம்ப புடிக்குற குணம் என்ன?',
    transliteration: 'Poṇṇukiṭṭa nī rompa puṭikkuṟa kuṇam eṉṉa?',
    english: 'What is the quality you most like in a woman?',
    isGate: false,
  },
  {
    id: 13,
    tamilNumeral: '௧௪',
    tamil: 'நீ ரொம்ப அதிகமா சொல்லுற வார்த்தைங்க என்ன?',
    transliteration: 'Nī rompa atikamā colluṟa vārttaiṅka eṉṉa?',
    english: 'Which words or phrases do you most overuse?',
    isGate: false,
  },
  {
    id: 14,
    tamilNumeral: '௧௫',
    tamil: 'உன் வாழ்க்கையோட ரொம்பப் பெரிய காதல் யாரு அல்லது என்ன?',
    transliteration: 'Uṉ vāḻkkaiyōṭa rompap periya kātal yāru allatu eṉṉa?',
    english: 'What or who is the greatest love of your life?',
    sangamRef: 'cf. Kuṟuntokai: காதல் (kātal) — love as life-force',
    isGate: false,
  },
  {
    id: 15,
    tamilNumeral: '௧௬',
    tamil: 'நீ எப்ப, எங்க ரொம்ப சந்தோஷமா இருந்த?',
    transliteration: 'Nī eppa, eṅka rompa cantōṣamā irunta?',
    english: 'When and where were you happiest?',
    isGate: false,
  },
  {
    id: 16,
    tamilNumeral: '௧௭',
    tamil: 'என்ன திறமை உனக்கு ரொம்ப வேணும்ன்னு ஆசப்படுவ?',
    transliteration: 'Eṉṉa tiṟamai uṉakku rompa vēṇumṉṉu ācappaṭuvā?',
    english: 'Which talent would you most like to have?',
    isGate: false,
  },
  {
    id: 17,
    tamilNumeral: '௧௮',
    tamil: 'உன்னுல ஒண்ணு மாத்திக்கலாம்ன்னா, அது என்னா இருக்கும்?',
    transliteration: 'Uṉṉula oṇṇu māttikkalāmṉṉā, atu eṉṉā irukkum?',
    english: 'If you could change one thing about yourself, what would it be?',
    isGate: false,
  },
  {
    id: 18,
    tamilNumeral: '௧௯',
    tamil: 'உன்னோட ரொம்பப் பெரிய சாதனை என்னன்னு நெனைக்க?',
    transliteration: 'Uṉṉōṭa rompap periya cātaṉai eṉṉaṉṉu neṉaikka?',
    english: 'What do you consider your greatest achievement?',
    isGate: false,
  },
  {
    id: 19,
    tamilNumeral: '௨௦',
    tamil: 'நீ செத்துப் போயி திரும்பி வந்தா, யாரா அல்லது என்னா வர விரும்புவ?',
    transliteration: 'Nī cettup pōyi tirumpi vantā, yārā allatu eṉṉā vara virumpuvā?',
    english: 'If you were to die and come back as a person or a thing, what would it be?',
    sangamRef: 'cf. புனர்ஜன்மம் (puṉarjaṉmam) — rebirth',
    isGate: false,
  },
  {
    id: 20,
    tamilNumeral: '௨௧',
    tamil: 'நீ ரொம்ப வாழ விரும்புற இடம் எது?',
    transliteration: 'Nī rompa vāḻa virumpuṟa iṭam etu?',
    english: 'Where would you most like to live?',
    isGate: false,
  },
  {
    id: 21,
    tamilNumeral: '௨௨',
    tamil: 'உன்னோட ரொம்ப பொக்கிஷமான பொருள் என்ன?',
    transliteration: 'Uṉṉōṭa rompa pokkiṣamāṉa poruḷ eṉṉa?',
    english: 'What is your most treasured possession?',
    isGate: false,
  },
  {
    id: 22,
    tamilNumeral: '௨௩',
    tamil: 'துன்பத்தோட ரொம்ப ஆழமான நெலை எதுன்னு நெனைக்க?',
    transliteration: 'Tuṉpattōṭa rompa āḻamāṉa nelai etuṉṉu neṉaikka?',
    english: 'What do you regard as the lowest depth of misery?',
    sangamRef: 'cf. Tirukkuṟaḷ: துன்பம் (tuṉpam) — suffering',
    isGate: false,
  },
  {
    id: 23,
    tamilNumeral: '௨௪',
    tamil: 'உனக்கு ரொம்ப புடிச்ச வேலை என்ன?',
    transliteration: 'Uṉakku rompa puṭicca vēlai eṉṉa?',
    english: 'What is your favorite occupation?',
    isGate: false,
  },
  {
    id: 24,
    tamilNumeral: '௨௫',
    tamil: 'உன்னோட ரொம்ப முக்கியமான குணம் என்ன?',
    transliteration: 'Uṉṉōṭa rompa mukkiyamāṉa kuṇam eṉṉa?',
    english: 'What is your most marked characteristic?',
    isGate: false,
  },
  {
    id: 25,
    tamilNumeral: '௨௬',
    tamil: 'நண்பன்கிட்ட நீ ரொம்ப மதிக்குறது என்ன?',
    transliteration: 'Naṇpaṉkiṭṭa nī rompa matikkuṟatu eṉṉa?',
    english: 'What do you most value in your friends?',
    sangamRef: 'cf. Tirukkuṟaḷ 781-790: நட்பு (naṭpu) — friendship',
    isGate: false,
  },
  {
    id: 26,
    tamilNumeral: '௨௭',
    tamil: 'உனக்கு புடிச்ச எழுத்தாளர்கள் யாரு?',
    transliteration: 'Uṉakku puṭicca eḻuttāḷarkaḷ yāru?',
    english: 'Who are your favorite writers?',
    isGate: false,
  },
  {
    id: 27,
    tamilNumeral: '௨௮',
    tamil: 'கற்பனைல உன் நாயகன் யாரு?',
    transliteration: 'Kaṟpaṉaila uṉ nāyakaṉ yāru?',
    english: 'Who is your hero of fiction?',
    isGate: false,
  },
  {
    id: 28,
    tamilNumeral: '௨௯',
    tamil: 'எந்த வரலாற்று ஆளோட நீ ரொம்ப ஒத்துப்போற?',
    transliteration: 'Enta varalāṟṟu āḷōṭa nī rompa ottuppōṟa?',
    english: 'Which historical figure do you most identify with?',
    isGate: false,
  },
  {
    id: 29,
    tamilNumeral: '௩௦',
    tamil: 'நிஜ வாழ்க்கையில உன் நாயகங்க யாரு?',
    transliteration: 'Nija vāḻkkaiyila uṉ nāyakaṅka yāru?',
    english: 'Who are your heroes in real life?',
    isGate: false,
  },
  {
    id: 30,
    tamilNumeral: '௩௧',
    tamil: 'உனக்கு புடிச்ச பேர்கள் என்ன?',
    transliteration: 'Uṉakku puṭicca pērkaḷ eṉṉa?',
    english: 'What are your favorite names?',
    isGate: false,
  },
  {
    id: 31,
    tamilNumeral: '௩௨',
    tamil: 'உனக்கு ரொம்ப புடிக்காதது என்ன?',
    transliteration: 'Uṉakku rompa puṭikkātatu eṉṉa?',
    english: 'What is it that you most dislike?',
    sangamRef: 'Proust: "My own worst qualities"',
    isGate: false,
  },
  {
    id: 32,
    tamilNumeral: '௩௩',
    tamil: 'உன்னோட ரொம்பப் பெரிய வருத்தம் என்ன?',
    transliteration: 'Uṉṉōṭa rompap periya varuttam eṉṉa?',
    english: 'What is your greatest regret?',
    isGate: false,
  },
  {
    id: 33,
    tamilNumeral: '௩௪',
    tamil: 'நீ எப்படி சாக விரும்புவ?',
    transliteration: 'Nī eppaṭi cāka virumpuvā?',
    english: 'How would you like to die?',
    sangamRef: 'cf. Puṟanāṉūṟu: சாவு (cāvu) — death as transition',
    isGate: false,
  },
  {
    id: 34,
    tamilNumeral: '௩௫',
    tamil: 'உன் வாழ்க்கையோட தாரக மந்திரம் என்ன?',
    transliteration: 'Uṉ vāḻkkaiyōṭa tāraka mantiram eṉṉa?',
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
