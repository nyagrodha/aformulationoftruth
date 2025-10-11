/**
 * Questionnaire Logic with Fisher-Yates Shuffle Support
 * Handles user authentication, question flow, and response storage
 * Uses shuffled question order from sessionStorage
 */

(function() {
  'use strict';

  // Proust Questionnaire Questions (35 questions)
  const QUESTIONS = [
    "What is your most treasured possession?",
    "What is your idea of perfect happiness?",
    "What is your greatest fear?",
    "What is the trait you most deplore in yourself?",
    "What is the trait you most deplore in others?",
    "Which living person do you most admire?",
    "What is your greatest extravagance?",
    "What is your current state of mind?",
    "What do you consider the most overrated virtue?",
    "On what occasion do you lie?",
    "What do you most dislike about your appearance?",
    "Which living person do you most despise?",
    "What is the quality you most like in a man?",
    "What is the quality you most like in a woman?",
    "Which words or phrases do you most overuse?",
    "What or who is the greatest love of your life?",
    "When and where were you happiest?",
    "Which talent would you most like to have?",
    "If you could change one thing about yourself, what would it be?",
    "What do you consider your greatest achievement?",
    "If you were to die and come back as a person or a thing, what would it be?",
    "Where would you most like to live?",
    "What is your most treasured memory?",
    "What is your greatest regret?",
    "How would you like to die?",
    "What is your motto?",
    "What is your favorite occupation?",
    "What is your most marked characteristic?",
    "What do you value most in your friends?",
    "Who are your favorite writers?",
    "Who is your hero of fiction?",
    "Which historical figure do you most identify with?",
    "Who are your heroes in real life?",
    "What is your favorite name?",
    "What is it that you most dislike?"
  ];

  // State
  let currentPosition = 0; // Current position in the shuffled order
  let userEmail = '';
  let answers = {}; // Stores answers by original question index
  let questionOrder = []; // Shuffled order of question indices

  // DOM Elements
  const authSection = document.getElementById('auth-section');
  const questionSection = document.getElementById('question-section');
  const completionSection = document.getElementById('completion-section');
  const authForm = document.getElementById('auth-form');
  const emailInput = document.getElementById('email');
  const authMessage = document.getElementById('auth-message');
  const questionNumber = document.getElementById('question-number');
  const questionText = document.getElementById('question-text');
  const answerForm = document.getElementById('answer-form');
  const answerTextarea = document.getElementById('answer-textarea');
  const prevBtn = document.getElementById('prev-btn');
  const progressFill = document.getElementById('progress-fill');
  const downloadBtn = document.getElementById('download-pdf');
  const startOverBtn = document.getElementById('start-over');

  // Get shuffled question order
  function getQuestionOrder() {
    const stored = sessionStorage.getItem('questionOrder');
    if (stored) {
      return JSON.parse(stored);
    }
    // Fallback: sequential order if shuffle hasn't run
    return Array.from({length: QUESTIONS.length}, (_, i) => i);
  }

  // Initialize
  function init() {
    questionOrder = getQuestionOrder();
    loadSavedSession();
    setupEventListeners();
  }

  // Load saved session from localStorage
  function loadSavedSession() {
    const saved = localStorage.getItem('a4ot-session');
    if (saved) {
      const session = JSON.parse(saved);
      userEmail = session.email;
      currentPosition = session.currentPosition || 0;
      answers = session.answers || {};

      // Resume questionnaire
      if (currentPosition < QUESTIONS.length) {
        showQuestionSection();
        displayQuestion();
      } else {
        showCompletionSection();
      }
    }
  }

  // Save session to localStorage
  function saveSession() {
    const session = {
      email: userEmail,
      currentPosition: currentPosition,
      answers: answers
    };
    localStorage.setItem('a4ot-session', JSON.stringify(session));
  }

  // Setup event listeners
  function setupEventListeners() {
    authForm.addEventListener('submit', handleAuth);
    answerForm.addEventListener('submit', handleAnswer);
    prevBtn.addEventListener('click', goToPreviousQuestion);
    downloadBtn.addEventListener('click', downloadResponses);
    startOverBtn.addEventListener('click', startOver);
  }

  // Handle authentication
  function handleAuth(e) {
    e.preventDefault();
    const email = emailInput.value.trim();

    if (!email) {
      showMessage('Please enter your email', 'error');
      return;
    }

    userEmail = email;
    currentPosition = 0;
    answers = {};
    questionOrder = getQuestionOrder(); // Refresh order
    saveSession();
    showQuestionSection();
    displayQuestion();
  }

  // Show message
  function showMessage(text, type) {
    authMessage.textContent = text;
    authMessage.className = `message ${type}`;
    authMessage.style.display = 'block';

    setTimeout(() => {
      authMessage.style.display = 'none';
    }, 3000);
  }

  // Show question section
  function showQuestionSection() {
    authSection.style.display = 'none';
    questionSection.style.display = 'block';
    completionSection.style.display = 'none';
  }

  // Show completion section
  function showCompletionSection() {
    authSection.style.display = 'none';
    questionSection.style.display = 'none';
    completionSection.style.display = 'block';
    updateProgressBar(100);
  }

  // Display current question using shuffled order
  function displayQuestion() {
    const questionIndex = questionOrder[currentPosition];

    questionNumber.textContent = `Question ${currentPosition + 1} of ${QUESTIONS.length}`;
    questionText.textContent = QUESTIONS[questionIndex];
    answerTextarea.value = answers[questionIndex] || '';
    answerTextarea.focus();

    // Toggle previous button
    prevBtn.style.display = currentPosition === 0 ? 'none' : 'inline-block';

    // Update progress
    updateProgressBar();
  }

  // Update progress bar
  function updateProgressBar(percent = null) {
    const progress = percent !== null ? percent : ((currentPosition / QUESTIONS.length) * 100);
    progressFill.style.width = `${progress}%`;
  }

  // Handle answer submission
  function handleAnswer(e) {
    e.preventDefault();

    // Save current answer using the original question index
    const questionIndex = questionOrder[currentPosition];
    answers[questionIndex] = answerTextarea.value.trim();

    // Move to next question
    if (currentPosition < QUESTIONS.length - 1) {
      currentPosition++;
      saveSession();
      displayQuestion();
    } else {
      // Questionnaire complete
      saveSession();
      saveToBackend();
      showCompletionSection();
    }
  }

  // Save responses to backend
  function saveToBackend() {
    fetch('/api/responses', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        email: userEmail,
        answers: answers,
        questionOrder: questionOrder // Include order for reference
      })
    })
    .then(response => response.json())
    .then(data => {
      console.log('Responses saved to database:', data);
    })
    .catch(error => {
      console.error('Error saving to backend:', error);
    });
  }

  // Go to previous question
  function goToPreviousQuestion() {
    if (currentPosition > 0) {
      // Save current answer before going back
      const questionIndex = questionOrder[currentPosition];
      answers[questionIndex] = answerTextarea.value.trim();
      currentPosition--;
      saveSession();
      displayQuestion();
    }
  }

  // Download responses as text file
  function downloadResponses() {
    let content = `A Formulation of Truth - Questionnaire Responses\n`;
    content += `Email: ${userEmail}\n`;
    content += `Date: ${new Date().toLocaleDateString()}\n`;
    content += `\n${'='.repeat(60)}\n\n`;

    // Output in the order questions were presented
    questionOrder.forEach((questionIndex, position) => {
      content += `Q${position + 1}: ${QUESTIONS[questionIndex]}\n`;
      content += `A: ${answers[questionIndex] || '(No answer provided)'}\n\n`;
    });

    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `questionnaire-${userEmail}-${Date.now()}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // Start over
  function startOver() {
    if (confirm('Are you sure you want to start over? All your responses will be lost.')) {
      localStorage.removeItem('a4ot-session');
      sessionStorage.removeItem('questionOrder');
      location.reload();
    }
  }

  // Initialize on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
