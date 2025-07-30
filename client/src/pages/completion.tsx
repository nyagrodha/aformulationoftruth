import { useParams } from "wouter";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { CheckCircle, Download, Mail, Clock, Loader2 } from "lucide-react";

export default function CompletionPage() {
  const { sessionId } = useParams();
  const { toast } = useToast();
  const [wantsReminder, setWantsReminder] = useState(false);
  const [isCompleted, setIsCompleted] = useState(false);

  const downloadPDFMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch(`/api/questionnaire/${sessionId}/pdf`);
      if (!response.ok) throw new Error('Failed to download PDF');
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'formulation-of-truth.pdf';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    },
    onError: (error: any) => {
      toast({
        title: "Download Failed",
        description: error.message || "Failed to download PDF",
        variant: "destructive",
      });
    },
  });

  const completeQuestionnaireMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest('POST', `/api/questionnaire/${sessionId}/complete`, {
        wantsReminder
      });
      return response.json();
    },
    onSuccess: () => {
      setIsCompleted(true);
      toast({
        title: "Journey Complete",
        description: "Your questionnaire has been completed and emailed to you. May all your paths be auspicious.",
      });
    },
    onError: (error: any) => {
      if (error.message.includes('2 months')) {
        toast({
          title: "Already Completed",
          description: "You may only complete the questionnaire once every 2 months.",
          variant: "destructive",
        });
      } else {
        toast({
          title: "Completion Failed",
          description: error.message || "Failed to complete questionnaire",
          variant: "destructive",
        });
      }
    },
  });

  const handleDownloadPDF = () => {
    downloadPDFMutation.mutate();
  };

  const handleComplete = () => {
    completeQuestionnaireMutation.mutate();
  };

  if (isCompleted) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-green-950 via-slate-900 to-green-950 flex items-center justify-center px-4 py-8" style={{backgroundColor: 'hsl(120, 100%, 3%)'}}>
        <Card className="w-full max-w-2xl bg-slate-800/60 border-slate-700/50">
          <CardContent className="p-8 text-center">
            <div className="w-16 h-16 bg-emerald-500/10 rounded-full flex items-center justify-center mx-auto mb-6">
              <CheckCircle className="w-8 h-8 text-emerald-500" />
            </div>
            <h1 className="text-2xl font-semibold text-slate-100 mb-4 question-text">
              Your Journey is Complete
            </h1>
            <p className="text-slate-300 mb-6">
              Your philosophical reflections have been sent to your email along with insights from Jacques Lacan and Sri Aurobindo.
            </p>
            <p className="text-lg text-emerald-400 question-text">
              May all your paths be auspicious.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-950 via-slate-900 to-green-950 flex items-center justify-center px-4 py-8" style={{backgroundColor: 'hsl(120, 100%, 3%)'}}>
      <div className="w-full max-w-2xl">
        <Card className="bg-slate-800/60 border-slate-700/50">
          <CardHeader>
            <CardTitle className="text-2xl text-slate-100 question-text text-center">
              Complete Your Journey
            </CardTitle>
          </CardHeader>
          <CardContent className="p-8">
            <div className="w-16 h-16 bg-emerald-500/10 rounded-full flex items-center justify-center mx-auto mb-6">
              <CheckCircle className="w-8 h-8 text-emerald-500" />
            </div>

            <h2 className="text-xl text-slate-100 mb-6 question-text text-center">
              You have answered all 35 questions
            </h2>

            <p className="text-slate-300 mb-8 text-center leading-relaxed">
              Your philosophical reflections are ready to be compiled into a beautiful PDF with insights from Jacques Lacan and Sri Aurobindo, then sent to your email.
            </p>

            {/* Reminder Option */}
            <div className="mb-8 p-4 bg-slate-700/30 rounded-lg border border-slate-600/50">
              <div className="flex items-start space-x-3">
                <Checkbox
                  id="reminder"
                  checked={wantsReminder}
                  onCheckedChange={(checked) => setWantsReminder(checked as boolean)}
                  className="mt-1"
                />
                <div className="flex-1">
                  <label
                    htmlFor="reminder"
                    className="text-sm font-medium text-slate-200 cursor-pointer"
                  >
                    Send me a reminder in 2 months
                  </label>
                  <p className="text-xs text-slate-400 mt-1">
                    You may complete the questionnaire once every 2 months. We can remind you when you're eligible again.
                  </p>
                </div>
              </div>
            </div>

            {/* Complete Button */}
            <div className="flex justify-center">
              <Button
                onClick={handleComplete}
                disabled={completeQuestionnaireMutation.isPending}
                className="w-full sm:w-auto bg-emerald-600 hover:bg-emerald-700 text-white px-8 py-3"
              >
                {completeQuestionnaireMutation.isPending ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Mail className="w-4 h-4 mr-2" />
                )}
                Complete & Email Results
              </Button>
            </div>

            {/* Download Option */}
            <div className="mt-6 pt-6 border-t border-slate-600 text-center">
              <Button
                onClick={handleDownloadPDF}
                disabled={downloadPDFMutation.isPending}
                variant="outline"
                className="text-slate-300 border-slate-600 hover:bg-slate-700"
              >
                {downloadPDFMutation.isPending ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Download className="w-4 h-4 mr-2" />
                )}
                Download PDF Only
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
