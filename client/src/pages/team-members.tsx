import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Users, Search, User } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

export default function TeamMembers() {
  const [searchQuery, setSearchQuery] = useState("");
  const [firmFilter, setFirmFilter] = useState("all");

  const { data: members, isLoading } = useQuery({
    queryKey: ["/api/members"],
  });

  const { data: firms } = useQuery({
    queryKey: ["/api/firms"],
  });

  const filteredMembers = (members as any[] || []).filter((member: any) => {
    const matchesSearch = 
      member.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (member.title && member.title.toLowerCase().includes(searchQuery.toLowerCase()));
    const matchesFirm = firmFilter === "all" || member.firmName === firmFilter;
    
    return matchesSearch && matchesFirm;
  }) || [];

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
            <CardTitle className="text-lg font-semibold text-gray-900">Team Members</CardTitle>
            <p className="text-sm text-gray-500">All team members across monitored firms</p>
          </div>
        </CardHeader>
        
        {/* Filters */}
        <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
              <Input
                placeholder="Search members..."
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
          </div>
        </div>
        
        <CardContent>
          {filteredMembers.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredMembers.map((member: any) => (
                <div key={member.id} className="border border-gray-200 rounded-lg p-4 hover:shadow-sm transition-shadow">
                  <div className="flex items-start space-x-4">
                    <Avatar className="h-12 w-12">
                      <AvatarImage src={member.imageUrl} alt={member.name} />
                      <AvatarFallback>
                        <User className="h-6 w-6" />
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <h3 className="text-sm font-medium text-gray-900 truncate">
                        {member.name}
                      </h3>
                      {member.title && (
                        <p className="text-sm text-gray-600 truncate">
                          {member.title}
                        </p>
                      )}
                      <div className="flex items-center space-x-2 mt-2">
                        <Badge className={member.firmType === "Venture Capital" ? "firm-type-vc" : "firm-type-pe"}>
                          {member.firmName}
                        </Badge>
                      </div>
                      {member.focusAreas && member.focusAreas.length > 0 && (
                        <div className="mt-3">
                          <p className="text-xs text-gray-500 mb-1">Focus Areas:</p>
                          <div className="flex flex-wrap gap-1">
                            {member.focusAreas.slice(0, 3).map((area: string, index: number) => (
                              <span
                                key={index}
                                className="inline-flex items-center px-2 py-1 rounded-full text-xs bg-gray-100 text-gray-800"
                              >
                                {area}
                              </span>
                            ))}
                            {member.focusAreas.length > 3 && (
                              <span className="text-xs text-gray-500">
                                +{member.focusAreas.length - 3} more
                              </span>
                            )}
                          </div>
                        </div>
                      )}
                      {member.bio && (
                        <p className="text-xs text-gray-500 mt-3 line-clamp-3">
                          {member.bio}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8">
              <Users className="mx-auto h-12 w-12 text-gray-400" />
              <h3 className="mt-2 text-sm font-medium text-gray-900">No team members</h3>
              <p className="mt-1 text-sm text-gray-500">
                {searchQuery || firmFilter !== "all" 
                  ? "No members match your search criteria."
                  : "Add firms to start monitoring team members."
                }
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
