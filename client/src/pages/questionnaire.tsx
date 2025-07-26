import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { isUnauthorizedError } from "@/lib/authUtils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { LogOut, Save, ArrowRight, Clock } from "lucide-react";

interface Question {
  id: number;
  text: string;
  position: string;
}

interface QuestionData {
  question: Question;
  progress: {
    current: number;
    total: number;
  };
  responses: Array<{
    questionId: number;
    answer: string;
  }>;
}

export default function QuestionnairePage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const [currentAnswer, setCurrentAnswer] = useState("");
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  // Redirect to auth if not authenticated
  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      toast({
        title: "Unauthorized",
        description: "You are logged out. Logging in again...",
        variant: "destructive",
      });
      setTimeout(() => {
        window.location.href = "/api/login";
      }, 500);
      return;
    }
  }, [isAuthenticated, authLoading, toast]);

  // Get or create session
  const { data: session, isLoading: sessionLoading } = useQuery({
    queryKey: ["/api/questionnaire/session"],
    enabled: !!isAuthenticated,
    retry: (failureCount, error) => {
      if (isUnauthorizedError(error as Error)) {
        return false;
      }
      return failureCount < 3;
    },
  });

  // Get current question data
  const { data: questionData, isLoading: questionLoading, refetch } = useQuery<QuestionData>({
    queryKey: ['/api/questionnaire', session?.id, 'current'],
    enabled: !!session?.id,
    retry: (failureCount, error) => {
      if (isUnauthorizedError(error as Error)) {
        return false;
      }
      return failureCount < 3;
    },
  });

  // Update current answer when question data loads
  useEffect(() => {
    if (questionData?.question) {
      const existingResponse = questionData.responses.find(
        r => r.questionId === questionData.question.id
      );
      
      if (existingResponse) {
        setCurrentAnswer(existingResponse.answer);
        setHasUnsavedChanges(false);
      } else {
        setCurrentAnswer("");
        setHasUnsavedChanges(false);
      }
    }
  }, [questionData]);

  // Handle answer changes
  const handleAnswerChange = (value: string) => {
    setCurrentAnswer(value);
    setHasUnsavedChanges(true);
  };

  // Submit answer mutation
  const submitAnswerMutation = useMutation({
    mutationFn: async ({ questionId, answer }: { questionId: number; answer: string }) => {
      const response = await apiRequest('POST', `/api/questionnaire/${session?.id}/answer`, {
        questionId,
        answer
      });
      return response.json();
    },
    onSuccess: () => {
      setHasUnsavedChanges(false);
      queryClient.invalidateQueries({ queryKey: ['/api/questionnaire', session?.id, 'current'] });
      toast({
        title: "Answer saved",
        description: "Your response has been saved and you've moved to the next question.",
      });
    },
    onError: (error) => {
      if (isUnauthorizedError(error)) {
        toast({
          title: "Unauthorized",
          description: "You are logged out. Logging in again...",
          variant: "destructive",
        });
        setTimeout(() => {
          window.location.href = "/api/login";
        }, 500);
        return;
      }
      
      toast({
        title: "Error",
        description: error.message || "Failed to save answer. Please try again.",
        variant: "destructive",
      });
    },
  });

  // Auto-save mutation (triggered on blur or periodically)
  const autoSaveMutation = useMutation({
    mutationFn: async ({ questionId, answer }: { questionId: number; answer: string }) => {
      const response = await apiRequest('POST', `/api/questionnaire/${session?.id}/answer`, {
        questionId,
        answer
      });
      return response.json();
    },
    onSuccess: () => {
      setHasUnsavedChanges(false);
      queryClient.invalidateQueries({ queryKey: ['/api/questionnaire', session?.id, 'responses'] });
    },
    onError: (error) => {
      if (!isUnauthorizedError(error)) {
        console.error("Auto-save failed:", error);
      }
    },
  });

  // Auto-save on blur if there are changes
  const handleBlur = () => {
    if (hasUnsavedChanges && currentAnswer.trim() && questionData?.question) {
      autoSaveMutation.mutate({
        questionId: questionData.question.id,
        answer: currentAnswer.trim()
      });
    }
  };

  // Submit answer and move to next question
  const handleSubmit = () => {
    if (!currentAnswer.trim()) {
      toast({
        title: "Answer required",
        description: "Please provide an answer before continuing.",
        variant: "destructive",
      });
      return;
    }

    if (!questionData?.question) return;

    submitAnswerMutation.mutate({
      questionId: questionData.question.id,
      answer: currentAnswer.trim()
    });
  };

  // Handle logout
  const handleLogout = () => {
    window.location.href = "/api/logout";
  };

  // Loading states
  if (authLoading || sessionLoading || questionLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 dark:from-slate-900 dark:to-blue-950 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-slate-600 dark:text-slate-400">Loading your questionnaire...</p>
        </div>
      </div>
    );
  }

  // Check if questionnaire is completed
  if (session?.completed) {
    setLocation(`/complete/${session.id}`);
    return null;
  }

  if (!questionData?.question) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 dark:from-slate-900 dark:to-blue-950 flex items-center justify-center">
        <Card className="w-full max-w-md">
          <CardContent className="text-center p-8">
            <p className="text-slate-600 dark:text-slate-400 mb-4">
              Unable to load questionnaire data.
            </p>
            <Button onClick={() => refetch()}>Try Again</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const progress = (questionData.progress.current / questionData.progress.total) * 100;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 dark:from-slate-900 dark:to-blue-950">
      {/* Header */}
      <div className="sticky top-0 bg-white/80 dark:bg-slate-900/80 backdrop-blur-sm border-b border-slate-200 dark:border-slate-700 z-10">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold text-slate-800 dark:text-slate-100">
              The Proust Questionnaire
            </h1>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Question {questionData.progress.current} of {questionData.progress.total}
            </p>
          </div>
          <Button 
            variant="outline" 
            size="sm" 
            onClick={handleLogout}
            className="text-slate-600 dark:text-slate-400"
          >
            <LogOut className="w-4 h-4 mr-2" />
            Logout
          </Button>
        </div>
        
        {/* Progress Bar */}
        <div className="px-4 pb-4">
          <Progress value={progress} className="h-2" />
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-4xl mx-auto px-4 py-8">
        <Card className="border-0 shadow-xl bg-white/90 dark:bg-slate-800/90 backdrop-blur-sm">
          <CardHeader className="pb-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-blue-100 dark:bg-blue-900 rounded-full flex items-center justify-center">
                <span className="text-blue-600 dark:text-blue-400 font-semibold">
                  {questionData.progress.current}
                </span>
              </div>
              <div>
                <CardTitle className="text-xl text-slate-800 dark:text-slate-100">
                  Question {questionData.progress.current}
                </CardTitle>
                <p className="text-sm text-slate-500 dark:text-slate-500 capitalize">
                  {questionData.question.position} question
                </p>
              </div>
            </div>
            
            <div className="text-lg text-slate-700 dark:text-slate-300 leading-relaxed">
              {questionData.question.text}
            </div>
          </CardHeader>
          
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                Your answer
              </label>
              <Textarea
                value={currentAnswer}
                onChange={(e) => handleAnswerChange(e.target.value)}
                onBlur={handleBlur}
                placeholder="Take your time to reflect and share your thoughts..."
                className="min-h-32 text-base leading-relaxed resize-none"
                disabled={submitAnswerMutation.isPending}
              />
              {hasUnsavedChanges && (
                <div className="flex items-center gap-2 text-sm text-amber-600 dark:text-amber-400">
                  <Clock className="w-4 h-4" />
                  Unsaved changes
                </div>
              )}
            </div>

            <div className="flex items-center justify-between pt-4">
              <div className="text-sm text-slate-500 dark:text-slate-500">
                Your response will be automatically saved
              </div>
              
              <div className="flex gap-3">
                {hasUnsavedChanges && (
                  <Button
                    variant="outline"
                    onClick={handleBlur}
                    disabled={!currentAnswer.trim() || autoSaveMutation.isPending}
                  >
                    <Save className="w-4 h-4 mr-2" />
                    Save Draft
                  </Button>
                )}
                
                <Button
                  onClick={handleSubmit}
                  disabled={!currentAnswer.trim() || submitAnswerMutation.isPending}
                  className="bg-blue-600 hover:bg-blue-700"
                >
                  {submitAnswerMutation.isPending ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                      Saving...
                    </>
                  ) : (
                    <>
                      Continue
                      <ArrowRight className="w-4 h-4 ml-2" />
                    </>
                  )}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}