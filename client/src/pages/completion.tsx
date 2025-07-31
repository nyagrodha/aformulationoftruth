import { useParams } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Download, Mail, Clock, Loader2 } from "lucide-react";

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
      const response = await apiRequest('GET', `/api/questionnaire/${sessionId}/pdf`);
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
      toast({
        title: "Inquiry Unavailable",
        description: "The formulation cannot be completed at this time. Please return later.",
        variant: "destructive",
      });
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
            <div className="w-16 h-16 bg-amber-500/10 rounded-full flex items-center justify-center mx-auto mb-6">
              <svg 
                width="32" 
                height="32" 
                viewBox="0 0 32 32" 
                className="text-amber-400"
                fill="currentColor"
              >
                {/* Madeline cookie shape */}
                <path d="M16 2C12 2 8 4 6 8C4 12 4 16 6 20C8 24 12 26 16 26C20 26 24 24 26 20C28 16 28 12 26 8C24 4 20 2 16 2Z" 
                      fill="currentColor" 
                      opacity="0.9"/>
                {/* Shell ridges */}
                <path d="M16 6C13 6 10 7 8 10C9 9 12 8 16 8C20 8 23 9 24 10C22 7 19 6 16 6Z" 
                      fill="currentColor" 
                      opacity="0.7"/>
                <path d="M16 10C13 10 10 11 8 14C9 13 12 12 16 12C20 12 23 13 24 14C22 11 19 10 16 10Z" 
                      fill="currentColor" 
                      opacity="0.5"/>
                <path d="M16 14C13 14 10 15 8 18C9 17 12 16 16 16C20 16 23 17 24 18C22 15 19 14 16 14Z" 
                      fill="currentColor" 
                      opacity="0.3"/>
                <path d="M16 18C13 18 10 19 8 22C9 21 12 20 16 20C20 20 23 21 24 22C22 19 19 18 16 18Z" 
                      fill="currentColor" 
                      opacity="0.2"/>
              </svg>
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
              a formulation of truth
            </CardTitle>
          </CardHeader>
          <CardContent className="p-8">
            <div className="w-16 h-16 bg-amber-500/10 rounded-full flex items-center justify-center mx-auto mb-6">
              <svg 
                width="32" 
                height="32" 
                viewBox="0 0 32 32" 
                className="text-amber-400"
                fill="currentColor"
              >
                {/* Madeline cookie shape */}
                <path d="M16 2C12 2 8 4 6 8C4 12 4 16 6 20C8 24 12 26 16 26C20 26 24 24 26 20C28 16 28 12 26 8C24 4 20 2 16 2Z" 
                      fill="currentColor" 
                      opacity="0.9"/>
                {/* Shell ridges */}
                <path d="M16 6C13 6 10 7 8 10C9 9 12 8 16 8C20 8 23 9 24 10C22 7 19 6 16 6Z" 
                      fill="currentColor" 
                      opacity="0.7"/>
                <path d="M16 10C13 10 10 11 8 14C9 13 12 12 16 12C20 12 23 13 24 14C22 11 19 10 16 10Z" 
                      fill="currentColor" 
                      opacity="0.5"/>
                <path d="M16 14C13 14 10 15 8 18C9 17 12 16 16 16C20 16 23 17 24 18C22 15 19 14 16 14Z" 
                      fill="currentColor" 
                      opacity="0.3"/>
                <path d="M16 18C13 18 10 19 8 22C9 21 12 20 16 20C20 20 23 21 24 22C22 19 19 18 16 18Z" 
                      fill="currentColor" 
                      opacity="0.2"/>
              </svg>
            </div>

            <h2 className="text-xl text-slate-100 mb-6 question-text text-center">
              You have answered the questionnaire for the first time.
              <br />
              Offering oneself as a formulation of truth
            </h2>

            <p className="text-slate-300 mb-8 text-center leading-relaxed">
              ...your responses are secured and you alone may choose with whom to share your work.
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
                      Notify me when I'm able to submit responses again.
                    </label>
                    <p className="text-xs text-slate-400 mt-1">
                      The inquiry may be completed once every so often. The precise interstitial period to remain unknown that you may forget (or not) these initial responses.
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
                      Generate a shareable link to the responses I submitted.
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
                  <div className="flex items-center">
                    <span className="text-lg mr-2">ಓಂ</span>
                    <span className="mx-2">Finalize & submit</span>
                    <span className="text-lg ml-2">ௐ</span>
                  </div>
                )}
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
