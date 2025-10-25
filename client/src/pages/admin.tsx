import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Search, Users, FileText, MessageSquare, Database } from "lucide-react";
import { questionService } from "@/lib/questionService";

export default function AdminPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState("users");

  // Users search
  const { data: users, isLoading: usersLoading } = useQuery({
    queryKey: [`/api/admin/users`, searchQuery],
    queryFn: () => fetch(`/api/admin/users?search=${encodeURIComponent(searchQuery)}&limit=100`).then(res => res.json()),
    retry: false,
  });

  // Sessions search
  const { data: sessions, isLoading: sessionsLoading } = useQuery({
    queryKey: [`/api/admin/sessions`, searchQuery],
    queryFn: () => fetch(`/api/admin/sessions?search=${encodeURIComponent(searchQuery)}&limit=100`).then(res => res.json()),
    retry: false,
  });

  // Responses search
  const { data: responses, isLoading: responsesLoading } = useQuery({
    queryKey: [`/api/admin/responses`, searchQuery],
    queryFn: () => fetch(`/api/admin/responses?search=${encodeURIComponent(searchQuery)}&limit=100`).then(res => res.json()),
    retry: false,
  });

  // Sessions with full data for overview
  const { data: sessionsWithData, isLoading: sessionsWithDataLoading } = useQuery({
    queryKey: [`/api/admin/sessions-with-data`],
    queryFn: () => fetch('/api/admin/sessions-with-data?limit=20').then(res => res.json()),
    retry: false,
  });

  const handleSearch = () => {
    // Trigger refetch by changing search query
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-950 via-slate-900 to-green-950 px-4 py-8" style={{backgroundColor: 'hsl(120, 100%, 3%)'}}>
      <div className="max-w-7xl mx-auto">
        <Card className="bg-slate-800/60 border-slate-700/50 mb-8">
          <CardHeader>
            <CardTitle className="text-3xl text-slate-100 question-text text-center flex items-center justify-center gap-2">
              <Database className="w-8 h-8" />
              Admin Dashboard - Database Search
            </CardTitle>
            <p className="text-slate-300 text-center">
              Search and explore the questionnaire database
            </p>
          </CardHeader>
        </Card>

        {/* Search Bar */}
        <Card className="bg-slate-800/60 border-slate-700/50 mb-6">
          <CardContent className="p-6">
            <div className="flex gap-4">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-4 h-4" />
                <Input
                  placeholder="Search users, sessions, or responses..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10 bg-slate-700/50 border-slate-600 text-slate-100"
                  onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
                />
              </div>
              <Button onClick={handleSearch} className="bg-emerald-600 hover:bg-emerald-700">
                Search
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Tabs for different data types */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-4 bg-slate-800/60">
            <TabsTrigger value="users" className="data-[state=active]:bg-emerald-600">
              <Users className="w-4 h-4 mr-2" />
              Users
            </TabsTrigger>
            <TabsTrigger value="sessions" className="data-[state=active]:bg-emerald-600">
              <FileText className="w-4 h-4 mr-2" />
              Sessions
            </TabsTrigger>
            <TabsTrigger value="responses" className="data-[state=active]:bg-emerald-600">
              <MessageSquare className="w-4 h-4 mr-2" />
              Responses
            </TabsTrigger>
            <TabsTrigger value="overview" className="data-[state=active]:bg-emerald-600">
              <Database className="w-4 h-4 mr-2" />
              Overview
            </TabsTrigger>
          </TabsList>

          {/* Users Tab */}
          <TabsContent value="users">
            <Card className="bg-slate-800/60 border-slate-700/50">
              <CardHeader>
                <CardTitle className="text-slate-100">Users ({users?.length || 0})</CardTitle>
              </CardHeader>
              <CardContent>
                {usersLoading ? (
                  <p className="text-slate-400">Loading users...</p>
                ) : (
                  <div className="space-y-4">
                    {users?.map((user: any) => (
                      <div key={user.id} className="p-4 bg-slate-700/30 rounded-lg border border-slate-600/50">
                        <div className="flex justify-between items-start">
                          <div>
                            <p className="text-slate-100 font-medium">{user.email}</p>
                            <p className="text-slate-400 text-sm">ID: {user.id}</p>
                            <p className="text-slate-400 text-sm">
                              {user.firstName} {user.lastName}
                            </p>
                            <p className="text-slate-400 text-sm">
                              Completions: {user.completionCount || 0}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="text-slate-400 text-sm">
                              Created: {new Date(user.createdAt).toLocaleDateString()}
                            </p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Sessions Tab */}
          <TabsContent value="sessions">
            <Card className="bg-slate-800/60 border-slate-700/50">
              <CardHeader>
                <CardTitle className="text-slate-100">Sessions ({sessions?.length || 0})</CardTitle>
              </CardHeader>
              <CardContent>
                {sessionsLoading ? (
                  <p className="text-slate-400">Loading sessions...</p>
                ) : (
                  <div className="space-y-4">
                    {sessions?.map((session: any) => (
                      <div key={session.id} className="p-4 bg-slate-700/30 rounded-lg border border-slate-600/50">
                        <div className="flex justify-between items-start">
                          <div>
                            <p className="text-slate-100 font-medium">Session: {session.id}</p>
                            <p className="text-slate-400 text-sm">User: {session.userId}</p>
                            <p className="text-slate-400 text-sm">
                              Progress: {session.currentQuestionIndex + 1}/35
                            </p>
                            {session.shareId && (
                              <p className="text-slate-400 text-sm">Share ID: {session.shareId}</p>
                            )}
                          </div>
                          <div className="text-right flex flex-col gap-2">
                            <div className="flex gap-2">
                              {session.completed && <Badge className="bg-green-600">Completed</Badge>}
                              {session.isShared && <Badge className="bg-blue-600">Shared</Badge>}
                              {session.wantsReminder && <Badge className="bg-yellow-600">Reminder</Badge>}
                            </div>
                            <p className="text-slate-400 text-sm">
                              Created: {new Date(session.createdAt).toLocaleDateString()}
                            </p>
                            {session.completedAt && (
                              <p className="text-slate-400 text-sm">
                                Completed: {new Date(session.completedAt).toLocaleDateString()}
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Responses Tab */}
          <TabsContent value="responses">
            <Card className="bg-slate-800/60 border-slate-700/50">
              <CardHeader>
                <CardTitle className="text-slate-100">Responses ({responses?.length || 0})</CardTitle>
              </CardHeader>
              <CardContent>
                {responsesLoading ? (
                  <p className="text-slate-400">Loading responses...</p>
                ) : (
                  <div className="space-y-4">
                    {responses?.map((response: any) => {
                      const question = questionService.getQuestionById(response.questionId);
                      return (
                        <div key={response.id} className="p-4 bg-slate-700/30 rounded-lg border border-slate-600/50">
                          <div className="space-y-2">
                            <p className="text-slate-100 font-medium">
                              Q{response.questionId}: {question?.text || 'Unknown question'}
                            </p>
                            <p className="text-slate-300 text-sm bg-slate-800/50 p-3 rounded">
                              {response.answer}
                            </p>
                            <div className="flex justify-between text-slate-400 text-xs">
                              <span>Session: {response.sessionId}</span>
                              <span>Created: {new Date(response.createdAt).toLocaleDateString()}</span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Overview Tab */}
          <TabsContent value="overview">
            <Card className="bg-slate-800/60 border-slate-700/50">
              <CardHeader>
                <CardTitle className="text-slate-100">Complete Sessions Overview</CardTitle>
              </CardHeader>
              <CardContent>
                {sessionsWithDataLoading ? (
                  <p className="text-slate-400">Loading session data...</p>
                ) : (
                  <div className="space-y-6">
                    {sessionsWithData?.map((sessionData: any) => (
                      <div key={sessionData.id} className="p-6 bg-slate-700/30 rounded-lg border border-slate-600/50">
                        <div className="mb-4">
                          <div className="flex justify-between items-start mb-2">
                            <div>
                              <p className="text-slate-100 font-bold">{sessionData.user.email}</p>
                              <p className="text-slate-400 text-sm">Session: {sessionData.id}</p>
                            </div>
                            <div className="text-right">
                              <div className="flex gap-2 mb-2">
                                {sessionData.completed && <Badge className="bg-green-600">Completed</Badge>}
                                {sessionData.isShared && <Badge className="bg-blue-600">Shared</Badge>}
                              </div>
                              <p className="text-slate-400 text-sm">
                                {sessionData.completedAt ? 
                                  `Completed: ${new Date(sessionData.completedAt).toLocaleDateString()}` :
                                  `Created: ${new Date(sessionData.createdAt).toLocaleDateString()}`
                                }
                              </p>
                            </div>
                          </div>
                        </div>
                        
                        {sessionData.responses.length > 0 && (
                          <div className="space-y-3">
                            <p className="text-slate-300 font-medium">
                              Responses ({sessionData.responses.length}/35):
                            </p>
                            <div className="grid gap-3 max-h-96 overflow-y-auto">
                              {sessionData.responses.map((response: any) => {
                                const question = questionService.getQuestionById(response.questionId);
                                return (
                                  <div key={response.id} className="p-3 bg-slate-800/50 rounded">
                                    <p className="text-slate-200 text-sm font-medium mb-1">
                                      Q{response.questionId}: {question?.text || 'Unknown question'}
                                    </p>
                                    <p className="text-slate-300 text-sm">
                                      {response.answer.length > 200 ? 
                                        `${response.answer.substring(0, 200)}...` : 
                                        response.answer
                                      }
                                    </p>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}