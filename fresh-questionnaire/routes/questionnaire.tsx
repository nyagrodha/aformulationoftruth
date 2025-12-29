import { Handlers, PageProps } from "$fresh/server.ts";
import { Head } from "$fresh/runtime.ts";
import QuestionnaireForm from "../islands/QuestionnaireForm.tsx";

interface QuestionnaireData {
  error?: string;
  completed?: boolean;
  message?: string;
  question?: {
    id: number;
    text: string;
  };
  progress?: {
    current: number;
    total: number;
  };
}

export const handler: Handlers<QuestionnaireData> = {
  async GET(req, ctx) {
    try {
      const apiUrl = Deno.env.get("API_BASE_URL") || "http://localhost:8393";

      // Forward all cookies from the request to the backend API
      const cookies = req.headers.get("cookie") || "";

      // Get next question from API using session-based auth
      const questionResponse = await fetch(`${apiUrl}/api/questions/next`, {
        headers: {
          "Cookie": cookies,
        },
        credentials: "include",
      });

      if (!questionResponse.ok) {
        if (questionResponse.status === 401) {
          return new Response(null, {
            status: 302,
            headers: { Location: "/begin" }
          });
        }
        throw new Error(`Failed to fetch question: ${questionResponse.statusText}`);
      }

      const questionData = await questionResponse.json();

      // Check if questionnaire is completed
      if (questionData.completed) {
        return ctx.render({
          completed: true,
          message: questionData.message || "All questions have been answered!"
        });
      }

      return ctx.render({
        question: {
          id: questionData.id,
          text: questionData.text,
        },
        progress: {
          current: questionData.position,
          total: questionData.total,
        },
      });
    } catch (error) {
      console.error("Questionnaire error:", error);
      return ctx.render({
        error: error instanceof Error ? error.message : "Failed to load questionnaire"
      });
    }
  },
};

export default function QuestionnairePage({ data }: PageProps<QuestionnaireData>) {
  if (data.error) {
    return (
      <>
        <Head>
          <title>error - a formulation of truth</title>
          <link rel="icon" type="image/x-icon" href="/favicon.ico" />
        </Head>
        <div class="min-h-screen flex items-center justify-center bg-gray-50">
          <div class="max-w-md w-full bg-white shadow-lg rounded-lg p-8">
            <h1 class="text-2xl font-bold text-red-600 mb-4">Error</h1>
            <p class="text-gray-700">{data.error}</p>
            <a href="/begin" class="inline-block mt-4 text-blue-600 hover:underline">← Return to begin</a>
          </div>
        </div>
      </>
    );
  }

  if (data.completed) {
    return (
      <>
        <Head>
          <title>complete - a formulation of truth</title>
          <link rel="icon" type="image/x-icon" href="/favicon.ico" />
        </Head>
        <div class="min-h-screen flex items-center justify-center bg-gradient-to-br from-amber-50 to-orange-100">
          <div class="max-w-2xl w-full bg-white shadow-xl rounded-lg p-12 text-center">
            <h1 class="text-4xl font-bold text-amber-800 mb-6">✨ Complete ✨</h1>
            <p class="text-xl text-gray-700 mb-8">{data.message}</p>
            <p class="text-gray-600 mb-8">
              Your answers have been encrypted and saved. Thank you for your introspection.
            </p>
            <a
              href="/"
              class="inline-block bg-amber-600 text-white px-8 py-3 rounded-lg font-medium hover:bg-amber-700 transition"
            >
              Return Home
            </a>
          </div>
        </div>
      </>
    );
  }

  const { question, progress } = data;

  // Optional: Insert random images/text at certain questions for cognitive dissonance
  // Uncomment and customize as needed
  /*
  const shouldShowImage = (questionNum: number) => {
    return [5, 12, 20, 28].includes(questionNum);
  };

  const shouldShowQuote = (questionNum: number) => {
    return [8, 16, 24, 32].includes(questionNum);
  };

  const getRandomImage = (questionNum: number) => {
    const images = [
      "/static/images/cats-playing-poker.jpg",
      "/static/images/empty-stadium.jpg",
      "/static/images/breakfast-cereal-scattered.jpg",
      "/static/images/upside-down-chair.jpg",
    ];
    return images[questionNum % images.length];
  };

  const getRandomQuote = (questionNum: number) => {
    const quotes = [
      {
        text: "I am so clever that sometimes I don't understand a single word of what I am saying.",
        author: "Oscar Wilde"
      },
      {
        text: "This sentence is false.",
        author: "The Liar's Paradox"
      },
      {
        text: "Tradition is the illusion of permanence.",
        author: "Woody Allen"
      },
      {
        text: "One day, in retrospect, the years of struggle will strike you as the most beautiful.",
        author: "Sigmund Freud"
      },
      {
        text: "I can resist everything except temptation.",
        author: "Oscar Wilde"
      },
      {
        text: "The shadow is a moral problem that challenges the whole ego-personality.",
        author: "Carl Jung"
      },
      {
        text: "Begin at the beginning and go on till you come to the end: then stop.",
        author: "Lewis Carroll"
      },
    ];
    return quotes[questionNum % quotes.length];
  };
  */

  return (
    <>
      <Head>
        <title>questionnaire - question {progress?.current} - a formulation of truth</title>
        <link rel="icon" type="image/x-icon" href="/favicon.ico" />
        <link rel="icon" type="image/png" sizes="32x32" href="/favicons/favicon-32x32.png" />
        <link rel="icon" type="image/png" sizes="16x16" href="/favicons/favicon-16x16.png" />
        <link rel="apple-touch-icon" sizes="180x180" href="/favicons/apple-touch-icon.png" />
      </Head>
      <div class="min-h-screen bg-gradient-to-br from-amber-50 to-orange-100 py-8">
        <div class="container mx-auto px-4 max-w-3xl">
          <div class="mb-8">
            <div class="flex justify-between text-sm text-gray-600 mb-2">
              <span>Question {progress?.current} of {progress?.total}</span>
              <span>{Math.round((progress?.current! / progress?.total!) * 100)}%</span>
            </div>
            <div class="w-full bg-gray-200 rounded-full h-2">
              <div
                class="bg-amber-600 h-2 rounded-full transition-all duration-300"
                style={`width: ${(progress?.current! / progress?.total!) * 100}%`}
              />
            </div>
          </div>

          {/* Optional: Random image (commented out) */}
          {/* {shouldShowImage(progress?.current!) && (
            <div class="mb-6 rounded-lg overflow-hidden shadow-lg">
              <img src={getRandomImage(progress?.current!)} alt="A moment of pause" class="w-full h-64 object-cover" />
            </div>
          )} */}

          {/* Optional: Random quote (commented out) */}
          {/* {shouldShowQuote(progress?.current!) && (
            <div class="mb-6 bg-amber-100 border-l-4 border-amber-600 p-6 rounded-r-lg">
              <p class="text-lg italic text-gray-800 mb-2">"{getRandomQuote(progress?.current!).text}"</p>
              <p class="text-right text-gray-600">— {getRandomQuote(progress?.current!).author}</p>
            </div>
          )} */}

          <div class="bg-white rounded-lg shadow-xl p-8 mb-8">
            <QuestionnaireForm
              questionId={question!.id}
              questionText={question!.text}
            />
          </div>

          <div class="text-center text-gray-600 text-sm">
            <p>The program encrypted and saved your response.</p>
          </div>
        </div>
      </div>
    </>
  );
}
