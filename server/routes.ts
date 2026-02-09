import type { Express, Request, Response, NextFunction } from "express";
import { type Server } from "http";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import pg from "pg";
import compression from "compression";
import { storage } from "./storage";
import { randomBytes } from "crypto";
import bcrypt from "bcrypt";
import { z } from "zod";
import { insertTemplateSchema, insertSubmissionSchema, graphSchema, quantityAnswerSchema, insertCruiseFormSchema } from "@shared/schema";
import type { Submission, FormGraph, CruiseForm } from "@shared/schema";
import { registerObjectStorageRoutes } from "./replit_integrations/object_storage";
import ExcelJS from "exceljs";
import PDFDocument from "pdfkit";

declare module "express-session" {
  interface SessionData {
    userId?: string;
  }
}

/** Extract a route param as a single string (Express 5 types params as string | string[]). */
function param(req: Request, name: string): string {
  const v = req.params[name];
  return Array.isArray(v) ? v[0] : v;
}

const requireAuth = (req: Request, res: Response, next: NextFunction) => {
  if (!req.session.userId) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  next();
};

// Rate limiter supporting multiple keys (submission + login)
class RateLimiter {
  private entries = new Map<string, { count: number; resetAt: number }>();

  constructor(private windowMs: number, private maxRequests: number) {
    // Clean up expired entries every 5 minutes
    setInterval(() => {
      const now = Date.now();
      this.entries.forEach((entry, key) => {
        if (now >= entry.resetAt) this.entries.delete(key);
      });
    }, 5 * 60 * 1000);
  }

  check(key: string): boolean {
    const now = Date.now();
    const entry = this.entries.get(key);

    if (!entry || now >= entry.resetAt) {
      this.entries.set(key, { count: 1, resetAt: now + this.windowMs });
      return true;
    }

    if (entry.count >= this.maxRequests) {
      return false;
    }

    entry.count++;
    return true;
  }
}

const submissionLimiter = new RateLimiter(60 * 1000, 10); // 10/min per IP
const loginLimiter = new RateLimiter(15 * 60 * 1000, 10); // 10 per 15min per IP

// Helper to log audit events (fire and forget, never blocks request)
async function audit(
  req: Request,
  action: string,
  entityType: string,
  entityId?: string,
  details?: Record<string, unknown>
) {
  try {
    await storage.createAuditLog({
      userId: req.session.userId || null,
      action,
      entityType,
      entityId: entityId || null,
      details: details || null,
      ipAddress: req.ip || req.socket.remoteAddress || null,
    });
  } catch {
    // Audit failure should never break the request
  }
}

// CSV helper
function escapeCsvField(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

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

const cruiseFormCreateSchema = z.object({
  templateId: z.string().min(1, "Template required"),
  label: z.string().min(1, "Label required"),
  stage: z.string().min(1).default("booking"),
  isActive: z.boolean().optional().default(true),
});

const cruiseFormUpdateSchema = z.object({
  label: z.string().min(1).optional(),
  stage: z.string().min(1).optional(),
  isActive: z.boolean().optional(),
  sortOrder: z.number().optional(),
});

const notificationSettingsSchema = z.object({
  emailOnSubmission: z.boolean().optional(),
  emailAddress: z.string().email().nullable().optional(),
});

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  // Validate session secret — crash in production if missing
  const sessionSecret = process.env.SESSION_SECRET;
  const isProduction = process.env.NODE_ENV === "production";

  if (!sessionSecret && isProduction) {
    console.error("FATAL: SESSION_SECRET must be set in production");
    process.exit(1);
  }
  if (!sessionSecret) {
    console.warn("Warning: SESSION_SECRET not set. Using fallback for development only.");
  }

  // Trust proxy for production (Replit sits behind a proxy)
  if (isProduction) {
    app.set("trust proxy", 1);
  }

  // Compression middleware
  app.use(compression());

  // Session middleware with PostgreSQL store
  const PgSession = connectPgSimple(session);
  const sessionPool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
  });

  app.use(
    session({
      store: new PgSession({
        pool: sessionPool,
        tableName: "user_sessions",
        createTableIfMissing: true,
      }),
      secret: sessionSecret || "dev-only-secret-change-in-prod",
      resave: false,
      saveUninitialized: false,
      cookie: {
        secure: isProduction,
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000, // 24 hours
        sameSite: "lax",
      },
    })
  );

  // Object storage routes for file uploads
  registerObjectStorageRoutes(app);

  // Health check endpoint
  app.get("/api/health", async (_req, res) => {
    try {
      await sessionPool.query("SELECT 1");
      res.json({ status: "ok", timestamp: new Date().toISOString() });
    } catch {
      res.status(503).json({ status: "unhealthy", timestamp: new Date().toISOString() });
    }
  });

  // Auth routes
  app.post("/api/auth/login", async (req, res) => {
    try {
      // Rate limit login attempts
      const clientIp = req.ip || req.socket.remoteAddress || "unknown";
      if (!loginLimiter.check(`login:${clientIp}`)) {
        return res.status(429).json({ error: "Too many login attempts. Please try again later." });
      }

      const parseResult = loginSchema.safeParse(req.body);
      if (!parseResult.success) {
        return res.status(400).json({ error: parseResult.error.errors[0]?.message ?? "Validation error" });
      }

      const { username, password } = parseResult.data;
      const user = await storage.getUserByUsername(username);

      if (!user) {
        return res.status(401).json({ error: "Invalid credentials" });
      }

      const isValidPassword = await bcrypt.compare(password, user.password);
      if (!isValidPassword) {
        await audit(req, "auth.login_failed", "user", undefined, { username });
        return res.status(401).json({ error: "Invalid credentials" });
      }

      req.session.userId = user.id;
      await audit(req, "auth.login", "user", user.id);
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
      // Attach active forms for each cruise
      const cruisesWithForms = await Promise.all(
        publishedCruises.map(async (cruise) => {
          const forms = await storage.getCruiseForms(cruise.id);
          return { ...cruise, forms: forms.filter(f => f.isActive) };
        })
      );
      res.json(cruisesWithForms);
    } catch (error) {
      console.error("Get published cruises error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Public learn more page for a cruise
  app.get("/api/public/cruises/:shareId/learn-more", async (req, res) => {
    try {
      const cruise = await storage.getCruiseByShareId(param(req, "shareId"));
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
      const template = await storage.getTemplate(param(req, "id"));
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
        return res.status(400).json({ error: parseResult.error.errors[0]?.message ?? "Validation error" });
      }

      const { name, graph, published, shareId } = parseResult.data;
      const template = await storage.createTemplate({
        name,
        graph,
        published: published || false,
        shareId: shareId || null,
      });
      await audit(req, "template.create", "template", template.id, { name });
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
        return res.status(400).json({ error: parseResult.error.errors[0]?.message ?? "Validation error" });
      }

      const { name, graph, published, shareId } = parseResult.data;
      const template = await storage.updateTemplate(param(req, "id"), {
        ...(name !== undefined && { name }),
        ...(graph !== undefined && { graph }),
        ...(published !== undefined && { published }),
        ...(shareId !== undefined && { shareId }),
      });

      if (!template) {
        return res.status(404).json({ error: "Template not found" });
      }
      await audit(req, "template.update", "template", template.id);
      res.json(template);
    } catch (error) {
      console.error("Update template error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.delete("/api/templates/:id", requireAuth, async (req, res) => {
    try {
      await storage.deleteTemplate(param(req, "id"));
      await audit(req, "template.delete", "template", param(req, "id"));
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
      const original = await storage.getTemplate(param(req, "id"));
      if (!original) {
        return res.status(404).json({ error: "Template not found" });
      }

      const duplicate = await storage.createTemplate({
        name: `${original.name} (Copy)`,
        graph: original.graph,
        published: false,
        shareId: null,
      });
      await audit(req, "template.duplicate", "template", duplicate.id, { sourceId: param(req, "id") });
      res.status(201).json(duplicate);
    } catch (error) {
      console.error("Duplicate template error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/templates/:id/publish", requireAuth, async (req, res) => {
    try {
      const template = await storage.getTemplate(param(req, "id"));
      if (!template) {
        return res.status(404).json({ error: "Template not found" });
      }

      const shareId = template.shareId || randomBytes(8).toString("hex");

      const updated = await storage.updateTemplate(param(req, "id"), {
        published: true,
        shareId,
      });

      await audit(req, "template.publish", "template", param(req, "id"));
      res.json({ shareId, template: updated });
    } catch (error) {
      console.error("Publish template error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Cruise routes (protected) — now with pagination and N+1 fix
  app.get("/api/cruises", requireAuth, async (req, res) => {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 20;
      const search = (req.query.search as string) || undefined;

      const result = await storage.getCruisesPaginated({ page, limit, search });

      // Attach forms with per-form stats for each cruise
      const dataWithForms = await Promise.all(
        result.data.map(async (cruise) => {
          const forms = await storage.getCruiseForms(cruise.id);
          const formStats = await storage.getFormSubmissionStats(cruise.id);
          const formsWithStats = forms.map(form => {
            const stats = formStats.find(s => s.cruiseFormId === form.id);
            return {
              ...form,
              submissionCount: stats?.submissionCount || 0,
              unviewedCount: stats?.unviewedCount || 0,
            };
          });
          return { ...cruise, forms: formsWithStats };
        })
      );

      res.json({ ...result, data: dataWithForms });
    } catch (error) {
      console.error("Get cruises error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/cruises/:id", requireAuth, async (req, res) => {
    try {
      const cruise = await storage.getCruise(param(req, "id"));
      if (!cruise) {
        return res.status(404).json({ error: "Cruise not found" });
      }
      const submissionCount = await storage.getSubmissionCountByCruise(cruise.id);
      const unviewedCount = await storage.getUnviewedSubmissionCount(cruise.id);
      const forms = await storage.getCruiseForms(cruise.id);
      const formStats = await storage.getFormSubmissionStats(cruise.id);

      // Merge stats into forms
      const formsWithStats = forms.map(form => {
        const stats = formStats.find(s => s.cruiseFormId === form.id);
        return {
          ...form,
          submissionCount: stats?.submissionCount || 0,
          unviewedCount: stats?.unviewedCount || 0,
        };
      });

      res.json({ ...cruise, submissionCount, unviewedCount, forms: formsWithStats });
    } catch (error) {
      console.error("Get cruise error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/cruises", requireAuth, async (req, res) => {
    try {
      const parseResult = cruiseCreateSchema.safeParse(req.body);
      if (!parseResult.success) {
        return res.status(400).json({ error: parseResult.error.errors[0]?.message ?? "Validation error" });
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

      // Auto-create default CruiseForm entry for the primary template
      const formShareId = randomBytes(8).toString("hex");
      await storage.createCruiseForm({
        cruiseId: cruise.id,
        templateId,
        label: "Booking Form",
        stage: "booking",
        sortOrder: 0,
        isActive: true,
        shareId: formShareId,
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

      await audit(req, "cruise.create", "cruise", cruise.id, { name });
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
        return res.status(400).json({ error: parseResult.error.errors[0]?.message ?? "Validation error" });
      }

      const { name, description, startDate, endDate, templateId, isActive, isPublished, learnMoreHeader, learnMoreImages, learnMoreDescription } = parseResult.data;

      const cruise = await storage.updateCruise(param(req, "id"), {
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
      await audit(req, "cruise.update", "cruise", cruise.id);
      res.json(cruise);
    } catch (error) {
      console.error("Update cruise error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.delete("/api/cruises/:id", requireAuth, async (req, res) => {
    try {
      const deleted = await storage.deleteCruise(param(req, "id"));
      if (!deleted) {
        return res.status(404).json({ error: "Cruise not found" });
      }
      await audit(req, "cruise.delete", "cruise", param(req, "id"));
      res.json({ success: true });
    } catch (error) {
      console.error("Delete cruise error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Cruise Forms routes (protected)
  app.get("/api/cruises/:id/forms", requireAuth, async (req, res) => {
    try {
      const forms = await storage.getCruiseForms(param(req, "id"));
      res.json(forms);
    } catch (error) {
      console.error("Get cruise forms error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/cruises/:id/forms", requireAuth, async (req, res) => {
    try {
      const parseResult = cruiseFormCreateSchema.safeParse(req.body);
      if (!parseResult.success) {
        return res.status(400).json({ error: parseResult.error.errors[0]?.message ?? "Validation error" });
      }

      const { templateId, label, stage, isActive } = parseResult.data;
      const cruiseId = param(req, "id");

      // Verify cruise exists
      const cruise = await storage.getCruise(cruiseId);
      if (!cruise) {
        return res.status(404).json({ error: "Cruise not found" });
      }

      // Verify template exists
      const template = await storage.getTemplate(templateId);
      if (!template) {
        return res.status(400).json({ error: "Template not found" });
      }

      // Get current forms to determine sortOrder
      const existingForms = await storage.getCruiseForms(cruiseId);
      const sortOrder = existingForms.length;

      // Generate unique shareId
      const shareId = randomBytes(8).toString("hex");

      const form = await storage.createCruiseForm({
        cruiseId,
        templateId,
        label,
        stage,
        sortOrder,
        isActive: isActive !== false,
        shareId,
      });

      await audit(req, "cruise_form.create", "cruise_form", form.id, { cruiseId, label });
      res.status(201).json(form);
    } catch (error) {
      console.error("Create cruise form error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.patch("/api/cruises/:id/forms/:formId", requireAuth, async (req, res) => {
    try {
      const parseResult = cruiseFormUpdateSchema.safeParse(req.body);
      if (!parseResult.success) {
        return res.status(400).json({ error: parseResult.error.errors[0]?.message ?? "Validation error" });
      }

      // Verify the form belongs to the specified cruise
      const existingForm = await storage.getCruiseForm(param(req, "formId"));
      if (!existingForm || existingForm.cruiseId !== param(req, "id")) {
        return res.status(404).json({ error: "Form not found" });
      }

      const form = await storage.updateCruiseForm(param(req, "formId"), parseResult.data);
      if (!form) {
        return res.status(404).json({ error: "Form not found" });
      }

      await audit(req, "cruise_form.update", "cruise_form", form.id);
      res.json(form);
    } catch (error) {
      console.error("Update cruise form error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.delete("/api/cruises/:id/forms/:formId", requireAuth, async (req, res) => {
    try {
      // Verify the form belongs to the specified cruise
      const existingForm = await storage.getCruiseForm(param(req, "formId"));
      if (!existingForm || existingForm.cruiseId !== param(req, "id")) {
        return res.status(404).json({ error: "Form not found" });
      }

      await storage.deleteCruiseForm(param(req, "formId"));
      await audit(req, "cruise_form.delete", "cruise_form", param(req, "formId"));
      res.json({ success: true });
    } catch (error) {
      console.error("Delete cruise form error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Per-form submission stats
  app.get("/api/cruises/:id/forms/stats", requireAuth, async (req, res) => {
    try {
      const cruiseId = param(req, "id");
      const stats = await storage.getFormSubmissionStats(cruiseId);
      res.json(stats);
    } catch (error) {
      console.error("Get form submission stats error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Per-form submissions (paginated)
  app.get("/api/cruises/:id/forms/:formId/submissions", requireAuth, async (req, res) => {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 20;
      const search = (req.query.search as string) || undefined;

      const result = await storage.getSubmissionsByFormPaginated(param(req, "formId"), { page, limit, search });
      res.json(result);
    } catch (error) {
      console.error("Get form submissions error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Cruise inventory routes
  app.get("/api/cruises/:id/inventory", requireAuth, async (req, res) => {
    try {
      const inventory = await storage.getCruiseInventory(param(req, "id"));
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
        return res.status(400).json({ error: parseResult.error.errors[0]?.message ?? "Validation error" });
      }

      const { stepId, choiceId, limit } = parseResult.data;

      // Validate that new limit is not below current orders
      if (limit !== null) {
        const item = await storage.getInventoryItem(param(req, "id"), stepId, choiceId);
        if (item && limit < item.totalOrdered) {
          return res.status(400).json({
            error: `Cannot set limit to ${limit}. Already ${item.totalOrdered} ordered.`
          });
        }
      }

      await storage.updateInventoryLimit(param(req, "id"), stepId, choiceId, limit);
      await audit(req, "inventory.update_limit", "cruise_inventory", param(req, "id"), { stepId, choiceId, limit });
      res.json({ success: true });
    } catch (error) {
      console.error("Update inventory limit error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Inventory export as Excel
  app.get("/api/cruises/:id/inventory/export/excel", requireAuth, async (req, res) => {
    try {
      const cruise = await storage.getCruise(param(req, "id"));
      if (!cruise) {
        return res.status(404).json({ error: "Cruise not found" });
      }

      const inventoryItems = await storage.getCruiseInventory(param(req, "id"));
      if (inventoryItems.length === 0) {
        return res.status(404).json({ error: "No inventory items to export" });
      }

      // Resolve step labels from templates
      const forms = await storage.getCruiseForms(cruise.id);
      const templateIds = Array.from(new Set([cruise.templateId, ...forms.map(f => f.templateId)]));
      const stepLabels: Record<string, string> = {};
      for (const tid of templateIds) {
        const tmpl = await storage.getTemplate(tid);
        if (tmpl?.graph?.steps) {
          for (const [id, step] of Object.entries(tmpl.graph.steps)) {
            if (!stepLabels[id]) stepLabels[id] = step.question || id;
          }
        }
      }

      const workbook = new ExcelJS.Workbook();
      workbook.creator = "Cruise Form Builder";
      workbook.created = new Date();

      const sheet = workbook.addWorksheet("Inventory");
      const headers = ["Item", "Question", "Price", "Ordered", "Revenue", "Stock Limit", "Remaining", "Status"];
      sheet.addRow(headers);

      const headerRow = sheet.getRow(1);
      headerRow.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 };
      headerRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E3A5F" } };
      headerRow.alignment = { horizontal: "center" };

      for (const item of inventoryItems) {
        const remaining = item.stockLimit === null ? "Unlimited" : Math.max(0, item.stockLimit - item.totalOrdered);
        const soldOut = item.stockLimit !== null && item.totalOrdered >= item.stockLimit;
        sheet.addRow([
          item.choiceLabel,
          stepLabels[item.stepId] || item.stepId,
          Number(item.price),
          item.totalOrdered,
          Number(item.price) * item.totalOrdered,
          item.stockLimit ?? "Unlimited",
          remaining,
          soldOut ? "Sold Out" : "Available",
        ]);
      }

      // Format price columns as currency
      sheet.getColumn(3).numFmt = '$#,##0.00';
      sheet.getColumn(5).numFmt = '$#,##0.00';

      // Auto-fit column widths
      sheet.columns.forEach((col) => {
        let maxLen = 10;
        col.eachCell?.({ includeEmpty: true }, (cell) => {
          const val = cell.value?.toString() || "";
          maxLen = Math.max(maxLen, Math.min(val.length + 2, 50));
        });
        col.width = maxLen;
      });

      // Add totals row
      const totalRevenue = inventoryItems.reduce((sum, item) => sum + Number(item.price) * item.totalOrdered, 0);
      const totalOrdered = inventoryItems.reduce((sum, item) => sum + item.totalOrdered, 0);
      const totalsRow = sheet.addRow(["TOTALS", "", "", totalOrdered, totalRevenue, "", "", ""]);
      totalsRow.font = { bold: true };
      totalsRow.getCell(5).numFmt = '$#,##0.00';

      const filename = `${cruise.name.replace(/[^a-zA-Z0-9]/g, "_")}_inventory_${new Date().toISOString().split("T")[0]}.xlsx`;
      await audit(req, "inventory.export", "cruise", param(req, "id"), { count: inventoryItems.length, format: "excel" });

      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      await workbook.xlsx.write(res);
      res.end();
    } catch (error) {
      console.error("Export inventory Excel error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Inventory export as PDF
  app.get("/api/cruises/:id/inventory/export/pdf", requireAuth, async (req, res) => {
    try {
      const cruise = await storage.getCruise(param(req, "id"));
      if (!cruise) {
        return res.status(404).json({ error: "Cruise not found" });
      }

      const inventoryItems = await storage.getCruiseInventory(param(req, "id"));
      if (inventoryItems.length === 0) {
        return res.status(404).json({ error: "No inventory items to export" });
      }

      // Resolve step labels
      const forms = await storage.getCruiseForms(cruise.id);
      const templateIds = Array.from(new Set([cruise.templateId, ...forms.map(f => f.templateId)]));
      const stepLabels: Record<string, string> = {};
      for (const tid of templateIds) {
        const tmpl = await storage.getTemplate(tid);
        if (tmpl?.graph?.steps) {
          for (const [id, step] of Object.entries(tmpl.graph.steps)) {
            if (!stepLabels[id]) stepLabels[id] = step.question || id;
          }
        }
      }

      const filename = `${cruise.name.replace(/[^a-zA-Z0-9]/g, "_")}_inventory_${new Date().toISOString().split("T")[0]}.pdf`;
      await audit(req, "inventory.export", "cruise", param(req, "id"), { count: inventoryItems.length, format: "pdf" });

      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);

      const doc = new PDFDocument({ size: "LETTER", layout: "landscape", margin: 40, bufferPages: true });
      doc.pipe(res);

      // Title
      doc.fontSize(18).font("Helvetica-Bold").text(`${cruise.name} — Inventory`, { align: "center" });
      doc.fontSize(10).font("Helvetica").text(`Export Date: ${new Date().toLocaleDateString()}`, { align: "center" });
      doc.fontSize(10).text(`Total items: ${inventoryItems.length}`, { align: "center" });
      doc.moveDown(1.5);

      const pdfColumns = [
        { label: "Item", width: 180 },
        { label: "Price", width: 70 },
        { label: "Ordered", width: 70 },
        { label: "Revenue", width: 90 },
        { label: "Limit", width: 70 },
        { label: "Remaining", width: 80 },
        { label: "Status", width: 80 },
      ];

      const rowHeight = 22;
      const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
      const startX = doc.page.margins.left;

      const drawInvHeader = (y: number) => {
        doc.rect(startX, y, pageWidth, rowHeight).fill("#1E3A5F");
        let x = startX + 4;
        for (const col of pdfColumns) {
          doc.fontSize(8).font("Helvetica-Bold").fillColor("white")
            .text(col.label, x, y + 6, { width: col.width - 8, ellipsis: true });
          x += col.width;
        }
        doc.fillColor("black");
        return y + rowHeight;
      };

      let currentY = drawInvHeader(doc.y);

      for (let i = 0; i < inventoryItems.length; i++) {
        const item = inventoryItems[i];

        if (currentY + rowHeight > doc.page.height - doc.page.margins.bottom - 40) {
          doc.addPage();
          currentY = drawInvHeader(doc.page.margins.top);
        }

        if (i % 2 === 0) {
          doc.rect(startX, currentY, pageWidth, rowHeight).fill("#F5F5F5");
        }
        doc.fillColor("black");

        const remaining = item.stockLimit === null ? "Unlimited" : String(Math.max(0, item.stockLimit - item.totalOrdered));
        const soldOut = item.stockLimit !== null && item.totalOrdered >= item.stockLimit;
        const values = [
          item.choiceLabel,
          `$${Number(item.price).toFixed(2)}`,
          String(item.totalOrdered),
          `$${(Number(item.price) * item.totalOrdered).toFixed(2)}`,
          item.stockLimit !== null ? String(item.stockLimit) : "Unlimited",
          remaining,
          soldOut ? "Sold Out" : "Available",
        ];

        let x = startX + 4;
        for (let j = 0; j < pdfColumns.length; j++) {
          doc.fontSize(7).font("Helvetica")
            .text(values[j], x, currentY + 6, { width: pdfColumns[j].width - 8, ellipsis: true });
          x += pdfColumns[j].width;
        }

        currentY += rowHeight;
      }

      // Totals row
      if (currentY + rowHeight > doc.page.height - doc.page.margins.bottom - 20) {
        doc.addPage();
        currentY = doc.page.margins.top;
      }
      doc.rect(startX, currentY, pageWidth, rowHeight).fill("#E0E7EF");
      doc.fillColor("black");
      const totalRevenue = inventoryItems.reduce((sum, item) => sum + Number(item.price) * item.totalOrdered, 0);
      const totalOrdered = inventoryItems.reduce((sum, item) => sum + item.totalOrdered, 0);
      let x = startX + 4;
      const totals = ["TOTALS", "", String(totalOrdered), `$${totalRevenue.toFixed(2)}`, "", "", ""];
      for (let j = 0; j < pdfColumns.length; j++) {
        doc.fontSize(8).font("Helvetica-Bold")
          .text(totals[j], x, currentY + 6, { width: pdfColumns[j].width - 8, ellipsis: true });
        x += pdfColumns[j].width;
      }

      doc.end();
    } catch (error) {
      console.error("Export inventory PDF error:", error);
      if (!res.headersSent) {
        res.status(500).json({ error: "Internal server error" });
      }
    }
  });

  // Inventory export as CSV
  app.get("/api/cruises/:id/inventory/export/csv", requireAuth, async (req, res) => {
    try {
      const cruise = await storage.getCruise(param(req, "id"));
      if (!cruise) {
        return res.status(404).json({ error: "Cruise not found" });
      }

      const inventoryItems = await storage.getCruiseInventory(param(req, "id"));
      if (inventoryItems.length === 0) {
        return res.status(404).json({ error: "No inventory items to export" });
      }

      const forms = await storage.getCruiseForms(cruise.id);
      const templateIds = Array.from(new Set([cruise.templateId, ...forms.map(f => f.templateId)]));
      const stepLabels: Record<string, string> = {};
      for (const tid of templateIds) {
        const tmpl = await storage.getTemplate(tid);
        if (tmpl?.graph?.steps) {
          for (const [id, step] of Object.entries(tmpl.graph.steps)) {
            if (!stepLabels[id]) stepLabels[id] = step.question || id;
          }
        }
      }

      const headers = ["Item", "Question", "Price", "Ordered", "Revenue", "Stock Limit", "Remaining", "Status"];
      const rows: string[] = [headers.map(escapeCsvField).join(",")];

      for (const item of inventoryItems) {
        const remaining = item.stockLimit === null ? "Unlimited" : String(Math.max(0, item.stockLimit - item.totalOrdered));
        const soldOut = item.stockLimit !== null && item.totalOrdered >= item.stockLimit;
        rows.push([
          item.choiceLabel,
          stepLabels[item.stepId] || item.stepId,
          `$${Number(item.price).toFixed(2)}`,
          String(item.totalOrdered),
          `$${(Number(item.price) * item.totalOrdered).toFixed(2)}`,
          item.stockLimit !== null ? String(item.stockLimit) : "Unlimited",
          remaining,
          soldOut ? "Sold Out" : "Available",
        ].map(escapeCsvField).join(","));
      }

      const csvContent = rows.join("\n");
      const filename = `${cruise.name.replace(/[^a-zA-Z0-9]/g, "_")}_inventory_${new Date().toISOString().split("T")[0]}.csv`;
      await audit(req, "inventory.export", "cruise", param(req, "id"), { count: inventoryItems.length, format: "csv" });

      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      res.send(csvContent);
    } catch (error) {
      console.error("Export inventory CSV error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Cruise submissions routes — now with pagination and search
  app.get("/api/cruises/:id/submissions", requireAuth, async (req, res) => {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 20;
      const search = (req.query.search as string) || undefined;

      const result = await storage.getSubmissionsByCruisePaginated(param(req, "id"), { page, limit, search });
      // Don't auto-mark all as viewed; let client mark individually
      res.json(result);
    } catch (error) {
      console.error("Get cruise submissions error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Mark a single submission as viewed
  app.patch("/api/submissions/:id/viewed", requireAuth, async (req, res) => {
    try {
      const submission = await storage.markSubmissionViewed(param(req, "id"));
      if (!submission) {
        return res.status(404).json({ error: "Submission not found" });
      }
      res.json({ success: true });
    } catch (error) {
      console.error("Mark submission viewed error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Mark all submissions as viewed for a cruise
  app.post("/api/cruises/:id/submissions/mark-all-viewed", requireAuth, async (req, res) => {
    try {
      await storage.markSubmissionsViewed(param(req, "id"));
      res.json({ success: true });
    } catch (error) {
      console.error("Mark all submissions viewed error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // CSV export for cruise submissions
  app.get("/api/cruises/:id/submissions/export", requireAuth, async (req, res) => {
    try {
      const cruise = await storage.getCruise(param(req, "id"));
      if (!cruise) {
        return res.status(404).json({ error: "Cruise not found" });
      }

      const allSubmissions = await storage.getSubmissionsByCruise(param(req, "id"));

      if (allSubmissions.length === 0) {
        return res.status(404).json({ error: "No submissions to export" });
      }

      // Collect all unique step IDs from submissions to build columns
      const stepIds = new Set<string>();
      for (const sub of allSubmissions) {
        if (sub.answers && typeof sub.answers === "object") {
          for (const key of Object.keys(sub.answers)) {
            stepIds.add(key);
          }
        }
      }

      // Build step label map from ALL templates used by this cruise's forms
      const stepLabels: Record<string, string> = {};
      const forms = await storage.getCruiseForms(cruise.id);
      const templateIds = Array.from(new Set([cruise.templateId, ...forms.map(f => f.templateId)]));
      for (const tid of templateIds) {
        const tmpl = await storage.getTemplate(tid);
        if (tmpl?.graph?.steps) {
          for (const [id, step] of Object.entries(tmpl.graph.steps)) {
            if (!stepLabels[id]) {
              stepLabels[id] = step.question || id;
            }
          }
        }
      }

      // Build form label lookup for the "Form" column
      const formLabelMap = new Map(forms.map(f => [f.id, f.label]));

      // Build CSV header
      const orderedStepIds = Array.from(stepIds);
      const headers = [
        "Submission ID",
        "Customer Name",
        "Customer Phone",
        "Form",
        "Submitted At",
        ...orderedStepIds.map(id => stepLabels[id] || id),
      ];

      const rows: string[] = [headers.map(escapeCsvField).join(",")];

      for (const sub of allSubmissions) {
        const row: string[] = [
          sub.id,
          sub.customerName || "",
          sub.customerPhone || "",
          sub.cruiseFormId ? (formLabelMap.get(sub.cruiseFormId) || "Unknown") : "Default",
          sub.createdAt ? new Date(sub.createdAt).toISOString() : "",
        ];

        for (const stepId of orderedStepIds) {
          const answer = sub.answers?.[stepId];
          if (answer === undefined || answer === null) {
            row.push("");
          } else if (typeof answer === "string") {
            row.push(answer);
          } else if (Array.isArray(answer)) {
            // Quantity answers: "2x Kayak Tour ($50); 1x Snorkel ($25)"
            const parts = answer
              .filter((a: any) => a.quantity > 0)
              .map((a: any) => `${a.quantity}x ${a.label} ($${a.price})`);
            row.push(parts.join("; "));
          } else {
            row.push(String(answer));
          }
        }

        rows.push(row.map(escapeCsvField).join(","));
      }

      const csvContent = rows.join("\n");
      const filename = `${cruise.name.replace(/[^a-zA-Z0-9]/g, "_")}_submissions_${new Date().toISOString().split("T")[0]}.csv`;

      await audit(req, "submission.export", "cruise", param(req, "id"), { count: allSubmissions.length, format: "csv" });

      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      res.send(csvContent);
    } catch (error) {
      console.error("Export submissions error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // ---- Shared helpers for export endpoints ----

  type ExportRow = {
    submissionId: string;
    customerName: string;
    customerPhone: string;
    formLabel: string;
    submittedAt: string;
    answers: Record<string, string>;
  };

  /** Build a flat set of export rows from submissions, resolving step labels from templates. */
  async function buildExportData(
    cruiseId: string,
    allSubmissions: Submission[],
    forms: CruiseForm[],
    orderedStepIds: string[],
    stepLabels: Record<string, string>,
    formLabelMap: Map<string, string>
  ): Promise<ExportRow[]> {
    return allSubmissions.map((sub) => {
      const answerMap: Record<string, string> = {};
      for (const stepId of orderedStepIds) {
        const answer = sub.answers?.[stepId];
        if (answer === undefined || answer === null) {
          answerMap[stepId] = "";
        } else if (typeof answer === "string") {
          answerMap[stepId] = answer;
        } else if (Array.isArray(answer)) {
          const parts = answer
            .filter((a: any) => a.quantity > 0)
            .map((a: any) => `${a.quantity}x ${a.label} ($${a.price})`);
          answerMap[stepId] = parts.join("; ");
        } else {
          answerMap[stepId] = String(answer);
        }
      }
      return {
        submissionId: sub.id,
        customerName: sub.customerName || "",
        customerPhone: sub.customerPhone || "",
        formLabel: sub.cruiseFormId ? (formLabelMap.get(sub.cruiseFormId) || "Unknown") : "Default",
        submittedAt: sub.createdAt ? new Date(sub.createdAt).toISOString() : "",
        answers: answerMap,
      };
    });
  }

  /** Collect all unique step IDs and build step labels from templates. */
  async function collectStepInfo(
    allSubmissions: Submission[],
    forms: CruiseForm[],
    primaryTemplateId: string
  ) {
    const stepIds = new Set<string>();
    for (const sub of allSubmissions) {
      if (sub.answers && typeof sub.answers === "object") {
        for (const key of Object.keys(sub.answers)) {
          stepIds.add(key);
        }
      }
    }

    const stepLabels: Record<string, string> = {};
    const templateIds = Array.from(new Set([primaryTemplateId, ...forms.map(f => f.templateId)]));
    for (const tid of templateIds) {
      const tmpl = await storage.getTemplate(tid);
      if (tmpl?.graph?.steps) {
        for (const [id, step] of Object.entries(tmpl.graph.steps)) {
          if (!stepLabels[id]) {
            stepLabels[id] = step.question || id;
          }
        }
      }
    }

    return { orderedStepIds: Array.from(stepIds), stepLabels };
  }

  // Excel export for cruise submissions (all forms)
  app.get("/api/cruises/:id/submissions/export/excel", requireAuth, async (req, res) => {
    try {
      const cruise = await storage.getCruise(param(req, "id"));
      if (!cruise) {
        return res.status(404).json({ error: "Cruise not found" });
      }

      const allSubmissions = await storage.getSubmissionsByCruise(param(req, "id"));
      if (allSubmissions.length === 0) {
        return res.status(404).json({ error: "No submissions to export" });
      }

      const forms = await storage.getCruiseForms(cruise.id);
      const formLabelMap = new Map(forms.map(f => [f.id, f.label]));
      const { orderedStepIds, stepLabels } = await collectStepInfo(allSubmissions, forms, cruise.templateId);
      const exportRows = await buildExportData(cruise.id, allSubmissions, forms, orderedStepIds, stepLabels, formLabelMap);

      const workbook = new ExcelJS.Workbook();
      workbook.creator = "Cruise Form Builder";
      workbook.created = new Date();

      // Summary sheet with all submissions
      const allSheet = workbook.addWorksheet("All Submissions");
      const headers = ["Customer Name", "Phone", "Form", "Submitted At", ...orderedStepIds.map(id => stepLabels[id] || id)];
      allSheet.addRow(headers);

      // Style header row
      const headerRow = allSheet.getRow(1);
      headerRow.font = { bold: true, size: 11 };
      headerRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E3A5F" } };
      headerRow.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 };
      headerRow.alignment = { horizontal: "center" };

      for (const row of exportRows) {
        allSheet.addRow([
          row.customerName,
          row.customerPhone,
          row.formLabel,
          row.submittedAt ? new Date(row.submittedAt).toLocaleDateString() : "",
          ...orderedStepIds.map(id => row.answers[id] || ""),
        ]);
      }

      // Auto-fit column widths
      allSheet.columns.forEach((col) => {
        let maxLen = 10;
        col.eachCell?.({ includeEmpty: true }, (cell) => {
          const val = cell.value?.toString() || "";
          maxLen = Math.max(maxLen, Math.min(val.length + 2, 50));
        });
        col.width = maxLen;
      });

      // Per-form sheets
      for (const form of forms) {
        const formSubmissions = allSubmissions.filter(s => s.cruiseFormId === form.id);
        if (formSubmissions.length === 0) continue;

        const sheetName = form.label.replace(/[*?:/\\[\]]/g, "").substring(0, 31);
        const sheet = workbook.addWorksheet(sheetName);
        const formHeaders = ["Customer Name", "Phone", "Submitted At", ...orderedStepIds.map(id => stepLabels[id] || id)];
        sheet.addRow(formHeaders);

        const fHeaderRow = sheet.getRow(1);
        fHeaderRow.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 };
        fHeaderRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E3A5F" } };
        fHeaderRow.alignment = { horizontal: "center" };

        for (const sub of formSubmissions) {
          const row = exportRows.find(r => r.submissionId === sub.id)!;
          sheet.addRow([
            row.customerName,
            row.customerPhone,
            row.submittedAt ? new Date(row.submittedAt).toLocaleDateString() : "",
            ...orderedStepIds.map(id => row.answers[id] || ""),
          ]);
        }

        sheet.columns.forEach((col) => {
          let maxLen = 10;
          col.eachCell?.({ includeEmpty: true }, (cell) => {
            const val = cell.value?.toString() || "";
            maxLen = Math.max(maxLen, Math.min(val.length + 2, 50));
          });
          col.width = maxLen;
        });
      }

      const filename = `${cruise.name.replace(/[^a-zA-Z0-9]/g, "_")}_submissions_${new Date().toISOString().split("T")[0]}.xlsx`;
      await audit(req, "submission.export", "cruise", param(req, "id"), { count: allSubmissions.length, format: "excel" });

      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      await workbook.xlsx.write(res);
      res.end();
    } catch (error) {
      console.error("Export Excel error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // PDF export for cruise submissions (all forms)
  app.get("/api/cruises/:id/submissions/export/pdf", requireAuth, async (req, res) => {
    try {
      const cruise = await storage.getCruise(param(req, "id"));
      if (!cruise) {
        return res.status(404).json({ error: "Cruise not found" });
      }

      const allSubmissions = await storage.getSubmissionsByCruise(param(req, "id"));
      if (allSubmissions.length === 0) {
        return res.status(404).json({ error: "No submissions to export" });
      }

      const forms = await storage.getCruiseForms(cruise.id);
      const formLabelMap = new Map(forms.map(f => [f.id, f.label]));
      const { orderedStepIds, stepLabels } = await collectStepInfo(allSubmissions, forms, cruise.templateId);
      const exportRows = await buildExportData(cruise.id, allSubmissions, forms, orderedStepIds, stepLabels, formLabelMap);

      const filename = `${cruise.name.replace(/[^a-zA-Z0-9]/g, "_")}_submissions_${new Date().toISOString().split("T")[0]}.pdf`;
      await audit(req, "submission.export", "cruise", param(req, "id"), { count: allSubmissions.length, format: "pdf" });

      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);

      const doc = new PDFDocument({ size: "LETTER", layout: "landscape", margin: 40, bufferPages: true });
      doc.pipe(res);

      // Title
      doc.fontSize(18).font("Helvetica-Bold").text(cruise.name, { align: "center" });
      doc.fontSize(10).font("Helvetica").text(`Submissions Export — ${new Date().toLocaleDateString()}`, { align: "center" });
      doc.fontSize(10).text(`Total submissions: ${allSubmissions.length}`, { align: "center" });
      doc.moveDown(1.5);

      // Build a table - pick a sensible set of columns for PDF (limited width)
      const pdfColumns = [
        { label: "Name", key: "customerName", width: 100 },
        { label: "Phone", key: "customerPhone", width: 90 },
        { label: "Form", key: "formLabel", width: 90 },
        { label: "Date", key: "submittedAt", width: 70 },
        ...orderedStepIds.slice(0, 5).map(id => ({
          label: (stepLabels[id] || id).substring(0, 25),
          key: id,
          width: Math.floor((752 - 350) / Math.min(orderedStepIds.length, 5)),
        })),
      ];

      const tableTop = doc.y;
      const rowHeight = 22;
      const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
      const startX = doc.page.margins.left;

      const drawTableHeader = (y: number) => {
        doc.rect(startX, y, pageWidth, rowHeight).fill("#1E3A5F");
        let x = startX + 4;
        for (const col of pdfColumns) {
          doc.fontSize(8).font("Helvetica-Bold").fillColor("white")
            .text(col.label, x, y + 6, { width: col.width - 8, ellipsis: true });
          x += col.width;
        }
        doc.fillColor("black");
        return y + rowHeight;
      };

      let currentY = drawTableHeader(tableTop);

      for (let i = 0; i < exportRows.length; i++) {
        const row = exportRows[i];

        if (currentY + rowHeight > doc.page.height - doc.page.margins.bottom - 20) {
          doc.addPage();
          currentY = drawTableHeader(doc.page.margins.top);
        }

        // Alternate row colors
        if (i % 2 === 0) {
          doc.rect(startX, currentY, pageWidth, rowHeight).fill("#F5F5F5");
        }
        doc.fillColor("black");

        let x = startX + 4;
        for (const col of pdfColumns) {
          let val = "";
          if (col.key === "customerName") val = row.customerName;
          else if (col.key === "customerPhone") val = row.customerPhone;
          else if (col.key === "formLabel") val = row.formLabel;
          else if (col.key === "submittedAt") val = row.submittedAt ? new Date(row.submittedAt).toLocaleDateString() : "";
          else val = row.answers[col.key] || "";

          doc.fontSize(7).font("Helvetica")
            .text(val, x, currentY + 6, { width: col.width - 8, ellipsis: true });
          x += col.width;
        }

        currentY += rowHeight;
      }

      // If there are more than 5 step columns, add a note
      if (orderedStepIds.length > 5) {
        doc.moveDown(1);
        doc.fontSize(8).font("Helvetica-Oblique").fillColor("gray")
          .text(`Note: ${orderedStepIds.length - 5} additional question columns not shown. Use Excel export for full data.`, startX, currentY + 10);
      }

      doc.end();
    } catch (error) {
      console.error("Export PDF error:", error);
      if (!res.headersSent) {
        res.status(500).json({ error: "Internal server error" });
      }
    }
  });

  // Excel export for a single form's submissions
  app.get("/api/cruises/:id/forms/:formId/submissions/export/excel", requireAuth, async (req, res) => {
    try {
      const cruise = await storage.getCruise(param(req, "id"));
      if (!cruise) {
        return res.status(404).json({ error: "Cruise not found" });
      }

      const form = await storage.getCruiseForm(param(req, "formId"));
      if (!form || form.cruiseId !== param(req, "id")) {
        return res.status(404).json({ error: "Form not found" });
      }

      const formSubmissions = await storage.getSubmissionsByForm(param(req, "formId"));
      if (formSubmissions.length === 0) {
        return res.status(404).json({ error: "No submissions to export" });
      }

      const forms = await storage.getCruiseForms(cruise.id);
      const formLabelMap = new Map(forms.map(f => [f.id, f.label]));
      const { orderedStepIds, stepLabels } = await collectStepInfo(formSubmissions, forms, cruise.templateId);
      const exportRows = await buildExportData(cruise.id, formSubmissions, forms, orderedStepIds, stepLabels, formLabelMap);

      const workbook = new ExcelJS.Workbook();
      workbook.creator = "Cruise Form Builder";
      workbook.created = new Date();

      const sheetName = form.label.replace(/[*?:/\\[\]]/g, "").substring(0, 31);
      const sheet = workbook.addWorksheet(sheetName);
      const headers = ["Customer Name", "Phone", "Submitted At", ...orderedStepIds.map(id => stepLabels[id] || id)];
      sheet.addRow(headers);

      const headerRow = sheet.getRow(1);
      headerRow.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 };
      headerRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E3A5F" } };
      headerRow.alignment = { horizontal: "center" };

      for (const row of exportRows) {
        sheet.addRow([
          row.customerName,
          row.customerPhone,
          row.submittedAt ? new Date(row.submittedAt).toLocaleDateString() : "",
          ...orderedStepIds.map(id => row.answers[id] || ""),
        ]);
      }

      sheet.columns.forEach((col) => {
        let maxLen = 10;
        col.eachCell?.({ includeEmpty: true }, (cell) => {
          const val = cell.value?.toString() || "";
          maxLen = Math.max(maxLen, Math.min(val.length + 2, 50));
        });
        col.width = maxLen;
      });

      const filename = `${cruise.name.replace(/[^a-zA-Z0-9]/g, "_")}_${form.label.replace(/[^a-zA-Z0-9]/g, "_")}_${new Date().toISOString().split("T")[0]}.xlsx`;
      await audit(req, "submission.export", "cruise_form", form.id, { cruiseId: cruise.id, count: formSubmissions.length, format: "excel" });

      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      await workbook.xlsx.write(res);
      res.end();
    } catch (error) {
      console.error("Export form Excel error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // PDF export for a single form's submissions
  app.get("/api/cruises/:id/forms/:formId/submissions/export/pdf", requireAuth, async (req, res) => {
    try {
      const cruise = await storage.getCruise(param(req, "id"));
      if (!cruise) {
        return res.status(404).json({ error: "Cruise not found" });
      }

      const form = await storage.getCruiseForm(param(req, "formId"));
      if (!form || form.cruiseId !== param(req, "id")) {
        return res.status(404).json({ error: "Form not found" });
      }

      const formSubmissions = await storage.getSubmissionsByForm(param(req, "formId"));
      if (formSubmissions.length === 0) {
        return res.status(404).json({ error: "No submissions to export" });
      }

      const forms = await storage.getCruiseForms(cruise.id);
      const formLabelMap = new Map(forms.map(f => [f.id, f.label]));
      const { orderedStepIds, stepLabels } = await collectStepInfo(formSubmissions, forms, cruise.templateId);
      const exportRows = await buildExportData(cruise.id, formSubmissions, forms, orderedStepIds, stepLabels, formLabelMap);

      const filename = `${cruise.name.replace(/[^a-zA-Z0-9]/g, "_")}_${form.label.replace(/[^a-zA-Z0-9]/g, "_")}_${new Date().toISOString().split("T")[0]}.pdf`;
      await audit(req, "submission.export", "cruise_form", form.id, { cruiseId: cruise.id, count: formSubmissions.length, format: "pdf" });

      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);

      const doc = new PDFDocument({ size: "LETTER", layout: "landscape", margin: 40, bufferPages: true });
      doc.pipe(res);

      // Title
      doc.fontSize(18).font("Helvetica-Bold").text(`${cruise.name} — ${form.label}`, { align: "center" });
      doc.fontSize(10).font("Helvetica").text(`Submissions Export — ${new Date().toLocaleDateString()}`, { align: "center" });
      doc.fontSize(10).text(`Total submissions: ${formSubmissions.length}`, { align: "center" });
      doc.moveDown(1.5);

      const pdfColumns = [
        { label: "Name", key: "customerName", width: 110 },
        { label: "Phone", key: "customerPhone", width: 100 },
        { label: "Date", key: "submittedAt", width: 80 },
        ...orderedStepIds.slice(0, 6).map(id => ({
          label: (stepLabels[id] || id).substring(0, 30),
          key: id,
          width: Math.floor((752 - 290) / Math.min(orderedStepIds.length, 6)),
        })),
      ];

      const rowHeight = 22;
      const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
      const startX = doc.page.margins.left;

      const drawFormTableHeader = (y: number) => {
        doc.rect(startX, y, pageWidth, rowHeight).fill("#1E3A5F");
        let x = startX + 4;
        for (const col of pdfColumns) {
          doc.fontSize(8).font("Helvetica-Bold").fillColor("white")
            .text(col.label, x, y + 6, { width: col.width - 8, ellipsis: true });
          x += col.width;
        }
        doc.fillColor("black");
        return y + rowHeight;
      };

      let currentY = drawFormTableHeader(doc.y);

      for (let i = 0; i < exportRows.length; i++) {
        const row = exportRows[i];

        if (currentY + rowHeight > doc.page.height - doc.page.margins.bottom - 20) {
          doc.addPage();
          currentY = drawFormTableHeader(doc.page.margins.top);
        }

        if (i % 2 === 0) {
          doc.rect(startX, currentY, pageWidth, rowHeight).fill("#F5F5F5");
        }
        doc.fillColor("black");

        let x = startX + 4;
        for (const col of pdfColumns) {
          let val = "";
          if (col.key === "customerName") val = row.customerName;
          else if (col.key === "customerPhone") val = row.customerPhone;
          else if (col.key === "submittedAt") val = row.submittedAt ? new Date(row.submittedAt).toLocaleDateString() : "";
          else val = row.answers[col.key] || "";

          doc.fontSize(7).font("Helvetica")
            .text(val, x, currentY + 6, { width: col.width - 8, ellipsis: true });
          x += col.width;
        }

        currentY += rowHeight;
      }

      if (orderedStepIds.length > 6) {
        doc.moveDown(1);
        doc.fontSize(8).font("Helvetica-Oblique").fillColor("gray")
          .text(`Note: ${orderedStepIds.length - 6} additional question columns not shown. Use Excel export for full data.`, startX, currentY + 10);
      }

      doc.end();
    } catch (error) {
      console.error("Export form PDF error:", error);
      if (!res.headersSent) {
        res.status(500).json({ error: "Internal server error" });
      }
    }
  });

  // Public form routes - now for cruises (with cruise form support)
  app.get("/api/forms/:shareId", async (req, res) => {
    try {
      const shareId = param(req, "shareId");

      // 1. Check cruise_forms table for shareId
      const cruiseForm = await storage.getCruiseFormByShareId(shareId);
      if (cruiseForm) {
        const cruise = await storage.getCruise(cruiseForm.cruiseId);
        if (!cruise?.isPublished || !cruise?.isActive || !cruiseForm.isActive) {
          return res.status(404).json({ error: "This form is not currently available", notAvailable: true });
        }
        const template = await storage.getTemplate(cruiseForm.templateId);
        if (template) {
          const inventory = await storage.getCruiseInventory(cruise.id);
          return res.json({
            ...template,
            cruise,
            cruiseForm,
            inventory: inventory.map(item => ({
              stepId: item.stepId,
              choiceId: item.choiceId,
              remaining: item.stockLimit ? Math.max(0, item.stockLimit - item.totalOrdered) : null,
              isSoldOut: item.stockLimit ? item.totalOrdered >= item.stockLimit : false,
            }))
          });
        }
      }

      // 2. Fall back to cruise shareId
      const cruise = await storage.getCruiseByShareId(shareId);
      if (cruise) {
        if (!cruise.isPublished || !cruise.isActive) {
          return res.status(404).json({ error: "This cruise is not currently available", notAvailable: true });
        }
        const template = await storage.getTemplate(cruise.templateId);
        if (template) {
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

      // 3. Fall back to template shareId (legacy support)
      const template = await storage.getTemplateByShareId(shareId);
      if (!template || !template.published) {
        return res.status(404).json({ error: "Form not found" });
      }
      res.json(template);
    } catch (error) {
      console.error("Get form error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Lightweight inventory check for active form sessions
  app.get("/api/forms/:shareId/inventory", async (req, res) => {
    try {
      const shareId = param(req, "shareId");

      // Check cruise_forms first, then fall back to cruise shareId
      let cruiseId: string | null = null;

      const cruiseForm = await storage.getCruiseFormByShareId(shareId);
      if (cruiseForm) {
        const cruise = await storage.getCruise(cruiseForm.cruiseId);
        if (!cruise || !cruise.isPublished || !cruise.isActive || !cruiseForm.isActive) {
          return res.status(404).json({ error: "Form not found" });
        }
        cruiseId = cruise.id;
      } else {
        const cruise = await storage.getCruiseByShareId(shareId);
        if (!cruise || !cruise.isPublished || !cruise.isActive) {
          return res.status(404).json({ error: "Form not found" });
        }
        cruiseId = cruise.id;
      }

      const inventory = await storage.getCruiseInventory(cruiseId);
      res.json({
        inventory: inventory.map(item => ({
          stepId: item.stepId,
          choiceId: item.choiceId,
          remaining: item.stockLimit ? Math.max(0, item.stockLimit - item.totalOrdered) : null,
          isSoldOut: item.stockLimit ? item.totalOrdered >= item.stockLimit : false,
        }))
      });
    } catch (error) {
      console.error("Get form inventory error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/forms/:shareId/submit", async (req, res) => {
    try {
      // Rate limit check
      const clientIp = req.ip || req.socket.remoteAddress || "unknown";
      if (!submissionLimiter.check(`submit:${clientIp}`)) {
        return res.status(429).json({ error: "Too many submissions. Please try again later." });
      }

      let templateId: string;
      let cruiseId: string | null = null;
      let cruiseFormId: string | null = null;
      const shareId = param(req, "shareId");

      // 1. Check cruise_forms table first
      const cruiseForm = await storage.getCruiseFormByShareId(shareId);
      if (cruiseForm) {
        const cruise = await storage.getCruise(cruiseForm.cruiseId);
        if (!cruise || !cruise.isActive || !cruise.isPublished || !cruiseForm.isActive) {
          return res.status(404).json({ error: "This form is not currently available" });
        }
        templateId = cruiseForm.templateId;
        cruiseId = cruise.id;
        cruiseFormId = cruiseForm.id;
      } else {
        // 2. Check cruise shareId
        const cruise = await storage.getCruiseByShareId(shareId);
        if (cruise && cruise.isActive && cruise.isPublished) {
          templateId = cruise.templateId;
          cruiseId = cruise.id;
        } else if (cruise && (!cruise.isActive || !cruise.isPublished)) {
          return res.status(404).json({ error: "This cruise is not currently available" });
        } else {
          // 3. Fall back to template shareId
          const template = await storage.getTemplateByShareId(shareId);
          if (!template || !template.published) {
            return res.status(404).json({ error: "Form not found" });
          }
          templateId = template.id;
        }
      }

      const parseResult = submissionSchema.safeParse(req.body);
      if (!parseResult.success) {
        return res.status(400).json({ error: parseResult.error.errors[0]?.message ?? "Validation error" });
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
        cruiseFormId,
        answers,
        customerName: customerName || null,
        customerPhone: customerPhone || null,
        isViewed: false,
      });

      // Log submission event for notification system
      await audit(
        req,
        "submission.create",
        "submission",
        submission.id,
        { cruiseId, cruiseFormId, customerName: customerName || null, customerPhone }
      );

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

  // Audit log routes (protected)
  app.get("/api/audit-logs", requireAuth, async (req, res) => {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 50;

      const result = await storage.getAuditLogs({ page, limit });
      res.json(result);
    } catch (error) {
      console.error("Get audit logs error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Notification settings routes (protected)
  app.get("/api/notification-settings", requireAuth, async (req, res) => {
    try {
      const settings = await storage.getNotificationSettings(req.session.userId!);
      res.json(settings || { emailOnSubmission: true, emailAddress: null });
    } catch (error) {
      console.error("Get notification settings error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.put("/api/notification-settings", requireAuth, async (req, res) => {
    try {
      const parseResult = notificationSettingsSchema.safeParse(req.body);
      if (!parseResult.success) {
        return res.status(400).json({ error: parseResult.error.errors[0]?.message ?? "Validation error" });
      }

      const settings = await storage.upsertNotificationSettings(
        req.session.userId!,
        parseResult.data
      );
      res.json(settings);
    } catch (error) {
      console.error("Update notification settings error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  return httpServer;
}
