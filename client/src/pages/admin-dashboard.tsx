import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { 
  Ship, Plus, MoreVertical, Edit, Copy, Trash2, Eye, 
  ExternalLink, Search, ClipboardList, LogOut, Loader2
} from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Template } from "@shared/schema";
import { Skeleton } from "@/components/ui/skeleton";

export default function AdminDashboard() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [searchTerm, setSearchTerm] = useState("");
  const [newTemplateName, setNewTemplateName] = useState("");
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [deleteTemplateId, setDeleteTemplateId] = useState<string | null>(null);

  const { data: templates, isLoading } = useQuery<Template[]>({
    queryKey: ["/api/templates"],
  });

  const createMutation = useMutation({
    mutationFn: async (name: string) => {
      return await apiRequest("POST", "/api/templates", { 
        name,
        graph: {
          rootStepId: "step-1",
          steps: {
            "step-1": {
              id: "step-1",
              type: "text",
              question: "What is your name?",
              placeholder: "Enter your full name",
              nextStepId: null
            }
          }
        },
        published: false,
        shareId: null
      });
    },
    onSuccess: async (response) => {
      await queryClient.invalidateQueries({ queryKey: ["/api/templates"] });
      setIsCreateDialogOpen(false);
      setNewTemplateName("");
      const template = await response.json();
      toast({
        title: "Template created",
        description: "Your new template is ready to edit.",
      });
      setLocation(`/admin/builder/${template.id}`);
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to create template. Please try again.",
        variant: "destructive",
      });
    },
  });

  const duplicateMutation = useMutation({
    mutationFn: async (id: string) => {
      return await apiRequest("POST", `/api/templates/${id}/duplicate`);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/templates"] });
      toast({
        title: "Template duplicated",
        description: "A copy of the template has been created.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to duplicate template.",
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return await apiRequest("DELETE", `/api/templates/${id}`);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/templates"] });
      setDeleteTemplateId(null);
      toast({
        title: "Template deleted",
        description: "The template has been removed.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to delete template.",
        variant: "destructive",
      });
    },
  });

  const handleLogout = async () => {
    try {
      await apiRequest("POST", "/api/auth/logout");
      setLocation("/");
    } catch (error) {
      console.error("Logout failed:", error);
    }
  };

  const filteredTemplates = templates?.filter((t) =>
    t.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const copyShareLink = (shareId: string) => {
    const url = `${window.location.origin}/form/${shareId}`;
    navigator.clipboard.writeText(url);
    toast({
      title: "Link copied",
      description: "The shareable link has been copied to your clipboard.",
    });
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-background/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between gap-4 flex-wrap">
          <Link href="/admin/dashboard" className="flex items-center gap-2">
            <div className="w-10 h-10 rounded-md bg-primary flex items-center justify-center">
              <Ship className="w-6 h-6 text-primary-foreground" />
            </div>
            <span className="text-xl font-semibold text-foreground">CruiseBook</span>
          </Link>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <Button variant="ghost" onClick={handleLogout} data-testid="button-logout">
              <LogOut className="w-4 h-4 mr-2" />
              Logout
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Form Templates</h1>
            <p className="text-muted-foreground">Create and manage your booking forms</p>
          </div>
          <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2" data-testid="button-create-template">
                <Plus className="w-4 h-4" />
                New Template
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create New Template</DialogTitle>
                <DialogDescription>
                  Give your new booking form a name to get started.
                </DialogDescription>
              </DialogHeader>
              <Input
                placeholder="e.g., Caribbean Cruise Booking"
                value={newTemplateName}
                onChange={(e) => setNewTemplateName(e.target.value)}
                data-testid="input-template-name"
              />
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setIsCreateDialogOpen(false)}
                >
                  Cancel
                </Button>
                <Button
                  onClick={() => createMutation.mutate(newTemplateName)}
                  disabled={!newTemplateName.trim() || createMutation.isPending}
                  data-testid="button-create-confirm"
                >
                  {createMutation.isPending ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : null}
                  Create
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        <div className="mb-6">
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search templates..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
              data-testid="input-search"
            />
          </div>
        </div>

        {isLoading ? (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3].map((i) => (
              <Card key={i}>
                <CardHeader>
                  <Skeleton className="h-6 w-3/4" />
                  <Skeleton className="h-4 w-1/2" />
                </CardHeader>
                <CardContent>
                  <Skeleton className="h-8 w-full" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : filteredTemplates && filteredTemplates.length > 0 ? (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredTemplates.map((template) => (
              <Card key={template.id} className="hover-elevate">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <CardTitle className="text-lg truncate">{template.name}</CardTitle>
                      <CardDescription className="mt-1">
                        {Object.keys(template.graph?.steps || {}).length} steps
                      </CardDescription>
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" data-testid={`button-menu-${template.id}`}>
                          <MoreVertical className="w-4 h-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem asChild>
                          <Link href={`/admin/builder/${template.id}`} className="flex items-center gap-2">
                            <Edit className="w-4 h-4" />
                            Edit
                          </Link>
                        </DropdownMenuItem>
                        <DropdownMenuItem asChild>
                          <Link href={`/admin/preview/${template.id}`} className="flex items-center gap-2">
                            <Eye className="w-4 h-4" />
                            Preview
                          </Link>
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => duplicateMutation.mutate(template.id)}
                          className="flex items-center gap-2"
                        >
                          <Copy className="w-4 h-4" />
                          Duplicate
                        </DropdownMenuItem>
                        {template.shareId && (
                          <DropdownMenuItem
                            onClick={() => copyShareLink(template.shareId!)}
                            className="flex items-center gap-2"
                          >
                            <ExternalLink className="w-4 h-4" />
                            Copy Link
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onClick={() => setDeleteTemplateId(template.id)}
                          className="flex items-center gap-2 text-destructive"
                        >
                          <Trash2 className="w-4 h-4" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-2">
                    {template.published ? (
                      <Badge variant="default" className="bg-green-600">Published</Badge>
                    ) : (
                      <Badge variant="secondary">Draft</Badge>
                    )}
                    {template.shareId && (
                      <Badge variant="outline" className="gap-1">
                        <ExternalLink className="w-3 h-3" />
                        Shareable
                      </Badge>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <Card className="bg-muted/30">
            <CardContent className="flex flex-col items-center justify-center py-16">
              <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
                <ClipboardList className="w-8 h-8 text-muted-foreground" />
              </div>
              <h3 className="text-lg font-semibold text-foreground mb-2">No templates yet</h3>
              <p className="text-muted-foreground text-center mb-4">
                {searchTerm ? "No templates match your search." : "Create your first booking form to get started."}
              </p>
              {!searchTerm && (
                <Button onClick={() => setIsCreateDialogOpen(true)} className="gap-2">
                  <Plus className="w-4 h-4" />
                  Create Template
                </Button>
              )}
            </CardContent>
          </Card>
        )}
      </main>

      <Dialog open={!!deleteTemplateId} onOpenChange={() => setDeleteTemplateId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Template</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this template? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTemplateId(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => deleteTemplateId && deleteMutation.mutate(deleteTemplateId)}
              disabled={deleteMutation.isPending}
              data-testid="button-delete-confirm"
            >
              {deleteMutation.isPending ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : null}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
