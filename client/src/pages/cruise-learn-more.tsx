import { useState } from "react";
import { Link, useParams, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Ship, ChevronLeft, ChevronRight, ArrowRight, Anchor } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { Skeleton } from "@/components/ui/skeleton";

type LearnMoreData = {
  id: string;
  name: string;
  shareId: string;
  learnMoreHeader: string | null;
  learnMoreImages: string[] | null;
  learnMoreDescription: string | null;
};

export default function CruiseLearnMore() {
  const { shareId } = useParams<{ shareId: string }>();
  const [, setLocation] = useLocation();
  const [currentImageIndex, setCurrentImageIndex] = useState(0);

  const { data: cruise, isLoading, error } = useQuery<LearnMoreData>({
    queryKey: ["/api/public/cruises", shareId, "learn-more"],
    enabled: !!shareId,
  });

  const images = cruise?.learnMoreImages || [];

  const handlePrevImage = () => {
    setCurrentImageIndex(prev => prev === 0 ? images.length - 1 : prev - 1);
  };

  const handleNextImage = () => {
    setCurrentImageIndex(prev => prev === images.length - 1 ? 0 : prev + 1);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <header className="border-b border-border/50 bg-background/80 backdrop-blur-sm sticky top-0 z-50">
          <div className="container mx-auto px-6 py-4 flex items-center justify-between gap-4">
            <Link href="/" className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-lg bg-navy flex items-center justify-center shadow-md">
                <Ship className="w-6 h-6 text-white" />
              </div>
              <span className="text-xl font-serif font-semibold text-foreground tracking-wide">CruiseBook</span>
            </Link>
            <ThemeToggle />
          </div>
        </header>
        <main className="container mx-auto px-6 py-10 max-w-2xl">
          <Skeleton className="h-10 w-3/4 mx-auto mb-8" />
          <Skeleton className="h-80 w-full rounded-lg mb-8" />
          <Skeleton className="h-32 w-full" />
        </main>
      </div>
    );
  }

  if (error || !cruise) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <Card className="w-full max-w-md text-center shadow-md border-border/50">
          <CardContent className="py-16">
            <div className="w-20 h-20 rounded-full bg-destructive/10 flex items-center justify-center mx-auto mb-6">
              <Anchor className="w-10 h-10 text-destructive" />
            </div>
            <h2 className="font-serif text-2xl font-bold text-foreground mb-3">Page Not Found</h2>
            <p className="text-muted-foreground mb-8 leading-relaxed">
              This cruise page is not available or the link is invalid.
            </p>
            <Button variant="outline" onClick={() => setLocation("/")} className="gap-2">
              <ArrowRight className="w-4 h-4 rotate-180" />
              Go to Homepage
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="border-b border-border/50 bg-background/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-6 py-4 flex items-center justify-between gap-4">
          <Link href="/" className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-lg bg-navy flex items-center justify-center shadow-md">
              <Ship className="w-6 h-6 text-white" />
            </div>
            <span className="text-xl font-serif font-semibold text-foreground tracking-wide">CruiseBook</span>
          </Link>
          <ThemeToggle />
        </div>
      </header>

      <main className="flex-1 container mx-auto px-6 py-10 max-w-2xl">
        <h1 className="font-serif text-3xl md:text-4xl font-bold text-foreground mb-8 text-center" data-testid="text-learn-more-header">
          {cruise.learnMoreHeader || cruise.name}
        </h1>

        {images.length > 0 && (
          <div className="flex items-center gap-4 mb-8" data-testid="image-carousel">
            {images.length > 1 && (
              <Button
                variant="outline"
                size="icon"
                className="flex-shrink-0"
                onClick={handlePrevImage}
                data-testid="button-prev-image"
              >
                <ChevronLeft className="w-5 h-5" />
              </Button>
            )}
            
            <div className="relative flex-1 rounded-lg overflow-hidden shadow-lg">
              <img
                src={images[currentImageIndex]}
                alt={`${cruise.name} - Image ${currentImageIndex + 1}`}
                className="w-full h-80 object-cover"
                onError={(e) => {
                  (e.target as HTMLImageElement).src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='100' height='100' viewBox='0 0 100 100'%3E%3Crect fill='%23f0f0f0' width='100' height='100'/%3E%3Ctext x='50' y='50' text-anchor='middle' dy='.3em' fill='%23999'%3EImage not found%3C/text%3E%3C/svg%3E";
                }}
                data-testid="img-cruise-preview"
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
                      data-testid={`button-dot-${index}`}
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
                data-testid="button-next-image"
              >
                <ChevronRight className="w-5 h-5" />
              </Button>
            )}
          </div>
        )}

        {cruise.learnMoreDescription && (
          <div className="prose prose-lg dark:prose-invert max-w-none mb-10" data-testid="text-learn-more-description">
            <p className="text-foreground leading-relaxed whitespace-pre-wrap">
              {cruise.learnMoreDescription}
            </p>
          </div>
        )}

        <div className="flex flex-col sm:flex-row gap-4">
          <Button
            className="flex-1 gap-2 h-12 text-base font-medium"
            onClick={() => setLocation(`/form/${cruise.shareId}`)}
            data-testid="button-book-now"
          >
            Book Now
            <ArrowRight className="w-4 h-4" />
          </Button>
          <Button
            variant="outline"
            className="flex-1 gap-2 h-12 text-base font-medium"
            onClick={() => setLocation("/")}
            data-testid="button-back-home"
          >
            <ArrowRight className="w-4 h-4 rotate-180" />
            Back to Cruises
          </Button>
        </div>
      </main>

      <footer className="border-t border-border/50 bg-muted/30 mt-auto">
        <div className="container mx-auto px-6 py-10">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-navy/10 flex items-center justify-center">
                <Ship className="w-5 h-5 text-navy" />
              </div>
              <span className="font-serif text-lg text-foreground">CruiseBook</span>
            </div>
            <div className="flex items-center gap-6 text-sm text-muted-foreground">
              <span>Smooth sailing ahead</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
