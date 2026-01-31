import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import type { InfoPopup } from "@shared/schema";

interface StepInfoPopupProps {
  infoPopup: InfoPopup;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function StepInfoPopup({ infoPopup, open, onOpenChange }: StepInfoPopupProps) {
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const images = infoPopup.images || [];

  const handlePrevImage = () => {
    setCurrentImageIndex(prev => prev === 0 ? images.length - 1 : prev - 1);
  };

  const handleNextImage = () => {
    setCurrentImageIndex(prev => prev === images.length - 1 ? 0 : prev + 1);
  };

  const handleClose = () => {
    onOpenChange(false);
    setCurrentImageIndex(0);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader className="flex flex-row items-center justify-between gap-4">
          <DialogTitle className="font-serif text-2xl md:text-3xl font-bold text-foreground" data-testid="text-info-popup-header">
            {infoPopup.header || "More Information"}
          </DialogTitle>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleClose}
            className="flex-shrink-0"
            data-testid="button-close-info-popup"
          >
            <X className="w-5 h-5" />
          </Button>
        </DialogHeader>

        <div className="space-y-6">
          {images.length > 0 && (
            <div className="flex items-center gap-4" data-testid="info-image-carousel">
              {images.length > 1 && (
                <Button
                  variant="outline"
                  size="icon"
                  className="flex-shrink-0"
                  onClick={handlePrevImage}
                  data-testid="button-info-prev-image"
                >
                  <ChevronLeft className="w-5 h-5" />
                </Button>
              )}
              
              <div className="relative flex-1 rounded-lg overflow-hidden shadow-lg">
                <img
                  src={images[currentImageIndex]}
                  alt={`Info image ${currentImageIndex + 1}`}
                  className="w-full h-64 object-cover"
                  onError={(e) => {
                    (e.target as HTMLImageElement).src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='100' height='100' viewBox='0 0 100 100'%3E%3Crect fill='%23f0f0f0' width='100' height='100'/%3E%3Ctext x='50' y='50' text-anchor='middle' dy='.3em' fill='%23999'%3EImage not found%3C/text%3E%3C/svg%3E";
                  }}
                  data-testid="img-info-preview"
                />
                
                {images.length > 1 && (
                  <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2">
                    {images.map((_, index) => (
                      <button
                        key={index}
                        onClick={() => setCurrentImageIndex(index)}
                        className={`w-2 h-2 rounded-full transition-all ${
                          index === currentImageIndex 
                            ? "bg-white scale-125" 
                            : "bg-white/50 hover:bg-white/75"
                        }`}
                        data-testid={`button-info-dot-${index}`}
                      />
                    ))}
                  </div>
                )}
              </div>
              
              {images.length > 1 && (
                <Button
                  variant="outline"
                  size="icon"
                  className="flex-shrink-0"
                  onClick={handleNextImage}
                  data-testid="button-info-next-image"
                >
                  <ChevronRight className="w-5 h-5" />
                </Button>
              )}
            </div>
          )}

          {infoPopup.description && (
            <div className="prose prose-lg dark:prose-invert max-w-none" data-testid="text-info-description">
              <p className="text-foreground leading-relaxed whitespace-pre-wrap">
                {infoPopup.description}
              </p>
            </div>
          )}

          <div className="flex justify-end pt-4">
            <Button
              variant="outline"
              onClick={handleClose}
              className="gap-2"
              data-testid="button-got-it"
            >
              <X className="w-4 h-4" />
              Close
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
