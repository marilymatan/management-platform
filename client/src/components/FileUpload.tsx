import { useCallback, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { Upload, FileText, X, Loader2, CheckCircle2, AlertCircle, Camera } from "lucide-react";
import type { UploadedFile, FileStatus } from "@shared/insurance";

interface FileUploadProps {
  files: UploadedFile[];
  onFilesSelected: (files: File[]) => void;
  onRemoveFile: (id: string) => void;
  onAnalyze: () => void;
  isUploading: boolean;
  isProcessing: boolean;
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
    case "queued":
      return <CheckCircle2 className="size-5 text-success" />;
    case "processing":
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
    case "queued": return "בתור לעיבוד";
    case "processing": return "בעיבוד";
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
  isProcessing,
  hasResults,
}: FileUploadProps) {
  const [isDragOver, setIsDragOver] = useState(false);

  function isSupportedFile(file: File) {
    return file.type === "application/pdf" || file.type.startsWith("image/");
  }

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
      (file) => isSupportedFile(file)
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

  const canAnalyze = files.length > 0 && !isUploading && !isProcessing && !hasResults;

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
          isUploading && "pointer-events-none opacity-60"
        )}
        data-testid="policy-upload-dropzone"
        onClick={() => document.getElementById("file-input")?.click()}
      >
        <input
          id="file-input"
          type="file"
          accept=".pdf,image/*"
          multiple
          onChange={handleFileInput}
          className="hidden"
        />
        <input
          id="camera-input"
          type="file"
          accept="image/*"
          capture="environment"
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
              גרור קובץ PDF או צילום מסמך לכאן
            </p>
            <p className="text-sm text-muted-foreground mt-1">
              או לחץ לבחירת קבצים · אפשר גם לצלם מסמך ישירות מהנייד
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Button variant="outline" onClick={() => document.getElementById("file-input")?.click()} className="gap-2">
          <Upload className="size-4" />
          בחר קובץ PDF או תמונה
        </Button>
        <Button variant="outline" onClick={() => document.getElementById("camera-input")?.click()} className="gap-2">
          <Camera className="size-4" />
          צלם מסמך עכשיו
        </Button>
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
                {file.status === "pending" && !isUploading && !isProcessing && (
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
          data-testid="policy-upload-submit"
        >
          {isUploading ? (
            <><Loader2 className="size-5 animate-spin" /> מעלה קבצים...</>
          ) : isProcessing ? (
            <><Loader2 className="size-5 animate-spin" /> שולח לעיבוד...</>
          ) : hasResults ? (
            <><CheckCircle2 className="size-5" /> הסריקה הושלמה</>
          ) : (
            <><Upload className="size-5" /> העלה פוליסות לעיבוד</>
          )}
        </Button>
      )}
    </div>
  );
}
