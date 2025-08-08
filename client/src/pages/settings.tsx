import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Settings as SettingsIcon, Mail, Plus, X, Save, Bell, Clock } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertEmailSettingsSchema, type InsertEmailSettings } from "@shared/schema";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

export default function Settings() {
  const [newRecipient, setNewRecipient] = useState("");
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: emailSettings, isLoading } = useQuery({
    queryKey: ["/api/settings/email"],
  });

  const form = useForm<InsertEmailSettings>({
    resolver: zodResolver(insertEmailSettingsSchema),
    values: emailSettings || { recipients: [], enabled: true },
  });

  const updateEmailSettingsMutation = useMutation({
    mutationFn: (data: InsertEmailSettings) => apiRequest("PUT", "/api/settings/email", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings/email"] });
      toast({
        title: "Settings Updated",
        description: "Email notification settings have been saved.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update settings. Please try again.",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: InsertEmailSettings) => {
    updateEmailSettingsMutation.mutate(data);
  };

  const addRecipient = () => {
    if (newRecipient && newRecipient.includes('@')) {
      const currentRecipients = form.getValues('recipients') || [];
      if (!currentRecipients.includes(newRecipient)) {
        form.setValue('recipients', [...currentRecipients, newRecipient]);
        setNewRecipient("");
      }
    }
  };

  const removeRecipient = (email: string) => {
    const currentRecipients = form.getValues('recipients') || [];
    form.setValue('recipients', currentRecipients.filter(r => r !== email));
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addRecipient();
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
      {/* Email Notification Settings */}
      <Card className="border border-gray-200">
        <CardHeader>
          <div className="flex items-center space-x-2">
            <Mail className="w-5 h-5 text-primary" />
            <div>
              <CardTitle className="text-lg font-semibold text-gray-900">Email Notifications</CardTitle>
              <p className="text-sm text-gray-500">Configure email alerts for team changes</p>
            </div>
          </div>
        </CardHeader>
        
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              {/* Enable/Disable Notifications */}
              <FormField
                control={form.control}
                name="enabled"
                render={({ field }) => (
                  <FormItem className="flex items-center justify-between rounded-lg border p-4">
                    <div className="space-y-0.5">
                      <FormLabel className="text-base">
                        Enable Email Notifications
                      </FormLabel>
                      <div className="text-sm text-gray-500">
                        Receive email alerts when team changes are detected
                      </div>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />

              {/* Recipients List */}
              <div className="space-y-4">
                <Label className="text-sm font-medium">Email Recipients</Label>
                
                {/* Add New Recipient */}
                <div className="flex space-x-2">
                  <Input
                    placeholder="Enter email address..."
                    value={newRecipient}
                    onChange={(e) => setNewRecipient(e.target.value)}
                    onKeyPress={handleKeyPress}
                    type="email"
                    className="flex-1"
                  />
                  <Button
                    type="button"
                    onClick={addRecipient}
                    variant="outline"
                    disabled={!newRecipient || !newRecipient.includes('@')}
                  >
                    <Plus className="w-4 h-4" />
                  </Button>
                </div>

                {/* Current Recipients */}
                {form.watch('recipients') && form.watch('recipients').length > 0 ? (
                  <div className="space-y-2">
                    <p className="text-sm text-gray-600">Current recipients:</p>
                    <div className="flex flex-wrap gap-2">
                      {form.watch('recipients').map((email: string) => (
                        <Badge key={email} variant="secondary" className="flex items-center space-x-2">
                          <span>{email}</span>
                          <button
                            type="button"
                            onClick={() => removeRecipient(email)}
                            className="ml-2 hover:text-red-600"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </Badge>
                      ))}
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-gray-500 italic">No recipients configured</p>
                )}
              </div>

              {/* Save Button */}
              <div className="flex justify-end pt-4 border-t">
                <Button 
                  type="submit" 
                  disabled={updateEmailSettingsMutation.isPending}
                  className="bg-primary hover:bg-primary-dark text-white"
                >
                  <Save className="w-4 h-4 mr-2" />
                  {updateEmailSettingsMutation.isPending ? "Saving..." : "Save Settings"}
                </Button>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>

      {/* Scraping Schedule Settings */}
      <Card className="border border-gray-200">
        <CardHeader>
          <div className="flex items-center space-x-2">
            <Clock className="w-5 h-5 text-primary" />
            <div>
              <CardTitle className="text-lg font-semibold text-gray-900">Scraping Schedule</CardTitle>
              <p className="text-sm text-gray-500">Configure when the scraper runs</p>
            </div>
          </div>
        </CardHeader>
        
        <CardContent>
          <div className="space-y-4">
            <div className="flex items-center justify-between p-4 border rounded-lg">
              <div>
                <p className="font-medium text-gray-900">Weekly Schedule</p>
                <p className="text-sm text-gray-500">Runs every Monday at 2:00 AM EST</p>
              </div>
              <Badge className="bg-green-100 text-green-800">Active</Badge>
            </div>
            
            <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
              <p className="text-sm text-blue-800">
                <strong>Note:</strong> The scraping schedule is currently fixed to run weekly on Mondays at 2:00 AM EST. 
                This ensures minimal impact on target websites and compliance with respectful scraping practices.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* System Information */}
      <Card className="border border-gray-200">
        <CardHeader>
          <div className="flex items-center space-x-2">
            <SettingsIcon className="w-5 h-5 text-primary" />
            <div>
              <CardTitle className="text-lg font-semibold text-gray-900">System Information</CardTitle>
              <p className="text-sm text-gray-500">Application configuration and status</p>
            </div>
          </div>
        </CardHeader>
        
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 border rounded-lg">
              <p className="font-medium text-gray-900">Application Version</p>
              <p className="text-sm text-gray-500">v1.0.0</p>
            </div>
            
            <div className="p-4 border rounded-lg">
              <p className="font-medium text-gray-900">Database Status</p>
              <div className="flex items-center space-x-2 mt-1">
                <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                <p className="text-sm text-gray-500">Connected</p>
              </div>
            </div>
            
            <div className="p-4 border rounded-lg">
              <p className="font-medium text-gray-900">Scraper Service</p>
              <div className="flex items-center space-x-2 mt-1">
                <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                <p className="text-sm text-gray-500">Running</p>
              </div>
            </div>
            
            <div className="p-4 border rounded-lg">
              <p className="font-medium text-gray-900">Email Service</p>
              <div className="flex items-center space-x-2 mt-1">
                <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                <p className="text-sm text-gray-500">
                  {emailSettings?.enabled ? "Enabled" : "Disabled"}
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Email Configuration Help */}
      <Card className="border border-gray-200">
        <CardHeader>
          <div className="flex items-center space-x-2">
            <Bell className="w-5 h-5 text-primary" />
            <div>
              <CardTitle className="text-lg font-semibold text-gray-900">Email Configuration</CardTitle>
              <p className="text-sm text-gray-500">Environment variables for email setup</p>
            </div>
          </div>
        </CardHeader>
        
        <CardContent>
          <div className="bg-gray-50 p-4 rounded-lg">
            <p className="text-sm text-gray-700 mb-3">
              To configure email notifications, set these environment variables:
            </p>
            <div className="space-y-2 text-sm font-mono text-gray-600">
              <div>SMTP_HOST=smtp.gmail.com</div>
              <div>SMTP_PORT=587</div>
              <div>SMTP_USER=your-email@gmail.com</div>
              <div>SMTP_PASS=your-app-password</div>
              <div>SMTP_FROM=noreply@teammonitor.com</div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
