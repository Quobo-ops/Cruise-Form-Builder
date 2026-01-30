import { 
  type User, type InsertUser, 
  type Template, type InsertTemplate,
  type Submission, type InsertSubmission,
  type Cruise, type InsertCruise,
  type CruiseInventory, type InsertCruiseInventory,
  users, templates, submissions, cruises, cruiseInventory,
  type QuantityAnswer
} from "@shared/schema";
import { db } from "./db";
import { eq, sql, and } from "drizzle-orm";

export interface IStorage {
  // Users
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;

  // Templates
  getTemplates(): Promise<Template[]>;
  getTemplate(id: string): Promise<Template | undefined>;
  getTemplateByShareId(shareId: string): Promise<Template | undefined>;
  createTemplate(template: InsertTemplate): Promise<Template>;
  updateTemplate(id: string, updates: Partial<InsertTemplate>): Promise<Template | undefined>;
  deleteTemplate(id: string): Promise<boolean>;

  // Cruises
  getCruises(): Promise<Cruise[]>;
  getCruise(id: string): Promise<Cruise | undefined>;
  getCruiseByShareId(shareId: string): Promise<Cruise | undefined>;
  createCruise(cruise: InsertCruise): Promise<Cruise>;
  updateCruise(id: string, updates: Partial<InsertCruise>): Promise<Cruise | undefined>;
  deleteCruise(id: string): Promise<boolean>;

  // Cruise Inventory
  getCruiseInventory(cruiseId: string): Promise<CruiseInventory[]>;
  getInventoryItem(cruiseId: string, stepId: string, choiceId: string): Promise<CruiseInventory | undefined>;
  upsertInventoryItem(item: InsertCruiseInventory): Promise<CruiseInventory>;
  updateInventoryTotals(cruiseId: string, stepId: string, choiceId: string, quantityDelta: number): Promise<void>;
  updateInventoryLimit(cruiseId: string, stepId: string, choiceId: string, limit: number | null): Promise<void>;

  // Submissions
  getSubmissions(templateId?: string): Promise<Submission[]>;
  getSubmissionsByCruise(cruiseId: string): Promise<Submission[]>;
  getSubmissionCountByCruise(cruiseId: string): Promise<number>;
  getUnviewedSubmissionCount(cruiseId: string): Promise<number>;
  markSubmissionsViewed(cruiseId: string): Promise<void>;
  createSubmission(submission: InsertSubmission): Promise<Submission>;
}

export class DatabaseStorage implements IStorage {
  // Users
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db.insert(users).values(insertUser).returning();
    return user;
  }

  // Templates
  async getTemplates(): Promise<Template[]> {
    return await db.select().from(templates);
  }

  async getTemplate(id: string): Promise<Template | undefined> {
    const [template] = await db.select().from(templates).where(eq(templates.id, id));
    return template;
  }

  async getTemplateByShareId(shareId: string): Promise<Template | undefined> {
    const [template] = await db.select().from(templates).where(eq(templates.shareId, shareId));
    return template;
  }

  async createTemplate(template: InsertTemplate): Promise<Template> {
    const [created] = await db.insert(templates).values(template).returning();
    return created;
  }

  async updateTemplate(id: string, updates: Partial<InsertTemplate>): Promise<Template | undefined> {
    const [updated] = await db
      .update(templates)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(templates.id, id))
      .returning();
    return updated;
  }

  async deleteTemplate(id: string): Promise<boolean> {
    await db.delete(templates).where(eq(templates.id, id));
    return true;
  }

  // Cruises
  async getCruises(): Promise<Cruise[]> {
    return await db.select().from(cruises).orderBy(sql`${cruises.createdAt} DESC`);
  }

  async getCruise(id: string): Promise<Cruise | undefined> {
    const [cruise] = await db.select().from(cruises).where(eq(cruises.id, id));
    return cruise;
  }

  async getCruiseByShareId(shareId: string): Promise<Cruise | undefined> {
    const [cruise] = await db.select().from(cruises).where(eq(cruises.shareId, shareId));
    return cruise;
  }

  async createCruise(cruise: InsertCruise): Promise<Cruise> {
    const [created] = await db.insert(cruises).values(cruise).returning();
    return created;
  }

  async updateCruise(id: string, updates: Partial<InsertCruise>): Promise<Cruise | undefined> {
    const [updated] = await db
      .update(cruises)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(cruises.id, id))
      .returning();
    return updated;
  }

  async deleteCruise(id: string): Promise<boolean> {
    // Delete inventory first
    await db.delete(cruiseInventory).where(eq(cruiseInventory.cruiseId, id));
    // Delete submissions linked to this cruise
    await db.delete(submissions).where(eq(submissions.cruiseId, id));
    // Delete the cruise
    await db.delete(cruises).where(eq(cruises.id, id));
    return true;
  }

  // Cruise Inventory
  async getCruiseInventory(cruiseId: string): Promise<CruiseInventory[]> {
    return await db.select().from(cruiseInventory).where(eq(cruiseInventory.cruiseId, cruiseId));
  }

  async getInventoryItem(cruiseId: string, stepId: string, choiceId: string): Promise<CruiseInventory | undefined> {
    const [item] = await db.select().from(cruiseInventory).where(
      and(
        eq(cruiseInventory.cruiseId, cruiseId),
        eq(cruiseInventory.stepId, stepId),
        eq(cruiseInventory.choiceId, choiceId)
      )
    );
    return item;
  }

  async upsertInventoryItem(item: InsertCruiseInventory): Promise<CruiseInventory> {
    const existing = await this.getInventoryItem(item.cruiseId, item.stepId, item.choiceId);
    if (existing) {
      const [updated] = await db
        .update(cruiseInventory)
        .set({ ...item, updatedAt: new Date() })
        .where(eq(cruiseInventory.id, existing.id))
        .returning();
      return updated;
    }
    const [created] = await db.insert(cruiseInventory).values(item).returning();
    return created;
  }

  async updateInventoryTotals(cruiseId: string, stepId: string, choiceId: string, quantityDelta: number): Promise<void> {
    await db
      .update(cruiseInventory)
      .set({ 
        totalOrdered: sql`${cruiseInventory.totalOrdered} + ${quantityDelta}`,
        updatedAt: new Date()
      })
      .where(
        and(
          eq(cruiseInventory.cruiseId, cruiseId),
          eq(cruiseInventory.stepId, stepId),
          eq(cruiseInventory.choiceId, choiceId)
        )
      );
  }

  async updateInventoryLimit(cruiseId: string, stepId: string, choiceId: string, limit: number | null): Promise<void> {
    await db
      .update(cruiseInventory)
      .set({ 
        stockLimit: limit,
        updatedAt: new Date()
      })
      .where(
        and(
          eq(cruiseInventory.cruiseId, cruiseId),
          eq(cruiseInventory.stepId, stepId),
          eq(cruiseInventory.choiceId, choiceId)
        )
      );
  }

  // Submissions
  async getSubmissions(templateId?: string): Promise<Submission[]> {
    if (templateId) {
      return await db.select().from(submissions).where(eq(submissions.templateId, templateId));
    }
    return await db.select().from(submissions);
  }

  async getSubmissionsByCruise(cruiseId: string): Promise<Submission[]> {
    return await db.select().from(submissions)
      .where(eq(submissions.cruiseId, cruiseId))
      .orderBy(sql`${submissions.createdAt} DESC`);
  }

  async getSubmissionCountByCruise(cruiseId: string): Promise<number> {
    const result = await db.select({ count: sql<number>`count(*)` })
      .from(submissions)
      .where(eq(submissions.cruiseId, cruiseId));
    return Number(result[0]?.count || 0);
  }

  async getUnviewedSubmissionCount(cruiseId: string): Promise<number> {
    const result = await db.select({ count: sql<number>`count(*)` })
      .from(submissions)
      .where(and(eq(submissions.cruiseId, cruiseId), eq(submissions.isViewed, false)));
    return Number(result[0]?.count || 0);
  }

  async markSubmissionsViewed(cruiseId: string): Promise<void> {
    await db
      .update(submissions)
      .set({ isViewed: true })
      .where(eq(submissions.cruiseId, cruiseId));
  }

  async createSubmission(submission: InsertSubmission): Promise<Submission> {
    const [created] = await db.insert(submissions).values(submission).returning();
    return created;
  }
}

export const storage = new DatabaseStorage();
