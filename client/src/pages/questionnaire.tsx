import { useEffect, useState } from "react";
import { useLocation, useParams } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import ProgressBar from "@/components/ProgressBar";
import QuestionCard from "@/components/QuestionCard";
import LoadingOverlay from "@/components/LoadingOverlay";
import { Skeleton } from "@/components/ui/skeleton";

interface QuestionData {
  question: {
    id: number;
    text: string;
    position: string;
  };
  questionNumber: number;
  totalQuestions: number;
  existingAnswer: string;
  declined: boolean;
  reviewingDeclined: boolean;
  progress: number;
  completed?: boolean;
  reviewDeclined?: boolean;
  declinedCount?: number;
}

export default function QuestionnairePage() {
  const { sessionId } = useParams();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [currentAnswer, setCurrentAnswer] = useState("");
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  const { data: questionData, isLoading, refetch } = useQuery<QuestionData>({
    queryKey: ['/api/questionnaire', sessionId, 'current'],
    enabled: !!sessionId,
  });

  useEffect(() => {
    if (questionData?.completed) {
      setLocation(`/complete/${sessionId}`);
      return;
    }

    if (questionData?.reviewDeclined) {
      setLocation(`/review-declined/${sessionId}`);
      return;
    }

    if (questionData?.existingAnswer) {
      setCurrentAnswer(questionData.existingAnswer);
      setHasUnsavedChanges(false);
    } else {
      setCurrentAnswer("");
      setHasUnsavedChanges(false);
    }
  }, [questionData, sessionId, setLocation]);

  const saveResponseMutation = useMutation({
    mutationFn: async ({ questionId, answer, declined }: { questionId: number; answer?: string; declined?: boolean }) => {
      const response = await apiRequest('POST', `/api/questionnaire/${sessionId}/response`, {
        questionId,
        answer,
        declined: declined || false
      });
      return response.json();
    },
    onSuccess: (data, variables) => {
      setHasUnsavedChanges(false);
      toast({
        title: variables.declined ? "Question declined" : "Response saved",
        description: variables.declined ? "You have declined to answer this question." : "Your answer has been saved automatically.",
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

  const navigateMutation = useMutation({
    mutationFn: async (direction: 'next' | 'previous') => {
      const response = await apiRequest('POST', `/api/questionnaire/${sessionId}/navigate`, {
        direction
      });
      return response.json();
    },
    onSuccess: (data) => {
      if (data.completed) {
        setLocation(`/complete/${sessionId}`);
      } else {
        refetch();
      }
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to navigate",
        variant: "destructive",
      });
    },
  });

  const handleAnswerChange = (value: string) => {
    setCurrentAnswer(value);
    setHasUnsavedChanges(value !== (questionData?.existingAnswer || ""));
  };

  const handleSave = () => {
    if (!questionData?.question.id || (!currentAnswer.trim() && !questionData.declined)) return;
    
    saveResponseMutation.mutate({
      questionId: questionData.question.id,
      answer: currentAnswer.trim(),
      declined: false
    });
  };

  const handleDecline = () => {
    if (!questionData?.question.id) return;
    
    saveResponseMutation.mutate({
      questionId: questionData.question.id,
      declined: true
    }, {
      onSuccess: () => {
        navigateMutation.mutate('next');
      }
    });
  };

  const handleNext = () => {
    if (hasUnsavedChanges && currentAnswer.trim()) {
      saveResponseMutation.mutate({
        questionId: questionData!.question.id,
        answer: currentAnswer.trim(),
        declined: false
      }, {
        onSuccess: () => {
          navigateMutation.mutate('next');
        }
      });
    } else if (!hasUnsavedChanges || questionData?.declined) {
      navigateMutation.mutate('next');
    }
  };

  const handlePrevious = () => {
    if (hasUnsavedChanges && currentAnswer.trim()) {
      saveResponseMutation.mutate({
        questionId: questionData!.question.id,
        answer: currentAnswer.trim(),
        declined: false
      }, {
        onSuccess: () => {
          navigateMutation.mutate('previous');
        }
      });
    } else {
      navigateMutation.mutate('previous');
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <div className="bg-surface shadow-sm sticky top-0 z-10">
          <div className="max-w-4xl mx-auto px-4 py-4">
            <div className="flex items-center justify-between mb-3">
              <Skeleton className="h-6 w-48" />
              <Skeleton className="h-4 w-32" />
            </div>
            <Skeleton className="w-full h-2 rounded-full" />
          </div>
        </div>
        <div className="max-w-4xl mx-auto px-4 py-8">
          <div className="bg-surface rounded-lg shadow-lg p-8">
            <Skeleton className="h-8 w-32 mb-6" />
            <Skeleton className="h-8 w-full mb-8" />
            <Skeleton className="h-32 w-full" />
          </div>
        </div>
      </div>
    );
  }

  if (!questionData) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-xl font-semibold text-secondary mb-2">Session not found</h2>
          <p className="text-muted-foreground">Please start a new questionnaire.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <ProgressBar
        current={questionData.questionNumber}
        total={questionData.totalQuestions}
        progress={questionData.progress}
      />

      <div className="max-w-4xl mx-auto px-4 py-8">
        <QuestionCard
          question={questionData.question}
          questionNumber={questionData.questionNumber}
          answer={currentAnswer}
          declined={questionData.declined}
          reviewingDeclined={questionData.reviewingDeclined}
          onAnswerChange={handleAnswerChange}
          onSave={handleSave}
          onDecline={handleDecline}
          onNext={handleNext}
          onPrevious={handlePrevious}
          canGoBack={questionData.questionNumber > 1}
          hasUnsavedChanges={hasUnsavedChanges}
          isSaving={saveResponseMutation.isPending}
          isNavigating={navigateMutation.isPending}
        />

        {/* Tips Section */}
        <div className="mt-6 bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
          <h3 className="font-medium text-blue-900 dark:text-blue-100 mb-2 flex items-center">
            <svg className="w-4 h-4 mr-2" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7.5 3.5a.5.5 0 01-1 0V9a.5.5 0 011 0v4.5zm0-8a.75.75 0 100-1.5.75.75 0 000 1.5z" clipRule="evenodd" />
            </svg>
            Reflection Tips
          </h3>
          <ul className="text-sm text-blue-800 dark:text-blue-200 space-y-1">
            <li>• Take your time - there are no wrong answers</li>
            <li>• Be honest and authentic in your responses</li>
            <li>• Consider what these questions reveal about your values</li>
            <li>• Your progress is saved automatically as you type</li>
          </ul>
        </div>
      </div>

      <LoadingOverlay 
        isVisible={navigateMutation.isPending}
        title="Loading next question..."
        message="Please wait while we prepare your next question"
      />
    </div>
  );
}
