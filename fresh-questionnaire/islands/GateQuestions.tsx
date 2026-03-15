import { useState, useEffect } from "preact/hooks";

interface GateQuestion {
  id: number;
  question_text: string;
  question_order: number;
  required: boolean;
}

interface GateQuestionsProps {
  questions: GateQuestion[];
  apiBaseUrl: string;
}

// Generate a unique session ID for gate responses
function generateSessionId(): string {
  const timestamp = Date.now().toString(36);
  const randomPart = Math.random().toString(36).substring(2, 15);
  return `gate_${timestamp}_${randomPart}`;
}

export default function GateQuestions({ questions, apiBaseUrl }: GateQuestionsProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answer, setAnswer] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [sessionId, setSessionId] = useState("");
  const [showEmailForm, setShowEmailForm] = useState(false);
  const [email, setEmail] = useState("");
  const [emailSent, setEmailSent] = useState(false);
  const [emailMessage, setEmailMessage] = useState("");

  // Initialize session ID on mount
  useEffect(() => {
    // Check for existing gate session in localStorage
    const existingSession = localStorage.getItem("gateSessionId");
    if (existingSession) {
      setSessionId(existingSession);
    } else {
      const newSessionId = generateSessionId();
      localStorage.setItem("gateSessionId", newSessionId);
      setSessionId(newSessionId);
    }
  }, []);

  const currentQuestion = questions[currentIndex];
  const isLastQuestion = currentIndex >= 1; // Show email form after 2 questions
  const progress = ((currentIndex + 1) / Math.min(questions.length, 2)) * 100;

  const handleSubmit = async (e: Event) => {
    e.preventDefault();

    if (!answer.trim() && currentQuestion?.required) {
      setError("Please provide an answer to continue");
      return;
    }

    setIsSubmitting(true);
    setError("");

    try {
      // Save answer to gate API
      const response = await fetch(`${apiBaseUrl}/api/gate/response`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          sessionId,
          questionText: currentQuestion.question_text,
          questionIndex: currentIndex,
          answer: answer.trim(),
          skipped: !answer.trim(),
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.message || "Failed to save response");
      }

      // Clear answer and move to next question or email form
      setAnswer("");

      if (isLastQuestion) {
        // After 2 questions, show email form
        setShowEmailForm(true);
      } else {
        setCurrentIndex(currentIndex + 1);
      }
    } catch (err) {
      console.error("Error saving gate response:", err);
      setError(err instanceof Error ? err.message : "Failed to save. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSkip = async () => {
    if (currentQuestion?.required) {
      setError("This question requires an answer");
      return;
    }

    setIsSubmitting(true);
    setError("");

    try {
      // Save skipped response
      await fetch(`${apiBaseUrl}/api/gate/response`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          sessionId,
          questionText: currentQuestion.question_text,
          questionIndex: currentIndex,
          answer: "",
          skipped: true,
        }),
      });

      setAnswer("");

      if (isLastQuestion) {
        setShowEmailForm(true);
      } else {
        setCurrentIndex(currentIndex + 1);
      }
    } catch (err) {
      console.error("Error skipping question:", err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEmailSubmit = async (e: Event) => {
    e.preventDefault();

    if (!email.trim()) {
      setError("Please enter your email address");
      return;
    }

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      setError("Please enter a valid email address");
      return;
    }

    setIsSubmitting(true);
    setError("");

    try {
      const response = await fetch(`${apiBaseUrl}/api/auth/magic-link`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: email.trim(),
          gateSessionId: sessionId,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to send magic link");
      }

      setEmailSent(true);
      setEmailMessage(data.message || "Magic link sent! Check your email inbox.");

      // Clear gate session from localStorage after successful email send
      // The session ID is now passed to the backend
    } catch (err) {
      console.error("Error sending magic link:", err);
      setError(err instanceof Error ? err.message : "Failed to send magic link. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Email sent confirmation
  if (emailSent) {
    return (
      <div class="text-center py-8">
        <div class="text-6xl mb-6">&#x2709;</div>
        <h2 class="text-2xl font-semibold text-amber-800 mb-4">Check Your Email</h2>
        <p class="text-gray-700 text-lg mb-4">{emailMessage}</p>
        <p class="text-gray-600 italic">
          Click the link in your email to continue the questionnaire.
        </p>
        <p class="text-gray-500 text-sm mt-6">
          Your first two answers have been saved and will be connected to your session.
        </p>
      </div>
    );
  }

  // Email form after gate questions
  if (showEmailForm) {
    return (
      <div class="space-y-6">
        <div class="text-center mb-8">
          <div class="text-4xl mb-4">&#x2728;</div>
          <h2 class="text-2xl font-semibold text-amber-800 mb-2">
            Your answers have been saved
          </h2>
          <p class="text-gray-600">
            Enter your email to receive a magic link and continue the remaining questions.
          </p>
        </div>

        <form onSubmit={handleEmailSubmit} class="space-y-4">
          <div>
            <label for="email" class="block text-sm font-medium text-gray-700 mb-2">
              Email Address
            </label>
            <input
              type="email"
              id="email"
              value={email}
              onInput={(e) => setEmail((e.target as HTMLInputElement).value)}
              placeholder="your@email.com"
              class="w-full px-4 py-3 border-2 border-amber-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 text-lg"
              required
              disabled={isSubmitting}
              autofocus
            />
          </div>

          {error && (
            <div class="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={isSubmitting}
            class="w-full bg-amber-600 text-white px-6 py-4 rounded-lg font-semibold text-lg hover:bg-amber-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSubmitting ? "Sending..." : "Send Magic Link"}
          </button>
        </form>

        <p class="text-center text-gray-500 text-sm mt-4">
          No password needed. We'll send you a secure link to continue.
        </p>
      </div>
    );
  }

  // Gate questions flow
  return (
    <div class="space-y-6">
      {/* Progress indicator */}
      <div class="mb-8">
        <div class="flex justify-between text-sm text-gray-600 mb-2">
          <span>Question {currentIndex + 1} of 2</span>
          <span>{Math.round(progress)}%</span>
        </div>
        <div class="w-full bg-gray-200 rounded-full h-2">
          <div
            class="bg-amber-600 h-2 rounded-full transition-all duration-500"
            style={`width: ${progress}%`}
          />
        </div>
      </div>

      {/* Question */}
      <form onSubmit={handleSubmit} class="space-y-6">
        <div>
          <h2 class="text-2xl font-semibold text-gray-800 mb-6 leading-relaxed">
            {currentQuestion?.question_text}
          </h2>

          <textarea
            value={answer}
            onInput={(e) => setAnswer((e.target as HTMLTextAreaElement).value)}
            rows={5}
            class="w-full px-4 py-3 border-2 border-amber-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 resize-none text-lg"
            placeholder="Take a moment to reflect..."
            disabled={isSubmitting}
            autofocus
          />
        </div>

        {error && (
          <div class="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
            {error}
          </div>
        )}

        <div class="flex justify-between items-center">
          {!currentQuestion?.required && (
            <button
              type="button"
              onClick={handleSkip}
              disabled={isSubmitting}
              class="text-gray-500 hover:text-gray-700 transition text-sm"
            >
              Skip this question
            </button>
          )}
          <div class="flex-1" />
          <button
            type="submit"
            disabled={isSubmitting}
            class="bg-amber-600 text-white px-8 py-3 rounded-lg font-medium hover:bg-amber-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSubmitting ? "Saving..." : "Continue"}
          </button>
        </div>
      </form>

      {/* Privacy note */}
      {currentIndex === 0 && (
        <p class="text-center text-gray-500 text-xs mt-8">
          Your responses are encrypted using AES-256 encryption and stored securely.
        </p>
      )}
    </div>
  );
}
