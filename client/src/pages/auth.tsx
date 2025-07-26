import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { LogIn, BookOpen, Users, Award } from "lucide-react";

export default function AuthPage() {
  const { isLoading } = useAuth();

  const handleLogin = () => {
    window.location.href = "/api/login";
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 dark:from-slate-900 dark:to-blue-950 flex items-center justify-center px-4">
      <div className="w-full max-w-4xl">
        <div className="text-center mb-12">
          <h1 className="text-5xl font-bold text-slate-800 dark:text-slate-100 mb-4">
            you are this moment; a formulation of truth
          </h1>
          <p className="text-xl text-slate-600 dark:text-slate-400 max-w-2xl mx-auto">
            Please share your original blurb text and I'll add it here.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-6 mb-12">
          <Card className="border-0 shadow-lg bg-white/80 dark:bg-slate-800/80 backdrop-blur-sm">
            <CardHeader className="text-center pb-4">
              <BookOpen className="w-12 h-12 text-blue-600 mx-auto mb-3" />
              <CardTitle className="text-lg text-slate-800 dark:text-slate-100">
                Thoughtful Questions
              </CardTitle>
            </CardHeader>
            <CardContent className="text-center">
              <p className="text-slate-600 dark:text-slate-400">
                35 carefully curated questions designed to explore your values, 
                dreams, and perspectives on life.
              </p>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-lg bg-white/80 dark:bg-slate-800/80 backdrop-blur-sm">
            <CardHeader className="text-center pb-4">
              <Users className="w-12 h-12 text-green-600 mx-auto mb-3" />
              <CardTitle className="text-lg text-slate-800 dark:text-slate-100">
                Personal Journey
              </CardTitle>
            </CardHeader>
            <CardContent className="text-center">
              <p className="text-slate-600 dark:text-slate-400">
                Your responses are saved as you progress, allowing you to 
                take your time and return whenever you're ready.
              </p>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-lg bg-white/80 dark:bg-slate-800/80 backdrop-blur-sm">
            <CardHeader className="text-center pb-4">
              <Award className="w-12 h-12 text-purple-600 mx-auto mb-3" />
              <CardTitle className="text-lg text-slate-800 dark:text-slate-100">
                Beautiful PDF
              </CardTitle>
            </CardHeader>
            <CardContent className="text-center">
              <p className="text-slate-600 dark:text-slate-400">
                Receive a beautifully formatted PDF of your completed 
                questionnaire delivered to your email.
              </p>
            </CardContent>
          </Card>
        </div>

        <Card className="border-0 shadow-xl bg-white/90 dark:bg-slate-800/90 backdrop-blur-sm max-w-md mx-auto">
          <CardHeader className="text-center pb-6">
            <CardTitle className="text-2xl text-slate-800 dark:text-slate-100">
              Begin Your Journey
            </CardTitle>
            <p className="text-slate-600 dark:text-slate-400 mt-2">
              Click below to receive your secure access link and start exploring.
            </p>
          </CardHeader>
          <CardContent className="text-center">
            <Button 
              onClick={handleLogin}
              size="lg" 
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 transition-colors"
            >
              <LogIn className="w-5 h-5 mr-2" />
              Get Your Apotropaic Link
            </Button>
            <p className="text-xs text-slate-500 dark:text-slate-500 mt-4">
              An apotropaic link is a secure, personalized gateway that protects 
              your privacy while providing access to your questionnaire.
            </p>
          </CardContent>
        </Card>

        <div className="text-center mt-12">
          <p className="text-slate-500 dark:text-slate-500 text-sm max-w-2xl mx-auto">
            Named after Marcel Proust, this questionnaire has been used by writers, 
            thinkers, and curious minds for over a century to explore the depths 
            of personality and preference.
          </p>
        </div>
      </div>
    </div>
  );
}