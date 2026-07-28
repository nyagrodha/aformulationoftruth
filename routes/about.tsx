/**
 * About — GET /about
 *
 * Ported verbatim from the former public/about.html (now a 301 redirect
 * from Caddy). Copy is the site owner's; do not reword.
 */
import { Ornament, PageShell } from '../components/PageShell.tsx';

export default function AboutPage() {
  return (
    <PageShell
      title='welcome - about a formulation of truth'
      description='Learn about the Proust Questionnaire and the practice of self-inquiry'
    >
      <div class='about-header'>
        <img
          src='/images/AusrbachianPassion.JPG'
          alt='Karuppacami - with auerbachian passion'
          class='about-header-image'
        />
        <h1>first and form: the name</h1>
        <p style='color: var(--text-secondary);'>a bit on the creator's vidyātīrtha</p>
      </div>

      <div class='about-content'>
        <p class='lead'>You are not one self. This is not tragedy. It's more like the weather.</p>

        <p>
          These questions are a practice in self-inquiry: the unguarded yet thoughtful answer discloses{' '}
          something interior (அகம்) — a subject, the grammatical I, a formulation of truth.
        </p>

        <p>
          To the degree you're able, forget that you ever responded to the questionnaire. Return after a{' '}
          period of time to answer the questions again. The earlier responses seemingly belong to a different person…
        </p>

        <p>
          Infer the harder truth: the one who answers is provisional. Other versions of self come and go{' '}
          through life. The questionnaire keeps their record — numerous is the I, oneself emerging from{' '}
          others in succession that bears one name.
        </p>

        <p>Find who sleeps.</p>

        <Ornament />

        <h2>what is a formulation of truth?</h2>

        <p>
          The site serves a sequence of prompts. Call them questions; or think of them as discrete{' '}
          invitations: here, a pause. With each question asked, in that moment, what wells up within{' '}
          requires a language user — you — to translate the past from memory, describing it in language{' '}
          that revivifies it in the present response you, the writer, compose.
        </p>

        <p>
          Sometimes those fragments congeal into something coherent — or not — amid still other{' '}
          fragments that remain… well, fragmented. Partial. Defiant, in fact, in how unbothered to be{' '}
          coherent some of the fragments may be.
        </p>

        <p>
          Mistaken would one be to suppose these sketches in word bear little or no meaning to any{' '}
          reader beyond the writer who translated them from their own recollection of a past, in reflex{' '}
          response to a prompt. A question:
        </p>

        <Ornament />

        <h2 class='subtle'>vividhā racanā: variegated composition</h2>

        <p>
          I envision this website as an instrument to focus attention: not a test, but a mechanic for{' '}
          rendering the past legible in the present. The questionnaire captures a selfie taken from within{' '}
          — subject and archive colluding — so that a single moment may be compared, placed beside, felt{' '}
          through an other. Reproducibility does not diminish aura; the site's structure redistributes it,{' '}
          letting echoes be heard in different rooms.
        </p>

        <Ornament />

        <h2 class='subtle'>further</h2>

        <ul class='about-links'>
          <li>
            <a href='/about/confession-albums'>More on Victorian confession albums</a>{' '}
            — where the questionnaire actually comes from.
          </li>
          <li>
            <a href='/about/respondents'>Contemporary figures who have responded</a>{' '}
            — the form’s afterlife, from Pivot to the present.
          </li>
          <li>
            <a href='/shop'>The gift shop</a> — the books themselves, and a few things to wear.
          </li>
        </ul>
      </div>

      <div class='support-section'>
        <div class='support-header'>
          <h3>Support This Work</h3>
          <p>If you enjoy this site consider supporting its continuation. We are grateful to anyone who contributes.</p>
        </div>

        <div class='crypto-support'>
          <div class='crypto-label'>
            <span class='crypto-icon'>⚡</span>
            <span>Zcash</span>
          </div>
          <div class='address-container'>
            <code class='crypto-address' id='zcash-address'>
              u17h46njzzm0gal5tplz8qtq009tqyxtvqu7c25uvun46nmrkux7u9064jgdk8lm8schulpz5t3rjpj7hd3rwcdsp4f86l9lxrsdxggqjffp46ry52z0hqg4g5mjvag8k4z6fkvakmtq5222qdsx20lu70l03xyn322tvz5qzeqygljjc7
            </code>
            <button type='button' class='copy-btn' aria-label='Copy Zcash address'>
              <svg width='16' height='16' viewBox='0 0 16 16' fill='none' xmlns='http://www.w3.org/2000/svg'>
                <path d='M13 5.5h-2V2H2v9h2.5v2H13V5.5zm-2.5 7H3v-7h2V3h5.5v2.5z' fill='currentColor' />
              </svg>
              <span class='copy-text'>Copy</span>
            </button>
          </div>
        </div>
      </div>

      <script src='/js/zcash-copy.js'></script>
    </PageShell>
  );
}
