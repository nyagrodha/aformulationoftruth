import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { CheckCircle, Loader2, Mail } from "lucide-react";

const emailSchema = z.object({
  email: z.string().email("Please enter a valid email address"),
});

type EmailForm = z.infer<typeof emailSchema>;

export default function AuthPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [emailSent, setEmailSent] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);

  const form = useForm<EmailForm>({
    resolver: zodResolver(emailSchema),
    defaultValues: {
      email: "",
    },
  });

  // Check for token in URL params
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const token = urlParams.get('token');

    if (token) {
      verifyToken(token);
    }
  }, []);

  const verifyToken = async (token: string) => {
    setIsVerifying(true);
    try {
      const response = await apiRequest('GET', `/api/auth/verify/${token}`);
      const data = await response.json();

      if (data.success) {
        if (data.completed) {
          setLocation(`/complete/${data.sessionId}`);
        } else {
          setLocation(`/questionnaire/${data.sessionId}`);
        }
      } else {
        throw new Error(data.message);
      }
    } catch (error) {
      toast({
        title: "Invalid Link",
        description: "This link has expired or is invalid. Please request a new one.",
        variant: "destructive",
      });
      setIsVerifying(false);
    }
  };

  const sendMagicLinkMutation = useMutation({
    mutationFn: async (data: EmailForm) => {
      const response = await apiRequest('POST', '/api/auth/magic-link', data);
      return response.json();
    },
    onSuccess: () => {
      setEmailSent(true);
      toast({
        title: "Link sent successfully!",
        description: "Check your email for the access link.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to send magic link",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: EmailForm) => {
    sendMagicLinkMutation.mutate(data);
  };

  if (isVerifying) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4 py-8">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6 text-center">
            <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-primary" />
            <h2 className="text-xl font-semibold text-secondary mb-2">Verifying Access</h2>
            <p className="text-muted-foreground">Please wait while we verify your link...</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-8 bg-background">
      <div className="w-full max-w-md">
        {/* Header Section */}
        <div className="text-center mb-8 animate-fade-in">
          <h1 className="text-3xl font-bold text-secondary mb-2">Proust Questionnaire</h1>
          <p className="text-muted-foreground mb-8 text-center leading-relaxed">
              These questions, a practice in self-inquiry, invite a reflective, if not meditative awareness. Any person who endeavors to craft their responses authentically exposes some inner machinations of their personalities.
            </p>
        </div>

        {/* Authentication Card */}
        <Card className="animate-slide-up">
          <CardContent className="p-6">
            <div className="mb-6">
              <h2 className="text-xl font-semibold text-secondary mb-2">Begin Your Journey</h2>
              <p className="text-muted-foreground text-sm">
                Enter your email to receive an apotropaic link to access the questionnaire. Your progress will be automatically saved.
              </p>
            </div>

            {!emailSent ? (
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <div>
                  <Label htmlFor="email" className="text-sm font-medium text-secondary">
                    Email Address
                  </Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="your.email@example.com"
                    className="mt-2"
                    {...form.register("email")}
                  />
                  {form.formState.errors.email && (
                    <p className="text-destructive text-sm mt-1">
                      {form.formState.errors.email.message}
                    </p>
                  )}
                </div>

                <Button 
                  type="submit" 
                  className="w-full"
                  disabled={sendMagicLinkMutation.isPending}
                >
                  {sendMagicLinkMutation.isPending ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Sending...
                    </>
                  ) : (
                    <>
                      <Mail className="w-4 h-4 mr-2" />
                      Send Access Link
                    </>
                  )}
                </Button>
              </form>
            ) : (
              <div className="p-4 bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 rounded-lg">
                <div className="flex items-center">
                  <CheckCircle className="text-accent mr-2 h-5 w-5" />
                  <span className="text-accent font-medium">Link sent successfully!</span>
                </div>
                <p className="text-sm text-muted-foreground mt-1">Check your email for the access link.</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Info Section */}
        <div className="mt-8">
          <Card>
            <CardContent className="p-4">
              <h3 className="font-medium text-secondary mb-2 text-center">About the Questionnaire</h3>
              <div className="text-sm text-muted-foreground space-y-1">
                <p>• 35 carefully curated questions</p>
                <p>• Progress automatically saved</p>
                <p>• Resume anytime with your email</p>
                <p>• Receive a beautiful PDF of your responses</p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}