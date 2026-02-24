import { Handlers, PageProps } from "$fresh/server.ts";
import { Head } from "$fresh/runtime.ts";

interface AuthData {
  error?: string;
}

export const handler: Handlers<AuthData> = {
  async GET(req, ctx) {
    const url = new URL(req.url);
    const token = url.searchParams.get("token");
    const gateSessionId = url.searchParams.get("gateSessionId") ?? undefined;

    if (!token) {
      return ctx.render({ error: "No authentication token provided" });
    }

    try {
      const apiBase = Deno.env.get("API_BASE_URL") || "http://localhost:8393";
      const incomingCookie = req.headers.get("cookie") ?? "";

      // Verify magic link token with backend API (POST endpoint)
      const verifyHeaders = new Headers({
        "Content-Type": "application/json",
      });
      if (incomingCookie) {
        verifyHeaders.set("cookie", incomingCookie);
      }

      const verifyResponse = await fetch(`${apiBase}/api/auth/magic-link/verify`, {
        method: "POST",
        headers: verifyHeaders,
        body: JSON.stringify({ token, gateSessionId }),
      });

      if (!verifyResponse.ok) {
        const errorMessage = verifyResponse.status === 400
          ? "Invalid or expired token"
          : "Failed to authenticate";
        return ctx.render({ error: errorMessage });
      }

      // Capture session cookie from backend
      const sessionCookie = verifyResponse.headers.get("set-cookie");
      const cookieForFollowup = sessionCookie ? sessionCookie.split(";")[0] : incomingCookie;

      // Create or fetch questionnaire session so we can land the user on the questionnaire
      const sessionResponse = await fetch(`${apiBase}/api/questionnaire/session`, {
        method: "GET",
        headers: cookieForFollowup
          ? { cookie: cookieForFollowup }
          : undefined,
      });

      if (!sessionResponse.ok) {
        return ctx.render({ error: "Failed to initialize questionnaire session" });
      }

      const session = await sessionResponse.json();

      // Redirect to questionnaire with session id and set cookies
      const headers = new Headers();
      if (sessionCookie) {
        headers.append("set-cookie", sessionCookie);
      }
      headers.append(
        "set-cookie",
        `questionnaireSessionId=${session.id}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=604800`
      );
      headers.append("Location", `/questionnaire?sessionId=${encodeURIComponent(session.id)}`);

      return new Response(null, {
        status: 302,
        headers,
      });

    } catch (error) {
      console.error("Auth verification failed:", error instanceof Error ? error.message : "unknown error");
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
