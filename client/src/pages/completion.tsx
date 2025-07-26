import { useParams } from "wouter";
import { useMutation } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { CheckCircle, Download, Mail, RotateCcw, Loader2 } from "lucide-react";

export default function CompletionPage() {
  const { sessionId } = useParams();
  const { toast } = useToast();

  const downloadPDFMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch(`/api/questionnaire/${sessionId}/pdf`);
      if (!response.ok) throw new Error('Failed to download PDF');
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'proust-questionnaire.pdf';
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

  const emailResultsMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest('POST', `/api/questionnaire/${sessionId}/complete`);
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Results Sent",
        description: "Your questionnaire results have been emailed to you.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Email Failed",
        description: error.message || "Failed to send results",
        variant: "destructive",
      });
    },
  });

  const handleDownloadPDF = () => {
    downloadPDFMutation.mutate();
  };

  const handleEmailResults = () => {
    emailResultsMutation.mutate();
  };

  const handleStartNew = () => {
    window.location.href = '/';
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-8 bg-background">
      <div className="w-full max-w-2xl text-center">
        <Card className="animate-slide-up">
          <CardContent className="p-8">
            {/* Success Icon */}
            <div className="w-16 h-16 bg-accent/10 rounded-full flex items-center justify-center mx-auto mb-6">
              <CheckCircle className="text-accent h-8 w-8" />
            </div>

            <h1 className="text-3xl font-bold text-secondary mb-4">Questionnaire Complete!</h1>
            <p className="text-muted-foreground mb-8 leading-relaxed">
              Thank you for taking the time to complete the Proust Questionnaire. Your thoughtful responses have been compiled into a beautiful document.
            </p>

            {/* Completion Stats */}
            <div className="grid grid-cols-3 gap-4 mb-8">
              <div className="text-center">
                <div className="text-2xl font-bold text-primary">35</div>
                <div className="text-sm text-muted-foreground">Questions</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-primary">Complete</div>
                <div className="text-sm text-muted-foreground">Status</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-primary">PDF</div>
                <div className="text-sm text-muted-foreground">Format</div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="space-y-4">
              <Button 
                onClick={handleDownloadPDF}
                className="w-full"
                disabled={downloadPDFMutation.isPending}
              >
                {downloadPDFMutation.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Generating PDF...
                  </>
                ) : (
                  <>
                    <Download className="w-4 h-4 mr-2" />
                    Download PDF Report
                  </>
                )}
              </Button>
              
              <Button 
                variant="outline"
                onClick={handleEmailResults}
                className="w-full"
                disabled={emailResultsMutation.isPending}
              >
                {emailResultsMutation.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Sending Email...
                  </>
                ) : (
                  <>
                    <Mail className="w-4 h-4 mr-2" />
                    Email Results to Me
                  </>
                )}
              </Button>
            </div>

            {/* Additional Options */}
            <div className="mt-8 pt-6 border-t border-border">
              <p className="text-sm text-muted-foreground mb-4">
                Your responses have been securely saved. You can access them anytime using your email.
              </p>
              <Button 
                variant="ghost"
                onClick={handleStartNew}
                className="text-primary hover:text-primary/80"
              >
                <RotateCcw className="w-4 h-4 mr-2" />
                Start a New Questionnaire
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
