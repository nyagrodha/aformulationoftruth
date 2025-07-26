import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, ArrowRight, Save, AlertTriangle, Check, Loader2 } from "lucide-react";

interface Question {
  id: number;
  text: string;
  position: string;
}

interface QuestionCardProps {
  question: Question;
  questionNumber: number;
  answer: string;
  declined: boolean;
  reviewingDeclined: boolean;
  onAnswerChange: (value: string) => void;
  onSave: () => void;
  onDecline: () => void;
  onNext: () => void;
  onPrevious: () => void;
  canGoBack: boolean;
  hasUnsavedChanges: boolean;
  isSaving: boolean;
  isNavigating: boolean;
}

export default function QuestionCard({
  question,
  questionNumber,
  answer,
  declined,
  reviewingDeclined,
  onAnswerChange,
  onSave,
  onDecline,
  onNext,
  onPrevious,
  canGoBack,
  hasUnsavedChanges,
  isSaving,
  isNavigating
}: QuestionCardProps) {
  const [validationError, setValidationError] = useState("");
  const [showSuccess, setShowSuccess] = useState(false);

  useEffect(() => {
    if (isSaving) {
      setShowSuccess(false);
    }
  }, [isSaving]);

  useEffect(() => {
    if (!isSaving && !hasUnsavedChanges && answer.trim().length > 0) {
      setShowSuccess(true);
      setTimeout(() => setShowSuccess(false), 2000);
    }
  }, [isSaving, hasUnsavedChanges, answer]);

  const validateAnswer = (value: string): string => {
    const trimmed = value.trim();
    
    if (trimmed.length < 10) {
      return "Please provide a thoughtful response (minimum 10 characters)";
    }
    
    if (/^\d+$/.test(trimmed)) {
      return "Please provide a thoughtful response, not just numbers";
    }
    
    if (/^[^a-zA-Z]*$/.test(trimmed)) {
      return "Response must contain meaningful text";
    }
    
    return "";
  };

  const handleAnswerChange = (value: string) => {
    onAnswerChange(value);
    const error = validateAnswer(value);
    setValidationError(error);
  };

  const handleNext = () => {
    const error = validateAnswer(answer);
    if (error) {
      setValidationError(error);
      return;
    }
    onNext();
  };

  const canProceed = !validationError && (answer.trim().length >= 10 || declined);

  return (
    <Card className="animate-slide-up">
      <CardContent className="p-8">
        {/* Question Number Badge */}
        <div className="flex items-center gap-2 mb-6">
          <Badge variant="secondary" className="bg-primary/10 text-primary">
            Question {questionNumber}
          </Badge>
          {reviewingDeclined && (
            <Badge variant="outline" className="text-orange-600 border-orange-600">
              Reviewing Declined
            </Badge>
          )}
          {declined && (
            <Badge variant="outline" className="text-yellow-600 border-yellow-600">
              Previously Declined
            </Badge>
          )}
        </div>

        {/* Question Text */}
        <h2 className="text-2xl font-semibold text-secondary mb-8 leading-relaxed">
          {question.text}
        </h2>

        {/* Declined Notice */}
        {declined && !answer && (
          <div className="mb-6 p-4 bg-yellow-50 dark:bg-yellow-950 border border-yellow-200 dark:border-yellow-800 rounded-lg">
            <p className="text-sm text-yellow-800 dark:text-yellow-200">
              You previously declined to answer this question. You can now provide a response or decline again.
            </p>
          </div>
        )}

        {/* Answer Input */}
        <div className="space-y-4">
          <Label htmlFor="answer" className="text-sm font-medium text-secondary">
            Your Response
          </Label>
          <Textarea 
            id="answer" 
            value={answer}
            onChange={(e) => handleAnswerChange(e.target.value)}
            rows={6} 
            className="resize-vertical"
            placeholder={declined ? "You can now provide a response if you'd like..." : "Take your time to reflect and share your thoughts..."}
            disabled={declined && !reviewingDeclined}
          />
          
          {/* Validation Messages */}
          {validationError && !declined && (
            <div className="text-destructive text-sm flex items-center">
              <AlertTriangle className="w-4 h-4 mr-1" />
              {validationError}
            </div>
          )}
          
          {showSuccess && (
            <div className="text-accent text-sm flex items-center">
              <Check className="w-4 h-4 mr-1" />
              Response saved automatically
            </div>
          )}

          {/* Character Counter */}
          <div className="text-xs text-muted-foreground text-right">
            {answer.length} characters
          </div>
        </div>

        {/* Navigation Buttons */}
        <div className="flex justify-between items-center mt-8 pt-6 border-t border-border">
          <Button 
            variant="outline"
            onClick={onPrevious}
            disabled={!canGoBack || isNavigating}
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Previous
          </Button>

          <div className="flex space-x-3">
            {!declined && (
              <Button 
                variant="outline"
                onClick={onDecline}
                disabled={isSaving || isNavigating}
                className="text-yellow-600 border-yellow-600 hover:bg-yellow-50 dark:hover:bg-yellow-950"
              >
                Decline to Answer
              </Button>
            )}

            <Button 
              variant="secondary"
              onClick={onSave}
              disabled={(!answer.trim() && !declined) || isSaving || !canProceed}
            >
              {isSaving ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="w-4 h-4 mr-2" />
                  Save Progress
                </>
              )}
            </Button>

            <Button 
              onClick={handleNext}
              disabled={!canProceed || isNavigating}
            >
              {isNavigating ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Loading...
                </>
              ) : (
                <>
                  Next
                  <ArrowRight className="w-4 h-4 ml-2" />
                </>
              )}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
