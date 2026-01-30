import { Link, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Ship, Anchor, Calendar, ArrowRight, Loader2 } from "lucide-react";
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
    <div className="min-h-screen flex flex-col bg-gradient-to-b from-background via-background to-primary/5">
      <header className="border-b bg-background/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between gap-4">
          <Link href="/" className="flex items-center gap-2">
            <div className="w-10 h-10 rounded-md bg-primary flex items-center justify-center">
              <Ship className="w-6 h-6 text-primary-foreground" />
            </div>
            <span className="text-xl font-semibold text-foreground">CruiseBook</span>
          </Link>
          <ThemeToggle />
        </div>
      </header>

      <main className="flex-1">
        <section className="px-6 md:px-10 py-12 md:py-16">
          <div className="max-w-2xl mx-auto text-center mb-10">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 text-primary mb-4">
              <Anchor className="w-4 h-4" />
              <span className="text-sm font-medium">Available Cruises</span>
            </div>
            <h1 className="text-3xl md:text-4xl font-bold text-foreground mb-4">
              Book Your Next Adventure
            </h1>
            <p className="text-muted-foreground">
              Browse our available cruises and complete your booking form in just a few minutes.
            </p>
          </div>

          {isLoading ? (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {[1, 2, 3].map((i) => (
                <Card key={i}>
                  <CardHeader>
                    <Skeleton className="h-6 w-3/4" />
                    <Skeleton className="h-4 w-1/2" />
                  </CardHeader>
                  <CardContent>
                    <Skeleton className="h-10 w-full" />
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : cruises && cruises.length > 0 ? (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {cruises.map((cruise) => (
                <Card key={cruise.id} className="hover-elevate flex flex-col" data-testid={`card-cruise-${cruise.id}`}>
                  <CardHeader className="flex-1">
                    <CardTitle className="text-lg">{cruise.name}</CardTitle>
                    {cruise.description && (
                      <CardDescription className="line-clamp-2">{cruise.description}</CardDescription>
                    )}
                    {(cruise.startDate || cruise.endDate) && (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground mt-2">
                        <Calendar className="w-4 h-4" />
                        <span>{formatDateRange(cruise.startDate, cruise.endDate)}</span>
                      </div>
                    )}
                  </CardHeader>
                  <CardContent>
                    <Button
                      className="w-full gap-2"
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
            <Card className="max-w-md mx-auto bg-muted/30">
              <CardContent className="flex flex-col items-center justify-center py-12">
                <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
                  <Ship className="w-8 h-8 text-muted-foreground" />
                </div>
                <h3 className="text-lg font-semibold text-foreground mb-2">No cruises available</h3>
                <p className="text-muted-foreground text-center">
                  Check back soon for upcoming cruise opportunities.
                </p>
              </CardContent>
            </Card>
          )}
        </section>
      </main>

      <footer className="border-t bg-background/50 mt-auto">
        <div className="container mx-auto px-4 py-8">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Ship className="w-5 h-5" />
              <span className="text-sm">CruiseBook</span>
            </div>
            <Link href="/admin/login" className="text-sm text-muted-foreground hover:text-foreground">
              Admin
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
