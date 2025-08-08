import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { History, Search, Plus, Minus, Edit, ChevronLeft, ChevronRight } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

export default function ChangeHistory() {
  const [searchQuery, setSearchQuery] = useState("");
  const [firmFilter, setFirmFilter] = useState("all");
  const [changeTypeFilter, setChangeTypeFilter] = useState("all");
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 20;

  const { data: changes, isLoading } = useQuery({
    queryKey: ["/api/changes"],
  });

  const { data: firms } = useQuery({
    queryKey: ["/api/firms"],
  });

  const filteredChanges = (changes as any[] || []).filter((change: any) => {
    const matchesSearch = 
      change.memberName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (change.firmName && change.firmName.toLowerCase().includes(searchQuery.toLowerCase()));
    const matchesFirm = firmFilter === "all" || change.firmName === firmFilter;
    const matchesType = changeTypeFilter === "all" || change.changeType === changeTypeFilter;
    
    return matchesSearch && matchesFirm && matchesType;
  }) || [];

  const totalPages = Math.ceil(filteredChanges.length / itemsPerPage);
  const paginatedChanges = filteredChanges.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  const getChangeIcon = (changeType: string) => {
    switch (changeType) {
      case 'added':
        return <Plus className="w-4 h-4 text-white" />;
      case 'removed':
        return <Minus className="w-4 h-4 text-white" />;
      case 'updated':
        return <Edit className="w-4 h-4 text-white" />;
      default:
        return <History className="w-4 h-4 text-white" />;
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

  const getChangeTypeLabel = (changeType: string) => {
    return changeType.charAt(0).toUpperCase() + changeType.slice(1);
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="h-8 bg-gray-200 animate-pulse rounded w-48" />
        <div className="h-96 bg-gray-200 animate-pulse rounded-lg" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card className="border border-gray-200">
        <CardHeader>
          <div>
            <CardTitle className="text-lg font-semibold text-gray-900">Change History</CardTitle>
            <p className="text-sm text-gray-500">Track all team member changes across firms</p>
          </div>
        </CardHeader>
        
        {/* Filters */}
        <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
              <Input
                placeholder="Search changes..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={firmFilter} onValueChange={setFirmFilter}>
              <SelectTrigger className="w-full sm:w-auto sm:min-w-[200px]">
                <SelectValue placeholder="All Firms" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Firms</SelectItem>
                {(firms as any[] || []).map((firm: any) => (
                  <SelectItem key={firm.id} value={firm.name}>
                    {firm.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={changeTypeFilter} onValueChange={setChangeTypeFilter}>
              <SelectTrigger className="w-full sm:w-auto">
                <SelectValue placeholder="All Changes" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Changes</SelectItem>
                <SelectItem value="added">Added</SelectItem>
                <SelectItem value="removed">Removed</SelectItem>
                <SelectItem value="updated">Updated</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        
        <CardContent>
          {paginatedChanges.length > 0 ? (
            <div className="space-y-4">
              {paginatedChanges.map((change: any) => (
                <div key={change.id} className="flex items-start space-x-4 p-4 border border-gray-100 rounded-lg hover:bg-gray-50 transition-colors">
                  <div className={`w-10 h-10 ${getChangeBgColor(change.changeType)} rounded-full flex items-center justify-center flex-shrink-0`}>
                    {getChangeIcon(change.changeType)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <p className="font-medium text-gray-900">{change.memberName}</p>
                        {change.memberTitle && (
                          <p className="text-sm text-gray-600">{change.memberTitle}</p>
                        )}
                        <div className="flex items-center space-x-2 mt-1">
                          <Badge className={change.firmType === "Venture Capital" ? "firm-type-vc" : "firm-type-pe"}>
                            {change.firmName}
                          </Badge>
                          <Badge variant="outline" className={`${change.changeType === 'added' ? 'border-secondary text-secondary' : change.changeType === 'removed' ? 'border-warning text-warning' : 'border-blue-500 text-blue-500'}`}>
                            {getChangeTypeLabel(change.changeType)}
                          </Badge>
                        </div>
                        
                        {/* Show change details for updates */}
                        {change.changeType === 'updated' && change.previousData && change.newData && (
                          <div className="mt-3 p-3 bg-blue-50 rounded-md text-sm">
                            <p className="font-medium text-blue-900 mb-2">Changes:</p>
                            {change.previousData.title !== change.newData.title && (
                              <div className="mb-1">
                                <span className="text-blue-700">Title: </span>
                                <span className="line-through text-gray-500">{change.previousData.title}</span>
                                <span className="mx-2">→</span>
                                <span className="text-blue-900">{change.newData.title}</span>
                              </div>
                            )}
                            {change.previousData.bio !== change.newData.bio && (
                              <div>
                                <span className="text-blue-700">Bio updated</span>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                      <div className="text-right text-xs text-gray-400 ml-4">
                        <p>{formatDistanceToNow(new Date(change.detectedAt), { addSuffix: true })}</p>
                        <p>{new Date(change.detectedAt).toLocaleDateString()}</p>
                        {change.emailSent && (
                          <p className="text-green-600 mt-1">✓ Email sent</p>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
              
              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between pt-4 border-t border-gray-200">
                  <p className="text-sm text-gray-700">
                    Showing {((currentPage - 1) * itemsPerPage) + 1} to {Math.min(currentPage * itemsPerPage, filteredChanges.length)} of {filteredChanges.length} results
                  </p>
                  <div className="flex items-center space-x-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                      disabled={currentPage === 1}
                    >
                      <ChevronLeft className="w-4 h-4 mr-1" />
                      Previous
                    </Button>
                    <div className="flex items-center space-x-1">
                      {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                        const pageNum = i + 1;
                        return (
                          <Button
                            key={pageNum}
                            variant={currentPage === pageNum ? "default" : "outline"}
                            size="sm"
                            onClick={() => setCurrentPage(pageNum)}
                            className={currentPage === pageNum ? "bg-primary text-white" : ""}
                          >
                            {pageNum}
                          </Button>
                        );
                      })}
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                      disabled={currentPage === totalPages}
                    >
                      Next
                      <ChevronRight className="w-4 h-4 ml-1" />
                    </Button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="text-center py-8">
              <History className="mx-auto h-12 w-12 text-gray-400" />
              <h3 className="mt-2 text-sm font-medium text-gray-900">No changes found</h3>
              <p className="mt-1 text-sm text-gray-500">
                {searchQuery || firmFilter !== "all" || changeTypeFilter !== "all"
                  ? "No changes match your search criteria."
                  : "No team changes have been detected yet."
                }
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
