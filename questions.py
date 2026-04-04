"""
Questions: Dakshina Parva Anuvadam
(Southern Chapter Translation)

35 Proust Questionnaire questions in Tamil with ISO 15919
transliteration and English translation.
"""

from dataclasses import dataclass


@dataclass(frozen=True, slots=True)
class Question:
    id: int
    tamil_numeral: str
    tamil: str
    transliteration: str
    english: str
    is_gate: bool
    sangam_ref: str = ""


# Tamil numerals
_TAMIL_DIGITS = "௦௧௨௩௪௫௬௭௮௯"


def to_tamil_numeral(n: int) -> str:
    if n == 0:
        return _TAMIL_DIGITS[0]
    result = []
    while n > 0:
        result.append(_TAMIL_DIGITS[n % 10])
        n //= 10
    return "".join(reversed(result))


QUESTIONS: list[Question] = [
    # Gate questions (shown on landing, in order)
    Question(
        id=0,
        tamil_numeral="௧",
        tamil="முழுமையான சந்தோஷம்ன்னா உனக்கு என்ன?",
        transliteration="Muḻumaiyāṉa cantōṣamṉṉā uṉakku eṉṉa?",
        english="What is your idea of perfect happiness?",
        is_gate=True,
        sangam_ref="cf. Tirukkuṟaḷ 66: இன்பம் விழையாதவர் இல்லை",
    ),
    Question(
        id=1,
        tamil_numeral="௨",
        tamil="உன்னோட ரொம்பப் பெரிய பயம் என்ன?",
        transliteration="Uṉṉōṭa rompap periya payam eṉṉa?",
        english="What is your greatest fear?",
        is_gate=True,
        sangam_ref="cf. Tirukkuṟaḷ 428: அஞ்சுவது அஞ்சாமை பேதைமை",
    ),
    # Main questionnaire (shuffled per session)
    Question(
        id=2,
        tamil_numeral="௩",
        tamil="உன்னிட்ட நீ ரொம்ப வெறுக்குற குணம் எது?",
        transliteration="Uṉṉiṭṭa nī rompa veṟukkuṟa kuṇam etu?",
        english="What is the trait you most deplore in yourself?",
        is_gate=False,
    ),
    Question(
        id=3,
        tamil_numeral="௪",
        tamil="மத்தவங்ககிட்ட நீ ரொம்ப வெறுக்குற குணம் எது?",
        transliteration="Mattavaṅkakiṭṭa nī rompa veṟukkuṟa kuṇam etu?",
        english="What is the trait you most deplore in others?",
        is_gate=False,
    ),
    Question(
        id=4,
        tamil_numeral="௫",
        tamil="உயிரோட இருக்குறவங்கள்ல நீ ரொம்ப மதிக்குறது யாரு?",
        transliteration="Uyirōṭa irukkuṟavaṅkaḷla nī rompa matikkuṟatu yāru?",
        english="Which living person do you most admire?",
        is_gate=False,
    ),
    Question(
        id=5,
        tamil_numeral="௬",
        tamil="உன்னோட ரொம்பப் பெரிய ஆடம்பரம் என்ன?",
        transliteration="Uṉṉōṭa rompap periya āṭamparam eṉṉa?",
        english="What is your greatest extravagance?",
        is_gate=False,
    ),
    Question(
        id=6,
        tamil_numeral="௭",
        tamil="இப்ப உன் மனசு எப்படி இருக்கு?",
        transliteration="Ippa uṉ maṉacu eppaṭi irukku?",
        english="What is your current state of mind?",
        is_gate=False,
        sangam_ref="cf. Akam poetry: உள்ளம் (uḷḷam) — the inner landscape",
    ),
    Question(
        id=7,
        tamil_numeral="௮",
        tamil="ஓவரா மதிக்கப்படுற நல்ல குணம் எதுன்னு நெனைக்க?",
        transliteration="Ōvarā matikkappaṭuṟa nalla kuṇam etuṉṉu neṉaikka?",
        english="What do you consider the most overrated virtue?",
        is_gate=False,
    ),
    Question(
        id=8,
        tamil_numeral="௯",
        tamil="எப்ப நீ பொய் சொல்லுவ?",
        transliteration="Eppa nī poy colluvā?",
        english="On what occasion do you lie?",
        is_gate=False,
        sangam_ref="cf. Tirukkuṟaḷ 292: பொய்யாமை பொய்யாமை ஆற்றின்",
    ),
    Question(
        id=9,
        tamil_numeral="௧௦",
        tamil="உன் தோற்றத்துல உனக்கு ரொம்ப புடிக்காதது என்ன?",
        transliteration="Uṉ tōṟṟattula uṉakku rompa puṭikkātatu eṉṉa?",
        english="What do you most dislike about your appearance?",
        is_gate=False,
    ),
    Question(
        id=10,
        tamil_numeral="௧௧",
        tamil="உயிரோட இருக்குறவங்கள்ல நீ ரொம்ப வெறுக்குறது யாரு?",
        transliteration="Uyirōṭa irukkuṟavaṅkaḷla nī rompa veṟukkuṟatu yāru?",
        english="Which living person do you most despise?",
        is_gate=False,
    ),
    Question(
        id=11,
        tamil_numeral="௧௨",
        tamil="ஆம்பிளைகிட்ட நீ ரொம்ப புடிக்குற குணம் என்ன?",
        transliteration="Āmpiḷaikiṭṭa nī rompa puṭikkuṟa kuṇam eṉṉa?",
        english="What is the quality you most like in a man?",
        is_gate=False,
    ),
    Question(
        id=12,
        tamil_numeral="௧௩",
        tamil="பொண்ணுகிட்ட நீ ரொம்ப புடிக்குற குணம் என்ன?",
        transliteration="Poṇṇukiṭṭa nī rompa puṭikkuṟa kuṇam eṉṉa?",
        english="What is the quality you most like in a woman?",
        is_gate=False,
    ),
    Question(
        id=13,
        tamil_numeral="௧௪",
        tamil="நீ ரொம்ப அதிகமா சொல்லுற வார்த்தைங்க என்ன?",
        transliteration="Nī rompa atikamā colluṟa vārttaiṅka eṉṉa?",
        english="Which words or phrases do you most overuse?",
        is_gate=False,
    ),
    Question(
        id=14,
        tamil_numeral="௧௫",
        tamil="உன் வாழ்க்கையோட ரொம்பப் பெரிய காதல் யாரு அல்லது என்ன?",
        transliteration="Uṉ vāḻkkaiyōṭa rompap periya kātal yāru allatu eṉṉa?",
        english="What or who is the greatest love of your life?",
        is_gate=False,
        sangam_ref="cf. Kuṟuntokai: காதல் (kātal) — love as life-force",
    ),
    Question(
        id=15,
        tamil_numeral="௧௬",
        tamil="நீ எப்ப, எங்க ரொம்ப சந்தோஷமா இருந்த?",
        transliteration="Nī eppa, eṅka rompa cantōṣamā irunta?",
        english="When and where were you happiest?",
        is_gate=False,
    ),
    Question(
        id=16,
        tamil_numeral="௧௭",
        tamil="என்ன திறமை உனக்கு ரொம்ப வேணும்ன்னு ஆசப்படுவ?",
        transliteration="Eṉṉa tiṟamai uṉakku rompa vēṇumṉṉu ācappaṭuvā?",
        english="Which talent would you most like to have?",
        is_gate=False,
    ),
    Question(
        id=17,
        tamil_numeral="௧௮",
        tamil="உன்னுல ஒண்ணு மாத்திக்கலாம்ன்னா, அது என்னா இருக்கும்?",
        transliteration="Uṉṉula oṇṇu māttikkalāmṉṉā, atu eṉṉā irukkum?",
        english="If you could change one thing about yourself, what would it be?",
        is_gate=False,
    ),
    Question(
        id=18,
        tamil_numeral="௧௯",
        tamil="உன்னோட ரொம்பப் பெரிய சாதனை என்னன்னு நெனைக்க?",
        transliteration="Uṉṉōṭa rompap periya cātaṉai eṉṉaṉṉu neṉaikka?",
        english="What do you consider your greatest achievement?",
        is_gate=False,
    ),
    Question(
        id=19,
        tamil_numeral="௨௦",
        tamil="நீ செத்துப் போயி திரும்பி வந்தா, யாரா அல்லது என்னா வர விரும்புவ?",
        transliteration="Nī cettup pōyi tirumpi vantā, yārā allatu eṉṉā vara virumpuvā?",
        english="If you were to die and come back as a person or a thing, what would it be?",
        is_gate=False,
        sangam_ref="cf. புனர்ஜன்மம் (puṉarjaṉmam) — rebirth",
    ),
    Question(
        id=20,
        tamil_numeral="௨௧",
        tamil="நீ ரொம்ப வாழ விரும்புற இடம் எது?",
        transliteration="Nī rompa vāḻa virumpuṟa iṭam etu?",
        english="Where would you most like to live?",
        is_gate=False,
    ),
    Question(
        id=21,
        tamil_numeral="௨௨",
        tamil="உன்னோட ரொம்ப பொக்கிஷமான பொருள் என்ன?",
        transliteration="Uṉṉōṭa rompa pokkiṣamāṉa poruḷ eṉṉa?",
        english="What is your most treasured possession?",
        is_gate=False,
    ),
    Question(
        id=22,
        tamil_numeral="௨௩",
        tamil="துன்பத்தோட ரொம்ப ஆழமான நெலை எதுன்னு நெனைக்க?",
        transliteration="Tuṉpattōṭa rompa āḻamāṉa nelai etuṉṉu neṉaikka?",
        english="What do you regard as the lowest depth of misery?",
        is_gate=False,
        sangam_ref="cf. Tirukkuṟaḷ: துன்பம் (tuṉpam) — suffering",
    ),
    Question(
        id=23,
        tamil_numeral="௨௪",
        tamil="உனக்கு ரொம்ப புடிச்ச வேலை என்ன?",
        transliteration="Uṉakku rompa puṭicca vēlai eṉṉa?",
        english="What is your favorite occupation?",
        is_gate=False,
    ),
    Question(
        id=24,
        tamil_numeral="௨௫",
        tamil="உன்னோட ரொம்ப முக்கியமான குணம் என்ன?",
        transliteration="Uṉṉōṭa rompa mukkiyamāṉa kuṇam eṉṉa?",
        english="What is your most marked characteristic?",
        is_gate=False,
    ),
    Question(
        id=25,
        tamil_numeral="௨௬",
        tamil="நண்பன்கிட்ட நீ ரொம்ப மதிக்குறது என்ன?",
        transliteration="Naṇpaṉkiṭṭa nī rompa matikkuṟatu eṉṉa?",
        english="What do you most value in your friends?",
        is_gate=False,
        sangam_ref="cf. Tirukkuṟaḷ 781-790: நட்பு (naṭpu) — friendship",
    ),
    Question(
        id=26,
        tamil_numeral="௨௭",
        tamil="உனக்கு புடிச்ச எழுத்தாளர்கள் யாரு?",
        transliteration="Uṉakku puṭicca eḻuttāḷarkaḷ yāru?",
        english="Who are your favorite writers?",
        is_gate=False,
    ),
    Question(
        id=27,
        tamil_numeral="௨௮",
        tamil="கற்பனைல உன் நாயகன் யாரு?",
        transliteration="Kaṟpaṉaila uṉ nāyakaṉ yāru?",
        english="Who is your hero of fiction?",
        is_gate=False,
    ),
    Question(
        id=28,
        tamil_numeral="௨௯",
        tamil="எந்த வரலாற்று ஆளோட நீ ரொம்ப ஒத்துப்போற?",
        transliteration="Enta varalāṟṟu āḷōṭa nī rompa ottuppōṟa?",
        english="Which historical figure do you most identify with?",
        is_gate=False,
    ),
    Question(
        id=29,
        tamil_numeral="௩௦",
        tamil="நிஜ வாழ்க்கையில உன் நாயகங்க யாரு?",
        transliteration="Nija vāḻkkaiyila uṉ nāyakaṅka yāru?",
        english="Who are your heroes in real life?",
        is_gate=False,
    ),
    Question(
        id=30,
        tamil_numeral="௩௧",
        tamil="உனக்கு புடிச்ச பேர்கள் என்ன?",
        transliteration="Uṉakku puṭicca pērkaḷ eṉṉa?",
        english="What are your favorite names?",
        is_gate=False,
    ),
    Question(
        id=31,
        tamil_numeral="௩௨",
        tamil="உனக்கு ரொம்ப புடிக்காதது என்ன?",
        transliteration="Uṉakku rompa puṭikkātatu eṉṉa?",
        english="What is it that you most dislike?",
        is_gate=False,
        sangam_ref='Proust: "My own worst qualities"',
    ),
    Question(
        id=32,
        tamil_numeral="௩௩",
        tamil="உன்னோட ரொம்பப் பெரிய வருத்தம் என்ன?",
        transliteration="Uṉṉōṭa rompap periya varuttam eṉṉa?",
        english="What is your greatest regret?",
        is_gate=False,
    ),
    Question(
        id=33,
        tamil_numeral="௩௪",
        tamil="நீ எப்படி சாக விரும்புவ?",
        transliteration="Nī eppaṭi cāka virumpuvā?",
        english="How would you like to die?",
        is_gate=False,
        sangam_ref="cf. Puṟanāṉūṟu: சாவு (cāvu) — death as transition",
    ),
    Question(
        id=34,
        tamil_numeral="௩௫",
        tamil="உன் வாழ்க்கையோட தாரக மந்திரம் என்ன?",
        transliteration="Uṉ vāḻkkaiyōṭa tāraka mantiram eṉṉa?",
        english="What is your motto?",
        is_gate=False,
        sangam_ref="தாரக மந்திரம் (tāraka mantiram) — the liberating utterance",
    ),
]

GATE_QUESTIONS = [q for q in QUESTIONS if q.is_gate]
MAIN_QUESTIONS = [q for q in QUESTIONS if not q.is_gate]
TOTAL_QUESTIONS = len(GATE_QUESTIONS) + len(MAIN_QUESTIONS)
