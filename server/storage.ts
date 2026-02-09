import {
  type User, type InsertUser,
  type Template, type InsertTemplate,
  type Submission, type InsertSubmission,
  type Cruise, type InsertCruise,
  type CruiseForm, type InsertCruiseForm,
  type CruiseInventory, type InsertCruiseInventory,
  type AuditLog, type InsertAuditLog,
  type NotificationSettings,
  users, templates, submissions, cruises, cruiseForms, cruiseInventory,
  auditLogs, notificationSettings,
  type QuantityAnswer
} from "@shared/schema";
import { db } from "./db";
import { eq, sql, and, isNull, ilike, or, desc } from "drizzle-orm";

function escapeLike(value: string): string {
  return value.replace(/[%_\\]/g, '\\$&');
}

export interface PaginationParams {
  page?: number;
  limit?: number;
  search?: string;
}

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

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
  getCruisesPaginated(params: PaginationParams): Promise<PaginatedResult<Cruise & { submissionCount: number; unviewedCount: number }>>;
  getPublishedCruises(): Promise<Cruise[]>;
  getCruise(id: string): Promise<Cruise | undefined>;
  getCruiseByShareId(shareId: string): Promise<Cruise | undefined>;
  createCruise(cruise: InsertCruise): Promise<Cruise>;
  updateCruise(id: string, updates: Partial<InsertCruise>): Promise<Cruise | undefined>;
  deleteCruise(id: string): Promise<boolean>;

  // Cruise Forms
  getCruiseForms(cruiseId: string): Promise<CruiseForm[]>;
  getCruiseFormByShareId(shareId: string): Promise<CruiseForm | undefined>;
  createCruiseForm(data: InsertCruiseForm): Promise<CruiseForm>;
  updateCruiseForm(id: string, data: Partial<InsertCruiseForm>): Promise<CruiseForm | undefined>;
  deleteCruiseForm(id: string): Promise<void>;
  reorderCruiseForms(cruiseId: string, orderedIds: string[]): Promise<void>;

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
  getSubmissionsByCruisePaginated(cruiseId: string, params: PaginationParams): Promise<PaginatedResult<Submission>>;
  getSubmissionCountByCruise(cruiseId: string): Promise<number>;
  getUnviewedSubmissionCount(cruiseId: string): Promise<number>;
  markSubmissionsViewed(cruiseId: string): Promise<void>;
  markSubmissionViewed(submissionId: string): Promise<Submission | undefined>;
  createSubmission(submission: InsertSubmission): Promise<Submission>;

  // Audit logs
  createAuditLog(log: InsertAuditLog): Promise<AuditLog>;
  getAuditLogs(params: PaginationParams): Promise<PaginatedResult<AuditLog>>;

  // Notification settings
  getNotificationSettings(userId: string): Promise<NotificationSettings | undefined>;
  upsertNotificationSettings(userId: string, settings: { emailOnSubmission?: boolean; emailAddress?: string | null }): Promise<NotificationSettings>;
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

  // Templates (soft delete aware)
  async getTemplates(): Promise<Template[]> {
    return await db.select().from(templates).where(isNull(templates.deletedAt));
  }

  async getTemplatesWithCruiseCounts(): Promise<(Template & { cruiseCount: number })[]> {
    const allTemplates = await db.select().from(templates).where(isNull(templates.deletedAt));
    const cruiseCounts = await db
      .select({
        templateId: cruises.templateId,
        count: sql<number>`count(*)::int`,
      })
      .from(cruises)
      .where(isNull(cruises.deletedAt))
      .groupBy(cruises.templateId);

    const countMap = new Map(cruiseCounts.map(c => [c.templateId, c.count]));

    return allTemplates.map(template => ({
      ...template,
      cruiseCount: countMap.get(template.id) || 0,
    }));
  }

  async getTemplate(id: string): Promise<Template | undefined> {
    const [template] = await db.select().from(templates).where(
      and(eq(templates.id, id), isNull(templates.deletedAt))
    );
    return template;
  }

  async getTemplateByShareId(shareId: string): Promise<Template | undefined> {
    const [template] = await db.select().from(templates).where(
      and(eq(templates.shareId, shareId), isNull(templates.deletedAt))
    );
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
      .where(and(eq(templates.id, id), isNull(templates.deletedAt)))
      .returning();
    return updated;
  }

  async deleteTemplate(id: string): Promise<boolean> {
    // Check if any active cruises reference this template
    const linkedCruises = await db.select({ id: cruises.id }).from(cruises).where(
      and(eq(cruises.templateId, id), isNull(cruises.deletedAt))
    );
    if (linkedCruises.length > 0) {
      throw new Error(`Cannot delete template: ${linkedCruises.length} cruise(s) are using it. Delete the cruises first.`);
    }
    // Soft delete
    const [deleted] = await db.update(templates)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(templates.id, id), isNull(templates.deletedAt)))
      .returning();
    return !!deleted;
  }

  // Cruises (soft delete aware)
  async getCruises(): Promise<Cruise[]> {
    return await db.select().from(cruises)
      .where(isNull(cruises.deletedAt))
      .orderBy(sql`${cruises.createdAt} DESC`);
  }

  // Paginated cruises with counts — fixes N+1 query
  async getCruisesPaginated(params: PaginationParams): Promise<PaginatedResult<Cruise & { submissionCount: number; unviewedCount: number }>> {
    const page = params.page || 1;
    const limit = Math.min(params.limit || 20, 100);
    const offset = (page - 1) * limit;

    // Build where conditions
    const conditions = [isNull(cruises.deletedAt)];
    if (params.search) {
      conditions.push(ilike(cruises.name, `%${params.search}%`));
    }
    const whereClause = and(...conditions);

    // Get total count
    const [{ count: total }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(cruises)
      .where(whereClause);

    // Get cruises with submission counts in a single query
    const rows = await db
      .select({
        cruise: cruises,
        submissionCount: sql<number>`COALESCE((SELECT count(*)::int FROM submissions WHERE submissions.cruise_id = ${cruises.id}), 0)`,
        unviewedCount: sql<number>`COALESCE((SELECT count(*)::int FROM submissions WHERE submissions.cruise_id = ${cruises.id} AND submissions.is_viewed = false), 0)`,
      })
      .from(cruises)
      .where(whereClause)
      .orderBy(desc(cruises.createdAt))
      .limit(limit)
      .offset(offset);

    return {
      data: rows.map(r => ({
        ...r.cruise,
        submissionCount: r.submissionCount,
        unviewedCount: r.unviewedCount,
      })),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async getPublishedCruises(): Promise<Cruise[]> {
    return await db.select().from(cruises)
      .where(and(eq(cruises.isPublished, true), isNull(cruises.deletedAt)))
      .orderBy(sql`${cruises.startDate} ASC NULLS LAST`);
  }

  async getCruise(id: string): Promise<Cruise | undefined> {
    const [cruise] = await db.select().from(cruises).where(
      and(eq(cruises.id, id), isNull(cruises.deletedAt))
    );
    return cruise;
  }

  async getCruiseByShareId(shareId: string): Promise<Cruise | undefined> {
    const [cruise] = await db.select().from(cruises).where(
      and(eq(cruises.shareId, shareId), isNull(cruises.deletedAt))
    );
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
      .where(and(eq(cruises.id, id), isNull(cruises.deletedAt)))
      .returning();
    return updated;
  }

  async deleteCruise(id: string): Promise<boolean> {
    // Soft delete the cruise (inventory and submissions remain intact)
    await db.update(cruises)
      .set({ deletedAt: new Date(), updatedAt: new Date(), isActive: false, isPublished: false })
      .where(eq(cruises.id, id));
    return true;
  }

  // Cruise Forms
  async getCruiseForm(id: string): Promise<CruiseForm | undefined> {
    const [form] = await db.select().from(cruiseForms).where(eq(cruiseForms.id, id));
    return form;
  }

  async getCruiseForms(cruiseId: string): Promise<CruiseForm[]> {
    return await db.select().from(cruiseForms)
      .where(eq(cruiseForms.cruiseId, cruiseId))
      .orderBy(cruiseForms.sortOrder);
  }

  async getCruiseFormByShareId(shareId: string): Promise<CruiseForm | undefined> {
    const [form] = await db.select().from(cruiseForms)
      .where(eq(cruiseForms.shareId, shareId));
    return form;
  }

  async createCruiseForm(data: InsertCruiseForm): Promise<CruiseForm> {
    const [created] = await db.insert(cruiseForms).values(data).returning();
    return created;
  }

  async updateCruiseForm(id: string, data: Partial<InsertCruiseForm>): Promise<CruiseForm | undefined> {
    const [updated] = await db.update(cruiseForms)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(cruiseForms.id, id))
      .returning();
    return updated;
  }

  async deleteCruiseForm(id: string): Promise<void> {
    // Soft-delete by deactivating the form instead of hard-deleting
    await db.update(cruiseForms)
      .set({ isActive: false, updatedAt: new Date() })
      .where(eq(cruiseForms.id, id));
  }

  async reorderCruiseForms(cruiseId: string, orderedIds: string[]): Promise<void> {
    await db.transaction(async (tx) => {
      for (let i = 0; i < orderedIds.length; i++) {
        await tx.update(cruiseForms)
          .set({ sortOrder: i, updatedAt: new Date() })
          .where(and(eq(cruiseForms.id, orderedIds[i]), eq(cruiseForms.cruiseId, cruiseId)));
      }
    });
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
    const [result] = await db.insert(cruiseInventory)
      .values(item)
      .onConflictDoUpdate({
        target: [cruiseInventory.cruiseId, cruiseInventory.stepId, cruiseInventory.choiceId],
        set: {
          choiceLabel: item.choiceLabel,
          price: item.price,
          updatedAt: new Date(),
        },
      })
      .returning();
    return result;
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

  // Paginated submissions with search
  async getSubmissionsByCruisePaginated(cruiseId: string, params: PaginationParams): Promise<PaginatedResult<Submission>> {
    const page = params.page || 1;
    const limit = Math.min(params.limit || 20, 100);
    const offset = (page - 1) * limit;

    const conditions = [eq(submissions.cruiseId, cruiseId)];
    if (params.search) {
      conditions.push(
        or(
          ilike(submissions.customerName, `%${escapeLike(params.search)}%`),
          ilike(submissions.customerPhone, `%${escapeLike(params.search)}%`),
        )!
      );
    }
    const whereClause = and(...conditions);

    const [{ count: total }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(submissions)
      .where(whereClause);

    const data = await db.select().from(submissions)
      .where(whereClause)
      .orderBy(desc(submissions.createdAt))
      .limit(limit)
      .offset(offset);

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async getSubmissionCountByCruise(cruiseId: string): Promise<number> {
    const result = await db.select({ count: sql<number>`count(*)::int` })
      .from(submissions)
      .where(eq(submissions.cruiseId, cruiseId));
    return result[0]?.count || 0;
  }

  async getUnviewedSubmissionCount(cruiseId: string): Promise<number> {
    const result = await db.select({ count: sql<number>`count(*)::int` })
      .from(submissions)
      .where(and(eq(submissions.cruiseId, cruiseId), eq(submissions.isViewed, false)));
    return result[0]?.count || 0;
  }

  async markSubmissionsViewed(cruiseId: string): Promise<void> {
    await db
      .update(submissions)
      .set({ isViewed: true })
      .where(eq(submissions.cruiseId, cruiseId));
  }

  async markSubmissionViewed(submissionId: string): Promise<Submission | undefined> {
    const [result] = await db
      .update(submissions)
      .set({ isViewed: true })
      .where(eq(submissions.id, submissionId))
      .returning();
    return result;
  }

  async createSubmission(submission: InsertSubmission): Promise<Submission> {
    const [created] = await db.insert(submissions).values(submission).returning();
    return created;
  }

  // Audit logs
  async createAuditLog(log: InsertAuditLog): Promise<AuditLog> {
    const [created] = await db.insert(auditLogs).values(log).returning();
    return created;
  }

  async getAuditLogs(params: PaginationParams): Promise<PaginatedResult<AuditLog>> {
    const page = params.page || 1;
    const limit = Math.min(params.limit || 50, 100);
    const offset = (page - 1) * limit;

    const [{ count: total }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(auditLogs);

    const data = await db.select().from(auditLogs)
      .orderBy(desc(auditLogs.createdAt))
      .limit(limit)
      .offset(offset);

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  // Notification settings
  async getNotificationSettings(userId: string): Promise<NotificationSettings | undefined> {
    const [settings] = await db.select().from(notificationSettings)
      .where(eq(notificationSettings.userId, userId));
    return settings;
  }

  async upsertNotificationSettings(userId: string, settings: { emailOnSubmission?: boolean; emailAddress?: string | null }): Promise<NotificationSettings> {
    const existing = await this.getNotificationSettings(userId);
    if (existing) {
      const [updated] = await db.update(notificationSettings)
        .set({ ...settings, updatedAt: new Date() })
        .where(eq(notificationSettings.userId, userId))
        .returning();
      return updated;
    }
    const [created] = await db.insert(notificationSettings)
      .values({ userId, ...settings })
      .returning();
    return created;
  }
}

/** Escape special characters in a SQL LIKE/ILIKE pattern so they are treated as literals. */
function escapeLike(value: string): string {
  return value.replace(/[%_\\]/g, (ch) => `\\${ch}`);
}

export const storage = new DatabaseStorage();
