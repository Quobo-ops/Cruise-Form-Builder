import { sql } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, jsonb, boolean, integer, numeric } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Choice with quantity configuration
export const quantityChoiceSchema = z.object({
  id: z.string(),
  label: z.string(),
  price: z.number().min(0).default(0),
  limit: z.number().min(0).nullable().optional(),
  isNoThanks: z.boolean().optional().default(false),
});

export type QuantityChoice = z.infer<typeof quantityChoiceSchema>;

// Step types for the form builder
export const stepSchema = z.object({
  id: z.string(),
  type: z.enum(["choice", "text", "quantity", "conclusion"]),
  question: z.string(),
  placeholder: z.string().optional(),
  choices: z.array(z.object({
    id: z.string(),
    label: z.string(),
    nextStepId: z.string().nullable(),
  })).optional(),
  quantityChoices: z.array(quantityChoiceSchema).optional(),
  nextStepId: z.string().nullable().optional(),
  // For conclusion steps
  thankYouMessage: z.string().optional(),
  submitButtonText: z.string().optional(),
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

// Cruises table
export const cruises = pgTable("cruises", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  description: text("description"),
  startDate: timestamp("start_date"),
  endDate: timestamp("end_date"),
  templateId: varchar("template_id").notNull().references(() => templates.id),
  shareId: varchar("share_id").unique().notNull(),
  isActive: boolean("is_active").default(true),
  isPublished: boolean("is_published").default(false),
  learnMoreHeader: text("learn_more_header"),
  learnMoreImages: text("learn_more_images").array(),
  learnMoreDescription: text("learn_more_description"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertCruiseSchema = createInsertSchema(cruises).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertCruise = z.infer<typeof insertCruiseSchema>;
export type Cruise = typeof cruises.$inferSelect;

// Quantity answer schema
export const quantityAnswerSchema = z.object({
  choiceId: z.string(),
  label: z.string(),
  quantity: z.number().min(0),
  price: z.number().min(0),
});

export type QuantityAnswer = z.infer<typeof quantityAnswerSchema>;

// Submissions table - now linked to cruises
export const submissions = pgTable("submissions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  templateId: varchar("template_id").notNull().references(() => templates.id),
  cruiseId: varchar("cruise_id").references(() => cruises.id),
  answers: jsonb("answers").notNull().$type<Record<string, string | QuantityAnswer[]>>(),
  customerName: text("customer_name"),
  customerPhone: text("customer_phone"),
  isViewed: boolean("is_viewed").default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertSubmissionSchema = createInsertSchema(submissions).omit({
  id: true,
  createdAt: true,
});

export type InsertSubmission = z.infer<typeof insertSubmissionSchema>;
export type Submission = typeof submissions.$inferSelect;

// Cruise inventory tracking table
export const cruiseInventory = pgTable("cruise_inventory", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  cruiseId: varchar("cruise_id").notNull().references(() => cruises.id),
  stepId: varchar("step_id").notNull(),
  choiceId: varchar("choice_id").notNull(),
  choiceLabel: text("choice_label").notNull(),
  price: numeric("price", { precision: 10, scale: 2 }).notNull().default("0"),
  totalOrdered: integer("total_ordered").notNull().default(0),
  stockLimit: integer("stock_limit"),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertCruiseInventorySchema = createInsertSchema(cruiseInventory).omit({
  id: true,
  updatedAt: true,
});

export type InsertCruiseInventory = z.infer<typeof insertCruiseInventorySchema>;
export type CruiseInventory = typeof cruiseInventory.$inferSelect;
