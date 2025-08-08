import { Card, CardContent } from "@/components/ui/card";
import { LucideIcon } from "lucide-react";

interface StatsCardProps {
  title: string;
  value: string | number;
  icon: LucideIcon;
  iconColor: string;
  iconBg: string;
}

export function StatsCard({ title, value, icon: Icon, iconColor, iconBg }: StatsCardProps) {
  return (
    <Card className="border border-gray-200">
      <CardContent className="pt-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-gray-500">{title}</p>
            <p className="text-3xl font-semibold text-gray-900">{value}</p>
          </div>
          <div className={`w-12 h-12 ${iconBg} rounded-lg flex items-center justify-center`}>
            <Icon className={`${iconColor} w-6 h-6`} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
