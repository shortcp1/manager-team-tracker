import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Building, Plus, Search, Eye, Edit, Pause, Play, Trash2 } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertFirmSchema, type InsertFirm } from "@shared/schema";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { formatDistanceToNow } from "date-fns";

export default function Firms() {
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: firms, isLoading } = useQuery({
    queryKey: ["/api/firms"],
  });

  const form = useForm<InsertFirm>({
    resolver: zodResolver(insertFirmSchema),
    defaultValues: {
      name: "",
      url: "",
      teamPageUrl: "",
      type: "Venture Capital",
      status: "active",
    },
  });

  const addFirmMutation = useMutation({
    mutationFn: (data: InsertFirm) => apiRequest("POST", "/api/firms", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/firms"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
      setIsAddDialogOpen(false);
      form.reset();
      toast({
        title: "Firm Added",
        description: "The firm has been added successfully.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to add firm. Please try again.",
        variant: "destructive",
      });
    },
  });

  const updateFirmMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<InsertFirm> }) => 
      apiRequest("PUT", `/api/firms/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/firms"] });
      toast({
        title: "Firm Updated",
        description: "The firm status has been updated.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update firm status.",
        variant: "destructive",
      });
    },
  });

  const deleteFirmMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/firms/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/firms"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
      toast({
        title: "Firm Deleted",
        description: "The firm has been removed.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to delete firm.",
        variant: "destructive",
      });
    },
  });

  const scrapeFirmMutation = useMutation({
    mutationFn: (id: string) => apiRequest("POST", `/api/scrape/firm/${id}`),
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/firms"] });
      toast({
        title: "Scrape Completed",
        description: `Found ${data.membersFound} members, ${data.changesDetected} changes detected.`,
      });
    },
    onError: () => {
      toast({
        title: "Scrape Failed",
        description: "Failed to scrape firm. Please check the configuration.",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: InsertFirm) => {
    addFirmMutation.mutate(data);
  };

  const toggleFirmStatus = (firm: any) => {
    const newStatus = firm.status === "active" ? "paused" : "active";
    updateFirmMutation.mutate({ id: firm.id, data: { status: newStatus } });
  };

  const filteredFirms = (firms as any[] || []).filter((firm: any) => {
    const matchesSearch = firm.name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesType = typeFilter === "all" || firm.type === typeFilter;
    const matchesStatus = statusFilter === "all" || firm.status === statusFilter;
    
    return matchesSearch && matchesType && matchesStatus;
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
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg font-semibold text-gray-900">Monitored Firms</CardTitle>
              <p className="text-sm text-gray-500">Manage firms to monitor for team changes</p>
            </div>
            <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
              <DialogTrigger asChild>
                <Button className="bg-primary hover:bg-primary-dark text-white">
                  <Plus className="w-4 h-4 mr-2" />
                  Add Firm
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[500px]">
                <DialogHeader>
                  <DialogTitle>Add New Firm</DialogTitle>
                </DialogHeader>
                <Form {...form}>
                  <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                    <FormField
                      control={form.control}
                      name="name"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Firm Name</FormLabel>
                          <FormControl>
                            <Input placeholder="e.g., Sequoia Capital" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="url"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Website URL</FormLabel>
                          <FormControl>
                            <Input placeholder="https://sequoiacap.com" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="teamPageUrl"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Team Page URL</FormLabel>
                          <FormControl>
                            <Input placeholder="https://sequoiacap.com/team" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="type"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Type</FormLabel>
                          <Select onValueChange={field.onChange} defaultValue={field.value}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Select type" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="Venture Capital">Venture Capital</SelectItem>
                              <SelectItem value="Private Equity">Private Equity</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <div className="flex justify-end space-x-2 pt-4">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setIsAddDialogOpen(false)}
                      >
                        Cancel
                      </Button>
                      <Button type="submit" disabled={addFirmMutation.isPending}>
                        {addFirmMutation.isPending ? "Adding..." : "Add Firm"}
                      </Button>
                    </div>
                  </form>
                </Form>
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>
        
        {/* Filters */}
        <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
              <Input
                placeholder="Search firms..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-full sm:w-auto">
                <SelectValue placeholder="All Types" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="Venture Capital">Venture Capital</SelectItem>
                <SelectItem value="Private Equity">Private Equity</SelectItem>
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full sm:w-auto">
                <SelectValue placeholder="All Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="paused">Paused</SelectItem>
                <SelectItem value="error">Error</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        
        <CardContent>
          {filteredFirms.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="border-b border-gray-200">
                  <tr>
                    <th className="text-left py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Firm</th>
                    <th className="text-left py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Type</th>
                    <th className="text-left py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Team Size</th>
                    <th className="text-left py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Last Updated</th>
                    <th className="text-left py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                    <th className="text-left py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {filteredFirms.map((firm: any) => (
                    <tr key={firm.id} className="hover:bg-gray-50">
                      <td className="py-4">
                        <div className="flex items-center">
                          <div className="w-10 h-10 bg-gray-200 rounded-lg flex items-center justify-center">
                            <Building className="w-5 h-5 text-gray-500" />
                          </div>
                          <div className="ml-4">
                            <p className="text-sm font-medium text-gray-900">{firm.name}</p>
                            <p className="text-sm text-gray-500">{new URL(firm.url).hostname}</p>
                          </div>
                        </div>
                      </td>
                      <td className="py-4">
                        <Badge className={firm.type === "Venture Capital" ? "firm-type-vc" : "firm-type-pe"}>
                          {firm.type}
                        </Badge>
                      </td>
                      <td className="py-4 text-sm text-gray-900">{firm.teamSize || 0}</td>
                      <td className="py-4 text-sm text-gray-500">
                        {firm.lastScraped 
                          ? formatDistanceToNow(new Date(firm.lastScraped), { addSuffix: true })
                          : 'Never'
                        }
                      </td>
                      <td className="py-4">
                        <Badge className={`status-${firm.status}`}>
                          {firm.status.charAt(0).toUpperCase() + firm.status.slice(1)}
                        </Badge>
                      </td>
                      <td className="py-4">
                        <div className="flex items-center space-x-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => scrapeFirmMutation.mutate(firm.id)}
                            disabled={scrapeFirmMutation.isPending}
                            className="text-primary hover:text-primary-dark"
                          >
                            <Eye className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-gray-400 hover:text-gray-600"
                          >
                            <Edit className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => toggleFirmStatus(firm)}
                            disabled={updateFirmMutation.isPending}
                            className="text-gray-400 hover:text-gray-600"
                          >
                            {firm.status === "active" ? (
                              <Pause className="w-4 h-4" />
                            ) : (
                              <Play className="w-4 h-4" />
                            )}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => deleteFirmMutation.mutate(firm.id)}
                            disabled={deleteFirmMutation.isPending}
                            className="text-gray-400 hover:text-red-600"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-center py-8">
              <Building className="mx-auto h-12 w-12 text-gray-400" />
              <h3 className="mt-2 text-sm font-medium text-gray-900">No firms</h3>
              <p className="mt-1 text-sm text-gray-500">Get started by adding a new firm to monitor.</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
