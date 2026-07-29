/**
 * Contemporary respondents — GET /about/respondents
 *
 * The Proust Questionnaire's modern afterlife: from Bernard Pivot's French
 * television programmes, through James Lipton's borrowed variant, to
 * Vanity Fair's back page. Every specific claim here is verified against a
 * source before being written — see the task report for citations.
 */
import { Ornament, PageShell } from '../../components/PageShell.tsx';

export default function RespondentsPage() {
  return (
    <PageShell
      title='Who has answered — a formulation of truth'
      description="The Proust Questionnaire's modern afterlife: Bernard Pivot's television programmes, James Lipton's borrowed variant, and Vanity Fair's back page."
    >
      <div class='about-header'>
        <h1>who has answered</h1>
        <p style='color: var(--text-secondary);'>
          on the questionnaire's move from the parlour album to the broadcast studio to the magazine page
        </p>
      </div>

      <div class='about-content'>
        <p class='lead'>
          The confession album was a private object. It circulated among people who already knew{' '}
          one another, and its answers were read by an audience of a dozen, or a few dozen, who could{' '}
          weigh a joke against the person who made it. The questionnaire's twentieth-century afterlife{' '}
          changed that condition entirely, and it changed it by way of television.
        </p>

        <p>
          For fifteen years, from 1975 to 1990, the French broadcaster Bernard Pivot closed episodes{' '}
          of his live literary talk show <em>Apostrophes</em> by putting a version of the old parlour{' '}
          questions to his guest. When that programme ended he carried the habit into its successor,{' '}
          <em>Bouillon de Culture</em>, which began on Antenne 2 in 1991 — the channel was renamed France{' '}
          2 the following year — and ran until 2001. Over those decades{' '}
          Pivot pared the inherited list down into his own compact set — ten pointed questions rather{' '}
          than the sprawling Victorian original — asked, on air, of novelists, philosophers, and{' '}
          politicians, with a national audience listening to what they said back.
        </p>

        <Ornament />

        <h2>an American borrowing</h2>

        <p>
          James Lipton had watched Pivot's programmes and, in building his own interview show for{' '}
          American drama students, adapted the same closing device.{' '}
          <em>Inside the Actors Studio</em>, which began airing in 1994, ended nearly every episode with Lipton's own
          {' '}
          ten-question descendant of Pivot's list — favorite word, least favorite word, a sound{' '}
          loved, a sound hated — put to the actor or director being interviewed, credited each time{' '}
          to its French source. It is largely through that programme, rather than through any French{' '}
          broadcast or French-language book, that English-speaking audiences met the form at all —{' '}
          most people who could name "the Proust Questionnaire" today learned the phrase from an{' '}
          American cable show borrowing a French television host's borrowing of a Victorian parlour game.
        </p>

        <Ornament />

        <h2>the magazine version</h2>

        <p>
          In 1993 <em>Vanity Fair</em> began running the Proust Questionnaire as a recurring feature{' '}
          on the last page of the magazine, putting the same set of questions to a different public{' '}
          figure each time it appeared. Unlike the broadcast versions, the magazine page is not{' '}
          spoken and does not need to survive live delivery; it is drafted, edited, and printed, and{' '}
          the answers collected over the years were substantial enough that a book of a hundred and{' '}
          one of them was eventually published as a volume in its own right.
        </p>

        <Ornament />

        <h2 class='subtle'>what changes in public</h2>

        <p>
          A confession album answer was written for an audience of people who already had a stake in{' '}
          you — a schoolmate, a cousin, the friend whose book it was. A magazine or television answer{' '}
          is written, however casually, for strangers, and for a version of yourself you expect{' '}
          strangers to recognize. The questions have not changed very much across a century and a{' '}
          half; what changes is who is presumed to be listening, and that presumption reaches back{' '}
          into the answer itself. An answer composed for publication tends to arrive already{' '}
          smoothed toward an image — witty, becoming, consistent with whatever the respondent is{' '}
          known for — in a way a page meant only for a friend's private album rarely bothers to be.
        </p>

        <p>
          That is the distinction this site keeps returning to, and the reason none of your{' '}
          responses here are collected into anything public. Read about the site's approach on the{' '}
          <a href='/about'>about page</a>, or about the form's earlier, private history on the page about{' '}
          <a href='/about/confession-albums'>Victorian confession albums</a>.
        </p>
      </div>
    </PageShell>
  );
}
