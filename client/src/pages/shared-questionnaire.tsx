import { useParams } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { questionService } from "@/lib/questionService";

export default function SharedQuestionnairePage() {
  const { shareId } = useParams();

  const { data, isLoading, error } = useQuery({
    queryKey: [`/api/shared/${shareId}`],
    retry: false,
  }) as { data: { session: any, responses: any[] } | undefined, isLoading: boolean, error: any };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-green-950 via-slate-900 to-green-950 flex items-center justify-center px-4 py-8" style={{backgroundColor: 'hsl(120, 100%, 3%)'}}>
        <Card className="w-full max-w-4xl bg-slate-800/60 border-slate-700/50">
          <CardContent className="p-8 text-center">
            <p className="text-slate-300">Loading shared questionnaire...</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-green-950 via-slate-900 to-green-950 flex items-center justify-center px-4 py-8" style={{backgroundColor: 'hsl(120, 100%, 3%)'}}>
        <Card className="w-full max-w-4xl bg-slate-800/60 border-slate-700/50">
          <CardContent className="p-8 text-center">
            <h1 className="text-2xl font-semibold text-slate-100 mb-4 question-text">
              Questionnaire Not Found
            </h1>
            <p className="text-slate-300">
              This shared questionnaire could not be found or is no longer available.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const session = data.session;
  const responses = data.responses;
  const questionOrder = session.questionOrder as number[];

  // Sort responses according to the display order
  const sortedResponses = responses.sort((a: any, b: any) => {
    const aIndex = questionOrder.indexOf(a.questionId);
    const bIndex = questionOrder.indexOf(b.questionId);
    return aIndex - bIndex;
  });

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-950 via-slate-900 to-green-950 px-4 py-8" style={{backgroundColor: 'hsl(120, 100%, 3%)'}}>
      <div className="max-w-4xl mx-auto">
        <Card className="bg-slate-800/60 border-slate-700/50">
          <CardHeader>
            <CardTitle className="text-3xl text-slate-100 question-text text-center">
              A Formulation of Truth
            </CardTitle>
            <p className="text-slate-300 text-center mt-2">
              Completed on {new Date(session.completedAt).toLocaleDateString('en-US', { 
                year: 'numeric', 
                month: 'long', 
                day: 'numeric' 
              })}
            </p>
          </CardHeader>
          <CardContent className="p-8">
            <div className="space-y-8">
              {sortedResponses.map((response: any, index: number) => {
                const question = questionService.getQuestionById(response.questionId);
                if (!question) return null;

                return (
                  <div key={response.id} className="border-b border-slate-600/50 pb-6 last:border-b-0">
                    <div className="flex items-start gap-4">
                      <div className="flex-shrink-0 w-8 h-8 bg-emerald-500/10 rounded-full flex items-center justify-center">
                        <span className="text-sm font-medium text-emerald-400 question-text">
                          {index + 1}
                        </span>
                      </div>
                      <div className="flex-1">
                        <h3 className="text-lg font-medium text-slate-100 mb-3 question-text">
                          {question.text}
                        </h3>
                        <div className="bg-slate-700/30 rounded-lg p-4 border border-slate-600/50">
                          <p className="text-slate-200 leading-relaxed whitespace-pre-wrap">
                            {response.answer}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            
            <div className="mt-12 pt-8 border-t border-slate-600/50 text-center">
              <p className="text-slate-400 text-sm">
                This is a shared response to the Proust Questionnaire from{" "}
                <span className="text-emerald-400">aformulationoftruth.com</span>
              </p>
              <p className="text-slate-500 text-xs mt-2">
                Create your own formulation of truth by visiting the site
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}