import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import Landing from "@/pages/landing";
import AdminLogin from "@/pages/admin-login";
import AdminDashboard from "@/pages/admin-dashboard";
import FormBuilder from "@/pages/form-builder";
import FormPreview from "@/pages/form-preview";
import PublicForm from "@/pages/public-form";
import CruiseDetail from "@/pages/cruise-detail";
import CruiseLearnMore from "@/pages/cruise-learn-more";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Landing} />
      <Route path="/admin/login" component={AdminLogin} />
      <Route path="/admin/dashboard" component={AdminDashboard} />
      <Route path="/admin/templates" component={AdminDashboard} />
      <Route path="/admin/cruises" component={AdminDashboard} />
      <Route path="/admin/cruises/:id" component={CruiseDetail} />
      <Route path="/admin/builder/:id" component={FormBuilder} />
      <Route path="/admin/preview/:id" component={FormPreview} />
      <Route path="/form/:shareId" component={PublicForm} />
      <Route path="/fill/cruise/:cruiseId" component={PublicForm} />
      <Route path="/cruise/:shareId/learn-more" component={CruiseLearnMore} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:absolute focus:z-[100] focus:p-4 focus:bg-background focus:text-foreground focus:border focus:rounded-md focus:top-2 focus:left-2"
        >
          Skip to main content
        </a>
        <Toaster />
        <Router />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
