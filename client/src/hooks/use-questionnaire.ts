import { useState, useCallback } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from './use-toast';

interface Question {
  id: number;
  text: string;
  position: string;
}

interface QuestionnaireState {
  sessionId: string | null;
  currentQuestion: Question | null;
  currentAnswer: string;
  questionNumber: number;
  totalQuestions: number;
  progress: number;
  hasUnsavedChanges: boolean;
}

export function useQuestionnaire(sessionId: string | null) {
  const { toast } = useToast();
  const [state, setState] = useState<QuestionnaireState>({
    sessionId,
    currentQuestion: null,
    currentAnswer: '',
    questionNumber: 1,
    totalQuestions: 35,
    progress: 0,
    hasUnsavedChanges: false,
  });

  const updateAnswer = useCallback((answer: string) => {
    setState(prev => ({
      ...prev,
      currentAnswer: answer,
      hasUnsavedChanges: answer !== (prev.currentAnswer || ''),
    }));
  }, []);

  const saveResponseMutation = useMutation({
    mutationFn: async ({ questionId, answer }: { questionId: number; answer: string }) => {
      if (!sessionId) throw new Error('No session ID');
      const response = await apiRequest('POST', `/api/questionnaire/${sessionId}/response`, {
        questionId,
        answer
      });
      return response.json();
    },
    onSuccess: () => {
      setState(prev => ({ ...prev, hasUnsavedChanges: false }));
      toast({
        title: "Response saved",
        description: "Your answer has been saved automatically.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Validation Error",
        description: error.message || "Please provide a thoughtful response",
        variant: "destructive",
      });
    },
  });

  return {
    state,
    updateAnswer,
    saveResponse: saveResponseMutation.mutate,
    isSaving: saveResponseMutation.isPending,
  };
}
