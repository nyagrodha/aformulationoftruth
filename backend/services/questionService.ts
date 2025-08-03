
export const questions = [
  { id: 1, text: "What is your idea of perfect happiness?", position: "start" },
  { id: 2, text: "What is your greatest fear?", position: "middle" },
  { id: 3, text: "What is the trait you most deplore in yourself?", position: "middle" },
  { id: 4, text: "What is the trait you most deplore in others?", position: "middle" },
  { id: 5, text: "Which living person do you most admire?", position: "middle" },
  { id: 6, text: "What is your greatest extravagance?", position: "middle" },
  { id: 7, text: "What is your current state of mind?", position: "middle" },
  { id: 8, text: "What do you consider the most overrated virtue?", position: "middle" },
  { id: 9, text: "On what occasion do you lie?", position: "middle" },
  { id: 10, text: "What do you most dislike about your appearance?", position: "middle" },
  { id: 11, text: "Which living person do you most despise?", position: "middle" },
  { id: 12, text: "What is the quality you most like in a man?", position: "middle" },
  { id: 13, text: "What is the quality you most like in a woman?", position: "middle" },
  { id: 14, text: "Which words or phrases do you most overuse?", position: "middle" },
  { id: 15, text: "What or who is the greatest love of your life?", position: "middle" },
  { id: 16, text: "When and where were you happiest?", position: "middle" },
  { id: 17, text: "Which talent would you most like to have?", position: "middle" },
  { id: 18, text: "If you could change one thing about yourself, what would it be?", position: "middle" },
  { id: 19, text: "What do you consider your greatest achievement?", position: "middle" },
  { id: 20, text: "If you were to die and come back as a person or a thing, what would it be?", position: "middle" },
  { id: 21, text: "Where would you most like to live?", position: "middle" },
  { id: 22, text: "What is your most treasured possession?", position: "middle" },
  { id: 23, text: "What do you regard as the lowest depth of misery?", position: "middle" },
  { id: 24, text: "What is your favorite occupation?", position: "middle" },
  { id: 25, text: "What is your most marked characteristic?", position: "middle" },
  { id: 26, text: "What do you most value in your friends?", position: "middle" },
  { id: 27, text: "Who are your favorite writers?", position: "middle" },
  { id: 28, text: "Who is your hero of fiction?", position: "middle" },
  { id: 29, text: "Which historical figure do you most identify with?", position: "middle" },
  { id: 30, text: "Who are your heroes in real life?", position: "middle" },
  { id: 31, text: "What are your favorite names?", position: "middle" },
  { id: 32, text: "What is it that you most dislike?", position: "middle" },
  { id: 33, text: "What is your greatest regret?", position: "middle" },
  { id: 34, text: "How would you like to die?", position: "middle" },
  { id: 35, text: "What is your motto?", position: "end" }
];

class QuestionService {
  generateQuestionOrder(): number[] {
    const startQuestions = questions.filter(q => q.position === "start").map(q => q.id);
    const middleQuestions = questions.filter(q => q.position === "middle").map(q => q.id);
    const endQuestions = questions.filter(q => q.position === "end").map(q => q.id);
    
    // Shuffle middle questions
    for (let i = middleQuestions.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [middleQuestions[i], middleQuestions[j]] = [middleQuestions[j], middleQuestions[i]];
    }

    return [...startQuestions, ...middleQuestions, ...endQuestions];
  }

  getQuestion(id: number) {
    return questions.find(q => q.id === id);
  }

  getCurrentQuestion(session: any) {
    const questionOrder = session.questionOrder as number[];
    const currentQuestionId = questionOrder[session.currentQuestionIndex];
    return this.getQuestion(currentQuestionId);
  }

  getQuestionDisplayOrder(questionId: number): number {
    return questions.findIndex(q => q.id === questionId) + 1;
  }

  validateAnswer(answer: string): { isValid: boolean; errors?: string[] } {
    if (!answer || answer.trim().length === 0) {
      return { isValid: false, errors: ["Answer cannot be empty"] };
    }
    
    if (answer.length < 2) {
      return { isValid: false, errors: ["Answer must be at least 2 characters long"] };
    }

    return { isValid: true };
  }
}

export const questionService = new QuestionService();
