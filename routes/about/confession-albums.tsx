/**
 * Confession albums — GET /about/confession-albums
 *
 * The Victorian parlour form the Proust Questionnaire descends from.
 * Written in the register of Richard Brautigan: plain sentences, small
 * domestic nouns, the large thing arriving without being announced.
 */
import { Ornament, PageShell } from '../../components/PageShell.tsx';

export default function ConfessionAlbumsPage() {
  return (
    <PageShell
      title='The Confession Album — a formulation of truth'
      description="Where the Proust Questionnaire actually comes from: a girl's parlour album in 1886, and the four hundred years of collecting each other that came before it."
    >
      <div class='about-header'>
        <h1>The Confession Album</h1>
        <p style='color: var(--muted);'>
          a book with questions printed in it, and a boy who was fourteen
        </p>
      </div>

      <div class='about-content'>
        <p class='lead'>
          In 1886 a girl named Antoinette Faure owned a book with questions printed in it, and she passed it around to
          her friends the way you'd gossip about someone over Snapchat.
        </p>

        <p>
          The book asked: What is your favourite virtue? What is your idea of misery? Where would you like to live?
        </p>

        <p>A boy answered it. He was fourteen. Nobody thought anything of it. It was a Tuesday sort of activity.</p>

        <Ornament />

        <p>
          These books were everywhere then. They sat in parlours the way air fryers sit in kitchens now. They had names
          like{' '}
          <em>Mental Photographs</em>, which is an alright name for a band, kinda shitty title for a book... All this
          tells you that folks in 1869 already understood something about what an introspective question does to a
          person!
        </p>

        <p>
          You handed someone the album and they wrote in it and handed it back, and now you had a piece of them, in ink,
          in your house, on a shelf, next to the other pieces of other people.
        </p>

        <p>Everyone was collecting each other.</p>

        <Ornament />

        <h2>the older habit</h2>

        <p>
          Before the printed ones there were handwritten ones. The Latin name is{' '}
          <em>album amicorum</em>, the book of friends, and students carried them around Europe in the fifteen hundreds
          collecting signatures from anybody who seemed worth collecting.
        </p>

        <p>
          So it was already a four hundred year old habit by the time somebody thought to save everyone the trouble and
          print the questions in advance.
        </p>

        <Ornament />

        <p>
          The boy grew up and wrote a very long book about remembering things, and died in 1922, and two years later
          Antoinette Faure's son was going through his mother's belongings the way you do, and there it was.
        </p>

        <p>The album. The Tuesday. The fourteen-year-old.</p>

        <p>
          In 2003 someone paid a hundred and two thousand euros for a piece of paper with a teenager's handwriting on
          it.
        </p>

        <p>
          The teenager had answered the questions the way you answer questions when you are fourteen and it is
          somebody's parlour and there is probably cake.
        </p>

        <Ornament />

        <h2 class='subtle'>what the album was actually doing</h2>

        <p>Here is the thing about a printed question.</p>

        <p>
          It doesn't know you. It was set in type in a factory and bound into a thousand identical books and shipped to
          a thousand parlours, and it asks every single person the same thing in the same words, and it does not care
          who is holding the pen.
        </p>

        <p>That sounds like a limitation. It is the whole trick.</p>

        <p>
          Because a question written for nobody in particular is a question you cannot flatter. It has no face to read.
          You can't tell it what it wants to hear, because it doesn't want anything. It's a form. It just sits there
          being a form, in a book, in a parlour, waiting.
        </p>

        <p>And into that indifference people wrote the truth, more or less, on a Tuesday, for fun.</p>

        <Ornament />

        <p>
          Nobody called it the Proust Questionnaire then. It was just the album. He did not invent it. He filled one
          out, the way you'd fill out anything handed to you at a party, and the form outlived the party and the century
          and eventually got his name on it, which is how names work.
        </p>

        <p>The questions are still the questions.</p>

        <p>
          There is <a href='/about'>a page here</a> explaining what this website thinks it is doing with them, and{' '}
          <a href='/about/respondents'>another</a> about who has answered since.
        </p>
      </div>
    </PageShell>
  );
}
