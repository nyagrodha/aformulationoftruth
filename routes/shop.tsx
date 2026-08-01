/**
 * Gift Shop — GET /shop
 *
 * Books are outbound affiliate links (two retailers, reader chooses).
 * Tees are Stripe Payment Links; prices are tax-inclusive, so the figure
 * shown is the final figure paid.
 */
import { Ornament, PageShell } from '../components/PageShell.tsx';
import { BOOKS, OWN_ITEMS, type ShopItem } from '../data/shop.ts';

function BookEntry({ item }: { item: ShopItem }) {
  if (item.kind !== 'affiliate') return null;
  return (
    <div class='shop-item'>
      <h3>
        {item.volume !== undefined ? `${item.volume}. ` : ''}
        {item.title}
      </h3>
      <p class='shop-meta'>
        {item.author}
        {item.translator ? ` · translated by ${item.translator}` : ''}
      </p>
      <p>{item.blurb}</p>
      <p class='shop-links'>
        {item.links.map((link, i) => (
          <span key={link.retailer}>
            {i > 0 ? ' · ' : ''}
            <a href={link.url} target='_blank' rel='noopener sponsored'>{link.retailer}</a>
          </span>
        ))}
      </p>
    </div>
  );
}

/**
 * A lone view sits in a fixed column beside the copy; two or more span the
 * measure with the copy beneath, so front and back stay big enough to compare.
 * `sizes` follows suit, or the browser picks a candidate for the wrong slot.
 */
function galleryClass(count: number): string {
  if (count === 0) return 'shop-item';
  return count === 1 ? 'shop-item shop-item--illustrated' : 'shop-item shop-item--gallery';
}

function OwnEntry({ item }: { item: ShopItem }) {
  if (item.kind !== 'own') return null;
  const views = item.views ?? [];
  const sizes = views.length > 1 ? '(max-width: 620px) 46vw, 385px' : '(max-width: 620px) 100vw, 280px';
  return (
    <div class={galleryClass(views.length)}>
      {views.length > 0 && (
        <div class='shop-figures'>
          {views.map((view) => (
            <figure
              key={view.src}
              class='shop-figure'
              /* Never paint a view wider than its own pixels. A low-resolution
                 source renders small and sharp rather than filling the column
                 and going soft. */
              style={`max-width: ${view.width}px`}
            >
              <img
                src={view.src}
                srcset={view.wide && view.wideWidth
                  ? `${view.src} ${view.width}w, ${view.wide} ${view.wideWidth}w`
                  : undefined}
                sizes={sizes}
                width={view.width}
                height={view.height}
                alt={view.alt}
                loading='lazy'
                decoding='async'
              />
              {view.label && <figcaption>{view.label}</figcaption>}
            </figure>
          ))}
        </div>
      )}
      <div class='shop-body'>
        <h3>{item.title}</h3>
        <p>{item.blurb}</p>
        <p class='shop-meta'>{item.price} — price includes tax</p>
        {item.caveat && <p class='shop-caveat'>{item.caveat}</p>}
        <p class='shop-links'>
          <a href={item.paymentLink} class='btn btn-primary' target='_blank' rel='noopener'>
            Buy
          </a>
        </p>
      </div>
    </div>
  );
}

export default function ShopPage() {
  return (
    <PageShell
      title='the gift shop — a formulation of truth'
      description='Books that shaped the questionnaire, and a few things to wear.'
    >
      <div class='about-header'>
        <h1>the gift shop</h1>
        <p style='color: var(--muted);'>what to read, and what to wear while reading it</p>
      </div>

      <div class='about-content'>
        <p class='lead'>
          Some of these are books. Some are shirts. All of them are here because they belong to the same preoccupation.
        </p>

        <p class='shop-disclosure'>
          <strong>Disclosure:</strong>{' '}
          book links are affiliate links. Purchases made through them may earn this site a small commission at no
          additional cost to you. As an Amazon Associate I earn from qualifying purchases. Both retailers are offered
          for every title so you can choose; neither is preferred on your behalf.
        </p>

        <Ornament />

        <h2>In Search of Lost Time</h2>

        <p>
          The Penguin Classics Deluxe edition, under Christopher Prendergast’s general editorship — a different
          translation from the Moncrieff{' '}
          <em>
            Remembrance of Things Past
          </em>{' '}
          many people met first. Seven volumes, each with its own translator, the last three of which reached American
          readers only recently.
        </p>

        {BOOKS.filter((b) => b.kind === 'affiliate' && b.volume !== undefined).map((item) => (
          <BookEntry key={item.title} item={item} />
        ))}

        <Ornament />

        <h2>On Proust</h2>

        {BOOKS.filter((b) => b.kind === 'affiliate' && b.volume === undefined).map((item) => (
          <BookEntry key={item.title} item={item} />
        ))}

        <Ornament />

        <h2 class='subtle'>to wear</h2>

        {OWN_ITEMS.map((item) => <OwnEntry key={item.title} item={item} />)}
      </div>
    </PageShell>
  );
}
