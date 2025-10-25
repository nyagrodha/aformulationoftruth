// Questions for the Proust Questionnaire
const questions = [
  { id: 1, text: "What is your idea of perfect happiness?" },
  { id: 2, text: "What is your greatest fear?" },
  { id: 3, text: "What is the trait you most deplore in yourself?" },
  { id: 4, text: "What is the trait you most deplore in others?" },
  { id: 5, text: "Which living person do you most admire?" },
  { id: 6, text: "What is your greatest extravagance?" },
  { id: 7, text: "What is your current state of mind?" },
  { id: 8, text: "What do you consider the most overrated virtue?" },
  { id: 9, text: "On what occasion do you lie?" },
  { id: 10, text: "What do you most dislike about your appearance?" },
  { id: 11, text: "Which living person do you most despise?" },
  { id: 12, text: "What is the quality you most like in a man?" },
  { id: 13, text: "What is the quality you most like in a woman?" },
  { id: 14, text: "Which words or phrases do you most overuse?" },
  { id: 15, text: "What or who is the greatest love of your life?" },
  { id: 16, text: "When and where were you happiest?" },
  { id: 17, text: "Which talent would you most like to have?" },
  { id: 18, text: "If you could change one thing about yourself, what would it be?" },
  { id: 19, text: "What do you consider your greatest achievement?" },
  { id: 20, text: "If you were to die and come back as a person or a thing, what would it be?" },
  { id: 21, text: "Where would you most like to live?" },
  { id: 22, text: "What is your most treasured possession?" },
  { id: 23, text: "What do you regard as the lowest depth of misery?" },
  { id: 24, text: "What is your favorite occupation?" },
  { id: 25, text: "What is your most marked characteristic?" },
  { id: 26, text: "What do you most value in your friends?" },
  { id: 27, text: "Who are your favorite writers?" },
  { id: 28, text: "Who is your hero of fiction?" },
  { id: 29, text: "Which historical figure do you most identify with?" },
  { id: 30, text: "Who are your heroes in real life?" },
  { id: 31, text: "What are your favorite names?" },
  { id: 32, text: "What is it that you most dislike?" },
  { id: 33, text: "What is your greatest regret?" },
  { id: 34, text: "How would you like to die?" },
  { id: 35, text: "What is your motto?" }
];

export const questionService = {
  getQuestionById: (id: number) => {
    return questions.find(q => q.id === id);
  },
  
  getAllQuestions: () => {
    return questions;
  },
  
  getQuestionCount: () => {
    return questions.length;
  }
};