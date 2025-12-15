import { Handlers, PageProps } from "$fresh/server.ts";

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

    if (!token) {
      return ctx.render({ error: "No authentication token provided" });
    }

    try {
      // Verify magic link token with backend API (GET endpoint)
      const apiBase = Deno.env.get("API_BASE_URL") || "http://localhost:8393";
      const response = await fetch(`${apiBase}/auth/verify?token=${encodeURIComponent(token)}`);

      if (!response.ok) {
        return ctx.render({
          error: "Invalid or expired token"
        });
      }

      // Backend returns HTML redirect, check if successful
      const html = await response.text();

      if (html.includes("error") || html.includes("Error")) {
        return ctx.render({
          error: "Invalid or expired magic link"
        });
      }

      // Set session cookie from backend
      const headers = new Headers();
      const setCookie = response.headers.get("set-cookie");
      if (setCookie) {
        headers.append("set-cookie", setCookie);
      }

      // Redirect to questionnaire
      headers.append("Location", "/questionnaire");
      return new Response(null, {
        status: 302,
        headers,
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
