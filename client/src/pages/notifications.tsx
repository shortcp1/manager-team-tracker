import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Bell, Check, Clock, AlertCircle } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

export default function Notifications() {
  const { data: recentChanges, isLoading: changesLoading } = useQuery({
    queryKey: ["/api/changes/recent", { days: 30 }],
  });

  const { data: scrapes, isLoading: scrapesLoading } = useQuery({
    queryKey: ["/api/scrapes", { limit: 10 }],
  });

  const isLoading = changesLoading || scrapesLoading;

  // Group notifications by type and date
  const notifications = [];

  // Add change notifications
  if (recentChanges) {
    recentChanges.forEach((change: any) => {
      notifications.push({
        id: `change-${change.id}`,
        type: 'change',
        title: `Team change detected at ${change.firmName}`,
        description: `${change.memberName} was ${change.changeType}${change.memberTitle ? ` as ${change.memberTitle}` : ''}`,
        timestamp: new Date(change.detectedAt),
        status: change.emailSent ? 'sent' : 'pending',
        changeType: change.changeType,
        firmName: change.firmName,
      });
    });
  }

  // Add scrape notifications (only errors or significant events)
  if (scrapes) {
    scrapes.forEach((scrape: any) => {
      if (scrape.status === 'error' || scrape.changesDetected > 0) {
        notifications.push({
          id: `scrape-${scrape.id}`,
          type: 'scrape',
          title: scrape.status === 'error' 
            ? `Scrape failed for ${scrape.firmName}`
            : `Scrape completed for ${scrape.firmName}`,
          description: scrape.status === 'error'
            ? scrape.errorMessage || 'Unknown error occurred'
            : `Found ${scrape.membersFound} members, ${scrape.changesDetected} changes detected`,
          timestamp: new Date(scrape.scrapedAt),
          status: scrape.status,
          firmName: scrape.firmName,
        });
      }
    });
  }

  // Sort notifications by timestamp (newest first)
  notifications.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

  const getNotificationIcon = (notification: any) => {
    if (notification.type === 'change') {
      return <Bell className="w-5 h-5 text-primary" />;
    } else if (notification.status === 'error') {
      return <AlertCircle className="w-5 h-5 text-error" />;
    } else {
      return <Check className="w-5 h-5 text-secondary" />;
    }
  };

  const getNotificationBgColor = (notification: any) => {
    if (notification.type === 'change') {
      return 'bg-blue-50 border-blue-200';
    } else if (notification.status === 'error') {
      return 'bg-red-50 border-red-200';
    } else {
      return 'bg-green-50 border-green-200';
    }
  };

  const getChangeTypeColor = (changeType: string) => {
    switch (changeType) {
      case 'added':
        return 'bg-green-100 text-green-800';
      case 'removed':
        return 'bg-red-100 text-red-800';
      case 'updated':
        return 'bg-blue-100 text-blue-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
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
            <CardTitle className="text-lg font-semibold text-gray-900">Notifications</CardTitle>
            <p className="text-sm text-gray-500">Recent system events and team changes</p>
          </div>
        </CardHeader>
        
        <CardContent>
          {notifications.length > 0 ? (
            <div className="space-y-4">
              {notifications.map((notification: any) => (
                <div
                  key={notification.id}
                  className={`flex items-start space-x-4 p-4 border rounded-lg transition-colors hover:bg-gray-50 ${getNotificationBgColor(notification)}`}
                >
                  <div className="flex-shrink-0 mt-1">
                    {getNotificationIcon(notification)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <p className="font-medium text-gray-900">{notification.title}</p>
                        <p className="text-sm text-gray-600 mt-1">{notification.description}</p>
                        
                        <div className="flex items-center space-x-2 mt-2">
                          <Badge variant="outline" className="text-xs">
                            {notification.firmName}
                          </Badge>
                          
                          {notification.changeType && (
                            <Badge className={`text-xs ${getChangeTypeColor(notification.changeType)}`}>
                              {notification.changeType.charAt(0).toUpperCase() + notification.changeType.slice(1)}
                            </Badge>
                          )}
                          
                          {notification.type === 'change' && (
                            <Badge 
                              variant="outline" 
                              className={`text-xs ${
                                notification.status === 'sent' 
                                  ? 'border-green-500 text-green-700' 
                                  : 'border-yellow-500 text-yellow-700'
                              }`}
                            >
                              {notification.status === 'sent' ? (
                                <>
                                  <Check className="w-3 h-3 mr-1" />
                                  Email Sent
                                </>
                              ) : (
                                <>
                                  <Clock className="w-3 h-3 mr-1" />
                                  Pending
                                </>
                              )}
                            </Badge>
                          )}
                          
                          {notification.status === 'error' && (
                            <Badge className="bg-red-100 text-red-800 text-xs">
                              Error
                            </Badge>
                          )}
                        </div>
                      </div>
                      
                      <div className="text-right text-xs text-gray-400 ml-4">
                        <p>{formatDistanceToNow(notification.timestamp, { addSuffix: true })}</p>
                        <p>{notification.timestamp.toLocaleDateString()}</p>
                        <p>{notification.timestamp.toLocaleTimeString()}</p>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8">
              <Bell className="mx-auto h-12 w-12 text-gray-400" />
              <h3 className="mt-2 text-sm font-medium text-gray-900">No notifications</h3>
              <p className="mt-1 text-sm text-gray-500">
                You're all caught up! No recent system events or changes to report.
              </p>
            </div>
          )}
        </CardContent>
      </Card>
      
      {/* Email Notification Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="border border-gray-200">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-500">Total Notifications</p>
                <p className="text-2xl font-semibold text-gray-900">{notifications.length}</p>
              </div>
              <Bell className="h-8 w-8 text-gray-400" />
            </div>
          </CardContent>
        </Card>
        
        <Card className="border border-gray-200">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-500">Emails Sent</p>
                <p className="text-2xl font-semibold text-gray-900">
                  {notifications.filter(n => n.type === 'change' && n.status === 'sent').length}
                </p>
              </div>
              <Check className="h-8 w-8 text-secondary" />
            </div>
          </CardContent>
        </Card>
        
        <Card className="border border-gray-200">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-500">Pending Emails</p>
                <p className="text-2xl font-semibold text-gray-900">
                  {notifications.filter(n => n.type === 'change' && n.status === 'pending').length}
                </p>
              </div>
              <Clock className="h-8 w-8 text-warning" />
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
