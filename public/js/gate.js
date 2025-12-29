// Gate page logic
// This implements the "refusal" approach - one entry point that asks something
// before revealing content

(function() {
  'use strict';

  // Questions to ask at the gate (first 3 from Proust Questionnaire)
  const gateQuestions = [
    "What is your idea of perfect happiness?",
    "What is your greatest fear?",
    "What is the trait you most deplore in yourself?"
  ];

  // Get next question in fixed order (0, 1, 2)
  function getNextQuestion(questionCount) {
    if (questionCount < gateQuestions.length) {
      return { index: questionCount, question: gateQuestions[questionCount] };
    }
    return null;
  }

  // DOM elements
  const entryBoxes = document.getElementById('entry-boxes');
  const questionBox = document.getElementById('question-box');
  const questionText = document.getElementById('question-text');
  const responseTextarea = document.getElementById('response');
  const submitButton = document.getElementById('submit');
  const skipButton = document.getElementById('skip');
  const transition = document.getElementById('transition');
  const enterButton = document.getElementById('enter');
  const thermoContent = document.getElementById('thermodynamics-content');
  const continueFromThermo = document.getElementById('continue-from-thermo');

  // State
  let questionCount = 0;
  let currentQuestionIndex = null;
  let gateSessionId = null;
  let lowSignalWarningShown = false;
  let consecutiveEmptyCount = 0;

  // Get or create gate session ID
  function getGateSessionId() {
    if (!gateSessionId) {
      gateSessionId = localStorage.getItem('gateSessionId');
      if (!gateSessionId) {
        gateSessionId = generateSessionId();
        localStorage.setItem('gateSessionId', gateSessionId);
      }
    }
    return gateSessionId;
  }

  // Generate random session ID
  function generateSessionId() {
    return 'gate_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  }

  // Normalize text input
  function normalize(input) {
    return input
      .normalize("NFKC")
      .replace(/\s+/g, " ")
      .trim();
  }

  // Classify answer quality
  function classifyAnswer(raw) {
    const text = normalize(raw);

    // Empty is fine - users can skip
    if (!text) {
      return { ok: true };
    }

    if (text.length === 1) {
      return { ok: false, reason: "single_character" };
    }

    if (/^\d+(\.\d+)?$/.test(text)) {
      return { ok: false, reason: "numbers_only" };
    }

    if (/^[^\p{L}\p{N}]+$/u.test(text)) {
      return { ok: false, reason: "symbols_only" };
    }

    if (/^(.)\1{4,}$/u.test(text)) {
      return { ok: false, reason: "repeated_character" };
    }

    if (/^(asdf|qwer|zxcv|hjkl)+$/i.test(text)) {
      return { ok: false, reason: "keyboard_mash" };
    }

    if (text.length < 5) {
      return { ok: false, reason: "too_short" };
    }

    return { ok: true };
  }

  // Show low signal warning
  function showLowSignalWarning() {
    const warningDiv = document.createElement('div');
    warningDiv.className = 'low-signal-warning';
    warningDiv.innerHTML = `
      <p class="warning-hindi">दाल में कुछ काला है।</p>
      <p class="warning-urdu">دال میں کچھ کالا سا محسوس ہوتا ہے۔</p>
      <p class="warning-message">क्या आप अपने उत्तर पर फिर से विचार करना चाहेंगे?</p>
      <div class="warning-actions">
        <button id="reconsider-answer" class="warning-btn-reconsider">फिर से विचार करें</button>
        <button id="keep-answer" class="warning-btn-keep">जैसा है रहने दें</button>
      </div>
    `;

    questionBox.appendChild(warningDiv);

    // Set up button handlers
    document.getElementById('reconsider-answer').addEventListener('click', () => {
      warningDiv.remove();
      lowSignalWarningShown = false;
      if (responseTextarea) {
        responseTextarea.focus();
      }
    });

    document.getElementById('keep-answer').addEventListener('click', () => {
      warningDiv.remove();
      lowSignalWarningShown = false;
      proceedWithSubmit();
    });
  }

  // Show questions preview offer
  function showQuestionsPreviewOffer() {
    const previewDiv = document.createElement('div');
    previewDiv.className = 'telegram-offer';
    previewDiv.innerHTML = `
      <p class="telegram-message">Curious about the questions before you devote time to responses?</p>
      <p class="telegram-hint">
        <a href="/questions.html" target="_blank" style="color: var(--pondicherry-ochre); text-decoration: underline;">View all 35 questions</a>
      </p>
      <div class="telegram-actions">
        <button id="continue-here" class="telegram-btn-stay">Continue here</button>
      </div>
    `;

    questionBox.appendChild(previewDiv);

    // Set up button handler
    document.getElementById('continue-here').addEventListener('click', () => {
      previewDiv.remove();
      consecutiveEmptyCount = 0; // Reset counter

      // Move to next question (response already saved)
      questionCount++;

      // Hide question box
      if (questionBox) {
        questionBox.classList.add('hidden');
      }

      // Check if we should ask another question or show transition
      if (questionCount < gateQuestions.length) {
        setTimeout(() => {
          showQuestion();
        }, 400);
      } else {
        showTransition();
      }
    });
  }

  // Save response to backend
  async function saveResponse(questionText, index, answer, skipped) {
    try {
      const response = await fetch('/gate/submit', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sessionId: getGateSessionId(),
          questionText,
          questionIndex: index,
          answer: answer || '',
          skipped: skipped || false
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('computer said no:', response.status, errorText);
        return false;
      }

      const data = await response.json();
      console.log('Response saved successfully:', data.request_id);
      return true;
    } catch (error) {
      console.error('Error saving gate response:', error);
      return false;
    }
  }

  // Initialize
  function init() {
    // Set up entry box click handler
    const entryBox = document.querySelector('.entry-box');
    if (entryBox) {
      entryBox.addEventListener('click', showQuestion);
    }

    // Set up submit handler
    if (submitButton) {
      submitButton.addEventListener('click', handleSubmit);
    }

    // Set up skip handler
    if (skipButton) {
      skipButton.addEventListener('click', handleSkip);
    }

    // Set up enter handler (to main site)
    if (enterButton) {
      enterButton.addEventListener('click', handleEnterClick);
    }

    // Set up continue from thermo handler
    if (continueFromThermo) {
      continueFromThermo.addEventListener('click', enterSite);
    }

    // Allow Enter key to submit (but not Shift+Enter for multiline)
    if (responseTextarea) {
      responseTextarea.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          handleSubmit();
        }
      });
    }
  }

  // Show the question box
  function showQuestion() {
    if (entryBoxes) {
      entryBoxes.classList.add('hidden');
    }

    const nextQuestion = getNextQuestion(questionCount);

    if (nextQuestion && questionBox && questionText) {
      currentQuestionIndex = nextQuestion.index;
      questionText.textContent = nextQuestion.question;
      questionBox.classList.remove('hidden');

      // Clear previous response
      if (responseTextarea) {
        responseTextarea.value = '';
      }

      // Focus on textarea after a brief delay for animation
      setTimeout(() => {
        if (responseTextarea) {
          responseTextarea.focus();
        }
      }, 300);
    }
  }

  // Handle submit (with or without answer)
  async function handleSubmit() {
    const response = responseTextarea ? responseTextarea.value.trim() : '';

    // Check if empty
    const isEmpty = !response;

    // Track consecutive empty answers
    if (isEmpty) {
      consecutiveEmptyCount++;

      // If 3 consecutive empties, offer questions preview (but save first)
      if (consecutiveEmptyCount >= 3) {
        const currentQuestion = questionText ? questionText.textContent : '';
        await saveResponse(currentQuestion, questionCount, '', false);
        showQuestionsPreviewOffer();
        return;
      }
    } else {
      // Reset counter when they provide an answer
      consecutiveEmptyCount = 0;

      // Validate answer quality for non-empty responses
      const classification = classifyAnswer(response);

      // If low quality and warning hasn't been shown yet, show warning
      if (!classification.ok && !lowSignalWarningShown) {
        lowSignalWarningShown = true;
        showLowSignalWarning();
        return;
      }
    }

    // Proceed with submission
    await proceedWithSubmit();
  }

  // Actually proceed with submission
  async function proceedWithSubmit() {
    const response = responseTextarea ? responseTextarea.value.trim() : '';
    const currentQuestion = questionText ? questionText.textContent : '';

    // Remove any existing warning or telegram offer
    const existingWarning = questionBox.querySelector('.low-signal-warning');
    if (existingWarning) {
      existingWarning.remove();
    }
    const existingPreview = questionBox.querySelector('.telegram-offer');
    if (existingPreview) {
      existingPreview.remove();
    }

    // Reset warning flag for next question
    lowSignalWarningShown = false;

    // Save response to backend (encrypted server-side)
    const saved = await saveResponse(currentQuestion, questionCount, response, false);

    if (!saved) {
      console.error('Failed to save response, but continuing anyway');
      // You could show an error message to the user here
    }

    questionCount++;

    // Hide question box
    if (questionBox) {
      questionBox.classList.add('hidden');
    }

    // Check if we should ask another question or show transition
    if (questionCount < gateQuestions.length) {
      // Show next question after brief delay
      setTimeout(() => {
        showQuestion();
      }, 400);
    } else {
      // Show transition
      showTransition();
    }
  }

  // Handle skip (explicitly leaving unanswered)
  async function handleSkip() {
    const currentQuestion = questionText ? questionText.textContent : '';

    consecutiveEmptyCount++;

    // If 3 consecutive skips, offer questions preview (but save the response first)
    if (consecutiveEmptyCount >= 3) {
      await saveResponse(currentQuestion, questionCount, '', true);
      showQuestionsPreviewOffer();
      return;
    }

    // Save skipped response to backend
    await saveResponse(currentQuestion, questionCount, '', true);

    questionCount++;

    // Hide question box
    if (questionBox) {
      questionBox.classList.add('hidden');
    }

    // Check if we should ask another question or show transition
    if (questionCount < gateQuestions.length) {
      // Show next question after brief delay
      setTimeout(() => {
        showQuestion();
      }, 400);
    } else {
      // Show transition
      showTransition();
    }
  }

  // Show transition to main site
  function showTransition() {
    if (transition) {
      transition.classList.remove('hidden');
    }
  }

  // Handle enter button click
  function handleEnterClick() {
    enterSite();
  }

  // Enter the main site
  function enterSite() {
    // Navigate to the continue page with two choices
    window.location.href = '/continue.html';
  }

  // Run initialization when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
