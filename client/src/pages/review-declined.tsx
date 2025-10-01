
import { useEffect, useState } from "react";
import { useLocation, useParams } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, ArrowRight, RotateCcw } from "lucide-react";

interface DeclinedQuestion {
  id: number;
  text: string;
  position: string;
}

interface DeclinedQuestionsData {
  declined: DeclinedQuestion[];
}

export default function ReviewDeclinedPage() {
  const { sessionId } = useParams();
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const { data: declinedData, isLoading } = useQuery<DeclinedQuestionsData>({
    queryKey: ['/api/questionnaire', sessionId, 'declined'],
    enabled: !!sessionId,
  });

  const startReviewMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest('POST', `/api/questionnaire/${sessionId}/review-declined`);
      return response.json();
    },
    onSuccess: () => {
      setLocation(`/questionnaire/${sessionId}`);
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to start review",
        variant: "destructive",
      });
    },
  });

  const completeMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest('POST', `/api/questionnaire/${sessionId}/complete`);
      return response.json();
    },
    onSuccess: () => {
      setLocation(`/complete/${sessionId}`);
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to complete questionnaire",
        variant: "destructive",
      });
    },
  });

  const handleReviewDeclined = () => {
    startReviewMutation.mutate();
  };

  const handleSkipReview = () => {
    completeMutation.mutate();
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-xl font-semibold text-secondary mb-2">Loading...</h2>
        </div>
      </div>
    );
  }

  if (!declinedData || declinedData.declined.length === 0) {
    // No declined questions, redirect to completion
    setLocation(`/complete/${sessionId}`);
    return null;
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-4xl mx-auto px-4 py-8">
        <Card className="animate-slide-up">
          <CardContent className="p-8">
            <div className="text-center mb-8">
              <Badge variant="outline" className="text-yellow-600 border-yellow-600 mb-4">
                Review Declined Questions
              </Badge>
              <h1 className="text-3xl font-bold text-secondary mb-4">
                You've completed the questionnaire!
              </h1>
              <p className="text-lg text-muted-foreground mb-6">
                However, you declined to answer {declinedData.declined.length} question{declinedData.declined.length !== 1 ? 's' : ''}. 
                Would you like to review and potentially answer them now?
              </p>
            </div>

            {/* Declined Questions List */}
            <div className="space-y-4 mb-8">
              <h3 className="font-semibold text-secondary mb-4 flex items-center">
                <AlertTriangle className="w-5 h-5 mr-2 text-yellow-600" />
                Questions you declined to answer:
              </h3>
              {declinedData.declined.map((question, index) => (
                <div key={question.id} className="p-4 bg-yellow-50 dark:bg-yellow-950 border border-yellow-200 dark:border-yellow-800 rounded-lg">
                  <div className="flex items-start gap-3">
                    <Badge variant="secondary" className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200 mt-1">
                      #{index + 1}
                    </Badge>
                    <p className="text-sm text-yellow-800 dark:text-yellow-200 leading-relaxed">
                      {question.text}
                    </p>
                  </div>
                </div>
              ))}
            </div>

            {/* Action Buttons */}
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button 
                onClick={handleReviewDeclined}
                disabled={startReviewMutation.isPending}
                className="flex items-center"
              >
                <RotateCcw className="w-4 h-4 mr-2" />
                Review Declined Questions
              </Button>
              
              <Button 
                variant="outline"
                onClick={handleSkipReview}
                disabled={completeMutation.isPending}
              >
                Skip Review & Complete
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </div>

            <div className="mt-8 pt-6 border-t border-border text-center">
              <p className="text-sm text-muted-foreground">
                If you choose to review, you'll be able to answer the declined questions or decline them again. 
                After the second review, any remaining declined questions will be left unanswered in your final results.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
