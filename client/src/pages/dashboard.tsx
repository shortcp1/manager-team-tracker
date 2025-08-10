import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { StatsCard } from "@/components/ui/stats-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Building, Users, ArrowUpDown, Clock, Plus, Minus, Edit, RefreshCw } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

export default function Dashboard() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: stats, isLoading: statsLoading, error: statsError } = useQuery({
    queryKey: ["/api/stats"],
  });

  const { data: recentChanges, isLoading: changesLoading, error: changesError } = useQuery({
    queryKey: ["/api/changes/recent"],
  });

  const { data: firms, isLoading: firmsLoading, error: firmsError } = useQuery({
    queryKey: ["/api/firms"],
  });

  const scrapeAllMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/scrape/all"),
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/changes/recent"] });
      queryClient.invalidateQueries({ queryKey: ["/api/firms"] });
      toast({
        title: "Scrape Completed",
        description: `Scraped ${data.firmsProcessed} firms. Found ${data.totalMembersFound} members, ${data.totalChangesDetected} changes detected.`,
      });
    },
    onError: () => {
      toast({
        title: "Scrape Failed",
        description: "Failed to start scraping process. Please try again.",
        variant: "destructive",
      });
    },
  });

  if (statsLoading || changesLoading || firmsLoading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-32 bg-gray-200 animate-pulse rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  // Handle error states
  if (statsError || changesError || firmsError) {
    return (
      <div className="space-y-6">
        <Card>
          <CardContent className="p-6">
            <div className="text-center">
              <h2 className="text-xl font-semibold text-red-600 mb-2">Connection Error</h2>
              <p className="text-gray-600 mb-4">
                Unable to load dashboard data. The database connection may be down.
              </p>
              <div className="space-y-2 text-sm text-gray-500">
                {statsError && <p>Stats error: {statsError instanceof Error ? statsError.message : 'Unknown'}</p>}
                {changesError && <p>Changes error: {changesError instanceof Error ? changesError.message : 'Unknown'}</p>}
                {firmsError && <p>Firms error: {firmsError instanceof Error ? firmsError.message : 'Unknown'}</p>}
              </div>
              <p className="text-sm text-blue-600 mt-4">
                Try: <a href="/api/debug" target="_blank" className="underline">Check API Debug Info</a>
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const getChangeIcon = (changeType: string) => {
    switch (changeType) {
      case 'added':
        return <Plus className="w-4 h-4 text-white" />;
      case 'removed':
        return <Minus className="w-4 h-4 text-white" />;
      case 'updated':
        return <Edit className="w-4 h-4 text-white" />;
      default:
        return <ArrowUpDown className="w-4 h-4 text-white" />;
    }
  };

  const getChangeBgColor = (changeType: string) => {
    switch (changeType) {
      case 'added':
        return 'bg-secondary';
      case 'removed':
        return 'bg-warning';
      case 'updated':
        return 'bg-blue-500';
      default:
        return 'bg-gray-500';
    }
  };

  return (
    <div className="space-y-6">
      {/* Statistics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatsCard
          title="Total Firms"
          value={(stats as any)?.totalFirms || 0}
          icon={Building}
          iconColor="text-primary"
          iconBg="bg-blue-50"
        />
        <StatsCard
          title="Team Members"
          value={(stats as any)?.totalMembers || 0}
          icon={Users}
          iconColor="text-secondary"
          iconBg="bg-green-50"
        />
        <StatsCard
          title="Changes This Week"
          value={(stats as any)?.weeklyChanges || 0}
          icon={ArrowUpDown}
          iconColor="text-warning"
          iconBg="bg-orange-50"
        />
        <StatsCard
          title="Last Scrape"
          value={(stats as any)?.lastScrape ? formatDistanceToNow(new Date((stats as any).lastScrape), { addSuffix: true }) : 'Never'}
          icon={Clock}
          iconColor="text-secondary"
          iconBg="bg-green-50"
        />
      </div>

      {/* Recent Changes and System Status */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Changes */}
        <Card className="border border-gray-200">
          <CardHeader>
            <CardTitle className="text-lg font-semibold text-gray-900">Recent Changes</CardTitle>
            <p className="text-sm text-gray-500">Latest team member updates</p>
          </CardHeader>
          <CardContent>
            {recentChanges && (recentChanges as any[]).length > 0 ? (
              <div className="space-y-4">
                {(recentChanges as any[]).slice(0, 5).map((change: any) => (
                  <div key={change.id} className="flex items-start space-x-4 p-4 border border-gray-100 rounded-lg">
                    <div className={`w-8 h-8 ${getChangeBgColor(change.changeType)} rounded-full flex items-center justify-center flex-shrink-0`}>
                      {getChangeIcon(change.changeType)}
                    </div>
                    <div className="flex-1">
                      <p className="font-medium text-gray-900">{change.memberName}</p>
                      {change.memberTitle && (
                        <p className="text-sm text-gray-600">{change.memberTitle}</p>
                      )}
                      <p className="text-sm text-gray-500">{change.firmName}</p>
                      <p className="text-xs text-gray-400">
                        {change.changeType.charAt(0).toUpperCase() + change.changeType.slice(1)} {formatDistanceToNow(new Date(change.detectedAt), { addSuffix: true })}
                      </p>
                    </div>
                  </div>
                ))}
                <div className="mt-4 pt-4 border-t border-gray-200">
                  <a href="/change-history" className="text-primary hover:text-primary-dark text-sm font-medium">
                    View all changes →
                  </a>
                </div>
              </div>
            ) : (
              <p className="text-gray-500 text-center py-8">No recent changes</p>
            )}
          </CardContent>
        </Card>

        {/* System Status */}
        <Card className="border border-gray-200">
          <CardHeader>
            <CardTitle className="text-lg font-semibold text-gray-900">System Status</CardTitle>
            <p className="text-sm text-gray-500">Scraper health and performance</p>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-center justify-between p-3 bg-green-50 border border-green-200 rounded-lg">
                <div className="flex items-center space-x-3">
                  <div className="w-3 h-3 bg-secondary rounded-full"></div>
                  <span className="font-medium text-gray-900">Scraper Service</span>
                </div>
                <Badge className="bg-green-100 text-green-800">Online</Badge>
              </div>
              
              <div className="flex items-center justify-between p-3 bg-green-50 border border-green-200 rounded-lg">
                <div className="flex items-center space-x-3">
                  <div className="w-3 h-3 bg-secondary rounded-full"></div>
                  <span className="font-medium text-gray-900">Email Notifications</span>
                </div>
                <Badge className="bg-green-100 text-green-800">Active</Badge>
              </div>
              
              <div className="flex items-center justify-between p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                <div className="flex items-center space-x-3">
                  <div className="w-3 h-3 bg-warning rounded-full"></div>
                  <span className="font-medium text-gray-900">Database</span>
                </div>
                <Badge className="bg-yellow-100 text-yellow-800">Good</Badge>
              </div>
              
              <div className="p-3 bg-gray-50 border border-gray-200 rounded-lg">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-gray-700">Success Rate</span>
                  <span className="text-sm font-medium text-gray-900">94.2%</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div className="bg-secondary h-2 rounded-full" style={{ width: "94.2%" }}></div>
                </div>
              </div>
              
              <div className="p-3 bg-gray-50 border border-gray-200 rounded-lg">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-gray-700">Next Scheduled Run</span>
                  <span className="text-sm font-medium text-gray-900">Tomorrow 2:00 AM</span>
                </div>
                <p className="text-xs text-gray-500">Weekly schedule (Mondays at 2:00 AM)</p>
              </div>
              
              <div className="pt-2">
                <Button
                  onClick={() => scrapeAllMutation.mutate()}
                  disabled={scrapeAllMutation.isPending}
                  className="w-full bg-primary hover:bg-primary-dark text-white"
                >
                  {scrapeAllMutation.isPending ? (
                    <>
                      <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                      Scraping...
                    </>
                  ) : (
                    <>
                      <RefreshCw className="w-4 h-4 mr-2" />
                      Scrape Now
                    </>
                  )}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Monitored Firms Table Preview */}
      <Card className="border border-gray-200">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg font-semibold text-gray-900">Monitored Firms</CardTitle>
              <p className="text-sm text-gray-500">Firms currently being tracked for team changes</p>
            </div>
            <a 
              href="/firms" 
              className="text-primary hover:text-primary-dark text-sm font-medium"
            >
              View all firms →
            </a>
          </div>
        </CardHeader>
        <CardContent>
          {firms && (firms as any[]).length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="text-left py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Firm</th>
                    <th className="text-left py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Type</th>
                    <th className="text-left py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Team Size</th>
                    <th className="text-left py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {(firms as any[]).slice(0, 5).map((firm: any) => (
                    <tr key={firm.id} className="hover:bg-gray-50">
                      <td className="py-4">
                        <div className="flex items-center">
                          <div className="w-10 h-10 bg-gray-200 rounded-lg flex items-center justify-center">
                            <Building className="w-5 h-5 text-gray-500" />
                          </div>
                          <div className="ml-4">
                            <p className="text-sm font-medium text-gray-900">{firm.name}</p>
                            <p className="text-sm text-gray-500">{firm.url ? new URL(firm.url).hostname : 'No URL'}</p>
                          </div>
                        </div>
                      </td>
                      <td className="py-4">
                        <Badge className={firm.type === "Venture Capital" ? "firm-type-vc" : "firm-type-pe"}>
                          {firm.type}
                        </Badge>
                      </td>
                      <td className="py-4 text-sm text-gray-900">{firm.teamSize || 0}</td>
                      <td className="py-4">
                        <Badge className={`status-${firm.status}`}>
                          {firm.status.charAt(0).toUpperCase() + firm.status.slice(1)}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-gray-500 text-center py-8">No firms configured</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
