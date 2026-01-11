import { useState } from "preact/hooks";

interface QuestionnaireFormProps {
  questionId: number;
  questionText: string;
}

export default function QuestionnaireForm({ questionId, questionText }: QuestionnaireFormProps) {
  const [answer, setAnswer] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: Event) => {
    e.preventDefault();

    if (!answer.trim()) {
      setError("Please provide an answer");
      return;
    }

    setIsSubmitting(true);
    setError("");

    try {
      // Use session-based authentication (cookies sent automatically)
      const response = await fetch("/api/answers", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({
          questionId,
          answer: answer.trim(),
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to save answer");
      }

      // Reload the page to get the next question
      window.location.href = "/questionnaire";
    } catch (err) {
      console.error("Error submitting answer:", err);
      setError(err instanceof Error ? err.message : "Failed to save answer. Please try again.");
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <h2 class="text-2xl font-semibold text-gray-800 mb-6">{questionText}</h2>

      <textarea
        value={answer}
        onInput={(e) => setAnswer((e.target as HTMLTextAreaElement).value)}
        rows={6}
        class="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent resize-none"
        placeholder="Take your time (or don't) to reflect (or not!) and consider a thoughtfully wreckless admission of truth..."
        required
        disabled={isSubmitting}
      />

      {error && (
        <div class="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
          {error}
        </div>
      )}

      <div class="mt-6 flex justify-end items-center">
        <button
          type="submit"
          disabled={isSubmitting}
          class="bg-amber-600 text-white px-8 py-3 rounded-lg font-medium hover:bg-amber-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isSubmitting ? "Saving..." : "Continue →"}
        </button>
      </div>
    </form>
  );
}
