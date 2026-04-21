import { Handlers, PageProps } from '$fresh/server.ts';
import JourneyLayout from '../components/JourneyLayout.tsx';
import LocalizedText from '../components/LocalizedText.tsx';
import {
  type LanguageMode,
  resolveLanguagePreference,
  withLanguageCookie,
} from '../lib/language.ts';

interface LoginData {
  gateToken?: string;
  htmlLang: string;
  langMode: LanguageMode;
}

function getCookie(cookieHeader: string | null, name: string): string | null {
  if (!cookieHeader) return null;
  const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

export const handler: Handlers<LoginData> = {
  GET(req, ctx) {
    const preference = resolveLanguagePreference(req);
    const gateToken = getCookie(req.headers.get('Cookie'), 'gate_token') || '';
    const headers = withLanguageCookie(undefined, req, preference.mode);

    return ctx.render(
      {
        gateToken,
        htmlLang: preference.htmlLang,
        langMode: preference.mode,
      },
      { headers },
    );
  },
};

export default function LoginPage({ data }: PageProps<LoginData>) {
  const copy = {
    title: {
      tamil: 'மீண்டும் வர வேண்டிய நேரம்',
      transliteration: 'Mīṇṭum vara vēṇṭiya nēram',
      english: 'the next return begins here',
      spanish: 'el siguiente regreso comienza aquí',
    },
    lead: {
      tamil: 'உன் மின்னஞ்சலை இடு. திரும்ப வர வேண்டிய வாசலை நாங்கள் அனுப்புவோம்.',
      transliteration: 'Uṉ miṉṉañcalai iṭu. Tirumpa vara vēṇṭiya vācalai nāṅkaḷ aṉuppuvōm.',
      english:
        'Enter your email and we will send the authenticated path back into the questionnaire.',
      spanish:
        'Introduce tu correo y te enviaremos el acceso autenticado para volver al cuestionario.',
    },
    intro: {
      tamil: 'இது ஒரு சின்ன அறிவிப்பு அல்ல. இது உன் இடத்தை நினைவில் வைத்திருக்கும் கதவு.',
      transliteration: 'Itu oru ciṉṉa aṟivippu alla. Itu uṉ iṭattai niṉaivil vaittirukkum katavu.',
      english:
        'This is not a newsletter prompt. It is the return vector that remembers where your inquiry paused.',
      spanish:
        'Esto no es un aviso cualquiera. Es el vector de regreso que recuerda dónde se detuvo tu indagación.',
    },
    emailLabel: {
      tamil: 'மின்னஞ்சல் முகவரி',
      transliteration: 'Miṉṉañcal mukavari',
      english: 'Email address',
      spanish: 'Correo electrónico',
    },
    emailPlaceholder: 'you@example.com',
    submit: {
      english: 'Send magic link',
      spanish: 'Enviar enlace mágico',
      tamil: 'மந்திர இணைப்பு அனுப்பு',
    },
    note: {
      tamil: 'தரவுகள் சேமிக்கப்படும் முன் குறியாக்கம் செய்யப்படும்.',
      transliteration: 'Taravukaḷ cēmikkappaṭum muṉ kuṟiyākkam ceyyappaṭum.',
      english:
        'Responses stay encrypted before storage and the login link carries no email address.',
      spanish:
        'Las respuestas se cifran antes de guardarse y el enlace de acceso no contiene tu correo.',
    },
  };

  const clientMessages = {
    english: {
      sending: 'Sending magic link...',
      successTitle: 'check your email',
      successBody: 'Your authenticated link is on its way. Open it on this device to continue.',
      invalid: 'Please enter a valid email address.',
      failure: 'Failed to send magic link. Please try again.',
      network: 'Network error. Please try again.',
    },
    spanish: {
      sending: 'Enviando enlace mágico...',
      successTitle: 'revisa tu correo',
      successBody:
        'Tu enlace autenticado ya va en camino. Ábrelo en este mismo dispositivo para continuar.',
      invalid: 'Introduce un correo electrónico válido.',
      failure: 'No se pudo enviar el enlace. Inténtalo de nuevo.',
      network: 'Error de red. Inténtalo de nuevo.',
    },
    tamil: {
      sending: 'இணைப்பை அனுப்புகிறோம்...',
      successTitle: 'மின்னஞ்சலை பார்க்கவும்',
      successBody: 'அங்கீகார இணைப்பு அனுப்பப்பட்டுள்ளது. இதே கருவியில் அதைத் திறந்து தொடரவும்.',
      invalid: 'சரியான மின்னஞ்சல் முகவரியை இடவும்.',
      failure: 'இணைப்பை அனுப்ப முடியவில்லை. மீண்டும் முயற்சிக்கவும்.',
      network: 'இணைய சிக்கல். மீண்டும் முயற்சிக்கவும்.',
    },
  };

  const loginScript = `
    (() => {
      const form = document.getElementById('login-form');
      const email = document.getElementById('email');
      const submit = document.getElementById('login-submit');
      const status = document.getElementById('login-status');
      const messages = ${JSON.stringify(clientMessages)};

      const getMode = () => localStorage.getItem('a4m_lang_mode') || document.body.dataset.langMode || 'english-only';
      const getMessages = (mode) => mode === 'spanish-only'
        ? messages.spanish
        : (mode === 'tamil-only' || mode === 'tamil-translit' || mode === 'all')
          ? messages.tamil
          : messages.english;

      if (!form || !email || !submit || !status) return;

      form.addEventListener('submit', async (event) => {
        event.preventDefault();
        const mode = getMode();
        const messageSet = getMessages(mode);
        const value = email.value.trim();

        if (!value || !/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(value)) {
          status.textContent = messageSet.invalid;
          return;
        }

        submit.disabled = true;
        submit.textContent = messageSet.sending;
        status.textContent = '';

        try {
          const response = await fetch('/api/auth/magic-link', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              email: value,
              gateToken: document.getElementById('gate_token')?.value || '',
              langMode: mode,
            }),
          });

          if (!response.ok) {
            const payload = await response.json().catch(() => ({ error: messageSet.failure }));
            throw new Error(payload.error || messageSet.failure);
          }

          document.getElementById('login-card').innerHTML = '<div class="journey-status"><strong>' + messageSet.successTitle + '</strong><span>' + messageSet.successBody + '</span></div>';
        } catch (error) {
          status.textContent = error instanceof Error ? error.message : messageSet.network;
          submit.disabled = false;
          submit.textContent = document.body.dataset.langMode === 'spanish-only'
            ? 'Enviar enlace mágico'
            : (document.body.dataset.langMode === 'tamil-only' || document.body.dataset.langMode === 'tamil-translit' || document.body.dataset.langMode === 'all')
              ? 'மந்திர இணைப்பு அனுப்பு'
              : 'Send magic link';
        }
      });
    })();
  `;

  return (
    <JourneyLayout
      currentMode={data.langMode}
      htmlLang={data.htmlLang}
      pageTitle='a formulation of truth'
      description='Request an authenticated return link for the Proust questionnaire.'
      stage='Authenticated Return'
      title={<LocalizedText as='span' {...copy.title} />}
      lead={<LocalizedText as='span' {...copy.lead} />}
    >
      <div id='login-card'>
        <LocalizedText as='p' className='journey-copy' {...copy.intro} />

        <form id='login-form' class='journey-form'>
          <input type='hidden' id='gate_token' value={data.gateToken || ''} />

          <div class='journey-field'>
            <LocalizedText as='label' htmlFor='email' {...copy.emailLabel} />
            <input
              type='email'
              id='email'
              name='email'
              placeholder={copy.emailPlaceholder}
              required
              autoComplete='email'
            />
          </div>

          <div class='journey-actions'>
            <button id='login-submit' type='submit' class='journey-button journey-button--primary'>
              {data.langMode === 'spanish-only'
                ? copy.submit.spanish
                : data.langMode === 'tamil-only' ||
                    data.langMode === 'tamil-translit' ||
                    data.langMode === 'all'
                ? copy.submit.tamil
                : copy.submit.english}
            </button>
          </div>

          <div id='login-status' class='journey-status' aria-live='polite'></div>

          <LocalizedText as='p' className='journey-meta' {...copy.note} />
        </form>
      </div>

      <script dangerouslySetInnerHTML={{ __html: loginScript }} />
    </JourneyLayout>
  );
}
