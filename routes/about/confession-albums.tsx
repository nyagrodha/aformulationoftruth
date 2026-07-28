/**
 * Confession albums — GET /about/confession-albums
 *
 * The Victorian parlour form the Proust Questionnaire descends from.
 */
import { Ornament, PageShell } from '../../components/PageShell.tsx';

export default function ConfessionAlbumsPage() {
  return (
    <PageShell
      title='Victorian confession albums — a formulation of truth'
      description='Where the Proust Questionnaire actually comes from: the Victorian confession album, and the album amicorum before it.'
    >
      <div class='about-header'>
        <h1>the album before the name</h1>
        <p style='color: var(--text-secondary);'>
          on confession albums, and how a set of parlour questions came to be called Proust's
        </p>
      </div>

      <div class='about-content'>
        <p class='lead'>
          Before there was a Proust Questionnaire, there was a book. A friend handed it to you, open{' '}
          to a blank page headed with a printed question, and you wrote your answer in among a dozen{' '}
          others already filling the volume.
        </p>

        <p>
          These were called confession albums, and by the 1860s they were an established fixture of{' '}
          parlour life — small hardbound books, sometimes homemade, sometimes commercially printed{' '}
          with a numbered list of prompts already set on the page: your favorite virtue, your idea of{' '}
          misery, the fault for which you have the most tolerance. An owner circulated her album among{' '}
          friends and family, and the answers accumulated over years into something like a group{' '}
          portrait — one person's questions refracted through everyone she knew. Printed editions{' '}
          followed the fashion; one of the earliest, published in New York in 1869, even reserved a{' '}
          page for a photograph beside each set of answers. The form stayed popular through the{' '}
          following decades and had faded into something faintly embarrassing by the early years of{' '}
          the twentieth century — the kind of thing a grown man was teased for having once filled out as a boy.
        </p>

        <Ornament />

        <h2>an older book underneath</h2>

        <p>
          The confession album did not appear from nowhere. It sits at the end of a much longer{' '}
          tradition of books passed hand to hand for inscription — the <em>album amicorum</em>, the{' '}
          "book of friends," which emerged among university students and scholars centuries earlier,{' '}
          during the Reformation. A traveling student would carry a blank book from town to town and{' '}
          ask teachers, patrons, and companions to sign it, often with a verse, a motto, or a small{' '}
          drawing alongside their name — less a questionnaire than a portable web of acquaintance,{' '}
          proof of who you had studied under and who thought well enough of you to write something{' '}
          down. Over the centuries that habit of the inscribed book branched into the autograph album,{' '}
          the friendship book, the birthday book — and, by the Victorian era, into a version with the{' '}
          questions already printed in, waiting only for an answer.
        </p>

        <Ornament />

        <h2>proust did not invent the form</h2>

        <p>
          Marcel Proust did not invent the questionnaire that carries his name. He filled one out —{' '}
          twice, in fact, years apart, as one respondent among the many friends and acquaintances who{' '}
          wrote in the same albums. The first time he was an adolescent, not yet fifteen, answering an{' '}
          English-language confession album — <em>An Album to Record Thoughts, Feelings, etc.</em>{' '}
          — that belonged to Antoinette Faure, the daughter of a man who would later become president{' '}
          of France. His answers, written in French into the English album, survive from around 1886.{' '}
          He answered a similar set of questions again several years later, as a young man, this time{' '}
          in a French album titled <em>Les confidences de salon</em> — "drawing-room confidences" —{' '}
          whose printed prompts overlapped with but did not exactly match the earlier English ones.{' '}
          Neither occasion was his idea. He was a guest in someone else's book, doing what any guest{' '}
          in a Victorian parlour was asked to do.
        </p>

        <Ornament />

        <h2>the manuscript's second life</h2>

        <p>
          Antoinette Faure's album disappeared from view for decades and resurfaced only in 1924, two{' '}
          years after Proust's death, when her son found it and had the adolescent answers published{' '}
          in a French literary journal. That posthumous publication is most of why the form now carries{' '}
          Proust's name at all: a schoolboy's answers in a friend's keepsake book, printed only after{' '}
          he had become the author of a monumental novel, and read backward through that fame. The{' '}
          manuscript itself later passed into private hands and came up for auction in 2003, selling{' '}
          for roughly one hundred thousand euros — a striking price for a few pages of a teenager's{' '}
          handwriting, explicable only because of whose handwriting it turned out to be. The attribution{' '}
          runs the wrong direction: not Proust's questionnaire, but a Victorian parlour game that Proust,{' '}
          like hundreds of others, once sat down and answered.
        </p>

        <Ornament />

        <h2>adjacent forms</h2>

        <p>
          The confession album kept company with several cousins that did similar work by other means.{' '}
          The birthday book assigned each page to a date and let visitors sign in against their own; the{' '}
          autograph album asked only for a name and perhaps a line of verse; the friendship book, closer to the old{' '}
          <em>album amicorum</em>, favored an inscription over an answer. All of them made the{' '}
          same wager: that a person could be sketched, a little at a time, through what they were willing{' '}
          to write down in someone else's book, in their own hand, under a question they did not choose.
        </p>

        <Ornament />

        <h2 class='subtle'>back to the questionnaire</h2>

        <p>
          Seen this way, the questionnaire was never a test — the confession album wasn't, and this site{' '}
          isn't either. It is a sequence of invitations, extended by a book instead of a friend, each one{' '}
          asking you to set down what you have not yet said out loud. Proust's name attached to the form{' '}
          almost by accident. The form itself is older, plainer, and stranger than any one respondent —{' '}
          Proust included. Read more about what this site is doing with it on the <a href='/about'>about page</a>.
        </p>
      </div>
    </PageShell>
  );
}
