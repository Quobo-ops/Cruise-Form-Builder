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
  getTemplatesWithCruiseCounts(): Promise<(Template & { cruiseCount: number })[]>;
  getTemplate(id: string): Promise<Template | undefined>;
  getTemplateByShareId(shareId: string): Promise<Template | undefined>;
  createTemplate(template: InsertTemplate): Promise<Template>;
  updateTemplate(id: string, updates: Partial<InsertTemplate>): Promise<Template | undefined>;
  deleteTemplate(id: string): Promise<boolean>;

  // Cruises
  getCruises(): Promise<Cruise[]>;
  getPublishedCruises(): Promise<Cruise[]>;
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

  // Transactional inventory
  checkAndUpdateInventory(
    cruiseId: string,
    items: Array<{ stepId: string; choiceId: string; quantity: number; label: string }>
  ): Promise<{ success: boolean; error?: string }>;

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

  async getTemplatesWithCruiseCounts(): Promise<(Template & { cruiseCount: number })[]> {
    const allTemplates = await db.select().from(templates);
    const cruiseCounts = await db
      .select({
        templateId: cruises.templateId,
        count: sql<number>`count(*)::int`,
      })
      .from(cruises)
      .groupBy(cruises.templateId);
    
    const countMap = new Map(cruiseCounts.map(c => [c.templateId, c.count]));
    
    return allTemplates.map(template => ({
      ...template,
      cruiseCount: countMap.get(template.id) || 0,
    }));
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
    // Check if any cruises reference this template
    const linkedCruises = await db.select({ id: cruises.id }).from(cruises).where(eq(cruises.templateId, id));
    if (linkedCruises.length > 0) {
      throw new Error(`Cannot delete template: ${linkedCruises.length} cruise(s) are using it. Delete the cruises first.`);
    }
    await db.delete(templates).where(eq(templates.id, id));
    return true;
  }

  // Cruises
  async getCruises(): Promise<Cruise[]> {
    return await db.select().from(cruises).orderBy(sql`${cruises.createdAt} DESC`);
  }

  async getPublishedCruises(): Promise<Cruise[]> {
    return await db.select().from(cruises)
      .where(eq(cruises.isPublished, true))
      .orderBy(sql`${cruises.startDate} ASC NULLS LAST`);
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
    await db.transaction(async (tx) => {
      await tx.delete(cruiseInventory).where(eq(cruiseInventory.cruiseId, id));
      await tx.delete(submissions).where(eq(submissions.cruiseId, id));
      await tx.delete(cruises).where(eq(cruises.id, id));
    });
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

  // Transactional inventory check + update (prevents race conditions)
  async checkAndUpdateInventory(
    cruiseId: string,
    items: Array<{ stepId: string; choiceId: string; quantity: number; label: string }>
  ): Promise<{ success: boolean; error?: string }> {
    try {
      await db.transaction(async (tx) => {
        for (const item of items) {
          if (item.quantity <= 0) continue;

          // Atomic check-and-update: only updates if stock is available
          const result = await tx
            .update(cruiseInventory)
            .set({
              totalOrdered: sql`${cruiseInventory.totalOrdered} + ${item.quantity}`,
              updatedAt: new Date(),
            })
            .where(
              and(
                eq(cruiseInventory.cruiseId, cruiseId),
                eq(cruiseInventory.stepId, item.stepId),
                eq(cruiseInventory.choiceId, item.choiceId),
                sql`(${cruiseInventory.stockLimit} IS NULL OR ${cruiseInventory.stockLimit} - ${cruiseInventory.totalOrdered} >= ${item.quantity})`
              )
            )
            .returning({ id: cruiseInventory.id });

          if (result.length === 0) {
            // Check if the item exists to determine the actual error
            const [existing] = await tx
              .select()
              .from(cruiseInventory)
              .where(
                and(
                  eq(cruiseInventory.cruiseId, cruiseId),
                  eq(cruiseInventory.stepId, item.stepId),
                  eq(cruiseInventory.choiceId, item.choiceId)
                )
              );

            if (existing?.stockLimit !== null && existing?.stockLimit !== undefined) {
              const remaining = Math.max(0, existing.stockLimit - existing.totalOrdered);
              throw new Error(`Not enough stock for ${item.label}. Only ${remaining} remaining.`);
            }
          }
        }
      });
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
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
