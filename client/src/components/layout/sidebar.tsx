import { Link, useLocation } from "wouter";
import { Home, Building, Users, History, Bell, Settings } from "lucide-react";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

const navigation = [
  { name: "Dashboard", href: "/", icon: Home },
  { name: "Firms", href: "/firms", icon: Building },
  { name: "Team Members", href: "/team-members", icon: Users },
  { name: "Change History", href: "/change-history", icon: History },
  { name: "Notifications", href: "/notifications", icon: Bell },
  { name: "Settings", href: "/settings", icon: Settings },
];

export function Sidebar({ isOpen, onClose }: SidebarProps) {
  const [location] = useLocation();
  const isMobile = useIsMobile();

  return (
    <div
      className={cn(
        "bg-white w-64 shadow-lg flex-shrink-0 sidebar-transition",
        isMobile && !isOpen && "mobile-sidebar-hidden",
        isMobile ? "fixed left-0 top-0 h-full z-50" : "relative"
      )}
    >
      <div className="p-6">
        <div className="flex items-center space-x-3 mb-8">
          <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
            <History className="text-white w-4 h-4" />
          </div>
          <h1 className="text-xl font-semibold text-gray-900">Team Monitor</h1>
        </div>
        
        <nav className="space-y-2">
          {navigation.map((item) => {
            const isActive = location === item.href;
            return (
              <Link key={item.name} href={item.href}>
                <a
                  onClick={isMobile ? onClose : undefined}
                  className={cn(
                    "flex items-center space-x-3 px-4 py-3 rounded-lg transition-colors",
                    isActive
                      ? "text-primary bg-blue-50"
                      : "text-gray-700 hover:bg-gray-100"
                  )}
                >
                  <item.icon className="w-5 h-5" />
                  <span className={isActive ? "font-medium" : ""}>
                    {item.name}
                  </span>
                </a>
              </Link>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
