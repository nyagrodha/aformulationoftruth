import { Handlers, PageProps } from '$fresh/server.ts';
import JourneyLayout from '../components/JourneyLayout.tsx';
import LocalizedText from '../components/LocalizedText.tsx';
import { randomToken } from '../lib/crypto.ts';
import { increment, trackFunnelQuestion, trackTemporalPattern } from '../lib/metrics.ts';
import { getGateQuestions, type Question } from '../lib/questions_dakshinaparvanuvadam.ts';
import {
  type LanguageMode,
  resolveLanguagePreference,
  shouldSecureCookies,
  withLanguageCookie,
} from '../lib/language.ts';

const GATE_QUESTIONS: Question[] = getGateQuestions();

function getCookieSecureFlag(req: Request): string {
  return shouldSecureCookies(req) ? '; Secure' : '';
}

interface GateData {
  questionIndex: number;
  question: Question;
  gateToken: string;
  error?: string;
  htmlLang: string;
  langMode: LanguageMode;
}

function getCookie(cookieHeader: string | null, name: string): string | null {
  if (!cookieHeader) return null;
  const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

export const handler: Handlers<GateData> = {
  GET(req, ctx) {
    increment('requests.api');
    increment('funnel.gate.viewed');
    trackTemporalPattern();

    const preference = resolveLanguagePreference(req);
    const cookies = req.headers.get('Cookie');
    let gateToken = getCookie(cookies, 'gate_token');
    let questionIndex = parseInt(getCookie(cookies, 'gate_q') || '0', 10);

    if (Number.isNaN(questionIndex) || questionIndex < 0) {
      questionIndex = 0;
    }

    if (questionIndex >= GATE_QUESTIONS.length) {
      return new Response(null, {
        status: 302,
        headers: { Location: '/login' },
      });
    }

    if (!gateToken) {
      gateToken = `gate_${randomToken(16)}`;
    }

    const secureFlag = getCookieSecureFlag(req);
    const headers = withLanguageCookie(undefined, req, preference.mode);
    headers.append(
      'Set-Cookie',
      `gate_token=${gateToken}; HttpOnly; SameSite=Strict; Path=/; Max-Age=3600${secureFlag}`,
    );
    headers.append(
      'Set-Cookie',
      `gate_q=${questionIndex}; HttpOnly; SameSite=Strict; Path=/; Max-Age=3600${secureFlag}`,
    );

    return ctx.render(
      {
        questionIndex,
        question: GATE_QUESTIONS[questionIndex],
        gateToken,
        htmlLang: preference.htmlLang,
        langMode: preference.mode,
      },
      { headers },
    );
  },

  async POST(req, _ctx) {
    increment('requests.api');

    const cookies = req.headers.get('Cookie');
    const gateToken = getCookie(cookies, 'gate_token');
    const questionIndex = parseInt(getCookie(cookies, 'gate_q') || '0', 10);

    if (!gateToken) {
      return new Response(null, {
        status: 302,
        headers: { Location: '/gate' },
      });
    }

    const formData = await req.formData();
    const answer = formData.get('answer')?.toString() || '';
    const action = formData.get('action')?.toString() || 'continue';
    const skipped = action === 'skip' || answer.trim() === '';

    trackFunnelQuestion(questionIndex);
    if (action === 'skip') {
      increment('feature.skip_used');
    }

    try {
      const storeRes = await fetch(new URL('/api/gate', req.url), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          gateToken,
          questionIndex,
          answer: skipped ? '' : answer,
          skipped,
        }),
      });

      if (!storeRes.ok) {
        console.error('[gate] Failed to store response');
      }
    } catch {
      console.error('[gate] Error storing response');
    }

    const nextIndex = questionIndex + 1;
    const secureFlag = getCookieSecureFlag(req);

    if (nextIndex >= GATE_QUESTIONS.length) {
      const headers = new Headers();
      headers.set('Location', '/login');
      headers.append(
        'Set-Cookie',
        `gate_q=${nextIndex}; HttpOnly; SameSite=Strict; Path=/; Max-Age=3600${secureFlag}`,
      );
      return new Response(null, { status: 302, headers });
    }

    const headers = new Headers();
    headers.set('Location', '/gate');
    headers.append(
      'Set-Cookie',
      `gate_q=${nextIndex}; HttpOnly; SameSite=Strict; Path=/; Max-Age=3600${secureFlag}`,
    );
    return new Response(null, { status: 302, headers });
  },
};

export default function GatePage({ data }: PageProps<GateData>) {
  const { questionIndex, question, gateToken, htmlLang, langMode } = data;
  const placeholder = langMode === 'spanish-only'
    ? 'Respira y escribe con calma...'
    : langMode === 'tamil-only' || langMode === 'tamil-translit' || langMode === 'all'
    ? 'மெதுவாக எண்ணி எழுதுங்கள்...'
    : 'Take your time and write slowly...';

  return (
    <JourneyLayout
      currentMode={langMode}
      htmlLang={htmlLang}
      pageTitle='a formulation of truth'
      description='The first gate into the questionnaire.'
      stage={`Gate ${questionIndex + 1} / ${GATE_QUESTIONS.length}`}
      title={
        <LocalizedText
          as='span'
          tamil='வாயில்'
          transliteration='Vāyil'
          english='the gate'
          spanish='el umbral'
        />
      }
      lead={
        <LocalizedText
          as='span'
          tamil='மரியாதைக்குரிய பதில் வேண்டாம். உண்மையைத் தொடும் பதில் மட்டும் போதும்.'
          transliteration='Mariyātaikkuriya patil vēṇṭām. Uṇmaiyait toṭum patil maṭṭum pōtum.'
          english='Do not answer politely. Answer closely enough that the water moves around your feet.'
          spanish='No respondas con cortesía. Responde lo bastante cerca de la verdad como para sentir el agua en los pies.'
        />
      }
    >
      <LocalizedText
        as='p'
        className='journey-copy'
        tamil='ஒவ்வொரு கேள்வியும் உன்னை அடுத்த அறைக்குக் கொண்டு செல்கிறது.'
        transliteration='Ovvoru kēḷviyum uṉṉai aṭutta aṟaikkuk koṇṭu celkiṟatu.'
        english='Each answer clears the next room.'
        spanish='Cada respuesta despeja la siguiente habitación.'
      />

      <form method='POST' action='/gate' class='journey-form'>
        <input type='hidden' name='gate_token' value={gateToken} />
        <input type='hidden' name='question_index' value={questionIndex} />

        <div class='journey-field'>
          <LocalizedText
            as='label'
            htmlFor='answer'
            tamil={question.tamil}
            transliteration={question.transliteration}
            english={question.english}
            spanish={question.spanish}
          />
          <textarea
            id='answer'
            name='answer'
            placeholder={placeholder}
            aria-describedby='journey-note'
          >
          </textarea>
        </div>

        <div class='journey-actions'>
          <button
            type='submit'
            name='action'
            value='continue'
            class='journey-button journey-button--primary'
          >
            {langMode === 'spanish-only'
              ? 'Continuar'
              : langMode === 'tamil-only' || langMode === 'tamil-translit' || langMode === 'all'
              ? 'தொடர்'
              : 'Continue'}
          </button>
          <button
            type='submit'
            name='action'
            value='skip'
            class='journey-button journey-button--secondary'
          >
            {langMode === 'spanish-only'
              ? 'Omitir'
              : langMode === 'tamil-only' || langMode === 'tamil-translit' || langMode === 'all'
              ? 'விட்டு செல்'
              : 'Skip'}
          </button>
        </div>

        <LocalizedText
          as='p'
          className='journey-meta'
          id='journey-note'
          tamil='வாய்ச் சொற்கள் வேண்டுமெனில் Handy பயன்பாட்டை பயன்படுத்தலாம்.'
          transliteration='Vāyc coṟkaḷ vēṇṭumeṉil Handy payaṉpāṭṭai payaṉpaṭuttalām.'
          english='If you prefer voice input, Handy works offline and stays on-device.'
          spanish='Si prefieres dictar, Handy funciona sin conexión y se queda en tu dispositivo.'
        />
      </form>
    </JourneyLayout>
  );
}
