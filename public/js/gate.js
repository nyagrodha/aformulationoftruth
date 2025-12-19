// Gate page logic
// This implements the "refusal" approach - one entry point that asks something
// before revealing content

(function() {
  'use strict';

  // Questions to ask at the gate
  const gateQuestions = [
    "What pattern have you been chasing that might not exist?",
    "Where in your personal life do you feel the second law of thermodynamics most? Where do you feel it in your professional life?",
    "Which lie do you tell most convincingly?",
    "How old were you when you first suspected that coincidence might not be coincidental? (describe the moment.)"
  ];

  // Configuration
  const MIN_QUESTIONS = 3;
  const MAX_QUESTIONS = 4;

  // Select a random question that hasn't been asked
  function getRandomQuestion(askedIndices) {
    const availableIndices = [];
    for (let i = 0; i < gateQuestions.length; i++) {
      if (!askedIndices.includes(i)) {
        availableIndices.push(i);
      }
    }

    if (availableIndices.length === 0) return null;

    const randomIndex = availableIndices[Math.floor(Math.random() * availableIndices.length)];
    return { index: randomIndex, question: gateQuestions[randomIndex] };
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
  let askedQuestions = [];
  let currentQuestionIndex = null;
  let thermoAnswerTime = null;
  let isThermoDynQuestion = false;
  let gateSessionId = null;

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

  // Save response to backend
  async function saveResponse(questionText, index, answer, skipped) {
    try {
      const response = await fetch('/api/gate/response', {
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
        console.error('Failed to save gate response');
      }
    } catch (error) {
      console.error('Error saving gate response:', error);
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

    let questionToShow;

    // Question 3 is always the thermodynamics question
    if (questionCount === 2) {
      questionToShow = thermoQuestion;
      isThermoDynQuestion = true;
    } else {
      const nextQuestion = getRandomQuestion(askedQuestions);
      if (nextQuestion) {
        currentQuestionIndex = nextQuestion.index;
        askedQuestions.push(nextQuestion.index);
        questionToShow = nextQuestion.question;
      }
      isThermoDynQuestion = false;
    }

    if (questionToShow && questionBox && questionText) {
      questionText.textContent = questionToShow;
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
  function handleSubmit() {
    const response = responseTextarea ? responseTextarea.value.trim() : '';
    const currentQuestion = questionText ? questionText.textContent : '';

    // Save response to backend (encrypted server-side)
    saveResponse(currentQuestion, questionCount, response, false);

    // Record time if this was the thermodynamics question
    if (isThermoDynQuestion) {
      thermoAnswerTime = Date.now();
    }

    questionCount++;

    // Hide question box
    if (questionBox) {
      questionBox.classList.add('hidden');
    }

    // Check if we should ask another question or show transition
    if (questionCount < MIN_QUESTIONS || (questionCount < MAX_QUESTIONS && askedQuestions.length < gateQuestions.length)) {
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
  function handleSkip() {
    const currentQuestion = questionText ? questionText.textContent : '';

    // Save skipped response to backend
    saveResponse(currentQuestion, questionCount, '', true);

    // Record time if this was the thermodynamics question
    if (isThermoDynQuestion) {
      thermoAnswerTime = Date.now();
    }

    questionCount++;

    // Hide question box
    if (questionBox) {
      questionBox.classList.add('hidden');
    }

    // Check if we should ask another question or show transition
    if (questionCount < MIN_QUESTIONS || (questionCount < MAX_QUESTIONS && askedQuestions.length < gateQuestions.length)) {
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

  // Handle enter button click - check if within thermo window
  function handleEnterClick() {
    // Check if they answered the thermo question and are within the time window
    if (thermoAnswerTime) {
      const timeSinceAnswer = Date.now() - thermoAnswerTime;
      if (timeSinceAnswer <= THERMO_WINDOW) {
        // Show thermodynamics educational content
        if (transition) {
          transition.classList.add('hidden');
        }
        if (thermoContent) {
          thermoContent.classList.remove('hidden');
        }
        return;
      }
    }

    // Otherwise, proceed to main site
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
