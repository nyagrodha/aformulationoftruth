import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import axios from 'axios';
import { Sun, Moon, Zap } from 'lucide-react';

import QuestionCard from '../components/QuestionCard';
import LoadingOverlay from '../components/LoadingOverlay';
import { useTheme } from '../context/ThemeContext';

// --- Types ---
interface Question {
  id: number;
  text: string;
  position: string;
}

interface Session {
  id: string;
  userId: string;
  questionOrder: number[];
  currentQuestionIndex: number;
  completed: boolean;
}

interface Quote {
  text: string;
  author: string;
}

// --- API Calls ---
const fetchSession = async (): Promise<Session> => {
  const { data } = await axios.get('/api/questionnaire/session');
  return data;
};

const fetchQuotes = async (): Promise<Quote[]> => {
  const { data } = await axios.get('/api/quotes');
  return data;
};

const saveAnswer = async ({ sessionId, questionId, answer }: { sessionId: string, questionId: number, answer: string }) => {
  const { data } = await axios.post(`/api/questionnaire/${sessionId}/answer`, { questionId, answer });
  return data;
};

// --- Custom Hook for Debouncing ---
const useDebounce = (value: string, delay: number) => {  
    const [debouncedValue, setDebouncedValue] = useState(value);
    useEffect(() => {
        const handler = setTimeout(() => setDebouncedValue(value), delay);
        return () => clearTimeout(handler);
    }, [value, delay]);
    return debouncedValue;
};

// --- UI Sub-components ---
const ThemeSwitcher = () => {
  const { theme, setTheme } = useTheme();
  return (
    <div className="absolute top-4 right-4 bg-white/20 dark:bg-black/20 backdrop-blur-sm p-1 rounded-full flex items-center gap-1 z-20">
      <button onClick={() => setTheme('light')} className={`p-2 rounded-full ${theme === 'light' ? 'bg-blue-500 text-white' : 'text-gray-500'}`}><Sun size={18} /></button>
      <button onClick={() => setTheme('dark')} className={`p-2 rounded-full ${theme === 'dark' ? 'bg-blue-500 text-white' : 'text-gray-500'}`}><Moon size={18} /></button>
      <button onClick={() => setTheme('neon')} className={`p-2 rounded-full ${theme === 'neon' ? 'bg-purple-500 text-white' : 'text-gray-500'}`}><Zap size={18} /></button>
    </div>
  );
};

const ContemplationQuote = ({ quote, theme }: { quote: Quote | null, theme: string }) => {
  if (!quote) return null;
  
  const quoteStyle = {
    light: 'border-slate-300 text-slate-600',
    dark: 'border-slate-700 text-slate-400',
    neon: 'border-cyan-400 text-cyan-200 neon-text-glow'
  }[theme as 'light' | 'dark' | 'neon'];

  return (
    <blockquote className={`mt-8 p-6 text-center border-l-4 border-opacity-50 transition-all duration-500 animate-fade-in ${quoteStyle}`}>
      <p className="text-lg italic leading-relaxed">"{quote.text}"</p>
      <cite className="block mt-4 text-sm not-italic opacity-80">— {quote.author}</cite>
    </blockquote>
  );
};

// --- The Main Component ---
export default function QuestionnairePage() {
  const params = useParams();
  const navigate = useNavigate();
  const { theme } = useTheme();
  
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [currentAnswer, setCurrentAnswer] = useState('');
  const [activeQuote, setActiveQuote] = useState<Quote | null>(null);
  const quoteIndexRef = useRef(0);

  const { data: session, isLoading: isSessionLoading, error: sessionError } = useQuery<Session, Error>({
    queryKey: ['questionnaireSession', params.sessionId],
    queryFn: fetchSession,
  });

  const { data: contemplationQuotes, isSuccess: quotesLoaded } = useQuery<Quote[], Error>({
    queryKey: ['quotes'],
    queryFn: fetchQuotes,
    staleTime: Infinity,
  });

  const saveAnswerMutation = useMutation({
    mutationFn: saveAnswer,
    onSuccess: () => console.log('Answer auto-saved successfully.'),
    onError: (error) => console.error('Failed to auto-save answer:', error)
  });

  const debouncedAnswer = useDebounce(currentAnswer, 10500);

  useEffect(() => {
    if (debouncedAnswer.trim() && session?.questionOrder) {
      const questionId = session.questionOrder[currentQuestionIndex];
      if (debouncedAnswer !== (answers[questionId] || '')) {
         saveAnswerMutation.mutate({ sessionId: session.id, questionId, answer: debouncedAnswer });
      }
    }
  }, [debouncedAnswer, session, currentQuestionIndex, answers, saveAnswerMutation]);

  useEffect(() => {
    if (session) setCurrentQuestionIndex(session.currentQuestionIndex || 0);
  }, [session]);

  useEffect(() => {
    if (session?.questionOrder && quotesLoaded && contemplationQuotes) {
      const currentQuestionId = session.questionOrder[currentQuestionIndex];
      setCurrentAnswer(answers[currentQuestionId] || '');

      const questionNumber = currentQuestionIndex + 1;
      if (questionNumber % 5 === 0 || questionNumber % 6 === 0 || questionNumber % 7 === 0) {
        setActiveQuote(contemplationQuotes[quoteIndexRef.current]);
        quoteIndexRef.current = (quoteIndexRef.current + 1) % contemplationQuotes.length;
      } else {
        setActiveQuote(null);
      }
    }
  }, [currentQuestionIndex, session, answers, quotesLoaded, contemplationQuotes]);

  const handleAnswerChange = (value: string) => setCurrentAnswer(value);

  const handleSaveAndNavigate = (direction: 'next' | 'prev') => {
    const questionId = session!.questionOrder[currentQuestionIndex];
    if (currentAnswer.trim()) {
        saveAnswerMutation.mutate({ sessionId: session!.id, questionId, answer: currentAnswer });
        setAnswers(prev => ({...prev, [questionId]: currentAnswer}));
    }

    if (direction === 'next') {
      if (currentQuestionIndex < session!.questionOrder.length - 1) {
        setCurrentQuestionIndex(currentQuestionIndex + 1);
      } else {
        navigate(`/complete/${session!.id}`);
      }
    } else if (direction === 'prev' && currentQuestionIndex > 0) {
      setCurrentQuestionIndex(currentQuestionIndex - 1);
    }
  };

  if (isSessionLoading) return <LoadingOverlay isVisible={true} title="Loading Your Session..." />;
  if (sessionError) return <div className="text-center text-red-500 p-8">Error: {sessionError.message}</div>;
  if (!session) return <div className="text-center p-8">No session found.</div>;
  
  const currentQuestionId = session.questionOrder[currentQuestionIndex];
  const currentQuestion: Question = { id: currentQuestionId, text: `Question text for ID ${currentQuestionId} would appear here.`, position: 'middle' };

  const containerClass = {
    light: 'bg-slate-50',
    dark: 'bg-gray-900',
    neon: 'neon-container'
  }[theme as 'light' | 'dark' | 'neon'];

  return (
    <div className={`min-h-screen relative transition-colors duration-500 ${containerClass}`}>
      {theme === 'neon' && <div className="absolute inset-0 neon-background -z-10"></div>}
      <ThemeSwitcher />
      <main className="max-w-4xl mx-auto p-4 sm:p-8 pt-20">
        <QuestionCard
          question={currentQuestion}
          questionNumber={currentQuestionIndex + 1}
          answer={currentAnswer}
          onAnswerChange={handleAnswerChange}
          onSave={() => saveAnswerMutation.mutate({ sessionId: session.id, questionId: currentQuestionId, answer: currentAnswer })}
          onNext={() => handleSaveAndNavigate('next')}
          onPrevious={() => handleSaveAndNavigate('prev')}
          canGoBack={currentQuestionIndex > 0}
          isSaving={saveAnswerMutation.isPending}
        />
        <ContemplationQuote quote={activeQuote} theme={theme} />
      </main>
    </div>
  );
}

