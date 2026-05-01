import { useState, useRef, useCallback } from "react";
import ReactCrop, { type Crop, type PixelCrop } from "react-image-crop";
import "react-image-crop/dist/ReactCrop.css";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { RotateCcw, Crop as CropIcon, Check } from "lucide-react";

interface CropDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  imageSrc: string;
  onImageCropped: (imageDataUrl: string) => void;
  onRetake: () => void;
}

export function CropDialog({ open, onOpenChange, imageSrc, onImageCropped, onRetake }: CropDialogProps) {
  const imgRef = useRef<HTMLImageElement>(null);
  const [crop, setCrop] = useState<Crop>();
  const [completedCrop, setCompletedCrop] = useState<PixelCrop>();

  const getCroppedImage = useCallback((): string => {
    if (!imgRef.current || !completedCrop) return imageSrc;

    const image = imgRef.current;
    const canvas = document.createElement("canvas");

    const scaleX = image.naturalWidth / image.width;
    const scaleY = image.naturalHeight / image.height;

    canvas.width = completedCrop.width * scaleX;
    canvas.height = completedCrop.height * scaleY;

    const ctx = canvas.getContext("2d");
    if (!ctx) return imageSrc;

    ctx.drawImage(
      image,
      completedCrop.x * scaleX,
      completedCrop.y * scaleY,
      completedCrop.width * scaleX,
      completedCrop.height * scaleY,
      0,
      0,
      canvas.width,
      canvas.height
    );

    return canvas.toDataURL("image/jpeg", 0.95);
  }, [imageSrc, completedCrop]);

  const handleUseImage = () => {
    const finalImage = completedCrop ? getCroppedImage() : imageSrc;
    onImageCropped(finalImage);
    handleClose();
  };

  const handleClose = () => {
    setCrop(undefined);
    setCompletedCrop(undefined);
    onOpenChange(false);
  };

  const handleRetake = () => {
    setCrop(undefined);
    setCompletedCrop(undefined);
    onOpenChange(false);
    onRetake();
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => {
      if (!isOpen) handleClose();
      else onOpenChange(true);
    }}>
      <DialogContent className="max-w-2xl max-h-[95vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Crop Image for OCR</DialogTitle>
          <DialogDescription>
            Drag to select the area containing the text you want to extract
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="border rounded-md p-2 bg-muted">
            <ReactCrop
              crop={crop}
              onChange={(c) => setCrop(c)}
              onComplete={(c) => setCompletedCrop(c)}
            >
              <img
                ref={imgRef}
                src={imageSrc}
                alt="Captured"
                className="max-w-full max-h-[55vh] object-contain"
                style={{ display: "block", margin: "0 auto" }}
              />
            </ReactCrop>
          </div>

          <p className="text-xs text-muted-foreground text-center">
            {completedCrop
              ? "Crop selected — click 'Use for OCR' to extract text from the selected area"
              : "Drag on the image to crop to the text area, or use the full image"}
          </p>

          <div className="flex gap-2 justify-center flex-wrap">
            <Button
              variant="outline"
              onClick={handleRetake}
            >
              <RotateCcw className="h-4 w-4 mr-2" />
              Retake
            </Button>
            <Button onClick={handleUseImage}>
              {completedCrop ? (
                <>
                  <CropIcon className="h-4 w-4 mr-2" />
                  Use Cropped for OCR
                </>
              ) : (
                <>
                  <Check className="h-4 w-4 mr-2" />
                  Use Full Image for OCR
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
