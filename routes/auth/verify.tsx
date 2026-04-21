import { Handlers, PageProps } from '$fresh/server.ts';
import JourneyLayout from '../../components/JourneyLayout.tsx';
import LocalizedText from '../../components/LocalizedText.tsx';
import { verifyQuestionnaireJWT } from '../../lib/jwt.ts';
import { hashResumeToken } from '../../lib/crypto.ts';
import { getSessionById } from '../../lib/questionnaire-session.ts';
import { increment } from '../../lib/metrics.ts';
import {
  type LanguageMode,
  resolveLanguagePreference,
  shouldSecureCookies,
  withLanguageCookie,
} from '../../lib/language.ts';

interface VerifyData {
  success: boolean;
  error?: string;
  errorCode?: string;
  htmlLang: string;
  langMode: LanguageMode;
}

export const handler: Handlers<VerifyData> = {
  async GET(req, ctx) {
    const preference = resolveLanguagePreference(req);
    const requestId = crypto.randomUUID();
    increment('requests.api');

    const url = new URL(req.url);
    const jwtToken = url.searchParams.get('token');
    const resumeToken = url.searchParams.get('resume');

    const renderError = (error: string, errorCode: string) =>
      ctx.render(
        {
          success: false,
          error,
          errorCode,
          htmlLang: preference.htmlLang,
          langMode: preference.mode,
        },
        { headers: withLanguageCookie(undefined, req, preference.mode) },
      );

    if (!jwtToken || !resumeToken) {
      increment('errors.4xx');
      increment('auth.verify.missing_tokens');
      return renderError('Missing authentication parameters', 'MISSING_TOKENS');
    }

    try {
      const jwtPayload = await verifyQuestionnaireJWT(jwtToken);
      if (!jwtPayload) {
        increment('errors.4xx');
        increment('auth.verify.invalid_jwt');
        return renderError('Invalid or expired authentication token', 'INVALID_JWT');
      }

      const sessionId = await hashResumeToken(resumeToken);
      if (sessionId !== jwtPayload.session_id) {
        increment('errors.4xx');
        increment('auth.verify.token_mismatch');
        return renderError('Authentication tokens do not match', 'TOKEN_MISMATCH');
      }

      const session = await getSessionById(sessionId);
      if (!session) {
        increment('errors.4xx');
        increment('auth.verify.session_not_found');
        return renderError('Session not found or expired', 'SESSION_NOT_FOUND');
      }

      if (session.emailHash !== jwtPayload.email_hash) {
        increment('errors.4xx');
        increment('auth.verify.email_mismatch');
        return renderError('Authentication verification failed', 'EMAIL_MISMATCH');
      }

      increment('auth.magiclink.verified');

      const cookieOptions = [
        'HttpOnly',
        'SameSite=Lax',
        'Path=/',
        ...(shouldSecureCookies(req) ? ['Secure'] : []),
      ].join('; ');
      const headers = withLanguageCookie(undefined, req, preference.mode);
      headers.append('Set-Cookie', `jwt=${jwtToken}; ${cookieOptions}; Max-Age=86400`);
      headers.append(
        'Set-Cookie',
        `resume_token=${resumeToken}; ${cookieOptions}; Max-Age=2592000`,
      );
      headers.set('Location', '/questionnaire');
      headers.set('Cache-Control', 'no-store, no-cache, must-revalidate');
      headers.set('X-Request-ID', requestId);

      increment('auth.verify.success');
      return new Response(null, { status: 302, headers });
    } catch {
      console.error('[auth] Verification failed');
      increment('errors.5xx');
      return renderError(
        'Verification failed. Please try requesting a new magic link.',
        'INTERNAL_ERROR',
      );
    }
  },
};

export default function VerifyPage({ data }: PageProps<VerifyData>) {
  const errorCopy = data.errorCode === 'MISSING_TOKENS'
    ? {
      tamil: 'அங்கீகார அளவுருக்கள் இல்லை.',
      transliteration: 'Aṅkīkāra aḷavurukkaḷ illai.',
      english: 'Missing authentication parameters.',
      spanish: 'Faltan parámetros de autenticación.',
    }
    : data.errorCode === 'INVALID_JWT'
    ? {
      tamil: 'இணைப்பு செல்லுபடியாகவில்லை அல்லது காலாவதியானது.',
      transliteration: 'Iṇaippu cellupaṭiyākavillai allatu kālāvatiyāṉatu.',
      english: 'The authentication link is invalid or expired.',
      spanish: 'El enlace de autenticación es inválido o ha caducado.',
    }
    : data.errorCode === 'SESSION_NOT_FOUND'
    ? {
      tamil: 'அமர்வு இல்லை அல்லது முடிந்துவிட்டது.',
      transliteration: 'Amarvu illai allatu muṭintuvittatu.',
      english: 'The session was not found or has expired.',
      spanish: 'La sesión no se encontró o ya expiró.',
    }
    : {
      tamil: 'புதிய இணைப்பை கேட்டால் பாதுகாப்பாக தொடரலாம்.',
      transliteration: 'Putiya iṇaippai kēṭṭāl pātukāppāka toṭaralām.',
      english: data.error || 'An error occurred.',
      spanish: 'Solicita un enlace nuevo para continuar con seguridad.',
    };

  return (
    <JourneyLayout
      currentMode={data.langMode}
      htmlLang={data.htmlLang}
      pageTitle='Verification Failed'
      description='Magic link verification status.'
      stage='Verification'
      title={
        <LocalizedText
          as='span'
          tamil='இணைப்பு தடுமாறியது'
          transliteration='Iṇaippu taṭumāṟiyatu'
          english='the link lost its shape'
          spanish='el enlace perdió su forma'
        />
      }
      lead={
        <LocalizedText
          as='span'
          tamil='புதிய இணைப்பை கேட்பது பாதுகாப்பான வழி.'
          transliteration='Putiya iṇaippai kēṭpatu pātukāppāṉa vaḻi.'
          english='The safest path now is to request a fresh return link.'
          spanish='Lo más seguro ahora es pedir un enlace nuevo para regresar.'
        />
      }
    >
      <LocalizedText
        as='p'
        className='journey-copy'
        {...errorCopy}
      />
      <div class='journey-actions'>
        <a
          href='/login'
          class='journey-button journey-button--primary'
          style={{ textDecoration: 'none' }}
        >
          {data.langMode === 'spanish-only'
            ? 'Solicitar un nuevo enlace'
            : data.langMode === 'tamil-only' ||
                data.langMode === 'tamil-translit' ||
                data.langMode === 'all'
            ? 'புதிய இணைப்பை கேள்'
            : 'Request a new link'}
        </a>
      </div>
    </JourneyLayout>
  );
}
