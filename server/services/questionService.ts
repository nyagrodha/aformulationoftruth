interface Question {
  id: number;
  text: string;
  position: 'fixed' | 'random';
}

const PROUST_QUESTIONS: Question[] = [
  { id: 1, text: "What is your idea of perfect happiness?", position: 'fixed' },
  { id: 2, text: "What is your greatest fear?", position: 'fixed' },
  { id: 3, text: "What is the trait you most deplore in yourself?", position: 'fixed' },
  { id: 4, text: "What is the trait you most deplore in others?", position: 'random' },
  { id: 5, text: "Which living person do you most admire?", position: 'random' },
  { id: 6, text: "What is your greatest extravagance?", position: 'random' },
  { id: 7, text: "What is your current state of mind?", position: 'random' },
  { id: 8, text: "What do you consider the most overrated virtue?", position: 'random' },
  { id: 9, text: "On what occasion do you lie?", position: 'random' },
  { id: 10, text: "What do you most dislike about your appearance?", position: 'random' },
  { id: 11, text: "Which living person do you most despise?", position: 'random' },
  { id: 12, text: "What is the quality you most like in a man?", position: 'random' },
  { id: 13, text: "What is the quality you most like in a woman?", position: 'random' },
  { id: 14, text: "Which words or phrases do you most overuse?", position: 'random' },
  { id: 15, text: "What or who is the greatest love of your life?", position: 'random' },
  { id: 16, text: "When and where were you happiest?", position: 'random' },
  { id: 17, text: "Which talent would you most like to have?", position: 'random' },
  { id: 18, text: "What is your most treasured possession?", position: 'fixed' },
  { id: 19, text: "What do you regard as the lowest depth of misery?", position: 'random' },
  { id: 20, text: "What is your favorite occupation?", position: 'random' },
  { id: 21, text: "What is your most marked characteristic?", position: 'random' },
  { id: 22, text: "What do you most value in your friends?", position: 'random' },
  { id: 23, text: "Who are your favorite writers?", position: 'random' },
  { id: 24, text: "Who is your hero of fiction?", position: 'random' },
  { id: 25, text: "Which historical figure do you most identify with?", position: 'random' },
  { id: 26, text: "Who are your heroes in real life?", position: 'random' },
  { id: 27, text: "What are your favorite names?", position: 'random' },
  { id: 28, text: "What is it that you most dislike?", position: 'random' },
  { id: 29, text: "What is your greatest regret?", position: 'random' },
  { id: 30, text: "How would you like to die?", position: 'random' },
  { id: 31, text: "What is your favorite journey?", position: 'random' },
  { id: 32, text: "What do you consider your greatest achievement?", position: 'random' },
  { id: 33, text: "What is your most treasured memory?", position: 'random' },
  { id: 34, text: "What is your motto?", position: 'fixed' },
  { id: 35, text: "If you could change one thing about yourself, what would it be?", position: 'random' }
];

class QuestionService {
  getQuestion(id: number): Question | undefined {
    return PROUST_QUESTIONS.find(q => q.id === id);
  }

  generateQuestionOrder(): number[] {
    const randomQuestions = PROUST_QUESTIONS.filter(q => q.position === 'random');
    
    // Shuffle all random questions
    const shuffledRandom = [...randomQuestions].sort(() => Math.random() - 0.5);
    
    // Create final order: first 3 fixed questions, then middle question, then penultimate question
    const questionOrder: number[] = [];
    
    // Positions 1-3: Same first three questions (1, 2, 3)
    questionOrder.push(1, 2, 3);
    
    // Positions 4-16: First batch of random questions
    shuffledRandom.slice(0, 13).forEach(q => questionOrder.push(q.id));
    
    // Position 17: Same middle question (18) 
    questionOrder.push(18);
    
    // Positions 18-33: Second batch of random questions
    shuffledRandom.slice(13).forEach(q => questionOrder.push(q.id));
    
    // Position 34: Same penultimate question (34)
    questionOrder.push(34);
    
    return questionOrder;
  }

  getQuestionDisplayOrder(questionId: number): number {
    // For sorting responses in display order
    const question = this.getQuestion(questionId);
    if (!question) return 999;
    
    if (question.position === 'fixed') {
      if (questionId === 1) return 1;
      if (questionId === 2) return 2;
      if (questionId === 3) return 3;
      if (questionId === 18) return 18;
      if (questionId === 34) return 34;
    }
    
    return questionId;
  }
}

export const questionService = new QuestionService();
