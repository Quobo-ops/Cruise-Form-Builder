import { useState } from "react";
import { Link, useParams, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useToast } from "@/hooks/use-toast";
import { 
  Ship, ArrowLeft, Copy, Users, Package, Edit, Loader2, Save, Phone, User, Image, ChevronLeft, ChevronRight, Plus, Trash2, Info
} from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ThemeToggle } from "@/components/theme-toggle";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Cruise, Template, CruiseInventory, Submission, QuantityAnswer } from "@shared/schema";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";

type CruiseWithCounts = Cruise & {
  submissionCount: number;
  unviewedCount: number;
};

export default function CruiseDetail() {
  const { id } = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { isLoading: authLoading, isAuthenticated } = useAuth();
  
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editIsActive, setEditIsActive] = useState(true);
  const [editIsPublished, setEditIsPublished] = useState(false);
  const [selectedSubmission, setSelectedSubmission] = useState<Submission | null>(null);
  const [editingLimit, setEditingLimit] = useState<{ stepId: string; choiceId: string; value: string } | null>(null);
  
  const [learnMoreHeader, setLearnMoreHeader] = useState("");
  const [learnMoreImages, setLearnMoreImages] = useState<string[]>([]);
  const [learnMoreDescription, setLearnMoreDescription] = useState("");
  const [newImageUrl, setNewImageUrl] = useState("");
  const [previewImageIndex, setPreviewImageIndex] = useState(0);

  const { data: cruise, isLoading: cruiseLoading } = useQuery<CruiseWithCounts>({
    queryKey: ["/api/cruises", id],
    enabled: isAuthenticated,
  });

  const { data: template } = useQuery<Template>({
    queryKey: ["/api/templates", cruise?.templateId],
    enabled: !!cruise?.templateId && isAuthenticated,
  });

  const { data: inventory } = useQuery<CruiseInventory[]>({
    queryKey: ["/api/cruises", id, "inventory"],
    enabled: !!id && isAuthenticated,
  });

  const { data: submissions } = useQuery<Submission[]>({
    queryKey: ["/api/cruises", id, "submissions"],
    enabled: !!id && isAuthenticated,
  });

  const updateCruiseMutation = useMutation({
    mutationFn: async (data: { name: string; description: string; isActive: boolean; isPublished: boolean }) => {
      return await apiRequest("PATCH", `/api/cruises/${id}`, data);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/cruises", id] });
      await queryClient.invalidateQueries({ queryKey: ["/api/cruises"] });
      setIsEditing(false);
      toast({
        title: "Cruise updated",
        description: "Your changes have been saved.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update cruise.",
        variant: "destructive",
      });
    },
  });

  const updateLimitMutation = useMutation({
    mutationFn: async (data: { stepId: string; choiceId: string; limit: number | null }) => {
      return await apiRequest("PATCH", `/api/cruises/${id}/inventory/limit`, data);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/cruises", id, "inventory"] });
      setEditingLimit(null);
      toast({
        title: "Limit updated",
        description: "The stock limit has been updated.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update limit.",
        variant: "destructive",
      });
    },
  });

  const updateLearnMoreMutation = useMutation({
    mutationFn: async (data: { learnMoreHeader: string | null; learnMoreImages: string[] | null; learnMoreDescription: string | null }) => {
      return await apiRequest("PATCH", `/api/cruises/${id}`, data);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/cruises", id] });
      toast({
        title: "Learn More saved",
        description: "Your Learn More content has been saved.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to save Learn More content.",
        variant: "destructive",
      });
    },
  });

  const initLearnMoreFromCruise = () => {
    if (cruise) {
      setLearnMoreHeader(cruise.learnMoreHeader || "");
      setLearnMoreImages(cruise.learnMoreImages || []);
      setLearnMoreDescription(cruise.learnMoreDescription || "");
      setPreviewImageIndex(0);
    }
  };

  const handleAddImage = () => {
    if (newImageUrl.trim()) {
      setLearnMoreImages([...learnMoreImages, newImageUrl.trim()]);
      setNewImageUrl("");
    }
  };

  const handleRemoveImage = (index: number) => {
    const updated = learnMoreImages.filter((_, i) => i !== index);
    setLearnMoreImages(updated);
    if (previewImageIndex >= updated.length) {
      setPreviewImageIndex(Math.max(0, updated.length - 1));
    }
  };

  const handleSaveLearnMore = () => {
    updateLearnMoreMutation.mutate({
      learnMoreHeader: learnMoreHeader || null,
      learnMoreImages: learnMoreImages.length > 0 ? learnMoreImages : null,
      learnMoreDescription: learnMoreDescription || null,
    });
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

  const copyShareLink = () => {
    if (!cruise) return;
    const url = `${window.location.origin}/form/${cruise.shareId}`;
    navigator.clipboard.writeText(url);
    toast({
      title: "Link copied",
      description: "The shareable link has been copied to your clipboard.",
    });
  };

  const startEditing = () => {
    if (cruise) {
      setEditName(cruise.name);
      setEditDescription(cruise.description || "");
      setEditIsActive(cruise.isActive ?? true);
      setEditIsPublished(cruise.isPublished ?? false);
      setIsEditing(true);
    }
  };

  const saveEdit = () => {
    updateCruiseMutation.mutate({
      name: editName,
      description: editDescription,
      isActive: editIsActive,
      isPublished: editIsPublished,
    });
  };

  const getStepQuestion = (stepId: string) => {
    return template?.graph?.steps[stepId]?.question || stepId;
  };

  const formatPrice = (price: string | number) => {
    const num = typeof price === 'string' ? parseFloat(price) : price;
    return `$${num.toFixed(2)}`;
  };

  const getRemaining = (item: CruiseInventory) => {
    if (item.stockLimit === null) return "Unlimited";
    return Math.max(0, item.stockLimit - item.totalOrdered);
  };

  const isSoldOut = (item: CruiseInventory) => {
    if (item.stockLimit === null) return false;
    return item.totalOrdered >= item.stockLimit;
  };

  if (cruiseLoading) {
    return (
      <div className="min-h-screen bg-background">
        <header className="border-b bg-background/80 backdrop-blur-sm sticky top-0 z-50">
          <div className="container mx-auto px-4 py-4">
            <Skeleton className="h-10 w-48" />
          </div>
        </header>
        <main className="container mx-auto px-4 py-8">
          <div className="grid gap-6">
            <Skeleton className="h-48" />
            <Skeleton className="h-96" />
          </div>
        </main>
      </div>
    );
  }

  if (!cruise) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Card className="w-full max-w-md text-center">
          <CardContent className="py-12">
            <Ship className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <h2 className="text-xl font-bold text-foreground mb-2">Cruise Not Found</h2>
            <p className="text-muted-foreground mb-6">
              This cruise doesn't exist or has been deleted.
            </p>
            <Link href="/admin/cruises">
              <Button>Back to Cruises</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-background/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-4">
            <Link href="/admin/cruises" className="flex items-center gap-2 text-muted-foreground hover-elevate rounded-md px-2 py-1">
              <ArrowLeft className="w-4 h-4" />
              <span className="hidden sm:inline">Back</span>
            </Link>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-md bg-primary flex items-center justify-center">
                <Ship className="w-5 h-5 text-primary-foreground" />
              </div>
              <span className="font-semibold text-lg">{cruise.name}</span>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <ThemeToggle />
            <Button variant="outline" onClick={copyShareLink} className="gap-2" data-testid="button-copy-link">
              <Copy className="w-4 h-4" />
              <span className="hidden sm:inline">Copy Link</span>
            </Button>
            <Button variant="outline" onClick={startEditing} className="gap-2" data-testid="button-edit-cruise">
              <Edit className="w-4 h-4" />
              <span className="hidden sm:inline">Edit</span>
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 space-y-4">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-semibold truncate">{cruise.name}</h1>
            {cruise.description && (
              <p className="text-sm text-muted-foreground mt-0.5 truncate">{cruise.description}</p>
            )}
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <Badge variant="secondary" className="gap-1">
              <Users className="w-3 h-3" />
              {cruise.submissionCount}
            </Badge>
            <Badge variant="secondary" className="gap-1">
              <Package className="w-3 h-3" />
              {inventory?.length || 0}
            </Badge>
            {cruise.isActive ? (
              <Badge variant="default" className="bg-green-600">Active</Badge>
            ) : (
              <Badge variant="secondary">Inactive</Badge>
            )}
          </div>
        </div>

        <Tabs defaultValue="inventory" className="w-full">
          <TabsList>
            <TabsTrigger value="inventory" className="gap-1.5" data-testid="tab-inventory">
              <Package className="w-4 h-4" />
              <span className="hidden sm:inline">Inventory</span>
            </TabsTrigger>
            <TabsTrigger value="clients" className="gap-1.5" data-testid="tab-clients">
              <Users className="w-4 h-4" />
              <span className="hidden sm:inline">Clients</span>
            </TabsTrigger>
            <TabsTrigger value="learn-more" className="gap-1.5" data-testid="tab-learn-more" onClick={initLearnMoreFromCruise}>
              <Info className="w-4 h-4" />
              <span className="hidden sm:inline">Learn More</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="inventory">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Inventory Tracking</CardTitle>
                <CardDescription>
                  Manage stock limits for items with quantity selection.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {inventory && inventory.length > 0 ? (
                  <>
                    {/* Mobile view - cards */}
                    <div className="md:hidden space-y-4">
                      {inventory.map((item) => (
                        <div key={item.id} className="p-4 border rounded-md space-y-3">
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1 min-w-0">
                              <p className="font-medium">{item.choiceLabel}</p>
                              <p className="text-xs text-muted-foreground">
                                {getStepQuestion(item.stepId)}
                              </p>
                            </div>
                            {isSoldOut(item) ? (
                              <Badge variant="destructive">Sold Out</Badge>
                            ) : (
                              <Badge variant="outline">Available</Badge>
                            )}
                          </div>
                          <div className="grid grid-cols-2 gap-2 text-sm">
                            <div>
                              <span className="text-muted-foreground">Price:</span>
                              <span className="ml-2 font-medium">{formatPrice(item.price)}</span>
                            </div>
                            <div>
                              <span className="text-muted-foreground">Ordered:</span>
                              <span className="ml-2 font-medium">{item.totalOrdered}</span>
                            </div>
                            <div>
                              <span className="text-muted-foreground">Total:</span>
                              <span className="ml-2 font-medium">{formatPrice(Number(item.price) * item.totalOrdered)}</span>
                            </div>
                            <div>
                              <span className="text-muted-foreground">Remaining:</span>
                              <span className="ml-2 font-medium">{getRemaining(item)}</span>
                            </div>
                          </div>
                          <div className="flex items-center justify-between pt-2 border-t">
                            <span className="text-sm text-muted-foreground">Stock Limit:</span>
                            {editingLimit?.stepId === item.stepId && editingLimit?.choiceId === item.choiceId ? (
                              <div className="flex items-center gap-2">
                                <Input
                                  type="number"
                                  min="0"
                                  value={editingLimit.value}
                                  onChange={(e) => setEditingLimit({ ...editingLimit, value: e.target.value })}
                                  className="w-20 h-8"
                                  data-testid={`input-limit-mobile-${item.choiceId}`}
                                />
                                <Button
                                  size="sm"
                                  onClick={() => updateLimitMutation.mutate({
                                    stepId: item.stepId,
                                    choiceId: item.choiceId,
                                    limit: editingLimit.value ? parseInt(editingLimit.value) : null,
                                  })}
                                  disabled={updateLimitMutation.isPending}
                                >
                                  {updateLimitMutation.isPending ? (
                                    <Loader2 className="w-3 h-3 animate-spin" />
                                  ) : (
                                    <Save className="w-3 h-3" />
                                  )}
                                </Button>
                              </div>
                            ) : (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setEditingLimit({
                                  stepId: item.stepId,
                                  choiceId: item.choiceId,
                                  value: item.stockLimit?.toString() || "",
                                })}
                                data-testid={`button-edit-limit-mobile-${item.choiceId}`}
                              >
                                {item.stockLimit ?? "Unlimited"}
                              </Button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                    
                    {/* Desktop view - table */}
                    <div className="hidden md:block">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Item</TableHead>
                            <TableHead>Price</TableHead>
                            <TableHead className="text-center">Ordered</TableHead>
                            <TableHead className="text-right">Total</TableHead>
                            <TableHead className="text-center">Limit</TableHead>
                            <TableHead className="text-center">Remaining</TableHead>
                            <TableHead className="text-center">Status</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {inventory.map((item) => (
                            <TableRow key={item.id}>
                              <TableCell>
                                <div>
                                  <p className="font-medium">{item.choiceLabel}</p>
                                  <p className="text-xs text-muted-foreground truncate max-w-48">
                                    {getStepQuestion(item.stepId)}
                                  </p>
                                </div>
                              </TableCell>
                              <TableCell>{formatPrice(item.price)}</TableCell>
                              <TableCell className="text-center font-medium">{item.totalOrdered}</TableCell>
                              <TableCell className="text-right font-medium">
                                {formatPrice(Number(item.price) * item.totalOrdered)}
                              </TableCell>
                              <TableCell className="text-center">
                                {editingLimit?.stepId === item.stepId && editingLimit?.choiceId === item.choiceId ? (
                                  <div className="flex items-center gap-2 justify-center">
                                    <Input
                                      type="number"
                                      min="0"
                                      value={editingLimit.value}
                                      onChange={(e) => setEditingLimit({ ...editingLimit, value: e.target.value })}
                                      className="w-20 h-8"
                                      data-testid={`input-limit-${item.choiceId}`}
                                    />
                                    <Button
                                      size="sm"
                                      onClick={() => updateLimitMutation.mutate({
                                        stepId: item.stepId,
                                        choiceId: item.choiceId,
                                        limit: editingLimit.value ? parseInt(editingLimit.value) : null,
                                      })}
                                      disabled={updateLimitMutation.isPending}
                                    >
                                      {updateLimitMutation.isPending ? (
                                        <Loader2 className="w-3 h-3 animate-spin" />
                                      ) : (
                                        <Save className="w-3 h-3" />
                                      )}
                                    </Button>
                                  </div>
                                ) : (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => setEditingLimit({
                                      stepId: item.stepId,
                                      choiceId: item.choiceId,
                                      value: item.stockLimit?.toString() || "",
                                    })}
                                    data-testid={`button-edit-limit-${item.choiceId}`}
                                  >
                                    {item.stockLimit ?? "Unlimited"}
                                  </Button>
                                )}
                              </TableCell>
                              <TableCell className="text-center">
                                {getRemaining(item)}
                              </TableCell>
                              <TableCell className="text-center">
                                {isSoldOut(item) ? (
                                  <Badge variant="destructive">Sold Out</Badge>
                                ) : (
                                  <Badge variant="outline">Available</Badge>
                                )}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </>
                ) : (
                  <div className="py-8 text-center">
                    <Package className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                    <p className="text-muted-foreground">No inventory items to track.</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="clients">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Client Submissions</CardTitle>
                <CardDescription>
                  View all signups for this cruise.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {submissions && submissions.length > 0 ? (
                  <>
                    {/* Mobile view - cards */}
                    <div className="md:hidden space-y-3">
                      {submissions.map((submission) => (
                        <div 
                          key={submission.id} 
                          className="p-4 border rounded-md hover-elevate cursor-pointer"
                          onClick={() => setSelectedSubmission(submission)}
                          data-testid={`card-submission-${submission.id}`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-3 min-w-0">
                              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                                <User className="w-5 h-5 text-primary" />
                              </div>
                              <div className="min-w-0">
                                <p className="font-medium truncate">{submission.customerName || "Unknown"}</p>
                                <div className="flex items-center gap-1 text-sm text-muted-foreground">
                                  <Phone className="w-3 h-3 flex-shrink-0" />
                                  <span className="truncate">{submission.customerPhone || "N/A"}</span>
                                </div>
                              </div>
                            </div>
                            <div className="text-right flex-shrink-0">
                              <p className="text-xs text-muted-foreground">
                                {submission.createdAt ? new Date(submission.createdAt).toLocaleDateString() : "N/A"}
                              </p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                    
                    {/* Desktop view - table */}
                    <div className="hidden md:block">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Name</TableHead>
                            <TableHead>Phone</TableHead>
                            <TableHead>Submitted</TableHead>
                            <TableHead className="text-right">Actions</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {submissions.map((submission) => (
                            <TableRow key={submission.id}>
                              <TableCell className="font-medium">
                                {submission.customerName || "Unknown"}
                              </TableCell>
                              <TableCell>
                                {submission.customerPhone || "N/A"}
                              </TableCell>
                              <TableCell>
                                {submission.createdAt ? new Date(submission.createdAt).toLocaleDateString() : "N/A"}
                              </TableCell>
                              <TableCell className="text-right">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => setSelectedSubmission(submission)}
                                  data-testid={`button-view-submission-${submission.id}`}
                                >
                                  View Details
                                </Button>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </>
                ) : (
                  <div className="text-center py-8">
                    <Users className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                    <p className="text-muted-foreground">No submissions yet.</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="learn-more">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Learn More Content</CardTitle>
                <CardDescription>
                  Create the Learn More page that users see when they click the Learn More button.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-2">
                  <Label>Page Header</Label>
                  <Input
                    value={learnMoreHeader}
                    onChange={(e) => setLearnMoreHeader(e.target.value)}
                    placeholder="Enter a header for the Learn More page"
                    data-testid="input-learn-more-header"
                  />
                </div>

                <div className="space-y-3">
                  <Label>Images</Label>
                  <div className="flex gap-2">
                    <Input
                      value={newImageUrl}
                      onChange={(e) => setNewImageUrl(e.target.value)}
                      placeholder="Enter image URL"
                      onKeyDown={(e) => e.key === "Enter" && handleAddImage()}
                      data-testid="input-learn-more-image-url"
                    />
                    <Button onClick={handleAddImage} data-testid="button-add-image">
                      <Plus className="w-4 h-4" />
                    </Button>
                  </div>
                  
                  {learnMoreImages.length > 0 && (
                    <div className="space-y-3">
                      <div className="relative bg-muted rounded-md overflow-hidden">
                        <img
                          src={learnMoreImages[previewImageIndex]}
                          alt={`Preview ${previewImageIndex + 1}`}
                          className="w-full h-64 object-cover"
                          onError={(e) => {
                            (e.target as HTMLImageElement).src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='100' height='100' viewBox='0 0 100 100'%3E%3Crect fill='%23f0f0f0' width='100' height='100'/%3E%3Ctext x='50' y='50' text-anchor='middle' dy='.3em' fill='%23999'%3EImage not found%3C/text%3E%3C/svg%3E";
                          }}
                        />
                        {learnMoreImages.length > 1 && (
                          <>
                            <Button
                              variant="outline"
                              size="icon"
                              className="absolute left-2 top-1/2 -translate-y-1/2 bg-background/80"
                              onClick={() => setPreviewImageIndex(prev => prev === 0 ? learnMoreImages.length - 1 : prev - 1)}
                              data-testid="button-prev-image"
                            >
                              <ChevronLeft className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="outline"
                              size="icon"
                              className="absolute right-2 top-1/2 -translate-y-1/2 bg-background/80"
                              onClick={() => setPreviewImageIndex(prev => prev === learnMoreImages.length - 1 ? 0 : prev + 1)}
                              data-testid="button-next-image"
                            >
                              <ChevronRight className="w-4 h-4" />
                            </Button>
                          </>
                        )}
                        <div className="absolute bottom-2 left-1/2 -translate-x-1/2 bg-background/80 px-2 py-1 rounded text-xs">
                          {previewImageIndex + 1} / {learnMoreImages.length}
                        </div>
                      </div>
                      
                      <div className="space-y-2">
                        {learnMoreImages.map((url, index) => (
                          <div key={index} className="flex items-center gap-2 p-2 border rounded-md">
                            <Image className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                            <span className="text-sm truncate flex-1">{url}</span>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleRemoveImage(index)}
                              data-testid={`button-remove-image-${index}`}
                            >
                              <Trash2 className="w-4 h-4 text-destructive" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <Label>Description</Label>
                  <Textarea
                    value={learnMoreDescription}
                    onChange={(e) => setLearnMoreDescription(e.target.value)}
                    placeholder="Enter a description for this cruise..."
                    rows={6}
                    data-testid="input-learn-more-description"
                  />
                </div>

                <Button
                  onClick={handleSaveLearnMore}
                  disabled={updateLearnMoreMutation.isPending}
                  className="w-full gap-2"
                  data-testid="button-save-learn-more"
                >
                  {updateLearnMoreMutation.isPending ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Save className="w-4 h-4" />
                  )}
                  Save Learn More Content
                </Button>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>

      <Dialog open={isEditing} onOpenChange={setIsEditing}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Cruise</DialogTitle>
            <DialogDescription>
              Update the cruise details.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Name</Label>
              <Input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                data-testid="input-edit-cruise-name"
              />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
                data-testid="input-edit-cruise-description"
              />
            </div>
            <div className="flex items-center gap-2">
              <Switch
                checked={editIsActive}
                onCheckedChange={setEditIsActive}
                data-testid="switch-cruise-active"
              />
              <Label>Active (accepting new signups)</Label>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                checked={editIsPublished}
                onCheckedChange={setEditIsPublished}
                data-testid="switch-cruise-published"
              />
              <Label>Published (visible on public landing page)</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditing(false)}>
              Cancel
            </Button>
            <Button
              onClick={saveEdit}
              disabled={!editName.trim() || updateCruiseMutation.isPending}
              data-testid="button-save-cruise"
            >
              {updateCruiseMutation.isPending ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : null}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Sheet open={!!selectedSubmission} onOpenChange={() => setSelectedSubmission(null)}>
        <SheetContent className="w-full sm:max-w-lg">
          <SheetHeader>
            <SheetTitle>Submission Details</SheetTitle>
            <SheetDescription>
              View the full form answers for this submission.
            </SheetDescription>
          </SheetHeader>
          {selectedSubmission && (
            <ScrollArea className="h-[calc(100vh-120px)] mt-4">
              <div className="space-y-6 pr-4">
                <div className="flex items-center gap-4 p-4 bg-muted rounded-md">
                  <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                    <User className="w-6 h-6 text-primary" />
                  </div>
                  <div>
                    <p className="font-semibold">{selectedSubmission.customerName || "Unknown"}</p>
                    <div className="flex items-center gap-1 text-sm text-muted-foreground">
                      <Phone className="w-3 h-3" />
                      {selectedSubmission.customerPhone || "N/A"}
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <h4 className="font-semibold">Form Answers</h4>
                  {Object.entries(selectedSubmission.answers || {}).map(([stepId, answer]) => {
                    const question = template?.graph?.steps[stepId]?.question || stepId;
                    return (
                      <div key={stepId} className="p-4 border rounded-md">
                        <p className="text-sm text-muted-foreground mb-2">{question}</p>
                        {Array.isArray(answer) ? (
                          <div className="space-y-2">
                            {(answer as QuantityAnswer[]).map((qa) => (
                              qa.quantity > 0 && (
                                <div key={qa.choiceId} className="flex justify-between items-center">
                                  <span>{qa.label}</span>
                                  <span className="font-medium">
                                    {qa.quantity} x ${qa.price.toFixed(2)} = ${(qa.quantity * qa.price).toFixed(2)}
                                  </span>
                                </div>
                              )
                            ))}
                            <div className="border-t pt-2 mt-2 flex justify-between font-semibold">
                              <span>Subtotal</span>
                              <span>
                                ${(answer as QuantityAnswer[]).reduce((sum, qa) => sum + qa.quantity * qa.price, 0).toFixed(2)}
                              </span>
                            </div>
                          </div>
                        ) : (
                          <p className="font-medium">{answer as string}</p>
                        )}
                      </div>
                    );
                  })}
                </div>

                <div className="text-sm text-muted-foreground">
                  Submitted on {selectedSubmission.createdAt ? new Date(selectedSubmission.createdAt).toLocaleString() : "N/A"}
                </div>
              </div>
            </ScrollArea>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
