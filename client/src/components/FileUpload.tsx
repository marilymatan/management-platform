import { useCallback, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { Upload, FileText, X, Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import type { UploadedFile, FileStatus } from "@shared/insurance";

interface FileUploadProps {
  files: UploadedFile[];
  onFilesSelected: (files: File[]) => void;
  onRemoveFile: (id: string) => void;
  onAnalyze: () => void;
  isUploading: boolean;
  isAnalyzing: boolean;
  hasResults: boolean;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getStatusIcon(status: FileStatus) {
  switch (status) {
    case "pending":
      return <FileText className="size-5 text-muted-foreground" />;
    case "uploading":
      return <Loader2 className="size-5 text-primary animate-spin" />;
    case "uploaded":
      return <CheckCircle2 className="size-5 text-success" />;
    case "analyzing":
      return <Loader2 className="size-5 text-primary animate-spin" />;
    case "done":
      return <CheckCircle2 className="size-5 text-success" />;
    case "error":
      return <AlertCircle className="size-5 text-destructive" />;
  }
}

function getStatusText(status: FileStatus): string {
  switch (status) {
    case "pending": return "ממתין";
    case "uploading": return "מעלה...";
    case "uploaded": return "הועלה";
    case "analyzing": return "סורק...";
    case "done": return "הושלם";
    case "error": return "שגיאה";
  }
}

export function FileUpload({
  files,
  onFilesSelected,
  onRemoveFile,
  onAnalyze,
  isUploading,
  isAnalyzing,
  hasResults,
}: FileUploadProps) {
  const [isDragOver, setIsDragOver] = useState(false);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    const droppedFiles = Array.from(e.dataTransfer.files).filter(
      f => f.type === "application/pdf"
    );
    if (droppedFiles.length > 0) {
      onFilesSelected(droppedFiles);
    }
  }, [onFilesSelected]);

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(e.target.files || []);
    if (selectedFiles.length > 0) {
      onFilesSelected(selectedFiles);
    }
    e.target.value = "";
  }, [onFilesSelected]);

  const canAnalyze = files.length > 0 && !isUploading && !isAnalyzing && !hasResults;

  return (
    <div className="space-y-4">
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={cn(
          "relative border-2 border-dashed rounded-xl p-10 text-center transition-all duration-300 cursor-pointer group bg-card",
          isDragOver
            ? "border-primary bg-primary/5 scale-[1.01] shadow-lg"
            : "border-border hover:border-primary/40 hover:bg-muted/20 hover:shadow-sm",
          (isUploading || isAnalyzing) && "pointer-events-none opacity-60"
        )}
        onClick={() => document.getElementById("file-input")?.click()}
      >
        <input
          id="file-input"
          type="file"
          accept=".pdf"
          multiple
          onChange={handleFileInput}
          className="hidden"
        />
        <div className="flex flex-col items-center gap-3">
          <div className={cn(
            "rounded-2xl p-4 transition-all duration-300",
            isDragOver ? "bg-primary/15 scale-110" : "bg-primary/8 group-hover:bg-primary/12"
          )}>
            <Upload className="size-8 text-primary" />
          </div>
          <div>
            <p className="text-base font-semibold text-foreground">
              גרור קבצי PDF לכאן
            </p>
            <p className="text-sm text-muted-foreground mt-1">
              או לחץ לבחירת קבצים · קבצי PDF של פוליסות ביטוח
            </p>
          </div>
        </div>
      </div>

      {files.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-xs font-medium text-muted-foreground">
            קבצים שנבחרו ({files.length})
          </h3>
          <div className="space-y-1.5">
            {files.map(file => (
              <Card key={file.id} className="flex items-center gap-3 p-3 bg-card">
                {getStatusIcon(file.status)}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{file.name}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {formatFileSize(file.size)} · {getStatusText(file.status)}
                  </p>
                  {file.error && (
                    <p className="text-[11px] text-destructive mt-0.5">{file.error}</p>
                  )}
                </div>
                {file.status === "pending" && !isUploading && !isAnalyzing && (
                  <button
                    onClick={(e) => { e.stopPropagation(); onRemoveFile(file.id); }}
                    className="p-1.5 rounded-lg hover:bg-muted transition-colors"
                  >
                    <X className="size-4 text-muted-foreground" />
                  </button>
                )}
              </Card>
            ))}
          </div>
        </div>
      )}

      {files.length > 0 && (
        <Button
          onClick={onAnalyze}
          disabled={!canAnalyze}
          size="lg"
          className="w-full text-base font-semibold gap-2 h-12 shadow-md"
        >
          {isUploading ? (
            <><Loader2 className="size-5 animate-spin" /> מעלה קבצים...</>
          ) : isAnalyzing ? (
            <><Loader2 className="size-5 animate-spin" /> סורק פוליסות...</>
          ) : hasResults ? (
            <><CheckCircle2 className="size-5" /> הסריקה הושלמה</>
          ) : (
            <><Upload className="size-5" /> העלה וסרוק פוליסות</>
          )}
        </Button>
      )}
    </div>
  );
}
