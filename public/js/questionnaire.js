/**
 * Questionnaire Logic
 * Handles user authentication, question flow, and response storage
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
  let currentQuestion = 0;
  let userEmail = '';
  let answers = {};

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

  // Initialize
  function init() {
    loadSavedSession();
    setupEventListeners();
  }

  // Load saved session from localStorage
  function loadSavedSession() {
    const saved = localStorage.getItem('a4ot-session');
    if (saved) {
      const session = JSON.parse(saved);
      userEmail = session.email;
      currentQuestion = session.currentQuestion || 0;
      answers = session.answers || {};

      // Resume questionnaire
      if (currentQuestion < QUESTIONS.length) {
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
      currentQuestion: currentQuestion,
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
    currentQuestion = 0;
    answers = {};
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

  // Display current question
  function displayQuestion() {
    questionNumber.textContent = `Question ${currentQuestion + 1} of ${QUESTIONS.length}`;
    questionText.textContent = QUESTIONS[currentQuestion];
    answerTextarea.value = answers[currentQuestion] || '';
    answerTextarea.focus();

    // Toggle previous button
    prevBtn.style.display = currentQuestion === 0 ? 'none' : 'inline-block';

    // Update progress
    updateProgressBar();
  }

  // Update progress bar
  function updateProgressBar(percent = null) {
    const progress = percent !== null ? percent : ((currentQuestion / QUESTIONS.length) * 100);
    progressFill.style.width = `${progress}%`;
  }

  // Handle answer submission
  function handleAnswer(e) {
    e.preventDefault();

    // Save current answer
    answers[currentQuestion] = answerTextarea.value.trim();

    // Move to next question
    if (currentQuestion < QUESTIONS.length - 1) {
      currentQuestion++;
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
        answers: answers
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
    if (currentQuestion > 0) {
      // Save current answer before going back
      answers[currentQuestion] = answerTextarea.value.trim();
      currentQuestion--;
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

    QUESTIONS.forEach((question, index) => {
      content += `Q${index + 1}: ${question}\n`;
      content += `A: ${answers[index] || '(No answer provided)'}\n\n`;
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
