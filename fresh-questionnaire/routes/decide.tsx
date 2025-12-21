import { Handlers, PageProps} from "$fresh/server.ts";

interface DecideData {
  gateCompleted: boolean;
}

export const handler: Handlers<DecideData> = {
  GET(req, ctx) {
    // TODO: Check if user has completed gate questions
    // For now, assume they have if they're on this page
    return ctx.render({
      gateCompleted: true
    });
  }
};

export default function DecidePage({ data }: PageProps<DecideData>) {
  return (
    <div class="min-h-screen bg-gradient-to-br from-amber-50 via-orange-50 to-rose-50 flex items-center justify-center p-4">
      <div class="max-w-4xl w-full">
        <div class="bg-white/90 backdrop-blur-sm shadow-2xl rounded-2xl p-8 md:p-12">
          {/* Header */}
          <div class="text-center mb-12">
            <h1 class="text-4xl md:text-5xl font-serif text-gray-800 mb-4">
              Now the Palette's Whet
            </h1>
            <p class="text-xl text-gray-600 leading-relaxed">
              Choose your own adventure:
            </p>
          </div>

          {/* Two choices */}
          <div class="grid md:grid-cols-2 gap-8 mb-8">
            {/* Continue to Questionnaire */}
            <div class="group relative bg-gradient-to-br from-amber-100 to-orange-100 rounded-xl p-8 border-2 border-amber-200 hover:border-amber-400 transition-all duration-300 hover:shadow-xl">
              <div class="mb-6">
                <div class="text-5xl mb-4">📝</div>
                <h2 class="text-2xl font-semibold text-gray-800 mb-3">
                  Continue to More Questions
                </h2>
                <p class="text-gray-700 leading-relaxed mb-6">
                  Begin answering the Proust questionnaire dba Karuppacāmi Kēḷvittāḷ.
                </p>
                <ul class="text-sm text-gray-600 space-y-2 mb-6">
                  <li class="flex items-start">
                    <span class="mr-2">✓</span>
                    <span>Your responses are encrypted end-to-end</span>
                  </li>
                  <li class="flex items-start">
                    <span class="mr-2">✓</span>
                    <span>Receive a PDF of your answers</span>
                  </li>
                  <li class="flex items-start">
                    <span class="mr-2">✓</span>
                    <span>Return anytime to continue</span>
                  </li>
                </ul>
              </div>
              <a
                href="/"
                class="block w-full text-center px-6 py-4 bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition font-semibold text-lg group-hover:scale-105 transform duration-200"
              >
                Enter the Questionnaire
              </a>
              <p class="text-xs text-gray-500 text-center mt-3">
                You'll be asked for your email to receive a magic link
              </p>
            </div>

            {/* Learn More */}
            <div class="group relative bg-gradient-to-br from-purple-100 to-pink-100 rounded-xl p-8 border-2 border-purple-200 hover:border-purple-400 transition-all duration-300 hover:shadow-xl">
              <div class="mb-6">
                <div class="text-5xl mb-4">👤</div>
                <h2 class="text-2xl font-semibold text-gray-800 mb-3">
                  Meet the Creator
                </h2>
                <p class="text-gray-700 leading-relaxed mb-6">
                  Learn more about the intentions behind this webapp. Learn about the intersection of technology and 10th c. C.E. Hindu Tantric philosophy. And why the name: a formulation of truth.
                </p>
                <ul class="text-sm text-gray-600 space-y-2 mb-6">
                  <li class="flex items-start">
                    <span class="mr-2">•</span>
                    <span>Background and motivations</span>
                  </li>
                  <li class="flex items-start">
                    <span class="mr-2">•</span>
                    <span>Privacy and encryption philosophy</span>
                  </li>
                  <li class="flex items-start">
                    <span class="mr-2">•</span>
                    <span>Future vision for this project</span>
                  </li>
                </ul>
              </div>
              <a
                href="/about"
                class="block w-full text-center px-6 py-4 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition font-semibold text-lg group-hover:scale-105 transform duration-200"
              >
                Learn More
              </a>
              <p class="text-xs text-gray-500 text-center mt-3">
                You can always return to the questionnaire later
              </p>
            </div>
          </div>

          {/* Optional: Both paths */}
          <div class="text-center text-gray-600">
            <p class="text-sm">
              Or take your time — explore both paths at your own pace
            </p>
          </div>
        </div>

        {/* Footer note */}
        <div class="text-center mt-8 text-sm text-gray-600">
          <p>
            This is <span class="font-semibold">a formulation of truth</span> — a space for introspection
          </p>
        </div>
      </div>
    </div>
  );
}
