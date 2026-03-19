import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FileText } from "lucide-react";

interface PolicyNamesProps {
  policyNames: string[];
}

export function PolicyNames({ policyNames }: PolicyNamesProps) {
  if (!policyNames || policyNames.length === 0) {
    return null;
  }

  return (
    <Card className="border-blue-200 bg-blue-50">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <FileText className="size-5 text-blue-600" />
          <CardTitle className="text-sm">הפוליסות בסריקה</CardTitle>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap gap-2">
          {policyNames.map((name, index) => (
            <Badge key={index} variant="secondary" className="text-xs">
              {name}
            </Badge>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
