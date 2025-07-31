import { useParams } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { CheckCircle, Download, Mail, Clock, Loader2 } from "lucide-react";

// Helper function to convert number to ordinal
function getOrdinal(num: number): string {
  const ordinals = ["first", "second", "third", "fourth", "fifth", "sixth", "seventh", "eighth", "ninth", "tenth"];
  if (num <= 10) {
    return ordinals[num - 1];
  }
  
  const lastDigit = num % 10;
  const lastTwoDigits = num % 100;
  
  if (lastTwoDigits >= 11 && lastTwoDigits <= 13) {
    return num + "th";
  }
  
  switch (lastDigit) {
    case 1: return num + "st";
    case 2: return num + "nd";  
    case 3: return num + "rd";
    default: return num + "th";
  }
}

export default function CompletionPage() {
  const { sessionId } = useParams();
  const { toast } = useToast();
  const [wantsReminder, setWantsReminder] = useState(false);
  const [wantsToShare, setWantsToShare] = useState(false);
  const [isCompleted, setIsCompleted] = useState(false);
  const [shareLink, setShareLink] = useState<string | null>(null);

  // Fetch user data to get completion count
  const { data: user } = useQuery({
    queryKey: ["/api/auth/user"],
    retry: false,
  }) as { data: { completionCount?: number } | undefined };

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
        wantsReminder,
        wantsToShare
      });
      return response.json();
    },
    onSuccess: (data) => {
      setIsCompleted(true);
      if (data.shareLink) {
        setShareLink(data.shareLink);
      }
      toast({
        title: "Inquiry Finalized",
        description: "Your responses have been compiled and transmitted. What was sought has been found.",
      });
    },
    onError: (error: any) => {
      if (error.message.includes('2 months')) {
        toast({
          title: "Cycle Incomplete",
          description: "The inquiry requires a two-month interval between completions.",
          variant: "destructive",
        });
      } else {
        toast({
          title: "Transmission Error",
          description: error.message || "Unable to finalize the inquiry",
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
              The Inquiry Concludes
            </h1>
            <p className="text-slate-300 mb-6">
              Your {user?.completionCount ? getOrdinal(user.completionCount) : "first"} formulation of truth has been preserved and transmitted. The document contains reflections from depth psychology and integral philosophy.
            </p>
            {shareLink && (
              <div className="mb-6 p-4 bg-emerald-500/10 rounded-lg border border-emerald-500/30">
                <p className="text-sm font-medium text-emerald-400 mb-2">Your shareable link:</p>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={shareLink}
                    readOnly
                    className="flex-1 bg-slate-700 border border-slate-600 rounded px-3 py-2 text-sm text-slate-200"
                  />
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(shareLink);
                      toast({
                        title: "Link Copied",
                        description: "The shareable link has been copied to your clipboard.",
                      });
                    }}
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm rounded"
                  >
                    Copy
                  </button>
                </div>
              </div>
            )}
            <p className="text-lg text-emerald-400 question-text">
              What was sought has been found.
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
              Questionnaire completed
            </CardTitle>
          </CardHeader>
          <CardContent className="p-8">
            <div className="w-16 h-16 bg-emerald-500/10 rounded-full flex items-center justify-center mx-auto mb-6">
              <CheckCircle className="w-8 h-8 text-emerald-500" />
            </div>

            <h2 className="text-xl text-slate-100 mb-6 question-text text-center">
              You have answered the Proust Questionnaire for the {user?.completionCount ? getOrdinal(user.completionCount + 1) : "first"} time, offering oneself as a formulation of truth.
            </h2>

            <p className="text-slate-300 mb-8 text-center leading-relaxed">
              Each of your responses is saved, securely encrypted in the database @aformulationoftruth.com
              You alone can choose with whom to share this work. Alternatively, you may elect to share your responses.
            </p>

            {/* Options */}
            <div className="mb-8 space-y-4">
              {/* Reminder Option */}
              <div className="p-4 bg-slate-700/30 rounded-lg border border-slate-600/50">
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
                      Notify me when the next cycle begins
                    </label>
                    <p className="text-xs text-slate-400 mt-1">
                      The inquiry may be undertaken once every two months. We can alert you when the waiting period concludes.
                    </p>
                  </div>
                </div>
              </div>

              {/* Sharing Option */}
              <div className="p-4 bg-slate-700/30 rounded-lg border border-slate-600/50">
                <div className="flex items-start space-x-3">
                  <Checkbox
                    id="share"
                    checked={wantsToShare}
                    onCheckedChange={(checked) => setWantsToShare(checked as boolean)}
                    className="mt-1"
                  />
                  <div className="flex-1">
                    <label
                      htmlFor="share"
                      className="text-sm font-medium text-slate-200 cursor-pointer"
                    >
                      Generate a shareable link to my responses
                    </label>
                    <p className="text-xs text-slate-400 mt-1">
                      Create a unique page that others can view without needing to register.
                    </p>
                  </div>
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
                Finalize & Transmit Document
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
                Retrieve Document Directly
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
