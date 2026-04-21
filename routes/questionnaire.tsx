import { Handlers, PageProps } from '$fresh/server.ts';
import JourneyLayout from '../components/JourneyLayout.tsx';
import LocalizedText from '../components/LocalizedText.tsx';
import { verifyQuestionnaireJWT } from '../lib/jwt.ts';
import {
  getSessionById,
  updateSessionIndex,
  updateSessionProgress,
} from '../lib/questionnaire-session.ts';
import { parseQuestionOrder } from '../lib/questionnaire.ts';
import { increment, trackFunnelQuestion, trackTemporalPattern } from '../lib/metrics.ts';
import { storeEncryptedAnswer } from '../lib/gate-client.ts';
import { getQuestionById, type Question } from '../lib/questions_dakshinaparvanuvadam.ts';
import {
  type LanguageMode,
  resolveLanguagePreference,
  withLanguageCookie,
} from '../lib/language.ts';

interface QuestionnaireData {
  authenticated: boolean;
  sessionId: string;
  currentIndex: number;
  currentQuestion: Question;
  questionNumber: number;
  totalQuestions: number;
  isFirstQuestion: boolean;
  htmlLang: string;
  langMode: LanguageMode;
}

function getCookie(cookieHeader: string | null, name: string): string | null {
  if (!cookieHeader) return null;
  const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

export const handler: Handlers<QuestionnaireData> = {
  async GET(req, ctx) {
    increment('requests.api');

    const cookies = req.headers.get('Cookie');
    const jwtToken = getCookie(cookies, 'jwt');
    if (!jwtToken) {
      increment('questionnaire.no_jwt');
      return new Response(null, {
        status: 302,
        headers: { Location: '/' },
      });
    }

    const jwtPayload = await verifyQuestionnaireJWT(jwtToken);
    if (!jwtPayload) {
      increment('questionnaire.invalid_jwt');
      return new Response(null, {
        status: 302,
        headers: { Location: '/' },
      });
    }

    const session = await getSessionById(jwtPayload.session_id);
    if (!session) {
      increment('questionnaire.session_not_found');
      return new Response(null, {
        status: 302,
        headers: { Location: '/' },
      });
    }

    const questionOrder = parseQuestionOrder(session.questionOrder);
    const totalQuestions = questionOrder.length;
    const currentIndex = session.currentIndex;

    if (currentIndex >= totalQuestions) {
      return new Response(null, {
        status: 302,
        headers: { Location: '/completion.html' },
      });
    }

    const questionId = questionOrder[currentIndex];
    const currentQuestion = getQuestionById(questionId);
    if (!currentQuestion) {
      increment('errors.5xx');
      return new Response(null, {
        status: 302,
        headers: { Location: '/' },
      });
    }

    increment('questionnaire.viewed');
    trackTemporalPattern();

    const preference = resolveLanguagePreference(req);
    const headers = withLanguageCookie(undefined, req, preference.mode);

    return ctx.render(
      {
        authenticated: true,
        sessionId: session.sessionId,
        currentIndex,
        currentQuestion,
        questionNumber: currentIndex + 1,
        totalQuestions,
        isFirstQuestion: currentIndex === 0,
        htmlLang: preference.htmlLang,
        langMode: preference.mode,
      },
      { headers },
    );
  },

  async POST(req, _ctx) {
    increment('requests.api');

    const cookies = req.headers.get('Cookie');
    const jwtToken = getCookie(cookies, 'jwt');
    if (!jwtToken) {
      return new Response(null, {
        status: 302,
        headers: { Location: '/' },
      });
    }

    const jwtPayload = await verifyQuestionnaireJWT(jwtToken);
    if (!jwtPayload) {
      return new Response(null, {
        status: 302,
        headers: { Location: '/' },
      });
    }

    const session = await getSessionById(jwtPayload.session_id);
    if (!session) {
      return new Response(null, {
        status: 302,
        headers: { Location: '/' },
      });
    }

    const formData = await req.formData();
    const answer = formData.get('answer')?.toString() || '';
    const action = formData.get('action')?.toString() || 'continue';
    const questionOrder = parseQuestionOrder(session.questionOrder);
    const currentIndex = session.currentIndex;

    if (action === 'previous') {
      if (currentIndex > 0) {
        await updateSessionIndex(session.sessionId, currentIndex - 1);
        increment('feature.previous_used');
      }
      return new Response(null, {
        status: 302,
        headers: { Location: '/questionnaire' },
      });
    }

    const questionId = questionOrder[currentIndex];
    const question = getQuestionById(questionId);
    if (!question) {
      increment('errors.5xx');
      return new Response(null, {
        status: 302,
        headers: { Location: '/' },
      });
    }

    const skipped = action === 'skip' || answer.trim() === '';

    trackFunnelQuestion(questionId);
    if (skipped) {
      increment('feature.skip_used');
    }

    try {
      await storeEncryptedAnswer({
        sessionId: session.sessionId,
        questionText: question.english,
        questionIndex: questionId,
        answer: skipped ? '' : answer,
        skipped,
      });
    } catch {
      console.error('[questionnaire] Error storing encrypted response');
    }

    const nextIndex = currentIndex + 1;
    if (skipped) {
      await updateSessionIndex(session.sessionId, nextIndex);
    } else {
      await updateSessionProgress(session.sessionId, questionId, nextIndex);
    }

    if (nextIndex >= questionOrder.length) {
      return new Response(null, {
        status: 302,
        headers: { Location: '/completion.html' },
      });
    }

    return new Response(null, {
      status: 302,
      headers: { Location: '/questionnaire' },
    });
  },
};

export default function QuestionnairePage({ data }: PageProps<QuestionnaireData>) {
  const progress = `${(data.questionNumber / data.totalQuestions) * 100}%`;
  const placeholder = data.langMode === 'spanish-only'
    ? 'Escribe lo que aparezca, aunque todavía no tenga forma...'
    : data.langMode === 'tamil-only' ||
        data.langMode === 'tamil-translit' ||
        data.langMode === 'all'
    ? 'மனத்தில் வரும் முதல் அசைவைக் கைவிடாதே...'
    : 'Write the first shape of the thought before it hardens...';

  return (
    <JourneyLayout
      currentMode={data.langMode}
      htmlLang={data.htmlLang}
      pageTitle='a formulation of truth'
      description='Continue the encrypted Proust questionnaire.'
      stage={`Question ${data.questionNumber} / ${data.totalQuestions}`}
      title={
        <LocalizedText
          as='span'
          tamil='உள் வானிலை'
          transliteration='Uḷ vāṉilai'
          english='interior weather'
          spanish='tiempo interior'
        />
      }
      lead={
        <LocalizedText
          as='span'
          tamil='அவசரம் வேண்டாம். ஒவ்வொரு பதிலும் அடுத்த கேள்வியின் வெளிச்சத்தை மாற்றும்.'
          transliteration='Avasaram vēṇṭām. Ovvoru patilum aṭutta kēḷviyiṉ veḷiccatthai māṟṟum.'
          english='Move with enough slowness that each answer can alter the light of the next question.'
          spanish='Avanza con la lentitud suficiente para que cada respuesta altere la luz de la siguiente pregunta.'
        />
      }
    >
      <div
        style={{
          height: '4px',
          background: 'rgba(248, 240, 218, 0.08)',
          marginBottom: '1.2rem',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            width: progress,
            height: '100%',
            background:
              'linear-gradient(90deg, rgba(245, 199, 106, 0.92), rgba(106, 215, 255, 0.88))',
            boxShadow: '0 0 28px rgba(245, 199, 106, 0.25)',
          }}
        />
      </div>

      <LocalizedText
        as='p'
        className='journey-copy'
        tamil={`கேள்வி ${data.questionNumber} / ${data.totalQuestions}`}
        transliteration={`Kēḷvi ${data.questionNumber} / ${data.totalQuestions}`}
        english={`Question ${data.questionNumber} of ${data.totalQuestions}`}
        spanish={`Pregunta ${data.questionNumber} de ${data.totalQuestions}`}
      />

      <form method='POST' action='/questionnaire' class='journey-form'>
        <div class='journey-field'>
          <LocalizedText
            as='label'
            htmlFor='answer'
            tamil={data.currentQuestion.tamil}
            transliteration={data.currentQuestion.transliteration}
            english={data.currentQuestion.english}
            spanish={data.currentQuestion.spanish}
          />
          <textarea
            id='answer'
            name='answer'
            placeholder={placeholder}
            aria-describedby='questionnaire-note'
          >
          </textarea>
        </div>

        <div class='journey-actions'>
          <button
            type='submit'
            name='action'
            value='previous'
            class='journey-button journey-button--secondary'
            disabled={data.isFirstQuestion}
            style={data.isFirstQuestion ? { opacity: '0.45', cursor: 'not-allowed' } : undefined}
          >
            {data.langMode === 'spanish-only' ? 'Anterior' : data.langMode === 'tamil-only' ||
                data.langMode === 'tamil-translit' ||
                data.langMode === 'all'
              ? 'முன்'
              : 'Prior'}
          </button>
          <button
            type='submit'
            name='action'
            value='continue'
            class='journey-button journey-button--primary'
          >
            {data.langMode === 'spanish-only' ? 'Continuar' : data.langMode === 'tamil-only' ||
                data.langMode === 'tamil-translit' ||
                data.langMode === 'all'
              ? 'தொடர்'
              : 'Continue'}
          </button>
          <button
            type='submit'
            name='action'
            value='skip'
            class='journey-button journey-button--secondary'
          >
            {data.langMode === 'spanish-only' ? 'Omitir' : data.langMode === 'tamil-only' ||
                data.langMode === 'tamil-translit' ||
                data.langMode === 'all'
              ? 'விட்டு செல்'
              : 'Skip'}
          </button>
        </div>

        <LocalizedText
          as='p'
          id='questionnaire-note'
          className='journey-meta'
          tamil='பதில் சேமிக்கப்படும் முன் குறியாக்கம் செய்யப்படும்.'
          transliteration='Patil cēmikkappaṭum muṉ kuṟiyākkam ceyyappaṭum.'
          english='Every answer is encrypted before it leaves this page.'
          spanish='Cada respuesta se cifra antes de salir de esta página.'
        />
      </form>
    </JourneyLayout>
  );
}
