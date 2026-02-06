import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import session from "express-session";
import { storage } from "./storage";
import { randomBytes } from "crypto";
import bcrypt from "bcrypt";
import { z } from "zod";
import { insertTemplateSchema, insertSubmissionSchema, graphSchema, quantityAnswerSchema } from "@shared/schema";
import { registerObjectStorageRoutes } from "./replit_integrations/object_storage";

declare module "express-session" {
  interface SessionData {
    userId?: string;
  }
}

const requireAuth = (req: Request, res: Response, next: NextFunction) => {
  if (!req.session.userId) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  next();
};

// Simple in-memory rate limiter for public form submissions
const submissionRateLimit = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute
const RATE_LIMIT_MAX = 10; // 10 submissions per minute per IP

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = submissionRateLimit.get(ip);

  if (!entry || now >= entry.resetAt) {
    submissionRateLimit.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW });
    return true;
  }

  if (entry.count >= RATE_LIMIT_MAX) {
    return false;
  }

  entry.count++;
  return true;
}

// Periodically clean up expired rate limit entries
setInterval(() => {
  const now = Date.now();
  submissionRateLimit.forEach((entry, ip) => {
    if (now >= entry.resetAt) submissionRateLimit.delete(ip);
  });
}, 5 * 60 * 1000);

// Validation schemas
const loginSchema = z.object({
  username: z.string().min(1, "Username required"),
  password: z.string().min(1, "Password required"),
});

const templateCreateSchema = z.object({
  name: z.string().min(1, "Name required"),
  graph: graphSchema,
  published: z.boolean().optional().default(false),
  shareId: z.string().nullable().optional(),
});

const templateUpdateSchema = z.object({
  name: z.string().min(1).optional(),
  graph: graphSchema.optional(),
  published: z.boolean().optional(),
  shareId: z.string().nullable().optional(),
});

const cruiseCreateSchema = z.object({
  name: z.string().min(1, "Name required"),
  description: z.string().nullable().optional(),
  startDate: z.string().nullable().optional(),
  endDate: z.string().nullable().optional(),
  templateId: z.string().min(1, "Template required"),
  isActive: z.boolean().optional().default(true),
  isPublished: z.boolean().optional().default(false),
});

const cruiseUpdateSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  startDate: z.string().nullable().optional(),
  endDate: z.string().nullable().optional(),
  templateId: z.string().optional(),
  isActive: z.boolean().optional(),
  isPublished: z.boolean().optional(),
  learnMoreHeader: z.string().nullable().optional(),
  learnMoreImages: z.array(z.string()).nullable().optional(),
  learnMoreDescription: z.string().nullable().optional(),
});

const inventoryLimitUpdateSchema = z.object({
  stepId: z.string(),
  choiceId: z.string(),
  limit: z.number().nullable(),
});

const submissionSchema = z.object({
  answers: z.record(z.string(), z.union([z.string(), z.array(quantityAnswerSchema)])),
  customerName: z.string().optional(),
  customerPhone: z.string().min(1, "Phone number is required").refine(
    (val) => val.replace(/\D/g, "").length >= 7,
    "Phone number must have at least 7 digits"
  ),
});

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  // Validate session secret
  const sessionSecret = process.env.SESSION_SECRET;
  if (!sessionSecret) {
    console.warn("Warning: SESSION_SECRET not set. Using fallback for development only.");
  }

  // Trust proxy for production (Replit sits behind a proxy)
  const isProduction = process.env.NODE_ENV === "production";
  if (isProduction) {
    app.set("trust proxy", 1);
  }

  // Session middleware
  app.use(
    session({
      secret: sessionSecret || "dev-only-secret-change-in-prod",
      resave: false,
      saveUninitialized: false,
      cookie: {
        secure: isProduction,
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000, // 24 hours
        sameSite: isProduction ? "none" : "lax",
      },
    })
  );

  // Object storage routes for file uploads
  registerObjectStorageRoutes(app);

  // Auth routes
  app.post("/api/auth/login", async (req, res) => {
    try {
      const parseResult = loginSchema.safeParse(req.body);
      if (!parseResult.success) {
        return res.status(400).json({ error: parseResult.error.errors[0].message });
      }

      const { username, password } = parseResult.data;
      const user = await storage.getUserByUsername(username);
      
      if (!user) {
        return res.status(401).json({ error: "Invalid credentials" });
      }

      const isValidPassword = await bcrypt.compare(password, user.password);
      if (!isValidPassword) {
        return res.status(401).json({ error: "Invalid credentials" });
      }

      req.session.userId = user.id;
      res.json({ id: user.id, username: user.username });
    } catch (error) {
      console.error("Login error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/auth/logout", (req, res) => {
    req.session.destroy((err) => {
      if (err) {
        return res.status(500).json({ error: "Logout failed" });
      }
      res.json({ success: true });
    });
  });

  app.get("/api/auth/me", requireAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      res.json({ id: user.id, username: user.username });
    } catch (error) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Public routes for landing page
  app.get("/api/public/cruises", async (req, res) => {
    try {
      const publishedCruises = await storage.getPublishedCruises();
      res.json(publishedCruises);
    } catch (error) {
      console.error("Get published cruises error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Public learn more page for a cruise
  app.get("/api/public/cruises/:shareId/learn-more", async (req, res) => {
    try {
      const cruise = await storage.getCruiseByShareId(req.params.shareId);
      if (!cruise || !cruise.isPublished) {
        return res.status(404).json({ error: "Cruise not found" });
      }
      res.json({
        id: cruise.id,
        name: cruise.name,
        shareId: cruise.shareId,
        learnMoreHeader: cruise.learnMoreHeader,
        learnMoreImages: cruise.learnMoreImages,
        learnMoreDescription: cruise.learnMoreDescription,
      });
    } catch (error) {
      console.error("Get cruise learn more error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Template routes (protected)
  app.get("/api/templates", requireAuth, async (req, res) => {
    try {
      const templates = await storage.getTemplatesWithCruiseCounts();
      res.json(templates);
    } catch (error) {
      console.error("Get templates error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/templates/:id", requireAuth, async (req, res) => {
    try {
      const template = await storage.getTemplate(req.params.id);
      if (!template) {
        return res.status(404).json({ error: "Template not found" });
      }
      res.json(template);
    } catch (error) {
      console.error("Get template error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/templates", requireAuth, async (req, res) => {
    try {
      const parseResult = templateCreateSchema.safeParse(req.body);
      if (!parseResult.success) {
        return res.status(400).json({ error: parseResult.error.errors[0].message });
      }

      const { name, graph, published, shareId } = parseResult.data;
      const template = await storage.createTemplate({
        name,
        graph,
        published: published || false,
        shareId: shareId || null,
      });
      res.status(201).json(template);
    } catch (error) {
      console.error("Create template error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.patch("/api/templates/:id", requireAuth, async (req, res) => {
    try {
      const parseResult = templateUpdateSchema.safeParse(req.body);
      if (!parseResult.success) {
        return res.status(400).json({ error: parseResult.error.errors[0].message });
      }

      const { name, graph, published, shareId } = parseResult.data;
      const template = await storage.updateTemplate(req.params.id, {
        ...(name !== undefined && { name }),
        ...(graph !== undefined && { graph }),
        ...(published !== undefined && { published }),
        ...(shareId !== undefined && { shareId }),
      });

      if (!template) {
        return res.status(404).json({ error: "Template not found" });
      }
      res.json(template);
    } catch (error) {
      console.error("Update template error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.delete("/api/templates/:id", requireAuth, async (req, res) => {
    try {
      await storage.deleteTemplate(req.params.id);
      res.json({ success: true });
    } catch (error: any) {
      if (error.message?.includes("Cannot delete template")) {
        return res.status(400).json({ error: error.message });
      }
      console.error("Delete template error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/templates/:id/duplicate", requireAuth, async (req, res) => {
    try {
      const original = await storage.getTemplate(req.params.id);
      if (!original) {
        return res.status(404).json({ error: "Template not found" });
      }

      const duplicate = await storage.createTemplate({
        name: `${original.name} (Copy)`,
        graph: original.graph,
        published: false,
        shareId: null,
      });
      res.status(201).json(duplicate);
    } catch (error) {
      console.error("Duplicate template error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/templates/:id/publish", requireAuth, async (req, res) => {
    try {
      const template = await storage.getTemplate(req.params.id);
      if (!template) {
        return res.status(404).json({ error: "Template not found" });
      }

      const shareId = template.shareId || randomBytes(8).toString("hex");
      
      const updated = await storage.updateTemplate(req.params.id, {
        published: true,
        shareId,
      });

      res.json({ shareId, template: updated });
    } catch (error) {
      console.error("Publish template error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Cruise routes (protected)
  app.get("/api/cruises", requireAuth, async (req, res) => {
    try {
      const cruiseList = await storage.getCruises();
      // Add submission counts for each cruise
      const cruisesWithCounts = await Promise.all(
        cruiseList.map(async (cruise) => {
          const submissionCount = await storage.getSubmissionCountByCruise(cruise.id);
          const unviewedCount = await storage.getUnviewedSubmissionCount(cruise.id);
          return {
            ...cruise,
            submissionCount,
            unviewedCount,
          };
        })
      );
      res.json(cruisesWithCounts);
    } catch (error) {
      console.error("Get cruises error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/cruises/:id", requireAuth, async (req, res) => {
    try {
      const cruise = await storage.getCruise(req.params.id);
      if (!cruise) {
        return res.status(404).json({ error: "Cruise not found" });
      }
      const submissionCount = await storage.getSubmissionCountByCruise(cruise.id);
      const unviewedCount = await storage.getUnviewedSubmissionCount(cruise.id);
      res.json({ ...cruise, submissionCount, unviewedCount });
    } catch (error) {
      console.error("Get cruise error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/cruises", requireAuth, async (req, res) => {
    try {
      const parseResult = cruiseCreateSchema.safeParse(req.body);
      if (!parseResult.success) {
        return res.status(400).json({ error: parseResult.error.errors[0].message });
      }

      const { name, description, startDate, endDate, templateId, isActive, isPublished } = parseResult.data;

      // Validate date range
      if (startDate && endDate) {
        const start = new Date(startDate);
        const end = new Date(endDate);
        if (isNaN(start.getTime()) || isNaN(end.getTime())) {
          return res.status(400).json({ error: "Invalid date format" });
        }
        if (end <= start) {
          return res.status(400).json({ error: "End date must be after start date" });
        }
      }

      // Verify template exists
      const template = await storage.getTemplate(templateId);
      if (!template) {
        return res.status(400).json({ error: "Template not found" });
      }

      // Generate unique shareId
      const shareId = randomBytes(8).toString("hex");

      const cruise = await storage.createCruise({
        name,
        description: description || null,
        startDate: startDate ? new Date(startDate) : null,
        endDate: endDate ? new Date(endDate) : null,
        templateId,
        shareId,
        isActive: isActive !== false,
        isPublished: isPublished || false,
      });

      // Initialize inventory for quantity steps
      if (template.graph?.steps) {
        for (const [stepId, step] of Object.entries(template.graph.steps)) {
          if (step.type === "quantity" && step.quantityChoices) {
            for (const choice of step.quantityChoices) {
              if (!choice.isNoThanks) {
                await storage.upsertInventoryItem({
                  cruiseId: cruise.id,
                  stepId,
                  choiceId: choice.id,
                  choiceLabel: choice.label,
                  price: String(choice.price || 0),
                  totalOrdered: 0,
                  stockLimit: choice.limit || null,
                });
              }
            }
          }
        }
      }

      res.status(201).json(cruise);
    } catch (error) {
      console.error("Create cruise error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.patch("/api/cruises/:id", requireAuth, async (req, res) => {
    try {
      const parseResult = cruiseUpdateSchema.safeParse(req.body);
      if (!parseResult.success) {
        return res.status(400).json({ error: parseResult.error.errors[0].message });
      }

      const { name, description, startDate, endDate, templateId, isActive, isPublished, learnMoreHeader, learnMoreImages, learnMoreDescription } = parseResult.data;
      
      const cruise = await storage.updateCruise(req.params.id, {
        ...(name !== undefined && { name }),
        ...(description !== undefined && { description }),
        ...(startDate !== undefined && { startDate: startDate ? new Date(startDate) : null }),
        ...(endDate !== undefined && { endDate: endDate ? new Date(endDate) : null }),
        ...(templateId !== undefined && { templateId }),
        ...(isActive !== undefined && { isActive }),
        ...(isPublished !== undefined && { isPublished }),
        ...(learnMoreHeader !== undefined && { learnMoreHeader }),
        ...(learnMoreImages !== undefined && { learnMoreImages }),
        ...(learnMoreDescription !== undefined && { learnMoreDescription }),
      });

      if (!cruise) {
        return res.status(404).json({ error: "Cruise not found" });
      }
      res.json(cruise);
    } catch (error) {
      console.error("Update cruise error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.delete("/api/cruises/:id", requireAuth, async (req, res) => {
    try {
      await storage.deleteCruise(req.params.id);
      res.json({ success: true });
    } catch (error) {
      console.error("Delete cruise error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Cruise inventory routes
  app.get("/api/cruises/:id/inventory", requireAuth, async (req, res) => {
    try {
      const inventory = await storage.getCruiseInventory(req.params.id);
      res.json(inventory);
    } catch (error) {
      console.error("Get cruise inventory error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.patch("/api/cruises/:id/inventory/limit", requireAuth, async (req, res) => {
    try {
      const parseResult = inventoryLimitUpdateSchema.safeParse(req.body);
      if (!parseResult.success) {
        return res.status(400).json({ error: parseResult.error.errors[0].message });
      }

      const { stepId, choiceId, limit } = parseResult.data;

      // Validate that new limit is not below current orders
      if (limit !== null) {
        const item = await storage.getInventoryItem(req.params.id, stepId, choiceId);
        if (item && limit < item.totalOrdered) {
          return res.status(400).json({
            error: `Cannot set limit to ${limit}. Already ${item.totalOrdered} ordered.`
          });
        }
      }

      await storage.updateInventoryLimit(req.params.id, stepId, choiceId, limit);
      res.json({ success: true });
    } catch (error) {
      console.error("Update inventory limit error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Cruise submissions routes
  app.get("/api/cruises/:id/submissions", requireAuth, async (req, res) => {
    try {
      const submissions = await storage.getSubmissionsByCruise(req.params.id);
      // Mark as viewed
      await storage.markSubmissionsViewed(req.params.id);
      res.json(submissions);
    } catch (error) {
      console.error("Get cruise submissions error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Public form routes - now for cruises
  app.get("/api/forms/:shareId", async (req, res) => {
    try {
      // First try to find a cruise with this shareId
      const cruise = await storage.getCruiseByShareId(req.params.shareId);
      if (cruise) {
        // Check if cruise is published and active
        if (!cruise.isPublished || !cruise.isActive) {
          return res.status(404).json({ error: "This cruise is not currently available", notAvailable: true });
        }
        const template = await storage.getTemplate(cruise.templateId);
        if (template) {
          // Get inventory for stock limit enforcement
          const inventory = await storage.getCruiseInventory(cruise.id);
          return res.json({ 
            ...template, 
            cruise,
            inventory: inventory.map(item => ({
              stepId: item.stepId,
              choiceId: item.choiceId,
              remaining: item.stockLimit ? Math.max(0, item.stockLimit - item.totalOrdered) : null,
              isSoldOut: item.stockLimit ? item.totalOrdered >= item.stockLimit : false,
            }))
          });
        }
      }

      // Fall back to template shareId (legacy support)
      const template = await storage.getTemplateByShareId(req.params.shareId);
      if (!template || !template.published) {
        return res.status(404).json({ error: "Form not found" });
      }
      res.json(template);
    } catch (error) {
      console.error("Get form error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/forms/:shareId/submit", async (req, res) => {
    try {
      // Rate limit check
      const clientIp = req.ip || req.socket.remoteAddress || "unknown";
      if (!checkRateLimit(clientIp)) {
        return res.status(429).json({ error: "Too many submissions. Please try again later." });
      }

      let templateId: string;
      let cruiseId: string | null = null;

      // Check if this is a cruise form
      const cruise = await storage.getCruiseByShareId(req.params.shareId);
      if (cruise && cruise.isActive && cruise.isPublished) {
        templateId = cruise.templateId;
        cruiseId = cruise.id;
      } else if (cruise && (!cruise.isActive || !cruise.isPublished)) {
        return res.status(404).json({ error: "This cruise is not currently available" });
      } else {
        // Fall back to template shareId
        const template = await storage.getTemplateByShareId(req.params.shareId);
        if (!template || !template.published) {
          return res.status(404).json({ error: "Form not found" });
        }
        templateId = template.id;
      }

      const parseResult = submissionSchema.safeParse(req.body);
      if (!parseResult.success) {
        return res.status(400).json({ error: parseResult.error.errors[0].message });
      }

      const { answers, customerName, customerPhone } = parseResult.data;

      // If this is a cruise form, update inventory totals atomically within a transaction
      if (cruiseId) {
        const inventoryItems: Array<{ stepId: string; choiceId: string; quantity: number; label: string }> = [];
        for (const [stepId, answer] of Object.entries(answers)) {
          if (Array.isArray(answer)) {
            for (const qa of answer) {
              if (qa.quantity > 0) {
                inventoryItems.push({ stepId, choiceId: qa.choiceId, quantity: qa.quantity, label: qa.label });
              }
            }
          }
        }

        if (inventoryItems.length > 0) {
          const result = await storage.checkAndUpdateInventory(cruiseId, inventoryItems);
          if (!result.success) {
            return res.status(400).json({ error: result.error });
          }
        }
      }

      const submission = await storage.createSubmission({
        templateId,
        cruiseId,
        answers,
        customerName: customerName || null,
        customerPhone: customerPhone || null,
        isViewed: false,
      });

      res.status(201).json(submission);
    } catch (error) {
      console.error("Submit form error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Submissions routes (protected)
  app.get("/api/submissions", requireAuth, async (req, res) => {
    try {
      const templateId = req.query.templateId as string | undefined;
      const submissions = await storage.getSubmissions(templateId);
      res.json(submissions);
    } catch (error) {
      console.error("Get submissions error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  return httpServer;
}
