import { Link, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Ship, Anchor, Calendar, ArrowRight, Compass, Waves } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { Skeleton } from "@/components/ui/skeleton";
import type { Cruise } from "@shared/schema";

export default function Landing() {
  const [, setLocation] = useLocation();

  const { data: cruises, isLoading } = useQuery<Cruise[]>({
    queryKey: ["/api/public/cruises"],
  });

  const formatDateRange = (startDate: Date | null, endDate: Date | null) => {
    if (!startDate && !endDate) return null;
    const options: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', year: 'numeric' };
    if (startDate && endDate) {
      return `${new Date(startDate).toLocaleDateString('en-US', options)} - ${new Date(endDate).toLocaleDateString('en-US', options)}`;
    }
    if (startDate) {
      return `Starting ${new Date(startDate).toLocaleDateString('en-US', options)}`;
    }
    return null;
  };

  return (
    <div className="min-h-screen flex flex-col bg-background">
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

      <main className="flex-1">
        {/* Hero Section */}
        <section className="relative px-6 md:px-10 pt-16 pb-8 md:pt-24 md:pb-12 overflow-hidden">
          {/* Subtle wave decoration */}
          <div className="absolute inset-0 opacity-[0.03] dark:opacity-[0.05] pointer-events-none">
            <svg className="absolute bottom-0 left-0 w-full" viewBox="0 0 1440 120" fill="none" preserveAspectRatio="none">
              <path d="M0,64 C480,128 960,0 1440,64 L1440,120 L0,120 Z" fill="currentColor" className="text-primary" />
            </svg>
          </div>
          
          <div className="max-w-2xl mx-auto text-center relative">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-gold/10 dark:bg-gold/20 text-gold mb-6 border border-gold/20">
              <Compass className="w-4 h-4" />
              <span className="text-sm font-medium tracking-wide">Set Sail With Us</span>
            </div>
            <h1 className="font-serif text-4xl md:text-5xl lg:text-6xl font-bold text-foreground mb-6 tracking-tight leading-tight">
              Join the Voyage
            </h1>
            <p className="text-lg text-muted-foreground leading-relaxed max-w-lg mx-auto">
              Discover extraordinary cruises and book your next adventure in just a few simple steps.
            </p>
          </div>
        </section>

        {/* Cruises Section */}
        <section className="px-6 md:px-10 py-8 md:py-12">
          <div className="max-w-xl mx-auto">
            <div className="flex items-center justify-center gap-2 mb-8">
              <Anchor className="w-5 h-5 text-primary" />
              <h2 className="font-serif text-2xl font-semibold text-foreground">Available Cruises</h2>
            </div>

          {isLoading ? (
            <div className="flex flex-col gap-5">
              {[1, 2, 3].map((i) => (
                <Card key={i} className="shadow-md">
                  <CardHeader>
                    <Skeleton className="h-6 w-3/4" />
                    <Skeleton className="h-4 w-1/2" />
                  </CardHeader>
                  <CardContent>
                    <Skeleton className="h-11 w-full rounded-lg" />
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : cruises && cruises.length > 0 ? (
            <div className="flex flex-col gap-5">
              {cruises.map((cruise) => (
                <Card 
                  key={cruise.id} 
                  className="hover-elevate flex flex-col shadow-md border-border/50 transition-shadow duration-300 hover:shadow-lg" 
                  data-testid={`card-cruise-${cruise.id}`}
                >
                  <CardHeader className="flex-1 pb-3">
                    <CardTitle className="font-serif text-xl tracking-tight">{cruise.name}</CardTitle>
                    {cruise.description && (
                      <CardDescription className="line-clamp-2 text-base leading-relaxed">{cruise.description}</CardDescription>
                    )}
                    {(cruise.startDate || cruise.endDate) && (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground mt-3 pt-3 border-t border-border/50">
                        <Calendar className="w-4 h-4 text-gold" />
                        <span>{formatDateRange(cruise.startDate, cruise.endDate)}</span>
                      </div>
                    )}
                  </CardHeader>
                  <CardContent className="pt-0">
                    <Button
                      className="w-full gap-2 h-11 text-base font-medium shadow-sm hover:shadow-md transition-all duration-200"
                      onClick={() => setLocation(`/form/${cruise.shareId}`)}
                      data-testid={`button-book-${cruise.id}`}
                    >
                      Book Now
                      <ArrowRight className="w-4 h-4" />
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <Card className="shadow-md border-border/50">
              <CardContent className="flex flex-col items-center justify-center py-16">
                <div className="w-20 h-20 rounded-full bg-navy/10 flex items-center justify-center mb-6">
                  <Ship className="w-10 h-10 text-navy" />
                </div>
                <h3 className="font-serif text-xl font-semibold text-foreground mb-3">No cruises available</h3>
                <p className="text-muted-foreground text-center max-w-xs">
                  Check back soon for upcoming voyage opportunities.
                </p>
              </CardContent>
            </Card>
          )}
          </div>
        </section>
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
              <Link href="/admin/login" className="hover:text-primary transition-colors">
                Admin Portal
              </Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
