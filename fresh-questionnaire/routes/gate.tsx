import { Handlers, PageProps } from "$fresh/server.ts";

interface GateQuestion {
  id: number;
  question_text: string;
  question_order: number;
  required: boolean;
}

interface GateData {
  questions?: GateQuestion[];
  currentQuestion?: GateQuestion;
  currentIndex?: number;
  total?: number;
  error?: string;
  completed?: boolean;
}

export const handler: Handlers<GateData> = {
  async GET(req, ctx) {
    const url = new URL(req.url);
    const apiUrl = Deno.env.get("API_URL") || "http://localhost:3001";

    try {
      // Fetch all gate questions
      const response = await fetch(`${apiUrl}/api/gate/questions`);

      if (!response.ok) {
        return ctx.render({
          error: "Failed to load gate questions"
        });
      }

      const data = await response.json();
      const questions = data.questions || [];

      if (questions.length === 0) {
        return ctx.render({
          error: "No gate questions available"
        });
      }

      // Get current question index from query param or start at 0
      const currentIndex = parseInt(url.searchParams.get("q") || "0");

      if (currentIndex >= questions.length) {
        // All questions answered, show completion
        return ctx.render({
          completed: true,
          total: questions.length
        });
      }

      return ctx.render({
        questions,
        currentQuestion: questions[currentIndex],
        currentIndex,
        total: questions.length
      });

    } catch (error) {
      console.error("Error in gate handler:", error);
      return ctx.render({
        error: "An error occurred loading the gate"
      });
    }
  },

  async POST(req, ctx) {
    const formData = await req.formData();
    const answer = formData.get("answer")?.toString();
    const questionId = formData.get("questionId")?.toString();
    const currentIndex = parseInt(formData.get("currentIndex")?.toString() || "0");
    const sessionId = formData.get("sessionId")?.toString() || "";
    const apiUrl = Deno.env.get("API_URL") || "http://localhost:3001";

    if (!answer || !questionId) {
      return new Response(null, {
        status: 303,
        headers: { Location: "/gate?error=missing" }
      });
    }

    try {
      // Save gate answer (temporarily to session until user authenticates)
      // For now, just move to next question
      // TODO: Store answers in localStorage or session before authentication

      // Move to next question
      const nextIndex = currentIndex + 1;

      return new Response(null, {
        status: 303,
        headers: { Location: `/gate?q=${nextIndex}` }
      });

    } catch (error) {
      console.error("Error saving gate answer:", error);
      return new Response(null, {
        status: 303,
        headers: { Location: "/gate?error=save" }
      });
    }
  }
};

export default function GatePage({ data }: PageProps<GateData>) {
  if (data.error) {
    return (
      <div class="min-h-screen bg-gradient-to-br from-amber-50 to-orange-50 flex items-center justify-center p-4">
        <div class="max-w-2xl w-full bg-white shadow-xl rounded-lg p-12 text-center">
          <h1 class="text-3xl font-bold text-red-600 mb-4">Error</h1>
          <p class="text-gray-700">{data.error}</p>
          <a href="/" class="inline-block mt-6 px-6 py-3 bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition">
            Return Home
          </a>
        </div>
      </div>
    );
  }

  if (data.completed) {
    return (
      <div class="min-h-screen bg-gradient-to-br from-amber-50 to-orange-50 flex items-center justify-center p-4">
        <div class="max-w-2xl w-full bg-white shadow-xl rounded-lg p-12 text-center">
          <h1 class="text-4xl font-bold text-amber-800 mb-6">Gateway Complete</h1>
          <p class="text-xl text-gray-700 mb-8">
            You've answered {data.total} introspective questions.
          </p>
          <p class="text-gray-600 mb-8">
            Now, choose your path forward:
          </p>
          <div class="flex flex-col sm:flex-row gap-4 justify-center">
            <a
              href="/decide"
              class="px-8 py-4 bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition font-semibold text-lg"
            >
              Continue Your Journey
            </a>
          </div>
        </div>
      </div>
    );
  }

  const { currentQuestion, currentIndex, total } = data;
  const progress = total ? ((currentIndex! / total) * 100).toFixed(0) : "0";

  return (
    <div class="min-h-screen bg-gradient-to-br from-amber-50 to-orange-50 flex items-center justify-center p-4">
      <div class="max-w-2xl w-full">
        {/* Progress indicator */}
        <div class="mb-6">
          <div class="flex justify-between text-sm text-gray-600 mb-2">
            <span>Question {(currentIndex! + 1)} of {total}</span>
            <span>{progress}% complete</span>
          </div>
          <div class="w-full bg-gray-200 rounded-full h-2">
            <div
              class="bg-amber-600 h-2 rounded-full transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        {/* Question card */}
        <div class="bg-white shadow-xl rounded-lg p-8 md:p-12">
          <h2 class="text-2xl md:text-3xl font-serif text-gray-800 mb-8 leading-relaxed">
            {currentQuestion?.question_text}
          </h2>

          <form method="POST" class="space-y-6">
            <input type="hidden" name="questionId" value={currentQuestion?.id} />
            <input type="hidden" name="currentIndex" value={currentIndex} />
            <input type="hidden" name="sessionId" value="" />

            <div>
              <label class="block text-sm font-medium text-gray-700 mb-2">
                Your response
              </label>
              <textarea
                name="answer"
                rows={6}
                required={currentQuestion?.required}
                placeholder="Take your time to reflect..."
                class="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent resize-none"
              />
            </div>

            <div class="flex justify-between items-center">
              {!currentQuestion?.required && (
                <button
                  type="submit"
                  formnovalidate
                  class="px-6 py-3 text-gray-600 hover:text-gray-800 transition"
                >
                  Skip
                </button>
              )}
              <button
                type="submit"
                class="ml-auto px-8 py-3 bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition font-semibold"
              >
                {currentIndex! + 1 < total! ? "Next Question" : "Complete"}
              </button>
            </div>
          </form>
        </div>

        {/* Note about progress */}
        <p class="text-center text-sm text-gray-600 mt-6">
          Your responses are collected anonymously. You'll be asked to authenticate after completing the gateway.
        </p>
      </div>
    </div>
  );
}
