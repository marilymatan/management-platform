import { Badge } from "@/components/ui/badge";
import { X } from "lucide-react";

interface FileFilterProps {
  fileNames: string[];
  selectedFile: string | null;
  onSelectFile: (fileName: string | null) => void;
}

export function FileFilter({ fileNames, selectedFile, onSelectFile }: FileFilterProps) {
  if (fileNames.length === 0) return null;

  return (
    <div className="mb-6 p-4 bg-slate-50 rounded-lg border border-slate-200">
      <p className="text-sm font-medium text-foreground mb-3 text-right" dir="rtl">
        סנן לפי קובץ:
      </p>
      <div className="flex flex-wrap gap-2 justify-end" dir="rtl">
        {/* "All Files" option */}
        <Badge
          variant={selectedFile === null ? "default" : "outline"}
          className="cursor-pointer hover:bg-slate-200 transition-colors"
          onClick={() => onSelectFile(null)}
        >
          כל הקבצים
        </Badge>

        {/* File badges */}
        {fileNames.map((fileName) => (
          <Badge
            key={fileName}
            variant={selectedFile === fileName ? "default" : "outline"}
            className="cursor-pointer hover:bg-slate-200 transition-colors flex items-center gap-1.5"
            onClick={() => onSelectFile(fileName)}
          >
            📄 {fileName}
            {selectedFile === fileName && (
              <X className="size-3" />
            )}
          </Badge>
        ))}
      </div>
    </div>
  );
}
