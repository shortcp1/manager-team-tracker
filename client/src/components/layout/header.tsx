import { Menu, Play, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useIsMobile } from "@/hooks/use-mobile";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface HeaderProps {
  onMenuClick: () => void;
}

export function Header({ onMenuClick }: HeaderProps) {
  const isMobile = useIsMobile();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const runScraperMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/scrape/run"),
    onSuccess: () => {
      toast({
        title: "Scraper Started",
        description: "The scraping job has been started successfully.",
      });
      // Invalidate stats to refresh dashboard
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Failed to start scraping job. Please try again.",
        variant: "destructive",
      });
    },
  });

  return (
    <header className="bg-white shadow-sm border-b border-gray-200 px-6 py-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          {isMobile && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onMenuClick}
              className="p-2"
            >
              <Menu className="h-5 w-5 text-gray-600" />
            </Button>
          )}
          <div>
            <h2 className="text-2xl font-semibold text-gray-900">Dashboard</h2>
            <p className="text-sm text-gray-500">Monitor team changes across PE/VC firms</p>
          </div>
        </div>
        
        <div className="flex items-center space-x-4">
          <Button 
            onClick={() => runScraperMutation.mutate()}
            disabled={runScraperMutation.isPending}
            className="bg-primary hover:bg-primary-dark text-white"
          >
            <Play className="w-4 h-4 mr-2" />
            {runScraperMutation.isPending ? "Running..." : "Run Scraper"}
          </Button>
          
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 bg-gray-300 rounded-full flex items-center justify-center">
              <User className="w-4 h-4 text-gray-600" />
            </div>
            <span className="text-sm font-medium text-gray-700">Admin User</span>
          </div>
        </div>
      </div>
    </header>
  );
}
