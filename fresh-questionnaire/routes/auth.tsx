import { Handlers, PageProps } from "$fresh/server.ts";
import { Head } from "$fresh/runtime.ts";

interface AuthData {
  token?: string;
  error?: string;
  user?: {
    id: string;
    email: string;
  };
}

export const handler: Handlers<AuthData> = {
  async GET(req, ctx) {
    const url = new URL(req.url);
    const token = url.searchParams.get("token");
    const gateSessionId = url.searchParams.get("gateSessionId");

    if (!token) {
      return ctx.render({ error: "No authentication token provided" });
    }

    try {
      // Verify magic link token with backend API (GET endpoint)
      // Use redirect: 'manual' to capture the session cookie from the redirect
      const apiBase = Deno.env.get("API_BASE_URL") || "http://localhost:8393";
      const response = await fetch(
        `${apiBase}/auth/verify?token=${encodeURIComponent(token)}${gateSessionId ? `&gateSessionId=${gateSessionId}` : ''}`,
        { redirect: 'manual' }
      );

      // Backend should return 302 redirect with session cookie
      if (response.status === 302) {
        // Extract session cookie from backend response
        const headers = new Headers();
        const setCookie = response.headers.get("set-cookie");

        if (setCookie) {
          // Forward the session cookie to the browser
          headers.append("set-cookie", setCookie);
        }

        // Get redirect location from backend (should be /questionnaire)
        const location = response.headers.get("location") || "/questionnaire";

        // Redirect browser to questionnaire with session cookie
        headers.append("Location", location);
        return new Response(null, {
          status: 302,
          headers,
        });
      }

      // If not a redirect, something went wrong
      return ctx.render({
        error: "Authentication failed. Please try again."
      });

    } catch (error) {
      console.error("Auth error:", error);
      return ctx.render({
        error: "Failed to authenticate. Please try again."
      });
    }
  },
};

export default function AuthPage({ data }: PageProps<AuthData>) {
  if (data.error) {
    return (
      <>
        <Head>
          <title>authentication error - a formulation of truth</title>
          <link rel="icon" type="image/x-icon" href="/favicon.ico" />
          <link rel="icon" type="image/png" sizes="32x32" href="/favicons/favicon-32x32.png" />
          <link rel="icon" type="image/png" sizes="16x16" href="/favicons/favicon-16x16.png" />
          <link rel="apple-touch-icon" sizes="180x180" href="/favicons/apple-touch-icon.png" />
        </Head>
        <div class="min-h-screen flex items-center justify-center bg-gray-50">
        <div class="max-w-md w-full bg-white shadow-lg rounded-lg p-8">
          <div class="text-center">
            <h1 class="text-2xl font-bold text-red-600 mb-4">
              Authentication Failed
            </h1>
            <p class="text-gray-700 mb-6">{data.error}</p>
            <a
              href="/"
              class="inline-block bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 transition"
            >
              Return Home
            </a>
          </div>
        </div>
      </div>
      </>
    );
  }

  return (
    <>
      <Head>
        <title>authenticating... - a formulation of truth</title>
        <link rel="icon" type="image/x-icon" href="/favicon.ico" />
        <link rel="icon" type="image/png" sizes="32x32" href="/favicons/favicon-32x32.png" />
        <link rel="icon" type="image/png" sizes="16x16" href="/favicons/favicon-16x16.png" />
        <link rel="apple-touch-icon" sizes="180x180" href="/favicons/apple-touch-icon.png" />
      </Head>
      <div class="min-h-screen flex items-center justify-center bg-gray-50">
        <div class="text-center">
          <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p class="text-gray-600">authenticating your session @ a formulation of truth.</p>
        </div>
      </div>
    </>
  );
}
