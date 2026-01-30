import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { 
  Ship, Plus, MoreVertical, Edit, Copy, Trash2, Eye, 
  ExternalLink, Search, ClipboardList, LogOut, Loader2, Anchor, Bell, Users
} from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Template, Cruise } from "@shared/schema";
import { Skeleton } from "@/components/ui/skeleton";

type CruiseWithCounts = Cruise & {
  submissionCount: number;
  unviewedCount: number;
};

export default function AdminDashboard() {
  const [location, setLocation] = useLocation();
  const { toast } = useToast();
  const { isLoading: authLoading, isAuthenticated } = useAuth();
  const [searchTerm, setSearchTerm] = useState("");
  const [newTemplateName, setNewTemplateName] = useState("");
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [deleteTemplateId, setDeleteTemplateId] = useState<string | null>(null);
  const [deleteCruiseId, setDeleteCruiseId] = useState<string | null>(null);
  
  // Cruise creation state
  const [isCreateCruiseDialogOpen, setIsCreateCruiseDialogOpen] = useState(false);
  const [newCruiseName, setNewCruiseName] = useState("");
  const [newCruiseDescription, setNewCruiseDescription] = useState("");
  const [newCruiseTemplateId, setNewCruiseTemplateId] = useState("");
  const [newCruiseStartDate, setNewCruiseStartDate] = useState("");
  const [newCruiseEndDate, setNewCruiseEndDate] = useState("");
  const [newCruisePublished, setNewCruisePublished] = useState(false);

  const activeTab = location.includes("/admin/templates") ? "templates" 
    : location.includes("/admin/cruises") ? "cruises" 
    : "cruises";

  const { data: templates, isLoading: templatesLoading } = useQuery<Template[]>({
    queryKey: ["/api/templates"],
    enabled: isAuthenticated,
  });

  const { data: cruises, isLoading: cruisesLoading } = useQuery<CruiseWithCounts[]>({
    queryKey: ["/api/cruises"],
    enabled: isAuthenticated,
  });

  const createTemplateMutation = useMutation({
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

  const createCruiseMutation = useMutation({
    mutationFn: async (data: { name: string; description: string; templateId: string; startDate?: string; endDate?: string; isPublished?: boolean }) => {
      return await apiRequest("POST", "/api/cruises", data);
    },
    onSuccess: async (response) => {
      await queryClient.invalidateQueries({ queryKey: ["/api/cruises"] });
      setIsCreateCruiseDialogOpen(false);
      setNewCruiseName("");
      setNewCruiseDescription("");
      setNewCruiseTemplateId("");
      setNewCruiseStartDate("");
      setNewCruiseEndDate("");
      setNewCruisePublished(false);
      const cruise = await response.json();
      toast({
        title: "Cruise created",
        description: "Your new cruise is ready.",
      });
      setLocation(`/admin/cruises/${cruise.id}`);
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to create cruise. Please try again.",
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

  const deleteTemplateMutation = useMutation({
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

  const deleteCruiseMutation = useMutation({
    mutationFn: async (id: string) => {
      return await apiRequest("DELETE", `/api/cruises/${id}`);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/cruises"] });
      setDeleteCruiseId(null);
      toast({
        title: "Cruise deleted",
        description: "The cruise has been removed.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to delete cruise.",
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

  const filteredCruises = cruises?.filter((c) =>
    c.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const copyShareLink = (shareId: string) => {
    const url = `${window.location.origin}/form/${shareId}`;
    navigator.clipboard.writeText(url);
    toast({
      title: "Link copied",
      description: "The shareable link has been copied to your clipboard.",
    });
  };

  const copyCruiseLink = (shareId: string) => {
    const url = `${window.location.origin}/form/${shareId}`;
    navigator.clipboard.writeText(url);
    toast({
      title: "Link copied",
      description: "The cruise form link has been copied to your clipboard.",
    });
  };

  const getTemplateName = (templateId: string) => {
    return templates?.find(t => t.id === templateId)?.name || "Unknown Template";
  };

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

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

      <div className="container mx-auto px-4 py-6">
        <div className="flex gap-2 mb-6 border-b">
          <Button
            variant="ghost"
            className={`rounded-b-none border-b-2 ${activeTab === "cruises" ? "border-primary" : "border-transparent"}`}
            onClick={() => setLocation("/admin/cruises")}
            data-testid="tab-cruises"
          >
            <Anchor className="w-4 h-4 mr-2" />
            Cruises
          </Button>
          <Button
            variant="ghost"
            className={`rounded-b-none border-b-2 ${activeTab === "templates" ? "border-primary" : "border-transparent"}`}
            onClick={() => setLocation("/admin/templates")}
            data-testid="tab-templates"
          >
            <ClipboardList className="w-4 h-4 mr-2" />
            Form Templates
          </Button>
        </div>

        {activeTab === "cruises" ? (
          <>
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-8">
              <div>
                <h1 className="text-2xl font-bold text-foreground">Cruises</h1>
                <p className="text-muted-foreground">Manage your cruise bookings and signups</p>
              </div>
              <Dialog open={isCreateCruiseDialogOpen} onOpenChange={setIsCreateCruiseDialogOpen}>
                <DialogTrigger asChild>
                  <Button className="gap-2" data-testid="button-create-cruise">
                    <Plus className="w-4 h-4" />
                    New Cruise
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Create New Cruise</DialogTitle>
                    <DialogDescription>
                      Set up a new cruise with its booking form.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label>Cruise Name</Label>
                      <Input
                        placeholder="e.g., Caribbean Adventure 2025"
                        value={newCruiseName}
                        onChange={(e) => setNewCruiseName(e.target.value)}
                        data-testid="input-cruise-name"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Description (optional)</Label>
                      <Textarea
                        placeholder="A brief description of the cruise..."
                        value={newCruiseDescription}
                        onChange={(e) => setNewCruiseDescription(e.target.value)}
                        data-testid="input-cruise-description"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Start Date (optional)</Label>
                        <Input
                          type="date"
                          value={newCruiseStartDate}
                          onChange={(e) => setNewCruiseStartDate(e.target.value)}
                          data-testid="input-cruise-start-date"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>End Date (optional)</Label>
                        <Input
                          type="date"
                          value={newCruiseEndDate}
                          onChange={(e) => setNewCruiseEndDate(e.target.value)}
                          data-testid="input-cruise-end-date"
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label>Form Template</Label>
                      <Select
                        value={newCruiseTemplateId}
                        onValueChange={setNewCruiseTemplateId}
                      >
                        <SelectTrigger data-testid="select-cruise-template">
                          <SelectValue placeholder="Select a template" />
                        </SelectTrigger>
                        <SelectContent>
                          {templates?.map((template) => (
                            <SelectItem key={template.id} value={template.id}>
                              {template.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        id="cruise-published"
                        checked={newCruisePublished}
                        onChange={(e) => setNewCruisePublished(e.target.checked)}
                        className="h-4 w-4 rounded border-input"
                        data-testid="checkbox-cruise-published"
                      />
                      <Label htmlFor="cruise-published" className="text-sm cursor-pointer">
                        Published (visible on public landing page)
                      </Label>
                    </div>
                  </div>
                  <DialogFooter>
                    <Button
                      variant="outline"
                      onClick={() => setIsCreateCruiseDialogOpen(false)}
                    >
                      Cancel
                    </Button>
                    <Button
                      onClick={() => createCruiseMutation.mutate({
                        name: newCruiseName,
                        description: newCruiseDescription,
                        templateId: newCruiseTemplateId,
                        startDate: newCruiseStartDate || undefined,
                        endDate: newCruiseEndDate || undefined,
                        isPublished: newCruisePublished,
                      })}
                      disabled={!newCruiseName.trim() || !newCruiseTemplateId || createCruiseMutation.isPending}
                      data-testid="button-create-cruise-confirm"
                    >
                      {createCruiseMutation.isPending ? (
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
                  placeholder="Search cruises..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                  data-testid="input-search-cruises"
                />
              </div>
            </div>

            {cruisesLoading ? (
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
            ) : filteredCruises && filteredCruises.length > 0 ? (
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                {filteredCruises.map((cruise) => (
                  <Card key={cruise.id} className="hover-elevate cursor-pointer" onClick={() => setLocation(`/admin/cruises/${cruise.id}`)}>
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <CardTitle className="text-lg truncate">{cruise.name}</CardTitle>
                            {cruise.unviewedCount > 0 && (
                              <Badge variant="destructive" className="text-xs">
                                {cruise.unviewedCount} new
                              </Badge>
                            )}
                          </div>
                          <CardDescription className="mt-1 truncate">
                            {getTemplateName(cruise.templateId)}
                          </CardDescription>
                        </div>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                            <Button variant="ghost" size="icon" data-testid={`button-cruise-menu-${cruise.id}`}>
                              <MoreVertical className="w-4 h-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem 
                              onClick={(e) => { e.stopPropagation(); setLocation(`/admin/cruises/${cruise.id}`); }}
                              className="flex items-center gap-2"
                            >
                              <Eye className="w-4 h-4" />
                              View Details
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={(e) => { e.stopPropagation(); copyCruiseLink(cruise.shareId); }}
                              className="flex items-center gap-2"
                            >
                              <ExternalLink className="w-4 h-4" />
                              Copy Link
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              onClick={(e) => { e.stopPropagation(); setDeleteCruiseId(cruise.id); }}
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
                      <div className="flex items-center gap-4 flex-wrap text-sm text-muted-foreground">
                        <div className="flex items-center gap-1">
                          <Users className="w-4 h-4" />
                          {cruise.submissionCount} signups
                        </div>
                        {cruise.isPublished ? (
                          <Badge variant="default" className="bg-green-600">Published</Badge>
                        ) : (
                          <Badge variant="secondary">Draft</Badge>
                        )}
                        {!cruise.isActive && (
                          <Badge variant="outline">Inactive</Badge>
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
                    <Anchor className="w-8 h-8 text-muted-foreground" />
                  </div>
                  <h3 className="text-lg font-semibold text-foreground mb-2">No cruises yet</h3>
                  <p className="text-muted-foreground text-center mb-4">
                    {searchTerm ? "No cruises match your search." : "Create your first cruise to get started."}
                  </p>
                  {!searchTerm && (
                    <Button onClick={() => setIsCreateCruiseDialogOpen(true)} className="gap-2">
                      <Plus className="w-4 h-4" />
                      Create Cruise
                    </Button>
                  )}
                </CardContent>
              </Card>
            )}
          </>
        ) : (
          <>
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
                      onClick={() => createTemplateMutation.mutate(newTemplateName)}
                      disabled={!newTemplateName.trim() || createTemplateMutation.isPending}
                      data-testid="button-create-confirm"
                    >
                      {createTemplateMutation.isPending ? (
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

            {templatesLoading ? (
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
          </>
        )}
      </div>

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
              onClick={() => deleteTemplateId && deleteTemplateMutation.mutate(deleteTemplateId)}
              disabled={deleteTemplateMutation.isPending}
              data-testid="button-delete-confirm"
            >
              {deleteTemplateMutation.isPending ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : null}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleteCruiseId} onOpenChange={() => setDeleteCruiseId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Cruise</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this cruise? All submissions will be lost.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteCruiseId(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => deleteCruiseId && deleteCruiseMutation.mutate(deleteCruiseId)}
              disabled={deleteCruiseMutation.isPending}
              data-testid="button-delete-cruise-confirm"
            >
              {deleteCruiseMutation.isPending ? (
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
