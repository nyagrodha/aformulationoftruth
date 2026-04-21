import type { ComponentChildren } from 'preact';
import LanguageSelector from './LanguageSelector.tsx';
import { getLanguageClientScript, type LanguageMode } from '../lib/language.ts';

interface JourneyLayoutProps {
  currentMode: LanguageMode;
  htmlLang: string;
  pageTitle: string;
  description: string;
  stage: string;
  title: ComponentChildren;
  lead: ComponentChildren;
  children: ComponentChildren;
}

export default function JourneyLayout(props: JourneyLayoutProps) {
  return (
    <html lang={props.htmlLang} data-lang-mode={props.currentMode}>
      <head>
        <meta charSet='UTF-8' />
        <meta name='viewport' content='width=device-width, initial-scale=1.0' />
        <title>{props.pageTitle}</title>
        <meta name='description' content={props.description} />
        <link rel='stylesheet' href='/css/main.css' />
        <style>
          {`
          :root {
            --journey-ink: #f8f0da;
            --journey-muted: rgba(248, 240, 218, 0.7);
            --journey-line: rgba(248, 240, 218, 0.12);
            --journey-glow: rgba(255, 140, 66, 0.18);
            --journey-gold: #f5c76a;
            --journey-cyan: #6ad7ff;
            --journey-panel: rgba(7, 8, 12, 0.78);
          }

          body {
            min-height: 100vh;
            margin: 0;
            background:
              radial-gradient(circle at top left, rgba(106, 215, 255, 0.14), transparent 32%),
              radial-gradient(circle at 80% 18%, rgba(255, 105, 180, 0.18), transparent 28%),
              radial-gradient(circle at bottom right, rgba(255, 140, 66, 0.12), transparent 38%),
              #040507;
            color: var(--journey-ink);
            font-family: 'Space Mono', monospace;
          }

          body::before {
            content: '';
            position: fixed;
            inset: 0;
            background:
              linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px),
              linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px);
            background-size: 72px 72px;
            pointer-events: none;
            opacity: 0.45;
          }

          .journey-shell {
            position: relative;
            z-index: 1;
            min-height: 100vh;
            display: grid;
            grid-template-columns: minmax(0, 0.9fr) minmax(320px, 560px);
            gap: 3rem;
            padding: 2rem;
            align-items: center;
          }

          .journey-stage {
            font-size: 0.75rem;
            letter-spacing: 0.28em;
            text-transform: uppercase;
            color: var(--journey-cyan);
            margin-bottom: 1.25rem;
          }

          .journey-title {
            display: flex;
            flex-direction: column;
            gap: 0.55rem;
            font-family: 'Orbitron', sans-serif;
            font-size: clamp(2.5rem, 7vw, 5.5rem);
            line-height: 0.92;
            margin: 0 0 1.25rem;
            text-transform: lowercase;
          }

          .journey-lead {
            max-width: 40rem;
            display: flex;
            flex-direction: column;
            gap: 0.7rem;
            font-size: 0.95rem;
            color: var(--journey-muted);
          }

          .journey-aside {
            padding: 2rem 0 2rem 1rem;
          }

          .journey-panel {
            position: relative;
            border: 1px solid var(--journey-line);
            background: linear-gradient(180deg, rgba(8, 10, 16, 0.92), var(--journey-panel));
            box-shadow:
              0 20px 80px rgba(0, 0, 0, 0.45),
              0 0 0 1px rgba(255, 255, 255, 0.02),
              inset 0 1px 0 rgba(255, 255, 255, 0.05);
            padding: 2rem;
            overflow: hidden;
          }

          .journey-panel::before {
            content: '';
            position: absolute;
            inset: 0;
            background:
              radial-gradient(circle at top, rgba(255, 199, 106, 0.18), transparent 38%),
              linear-gradient(180deg, transparent, rgba(255,255,255,0.02));
            pointer-events: none;
          }

          .journey-panel__inner {
            position: relative;
            z-index: 1;
          }

          .language-selector {
            display: flex;
            flex-wrap: wrap;
            align-items: center;
            gap: 0.85rem;
            margin-bottom: 1.75rem;
          }

          .language-selector__label {
            font-size: 0.75rem;
            letter-spacing: 0.18em;
            text-transform: uppercase;
            color: var(--journey-muted);
          }

          .language-selector__options {
            display: flex;
            flex-wrap: wrap;
            gap: 0.45rem;
          }

          .language-selector__button {
            border: 1px solid var(--journey-line);
            background: rgba(255, 255, 255, 0.03);
            color: var(--journey-muted);
            padding: 0.45rem 0.7rem;
            text-transform: uppercase;
            letter-spacing: 0.14em;
            font-size: 0.68rem;
            cursor: pointer;
            transition: 180ms ease;
          }

          .language-selector__button[aria-pressed='true'],
          .language-selector__button:hover {
            border-color: rgba(245, 199, 106, 0.7);
            color: var(--journey-gold);
            box-shadow: 0 0 0 1px rgba(245, 199, 106, 0.14), 0 0 24px rgba(245, 199, 106, 0.1);
          }

          .lang-layer {
            display: block;
          }

          .lang-layer--english,
          .lang-layer--spanish {
            display: none;
          }

          [data-lang-mode='all'] .lang-layer--english,
          [data-lang-mode='all'] .lang-layer--tamil,
          [data-lang-mode='all'] .lang-layer--translit {
            display: block;
          }

          [data-lang-mode='tamil-only'] .lang-layer--tamil {
            display: block;
          }

          [data-lang-mode='tamil-translit'] .lang-layer--tamil,
          [data-lang-mode='tamil-translit'] .lang-layer--translit {
            display: block;
          }

          [data-lang-mode='english-only'] .lang-layer--english {
            display: block;
          }

          [data-lang-mode='spanish-only'] .lang-layer--spanish {
            display: block;
          }

          .lang-layer--translit {
            color: rgba(248, 240, 218, 0.58);
            font-style: italic;
          }

          .journey-form {
            display: grid;
            gap: 1.1rem;
          }

          .journey-field {
            display: grid;
            gap: 0.6rem;
          }

          .journey-field label,
          .journey-copy,
          .journey-status {
            display: flex;
            flex-direction: column;
            gap: 0.35rem;
          }

          .journey-copy {
            margin-bottom: 1.2rem;
            color: var(--journey-muted);
          }

          .journey-field input,
          .journey-field textarea {
            width: 100%;
            border: 1px solid rgba(248, 240, 218, 0.18);
            background: rgba(5, 8, 14, 0.92);
            color: var(--journey-ink);
            padding: 0.95rem 1rem;
            font: inherit;
            resize: vertical;
            min-height: 3.25rem;
          }

          .journey-field textarea {
            min-height: 12rem;
            line-height: 1.75;
          }

          .journey-field input:focus,
          .journey-field textarea:focus {
            outline: none;
            border-color: rgba(245, 199, 106, 0.65);
            box-shadow: 0 0 0 1px rgba(245, 199, 106, 0.25), 0 0 32px rgba(245, 199, 106, 0.08);
          }

          .journey-actions {
            display: flex;
            gap: 0.85rem;
            flex-wrap: wrap;
            margin-top: 0.5rem;
          }

          .journey-button {
            border: 1px solid transparent;
            padding: 0.95rem 1.3rem;
            font: inherit;
            letter-spacing: 0.12em;
            text-transform: uppercase;
            cursor: pointer;
            transition: 180ms ease;
          }

          .journey-button--primary {
            background: linear-gradient(135deg, rgba(245, 199, 106, 0.92), rgba(106, 215, 255, 0.78));
            color: #050608;
            box-shadow: 0 16px 34px var(--journey-glow);
          }

          .journey-button--secondary {
            background: transparent;
            color: var(--journey-muted);
            border-color: var(--journey-line);
          }

          .journey-button:hover {
            transform: translateY(-1px);
          }

          .journey-meta {
            margin-top: 1rem;
            font-size: 0.72rem;
            letter-spacing: 0.08em;
            color: rgba(248, 240, 218, 0.55);
          }

          @media (max-width: 900px) {
            .journey-shell {
              grid-template-columns: 1fr;
              gap: 1.5rem;
              padding: 1.25rem;
            }

            .journey-aside {
              padding: 0;
            }

            .journey-title {
              font-size: clamp(2.3rem, 13vw, 4rem);
            }

            .journey-panel {
              padding: 1.4rem;
            }
          }
        `}
        </style>
      </head>
      <body data-lang-mode={props.currentMode}>
        <main class='journey-shell'>
          <section class='journey-aside'>
            <div class='journey-stage'>{props.stage}</div>
            <div class='journey-title'>{props.title}</div>
            <div class='journey-lead'>{props.lead}</div>
          </section>

          <section class='journey-panel'>
            <div class='journey-panel__inner'>
              <LanguageSelector currentMode={props.currentMode} />
              {props.children}
            </div>
          </section>
        </main>

        <script dangerouslySetInnerHTML={{ __html: getLanguageClientScript(props.currentMode) }} />
      </body>
    </html>
  );
}
