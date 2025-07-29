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

// Devanagari numerals mapping
const devanagariNumerals: { [key: number]: string } = {
  1: "एक", 2: "द्वि", 3: "त्रि", 4: "चतुर्", 5: "पञ्च", 6: "षट्", 7: "सप्त", 8: "अष्ट", 9: "नव", 10: "दश",
  11: "एकादश", 12: "द्वादश", 13: "त्रयोदश", 14: "चतुर्दश", 15: "पञ्चदश", 16: "षोडश", 17: "सप्तदश", 18: "अष्टादश", 19: "एकोनविंश", 20: "विंशति",
  21: "एकविंश", 22: "द्वाविंश", 23: "त्रयोविंश", 24: "चतुर्विंश", 25: "पञ्चविंश", 26: "षड्विंश", 27: "सप्तविंश", 28: "अष्टाविंश", 29: "एकोनत्रिंश", 30: "त्रिंशत्",
  31: "एकत्रिंश", 32: "द्वात्रिंश", 33: "त्रयस्त्रिंश", 34: "चतुस्त्रिंश", 35: "पञ्चत्रिंश"
};

const getDevanagariNumeral = (num: number): string => {
  return devanagariNumerals[num] || num.toString();
};

interface Question {
  id: number;
  text: string;
  position: string;
  shloka?: string;
  deity?: string;
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
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-400 mx-auto mb-4"></div>
          <p className="text-slate-400">Loading your questionnaire...</p>
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
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center">
        <Card className="w-full max-w-md bg-slate-800/60 border-slate-700/50">
          <CardContent className="text-center p-8">
            <p className="text-slate-400 mb-4">
              Unable to load questionnaire data.
            </p>
            <Button onClick={() => refetch()} className="bg-emerald-600 hover:bg-emerald-700">Try Again</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const progress = (questionData.progress.current / questionData.progress.total) * 100;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      {/* Header */}
      <div className="sticky top-0 bg-slate-900/90 backdrop-blur-sm border-b border-slate-700 z-10">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold text-slate-100">
              a formulation of truth
            </h1>
            <p className="text-xs text-slate-500 italic">
              om shree ganapataye namah
            </p>
          </div>
          <Button 
            variant="outline" 
            size="sm" 
            onClick={handleLogout}
            className="text-slate-400 hover:text-slate-200"
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
        <Card className="border border-slate-700/50 shadow-xl bg-slate-800/60 backdrop-blur-sm">
          <CardHeader className="pb-6">
            <div className="flex items-start gap-4 mb-6">
              {/* Question numerals */}
              <div className="flex flex-col items-center gap-2 min-w-[80px] pt-1">
                <div className={`text-3xl font-bold ${questionData.progress.current % 2 === 1 ? 'text-emerald-400' : 'text-yellow-400'}`}>
                  {getDevanagariNumeral(questionData.progress.current)}
                </div>
                <div className={`text-2xl font-semibold ${questionData.progress.current % 2 === 1 ? 'text-yellow-400' : 'text-emerald-400'}`}>
                  {questionData.progress.current}
                </div>
              </div>
              
              {/* Question text */}
              <div className="flex-1">
                {questionData.question.shloka && (
                  <div className="mb-4 p-3 bg-slate-800/50 rounded-lg border-l-4 border-emerald-400">
                    <div className="text-emerald-300 text-sm font-medium mb-1">
                      {questionData.question.deity}
                    </div>
                    <div className="text-amber-200 text-sm leading-relaxed font-light">
                      {questionData.question.shloka}
                    </div>
                  </div>
                )}
                <div className="text-xl text-slate-100 leading-relaxed font-light">
                  {questionData.question.text}
                </div>
                <p className="text-xs text-slate-500 mt-2 italic">
                  om shree ganapataye namah
                </p>
              </div>
            </div>
          </CardHeader>
          
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-300">
                Your answer
              </label>
              <Textarea
                value={currentAnswer}
                onChange={(e) => handleAnswerChange(e.target.value)}
                onBlur={handleBlur}
                placeholder="Take your time to reflect and share your thoughts..."
                className="min-h-32 text-base leading-relaxed resize-none bg-slate-700/50 border-slate-600 text-slate-100 placeholder:text-slate-400"
                disabled={submitAnswerMutation.isPending}
              />
              {hasUnsavedChanges && (
                <div className="flex items-center gap-2 text-sm text-amber-400">
                  <Clock className="w-4 h-4" />
                  Unsaved changes
                </div>
              )}
            </div>

            <div className="flex items-center justify-between pt-4">
              <div className="text-xs text-slate-500 italic">
                om shree ganapataye namah • your response will be automatically saved
              </div>
              
              <div className="flex gap-3">
                {hasUnsavedChanges && (
                  <Button
                    variant="outline"
                    onClick={handleBlur}
                    disabled={!currentAnswer.trim() || autoSaveMutation.isPending}
                    className="border-slate-600 text-slate-300 hover:bg-slate-700"
                  >
                    <Save className="w-4 h-4 mr-2" />
                    Save Draft
                  </Button>
                )}
                
                <Button
                  onClick={handleSubmit}
                  disabled={!currentAnswer.trim() || submitAnswerMutation.isPending}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white"
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