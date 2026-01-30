import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Ship, Anchor, Waves, ClipboardList, Settings, Share2 } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";

export default function Landing() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-background via-background to-primary/5">
      <header className="border-b bg-background/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between gap-4">
          <Link href="/" className="flex items-center gap-2">
            <div className="w-10 h-10 rounded-md bg-primary flex items-center justify-center">
              <Ship className="w-6 h-6 text-primary-foreground" />
            </div>
            <span className="text-xl font-semibold text-foreground">CruiseBook</span>
          </Link>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <Link href="/admin/login">
              <Button variant="outline" data-testid="link-admin-login">
                Admin Login
              </Button>
            </Link>
          </div>
        </div>
      </header>

      <main>
        <section className="container mx-auto px-4 py-16 md:py-24">
          <div className="max-w-3xl mx-auto text-center">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 text-primary mb-6">
              <Anchor className="w-4 h-4" />
              <span className="text-sm font-medium">Cruise Line Booking Forms</span>
            </div>
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-foreground mb-6 leading-tight">
              Create Dynamic Booking Forms for Your{" "}
              <span className="text-primary">Cruise Line</span>
            </h1>
            <p className="text-lg md:text-xl text-muted-foreground mb-8 max-w-2xl mx-auto">
              Build multi-step booking wizards with branching logic. Share via SMS links and collect customer information seamlessly on any device.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-4">
              <Link href="/admin/login">
                <Button size="lg" className="gap-2" data-testid="button-get-started">
                  <Settings className="w-5 h-5" />
                  Get Started
                </Button>
              </Link>
              <Button size="lg" variant="outline" className="gap-2" data-testid="button-learn-more">
                <Waves className="w-5 h-5" />
                Learn More
              </Button>
            </div>
          </div>
        </section>

        <section className="container mx-auto px-4 py-16">
          <div className="grid md:grid-cols-3 gap-6">
            <Card className="hover-elevate">
              <CardContent className="p-6">
                <div className="w-12 h-12 rounded-md bg-primary/10 flex items-center justify-center mb-4">
                  <ClipboardList className="w-6 h-6 text-primary" />
                </div>
                <h3 className="text-lg font-semibold text-foreground mb-2">Visual Form Builder</h3>
                <p className="text-muted-foreground">
                  Create multi-step wizards with our intuitive drag-and-drop builder. Add choices, text inputs, and branching logic.
                </p>
              </CardContent>
            </Card>
            <Card className="hover-elevate">
              <CardContent className="p-6">
                <div className="w-12 h-12 rounded-md bg-primary/10 flex items-center justify-center mb-4">
                  <Share2 className="w-6 h-6 text-primary" />
                </div>
                <h3 className="text-lg font-semibold text-foreground mb-2">Shareable Links</h3>
                <p className="text-muted-foreground">
                  Generate unique links for each form template. Share via SMS for customers to complete on their mobile devices.
                </p>
              </CardContent>
            </Card>
            <Card className="hover-elevate">
              <CardContent className="p-6">
                <div className="w-12 h-12 rounded-md bg-primary/10 flex items-center justify-center mb-4">
                  <Ship className="w-6 h-6 text-primary" />
                </div>
                <h3 className="text-lg font-semibold text-foreground mb-2">Mobile Optimized</h3>
                <p className="text-muted-foreground">
                  Fully responsive forms that look great on any device. Perfect for customers booking on the go.
                </p>
              </CardContent>
            </Card>
          </div>
        </section>

        <section className="container mx-auto px-4 py-16">
          <Card className="bg-primary text-primary-foreground">
            <CardContent className="p-8 md:p-12 text-center">
              <h2 className="text-2xl md:text-3xl font-bold mb-4">
                Ready to streamline your cruise bookings?
              </h2>
              <p className="text-primary-foreground/80 mb-6 max-w-xl mx-auto">
                Start creating professional booking forms in minutes. No coding required.
              </p>
              <Link href="/admin/login">
                <Button size="lg" variant="secondary" data-testid="button-start-now">
                  Start Building Now
                </Button>
              </Link>
            </CardContent>
          </Card>
        </section>
      </main>

      <footer className="border-t bg-background/50 mt-16">
        <div className="container mx-auto px-4 py-8">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Ship className="w-5 h-5" />
              <span className="text-sm">CruiseBook - Dynamic Booking Forms</span>
            </div>
            <p className="text-sm text-muted-foreground">
              Built for cruise line businesses
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
