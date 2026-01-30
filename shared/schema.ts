import { sql } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, jsonb, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Step types for the form builder
export const stepSchema = z.object({
  id: z.string(),
  type: z.enum(["choice", "text"]),
  question: z.string(),
  placeholder: z.string().optional(),
  choices: z.array(z.object({
    id: z.string(),
    label: z.string(),
    nextStepId: z.string().nullable(),
  })).optional(),
  nextStepId: z.string().nullable().optional(),
});

export type Step = z.infer<typeof stepSchema>;

export const graphSchema = z.object({
  rootStepId: z.string(),
  steps: z.record(z.string(), stepSchema),
});

export type FormGraph = z.infer<typeof graphSchema>;

// Admin users table
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

// Templates table
export const templates = pgTable("templates", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  graph: jsonb("graph").notNull().$type<FormGraph>(),
  published: boolean("published").default(false),
  shareId: varchar("share_id").unique(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertTemplateSchema = createInsertSchema(templates).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertTemplate = z.infer<typeof insertTemplateSchema>;
export type Template = typeof templates.$inferSelect;

// Submissions table
export const submissions = pgTable("submissions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  templateId: varchar("template_id").notNull().references(() => templates.id),
  answers: jsonb("answers").notNull().$type<Record<string, string>>(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertSubmissionSchema = createInsertSchema(submissions).omit({
  id: true,
  createdAt: true,
});

export type InsertSubmission = z.infer<typeof insertSubmissionSchema>;
export type Submission = typeof submissions.$inferSelect;
