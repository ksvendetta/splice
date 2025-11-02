import { useState, useRef } from "react";
import { createWorker } from "tesseract.js";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { Camera, Upload, Copy, CheckCircle2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cleanOcrText } from "@/lib/circuitIdUtils";

interface OcrDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onTextExtracted: (text: string) => void;
}

export function OcrDialog({ open, onOpenChange, onTextExtracted }: OcrDialogProps) {
  const { toast } = useToast();
  const [selectedImage, setSelectedImage] = useState<string>("");
  const [extractedText, setExtractedText] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [copied, setCopied] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onloadend = () => {
      setSelectedImage(reader.result as string);
      setExtractedText("");
    };
    reader.readAsDataURL(file);
  };

  const handlePaste = async () => {
    try {
      const items = await navigator.clipboard.read();
      for (const item of items) {
        for (const type of item.types) {
          if (type.startsWith('image/')) {
            const blob = await item.getType(type);
            const reader = new FileReader();
            reader.onloadend = () => {
              setSelectedImage(reader.result as string);
              setExtractedText("");
              toast({ title: "Image pasted from clipboard" });
            };
            reader.readAsDataURL(blob);
            return;
          }
        }
      }
      toast({ 
        title: "No image found in clipboard", 
        description: "Take a screenshot (Windows: Win+Shift+S, Mac: Cmd+Shift+4) and try again",
        variant: "destructive" 
      });
    } catch (error) {
      toast({ 
        title: "Clipboard access failed", 
        description: "Please upload an image file instead",
        variant: "destructive" 
      });
    }
  };

  const performOCR = async () => {
    if (!selectedImage) return;

    setIsProcessing(true);
    setProgress(0);
    setExtractedText("");

    try {
      const worker = await createWorker('eng', 1, {
        logger: (m) => {
          if (m.status === 'recognizing text') {
            setProgress(Math.round(m.progress * 100));
          }
        },
      });

      const { data: { text } } = await worker.recognize(selectedImage);
      
      // Clean the OCR text using the circuit ID cleaning function
      const cleanedText = cleanOcrText(text);
      
      setExtractedText(cleanedText);
      
      await worker.terminate();
      
      toast({ title: "Text extracted successfully" });
    } catch (error) {
      toast({ 
        title: "Failed to process image", 
        description: "Please try a clearer image",
        variant: "destructive" 
      });
    } finally {
      setIsProcessing(false);
      setProgress(0);
    }
  };

  const handleCopyText = () => {
    navigator.clipboard.writeText(extractedText);
    setCopied(true);
    toast({ title: "Text copied to clipboard" });
    setTimeout(() => setCopied(false), 2000);
  };

  const handleUseText = () => {
    if (extractedText.trim()) {
      onTextExtracted(extractedText);
      onOpenChange(false);
      // Reset state
      setSelectedImage("");
      setExtractedText("");
      toast({ title: "Text added to Circuit IDs" });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" data-testid="dialog-ocr">
        <DialogHeader>
          <DialogTitle>Extract Circuit IDs from Image</DialogTitle>
          <DialogDescription>
            Upload an image or paste a screenshot to automatically extract text using OCR
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Upload/Paste Buttons */}
          <div className="grid grid-cols-2 gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleImageUpload}
              className="hidden"
              data-testid="input-ocr-file"
            />
            <Button
              variant="outline"
              onClick={() => fileInputRef.current?.click()}
              data-testid="button-upload-image"
            >
              <Upload className="h-4 w-4 mr-2" />
              Upload
            </Button>
            <Button
              variant="outline"
              onClick={handlePaste}
              data-testid="button-paste-image"
            >
              <Camera className="h-4 w-4 mr-2" />
              Paste
            </Button>
          </div>

          {/* Image Preview */}
          {selectedImage && (
            <div className="border rounded-md p-4 bg-muted">
              <img 
                src={selectedImage} 
                alt="Selected" 
                className="max-w-full max-h-64 mx-auto object-contain"
              />
              <Button
                onClick={performOCR}
                disabled={isProcessing}
                className="w-full mt-4"
                data-testid="button-extract-text"
              >
                {isProcessing ? "Processing..." : "Extract Text"}
              </Button>
            </div>
          )}

          {/* Progress Bar */}
          {isProcessing && (
            <div className="space-y-2">
              <Progress value={progress} className="w-full" />
              <p className="text-sm text-center text-muted-foreground">
                Processing image... {progress}%
              </p>
            </div>
          )}

          {/* Extracted Text */}
          {extractedText && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium">Extracted Text</label>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleCopyText}
                  data-testid="button-copy-text"
                >
                  {copied ? (
                    <>
                      <CheckCircle2 className="h-4 w-4 mr-2" />
                      Copied
                    </>
                  ) : (
                    <>
                      <Copy className="h-4 w-4 mr-2" />
                      Copy
                    </>
                  )}
                </Button>
              </div>
              <Textarea
                value={extractedText}
                onChange={(e) => setExtractedText(e.target.value)}
                rows={8}
                className="font-mono text-sm"
                placeholder="Extracted text will appear here..."
                data-testid="textarea-extracted-text"
              />
              <p className="text-xs text-muted-foreground">
                You can edit the text above before using it
              </p>
            </div>
          )}

          {/* Action Buttons */}
          {extractedText && (
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  setSelectedImage("");
                  setExtractedText("");
                }}
                data-testid="button-clear-ocr"
              >
                Clear
              </Button>
              <Button
                onClick={handleUseText}
                data-testid="button-use-text"
              >
                Use This Text
              </Button>
            </div>
          )}

          {/* Help Text */}
          {!selectedImage && (
            <div className="text-sm text-muted-foreground space-y-3 border rounded-md p-4 bg-muted/50">
              <div className="bg-primary/10 border border-primary/20 rounded p-3">
                <p className="font-semibold text-primary mb-2">💡 Recommended: Snip Part of Screen</p>
                <ol className="list-decimal list-inside space-y-1 text-sm">
                  <li><strong>Windows:</strong> Press <kbd className="px-2 py-1 bg-background border rounded text-xs">Win+Shift+S</kbd> → Drag to select region</li>
                  <li><strong>Mac:</strong> Press <kbd className="px-2 py-1 bg-background border rounded text-xs">Cmd+Shift+4</kbd> → Drag to select region</li>
                  <li>Click <strong>"Paste"</strong> button above → Your snippet appears!</li>
                </ol>
              </div>
              
              <div>
                <p className="font-medium">Alternative:</p>
                <ul className="list-disc list-inside space-y-1 ml-2 text-sm">
                  <li><strong>Upload:</strong> Choose a saved image file from your computer</li>
                </ul>
              </div>

              <div>
                <p className="font-medium">Tips for best OCR results:</p>
                <ul className="list-disc list-inside space-y-1 ml-2 text-sm">
                  <li>Use clear, high-contrast images</li>
                  <li>Ensure text is horizontal and legible</li>
                  <li>Works best with printed text (not handwriting)</li>
                </ul>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
