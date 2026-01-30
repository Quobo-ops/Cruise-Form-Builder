import { db } from "./db";
import { users, templates } from "@shared/schema";
import { eq } from "drizzle-orm";
import bcrypt from "bcrypt";

const SALT_ROUNDS = 10;

export async function seedDatabase() {
  try {
    // Check if admin user exists
    const [existingAdmin] = await db.select().from(users).where(eq(users.username, "admin"));
    
    if (!existingAdmin) {
      console.log("Creating admin user...");
      const hashedPassword = await bcrypt.hash("admin123", SALT_ROUNDS);
      await db.insert(users).values({
        username: "admin",
        password: hashedPassword,
      });
      console.log("Admin user created");
    }

    // Check if sample templates exist
    const existingTemplates = await db.select().from(templates);
    
    if (existingTemplates.length === 0) {
      console.log("Creating sample templates...");
      
      // Caribbean Cruise Booking template
      await db.insert(templates).values({
        name: "Caribbean Cruise Booking",
        published: true,
        shareId: "caribbean-cruise",
        graph: {
          rootStepId: "step-1",
          steps: {
            "step-1": {
              id: "step-1",
              type: "text",
              question: "What is your full name?",
              placeholder: "Enter your full name",
              nextStepId: "step-2",
            },
            "step-2": {
              id: "step-2",
              type: "text",
              question: "What is your email address?",
              placeholder: "your@email.com",
              nextStepId: "step-3",
            },
            "step-3": {
              id: "step-3",
              type: "choice",
              question: "Which cruise package interests you?",
              choices: [
                { id: "choice-1", label: "7-Day Caribbean Explorer", nextStepId: "step-4" },
                { id: "choice-2", label: "14-Day Island Hopper", nextStepId: "step-4" },
                { id: "choice-3", label: "21-Day Grand Caribbean", nextStepId: "step-4" },
              ],
            },
            "step-4": {
              id: "step-4",
              type: "choice",
              question: "What type of cabin do you prefer?",
              choices: [
                { id: "choice-4", label: "Interior Cabin", nextStepId: "step-5" },
                { id: "choice-5", label: "Ocean View Cabin", nextStepId: "step-5" },
                { id: "choice-6", label: "Balcony Suite", nextStepId: "step-5" },
                { id: "choice-7", label: "Penthouse Suite", nextStepId: "step-5" },
              ],
            },
            "step-5": {
              id: "step-5",
              type: "text",
              question: "How many guests will be traveling?",
              placeholder: "Number of guests",
              nextStepId: "step-6",
            },
            "step-6": {
              id: "step-6",
              type: "text",
              question: "What are your preferred travel dates?",
              placeholder: "e.g., March 15-22, 2026",
              nextStepId: null,
            },
          },
        },
      });

      // Mediterranean Voyage template
      await db.insert(templates).values({
        name: "Mediterranean Voyage",
        published: true,
        shareId: "med-voyage",
        graph: {
          rootStepId: "step-1",
          steps: {
            "step-1": {
              id: "step-1",
              type: "text",
              question: "What is your full name?",
              placeholder: "Enter your full name",
              nextStepId: "step-2",
            },
            "step-2": {
              id: "step-2",
              type: "text",
              question: "Contact phone number?",
              placeholder: "+1 (555) 000-0000",
              nextStepId: "step-3",
            },
            "step-3": {
              id: "step-3",
              type: "choice",
              question: "Which Mediterranean route do you prefer?",
              choices: [
                { id: "choice-1", label: "Western Mediterranean (Spain, France, Italy)", nextStepId: "step-4" },
                { id: "choice-2", label: "Eastern Mediterranean (Greece, Turkey, Croatia)", nextStepId: "step-4" },
                { id: "choice-3", label: "Full Mediterranean Grand Tour", nextStepId: "step-4" },
              ],
            },
            "step-4": {
              id: "step-4",
              type: "choice",
              question: "Are you interested in shore excursions?",
              choices: [
                { id: "choice-4", label: "Yes, include all excursions", nextStepId: "step-5" },
                { id: "choice-5", label: "Yes, select excursions only", nextStepId: "step-5" },
                { id: "choice-6", label: "No, just the cruise", nextStepId: "step-5" },
              ],
            },
            "step-5": {
              id: "step-5",
              type: "text",
              question: "Any special requests or dietary requirements?",
              placeholder: "Enter any special requests",
              nextStepId: null,
            },
          },
        },
      });

      // Alaska Expedition template
      await db.insert(templates).values({
        name: "Alaska Expedition",
        published: false,
        shareId: null,
        graph: {
          rootStepId: "step-1",
          steps: {
            "step-1": {
              id: "step-1",
              type: "text",
              question: "Your name?",
              placeholder: "Full name",
              nextStepId: "step-2",
            },
            "step-2": {
              id: "step-2",
              type: "choice",
              question: "What are you most excited to see?",
              choices: [
                { id: "choice-1", label: "Glaciers and ice formations", nextStepId: null },
                { id: "choice-2", label: "Wildlife (whales, bears, eagles)", nextStepId: null },
                { id: "choice-3", label: "Northern Lights", nextStepId: null },
                { id: "choice-4", label: "All of the above!", nextStepId: null },
              ],
            },
          },
        },
      });

      console.log("Sample templates created");
    }

    console.log("Database seeding complete");
  } catch (error) {
    console.error("Seed error:", error);
  }
}
