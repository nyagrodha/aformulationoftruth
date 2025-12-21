import { Handlers, PageProps } from "$fresh/server.ts";
import { Head } from "$fresh/runtime.ts";

interface IndexData {
  error?: string;
  success?: boolean;
  message?: string;
}

export const handler: Handlers<IndexData> = {
  async GET(req, ctx) {
    return ctx.render({});
  },

  async POST(req, ctx) {
    try {
      const formData = await req.formData();
      const email = formData.get("email")?.toString();

      if (!email) {
        return ctx.render({ error: "Email is required" });
      }

      // Validate email format
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        return ctx.render({ error: "Please enter a valid email address" });
      }

      // Send magic link request to backend
      const apiBase = Deno.env.get("API_BASE_URL") || "http://localhost:8393";
      const response = await fetch(`${apiBase}/api/auth/magic-link`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email }),
      });

      const data = await response.json();

      if (!response.ok) {
        return ctx.render({ error: data.error || "Failed to send magic link" });
      }

      return ctx.render({
        success: true,
        message: data.message || "Magic link sent! Check your email inbox.",
      });
    } catch (error) {
      console.error("Error requesting magic link:", error);
      return ctx.render({
        error: "An error occurred. Please try again.",
      });
    }
  },
};

export default function IndexPage({ data }: PageProps<IndexData>) {
  return (
    <>
      <Head>
        <title>begin the questionnaire - a formulation of truth</title>
        <link rel="icon" type="image/x-icon" href="/favicon.ico" />
        <link rel="icon" type="image/png" sizes="32x32" href="/favicons/favicon-32x32.png" />
        <link rel="icon" type="image/png" sizes="16x16" href="/favicons/favicon-16x16.png" />
        <link rel="apple-touch-icon" sizes="180x180" href="/favicons/apple-touch-icon.png" />
        <style>{`
          * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
          }

          body {
            font-family: 'Spectral', 'Libre Baskerville', Georgia, serif;
            background: linear-gradient(135deg, #f5e6d3 0%, #e8d5c0 100%);
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 2rem;
            line-height: 1.6;
            color: #4a3728;
          }

          .container {
            max-width: 600px;
            width: 100%;
            background: rgba(255, 255, 255, 0.95);
            border-radius: 12px;
            box-shadow: 0 10px 40px rgba(0, 0, 0, 0.15);
            padding: 3rem;
            border: 3px solid #8b4513;
          }

          h1 {
            font-family: 'Noto Sans Tamil', serif;
            font-size: 2.5rem;
            margin-bottom: 0.5rem;
            color: #8b4513;
            text-align: center;
          }

          .subtitle {
            text-align: center;
            font-style: italic;
            color: #6b5344;
            margin-bottom: 2rem;
            font-size: 1.1rem;
          }

          .intro {
            margin-bottom: 2rem;
            font-size: 1.05rem;
            line-height: 1.8;
            text-align: center;
          }

          .form-group {
            margin-bottom: 1.5rem;
          }

          label {
            display: block;
            margin-bottom: 0.5rem;
            font-weight: 600;
            color: #4a3728;
          }

          input[type="email"] {
            width: 100%;
            padding: 1rem;
            font-size: 1rem;
            border: 2px solid #d4a574;
            border-radius: 6px;
            font-family: inherit;
            transition: all 0.3s ease;
          }

          input[type="email"]:focus {
            outline: none;
            border-color: #8b4513;
            box-shadow: 0 0 0 3px rgba(139, 69, 19, 0.1);
          }

          button {
            width: 100%;
            padding: 1rem 2rem;
            font-size: 1.1rem;
            font-weight: 600;
            background: #8b4513;
            color: white;
            border: none;
            border-radius: 6px;
            cursor: pointer;
            transition: all 0.3s ease;
            font-family: inherit;
          }

          button:hover {
            background: #6b3410;
            transform: translateY(-2px);
            box-shadow: 0 4px 12px rgba(139, 69, 19, 0.3);
          }

          button:active {
            transform: translateY(0);
          }

          .error {
            background: #fee;
            border: 2px solid #c33;
            color: #c33;
            padding: 1rem;
            border-radius: 6px;
            margin-bottom: 1.5rem;
            text-align: center;
          }

          .success {
            background: #efe;
            border: 2px solid #3c3;
            color: #272;
            padding: 1.5rem;
            border-radius: 6px;
            text-align: center;
            font-size: 1.1rem;
          }

          .success-icon {
            font-size: 3rem;
            margin-bottom: 0.5rem;
          }

          .home-link {
            display: block;
            text-align: center;
            margin-top: 2rem;
            color: #8b4513;
            text-decoration: none;
            font-style: italic;
          }

          .home-link:hover {
            text-decoration: underline;
          }

          @media (max-width: 640px) {
            .container {
              padding: 2rem;
            }

            h1 {
              font-size: 2rem;
            }

            .subtitle {
              font-size: 1rem;
            }
          }
        `}</style>
      </Head>

      <div class="container">
        {data.success ? (
          <div class="success">
            <div class="success-icon">✉️</div>
            <p>{data.message}</p>
            <p style="margin-top: 1rem; font-size: 0.95rem; font-style: italic;">
              Click the link in your email to begin the questionnaire.
            </p>
          </div>
        ) : (
          <>
            <h1>தொடங்கு</h1>
            <p class="subtitle">Begin the questionnaire</p>

            <div class="intro">
              <p>
                Enter your email to receive a magic link. No password needed—just
                click the link we send you to begin answering the thirty-five questions.
              </p>
            </div>

            {data.error && (
              <div class="error">
                {data.error}
              </div>
            )}

            <form method="POST">
              <div class="form-group">
                <label for="email">Email Address</label>
                <input
                  type="email"
                  id="email"
                  name="email"
                  placeholder="your@email.com"
                  required
                  autofocus
                />
              </div>

              <button type="submit">
                Send Magic Link
              </button>
            </form>
          </>
        )}

        <a href="/" class="home-link">← Return to homepage</a>
      </div>
    </>
  );
}
