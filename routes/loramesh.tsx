/**
 * /loramesh — Proust questions asked over the Meshtastic LongFast channel, and the
 * answers heard back. Public by design: every answer here was broadcast in
 * plaintext over the air. Server-rendered, no JavaScript. Node ids are never
 * shown; wall() does not even select them.
 */
import { Handlers, PageProps } from '$fresh/server.ts';
import { PageShell } from '../components/PageShell.tsx';
import { wall, type WallQuestion } from '../lib/mesh-store.ts';

export interface MeshData {
  questions: WallQuestion[];
  unavailable?: boolean;
}

export const handler: Handlers<MeshData> = {
  async GET(_req, ctx) {
    try {
      return ctx.render({ questions: await wall() });
    } catch {
      console.error('[mesh] reading the wall failed');
      return ctx.render({ questions: [], unavailable: true });
    }
  },
};

const DAY = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', month: 'short', day: 'numeric' });

export default function MeshPage({ data }: PageProps<MeshData>) {
  return (
    <PageShell
      title='Heard on the mesh - a formulation of truth'
      description='Proust questions asked over the Meshtastic mesh around Madison, and the answers heard back'
    >
      <div class='about-header'>
        <h1>Heard on the mesh</h1>
        <p>Proust questions, asked over the air</p>
      </div>

      <div class='about-content'>
        <p class='lead'>
          Each evening the node <strong>a4mulas4t</strong>{' '}
          (A4T) asks one question from the Proust questionnaire on the Meshtastic LongFast channel around Madison. Reply
          to it in your Meshtastic app, or send A4T a direct message, and your answer appears here under your node's
          short name.
        </p>

        {data.unavailable && <p class='callout'>The wall can't be read right now. Please try again later.</p>}
        {!data.unavailable && data.questions.length === 0 && <p>No question has gone out yet.</p>}

        {data.questions.map((q) => (
          <section key={q.sent_at.toISOString()}>
            <h2>{q.text}</h2>
            <p>
              <small>Asked {DAY.format(q.sent_at)}</small>
            </p>
            {q.answers.length === 0
              ? (
                <p>
                  <em>No answers heard.</em>
                </p>
              )
              : (
                <ul>
                  {q.answers.map((a) => (
                    <li key={`${a.short_name}-${a.rx_at.toISOString()}`}>
                      <strong>{a.short_name}</strong> — {a.text} <small>({DAY.format(a.rx_at)})</small>
                    </li>
                  ))}
                </ul>
              )}
          </section>
        ))}

        <h2>What is kept</h2>
        <p>
          For each answer: the question it answers, the text of the answer, and the node's short name as reported by the
          radio, with the time it was heard. Names are not verified — any radio can transmit under any name. Send{' '}
          <strong>forget</strong> as a direct message to A4T and every answer from your node is removed from this page.
        </p>
      </div>
    </PageShell>
  );
}
