/**
 * The landing page's footer, shared with the pages drawn in its style.
 *
 * Lifted out of routes/index.tsx when /completion moved onto the landing's
 * layout, so the two cannot drift. `home` is where the wordmark points: the
 * landing links to its own #top, every other page to '/'.
 */

import { WordmarkGlyphs } from './Wordmark.tsx';
import TipJar from './TipJar.tsx';

export default function SiteFooter({ home = '/', id }: { home?: string; id?: string }) {
  return (
    <footer id={id}>
      <a class='wordmark' href={home} aria-label='a formulation of truth'>
        <WordmarkGlyphs />
      </a>

      <div>
        <p>
          a <span class='keep-case'>Proust</span>{' '}
          questionnaire through which to acquaint oneself with a lifetime’s sequence of selves.
        </p>
        <p style='margin-top: 1rem;'>
          database hosted in Iceland by{' '}
          <a
            href='https://billing.flokinet.is/aff.php?aff=543'
            target='_blank'
            rel='noopener noreferrer'
          >
            FlokiNET
          </a>
        </p>
        <p style='margin-top: 0.5rem; word-break: break-all;'>
          Onion mirror:{' '}
          <a
            href='http://a4mulasy36kk6s4liqbqkqs4fx4i6nmtyp73r2vv42mgechry2u47wad.onion/'
            rel='noopener noreferrer'
          >
            a4mulasy36kk6s4liqbqkqs4fx4i6nmtyp73r2vv42mgechry2u47wad.onion
          </a>
        </p>
      </div>

      <div class='footer-links' style='justify-content: flex-end;'>
        <a href='/about'>about</a>
        <a href='/shop'>gift shop</a>
        <a href='/contact.html'>contact</a>
        <a href='/privacy'>privacy</a>
      </div>

      <TipJar />
    </footer>
  );
}
