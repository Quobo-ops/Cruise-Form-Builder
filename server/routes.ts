import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import session from "express-session";
import { storage } from "./storage";
import { randomBytes } from "crypto";
import bcrypt from "bcrypt";
import { z } from "zod";
import { insertTemplateSchema, insertSubmissionSchema, graphSchema } from "@shared/schema";

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

const submissionSchema = z.object({
  answers: z.record(z.string(), z.string()),
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

  // Session middleware
  app.use(
    session({
      secret: sessionSecret || "dev-only-secret-change-in-prod",
      resave: false,
      saveUninitialized: false,
      cookie: {
        secure: process.env.NODE_ENV === "production",
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000, // 24 hours
      },
    })
  );

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

  // Template routes (protected)
  app.get("/api/templates", requireAuth, async (req, res) => {
    try {
      const templates = await storage.getTemplates();
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
    } catch (error) {
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

  // Public form routes (no auth required)
  app.get("/api/forms/:shareId", async (req, res) => {
    try {
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
      const template = await storage.getTemplateByShareId(req.params.shareId);
      if (!template || !template.published) {
        return res.status(404).json({ error: "Form not found" });
      }

      const parseResult = submissionSchema.safeParse(req.body);
      if (!parseResult.success) {
        return res.status(400).json({ error: parseResult.error.errors[0].message });
      }

      const { answers } = parseResult.data;
      const submission = await storage.createSubmission({
        templateId: template.id,
        answers,
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
