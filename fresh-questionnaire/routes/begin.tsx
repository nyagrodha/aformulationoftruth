import { Handlers, PageProps } from "$fresh/server.ts";
import { Head } from "$fresh/runtime.ts";
import GateQuestions from "../islands/GateQuestions.tsx";

interface GateQuestion {
  id: number;
  question_text: string;
  question_order: number;
  required: boolean;
}

interface BeginData {
  questions: GateQuestion[];
  error?: string;
  apiBaseUrl: string;
}

export const handler: Handlers<BeginData> = {
  async GET(_req, ctx) {
    const apiBaseUrl = Deno.env.get("API_BASE_URL") || "http://localhost:8393";

    try {
      // Fetch gate questions from the backend API
      const response = await fetch(`${apiBaseUrl}/api/gate/questions`);

      if (!response.ok) {
        throw new Error("Failed to fetch questions");
      }

      const data = await response.json();

      if (!data.success || !data.questions) {
        throw new Error("Invalid response from API");
      }

      // Take only the first 2 questions for the gate
      const gateQuestions = data.questions.slice(0, 2);

      return ctx.render({
        questions: gateQuestions,
        apiBaseUrl,
      });
    } catch (error) {
      console.error("Error fetching gate questions:", error);
      return ctx.render({
        questions: [],
        error: "Failed to load questions. Please try again.",
        apiBaseUrl,
      });
    }
  },
};

export default function BeginPage({ data }: PageProps<BeginData>) {
  const { questions, error, apiBaseUrl } = data;

  return (
    <>
      <Head>
        <title>begin - a formulation of truth</title>
        <link rel="icon" type="image/x-icon" href="/favicon.ico" />
        <link
          rel="icon"
          type="image/png"
          sizes="32x32"
          href="/favicons/favicon-32x32.png"
        />
        <link
          rel="icon"
          type="image/png"
          sizes="16x16"
          href="/favicons/favicon-16x16.png"
        />
        <link
          rel="apple-touch-icon"
          sizes="180x180"
          href="/favicons/apple-touch-icon.png"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Spectral:ital,wght@0,400;0,600;1,400&display=swap"
          rel="stylesheet"
        />
        <style>
          {`
          * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
          }

          body {
            font-family: 'Spectral', Georgia, serif;
            background: linear-gradient(135deg, #fef3c7 0%, #fde68a 50%, #fcd34d 100%);
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 2rem;
            line-height: 1.7;
            color: #78350f;
          }

          .container {
            max-width: 700px;
            width: 100%;
            background: rgba(255, 255, 255, 0.97);
            border-radius: 16px;
            box-shadow:
              0 25px 50px -12px rgba(0, 0, 0, 0.15),
              0 0 0 1px rgba(217, 119, 6, 0.1);
            padding: 3rem;
            border: 2px solid #d97706;
          }

          .header {
            text-align: center;
            margin-bottom: 2.5rem;
            padding-bottom: 2rem;
            border-bottom: 1px solid #fcd34d;
          }

          .header h1 {
            font-size: 2rem;
            font-weight: 600;
            color: #92400e;
            margin-bottom: 0.5rem;
            letter-spacing: 0.02em;
          }

          .header .subtitle {
            font-style: italic;
            color: #a16207;
            font-size: 1.1rem;
          }

          .intro {
            text-align: center;
            margin-bottom: 2rem;
            color: #78350f;
            font-size: 1.05rem;
          }

          .error-box {
            background: #fef2f2;
            border: 2px solid #dc2626;
            color: #dc2626;
            padding: 1.5rem;
            border-radius: 8px;
            text-align: center;
            margin-bottom: 1.5rem;
          }

          .home-link {
            display: block;
            text-align: center;
            margin-top: 2.5rem;
            padding-top: 1.5rem;
            border-top: 1px solid #fcd34d;
            color: #92400e;
            text-decoration: none;
            font-style: italic;
            font-size: 0.95rem;
          }

          .home-link:hover {
            text-decoration: underline;
          }

          @media (max-width: 640px) {
            body {
              padding: 1rem;
            }

            .container {
              padding: 1.5rem;
            }

            .header h1 {
              font-size: 1.5rem;
            }
          }
        `}
        </style>
      </Head>

      <div class="container">
        <div class="header">
          <h1>a formulation of truth</h1>
          <p class="subtitle">Begin the questionnaire</p>
        </div>

        {error ? (
          <div class="error-box">
            <p>{error}</p>
            <a
              href="/begin"
              style="display: inline-block; margin-top: 1rem; color: #dc2626; text-decoration: underline;"
            >
              Try again
            </a>
          </div>
        ) : questions.length === 0 ? (
          <div class="intro">
            <p>Loading questions...</p>
          </div>
        ) : (
          <>
            <div class="intro">
              <p>
                Answer two questions to begin. Your responses will be saved
                securely.
              </p>
            </div>

            <GateQuestions questions={questions} apiBaseUrl={apiBaseUrl} />
          </>
        )}

        <a href="/" class="home-link">
          &larr; Return to homepage
        </a>
      </div>
    </>
  );
}
