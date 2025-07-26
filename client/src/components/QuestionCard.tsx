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
  onAnswerChange: (value: string) => void;
  onSave: () => void;
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
  onAnswerChange,
  onSave,
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

  const canProceed = !validationError && answer.trim().length >= 10;

  return (
    <Card className="animate-slide-up">
      <CardContent className="p-8">
        {/* Question Number Badge */}
        <div className="flex items-center gap-2 mb-6">
          <Badge variant="secondary" className="bg-primary/10 text-primary">
            Question {questionNumber}
          </Badge>
        </div>

        {/* Question Text */}
        <h2 className="text-2xl font-semibold text-secondary mb-8 leading-relaxed">
          {question.text}
        </h2>

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
            placeholder="Take your time to reflect and share your thoughts..."
          />
          
          {/* Validation Messages */}
          {validationError && (
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
            <Button 
              variant="secondary"
              onClick={onSave}
              disabled={!answer.trim() || isSaving || !canProceed}
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
