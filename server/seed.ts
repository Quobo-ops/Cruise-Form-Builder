import { db } from "./db";
import { users, templates } from "@shared/schema";
import { eq } from "drizzle-orm";
import bcrypt from "bcrypt";

const SALT_ROUNDS = 10;

export async function seedDatabase() {
  try {
    // Check if admin user exists
    const [existingAdmin] = await db.select().from(users).where(eq(users.username, "EloiseDavid"));
    
    if (!existingAdmin) {
      console.log("Creating admin user...");
      const hashedPassword = await bcrypt.hash("LumiSade2026!", SALT_ROUNDS);
      await db.insert(users).values({
        username: "EloiseDavid",
        password: hashedPassword,
      });
      console.log("Admin user created");
    }

    // Check if sample templates exist
    const existingTemplates = await db.select().from(templates);
    
    if (existingTemplates.length === 0) {
      console.log("Creating sample templates...");
      
      // Geno Delafose Zydeco Cruise 2026 template
      // Based on the physical form: Nov 15-21, 2026, R/T New Orleans, LA → Belize & Cozumel, MX
      await db.insert(templates).values({
        name: "Geno Delafose Zydeco Cruise 2026",
        published: true,
        shareId: "zydeco-cruise-2026",
        graph: {
          rootStepId: "step-1",
          steps: {
            // --- Customer Identification ---
            "step-1": {
              id: "step-1",
              type: "text",
              question: "What is your full name?",
              placeholder: "Enter your full name",
              nextStepId: "step-2",
            },

            // --- Lanyard / Badge Names ---
            "step-2": {
              id: "step-2",
              type: "text",
              question: "What name would you like on your first performance badge/lanyard?",
              placeholder: "Name for Badge #1",
              nextStepId: "step-3",
            },
            "step-3": {
              id: "step-3",
              type: "text",
              question: "What name would you like on your second performance badge/lanyard?",
              placeholder: "Name for Badge #2 (enter N/A if not needed)",
              nextStepId: "step-4",
            },

            // --- Payment Method ---
            "step-4": {
              id: "step-4",
              type: "choice",
              question: "How would you like to pay for your selected options?",
              choices: [
                { id: "pay-cc", label: "Credit Card", nextStepId: "step-5" },
                { id: "pay-venmo", label: "Venmo / PayPal / Zelle", nextStepId: "step-4a" },
              ],
              infoPopup: {
                enabled: true,
                header: "Payment Authorization",
                images: [],
                description: "Your signature on the submitted form authorizes Events by LeVoyage to use the selected payment method to pay for any of your selected options. Credit card details will be collected securely by the organizer.",
              },
            },
            "step-4a": {
              id: "step-4a",
              type: "text",
              question: "What is your Venmo, PayPal, or Zelle ID?",
              placeholder: "Enter your Venmo/PayPal/Zelle username or ID",
              nextStepId: "step-5",
            },

            // --- Cozumel Excursion ---
            "step-5": {
              id: "step-5",
              type: "quantity",
              question: "Cozumel Excursion — Mr. Sanchos Group Excursion",
              quantityChoices: [
                { id: "sanchos", label: "Mr. Sanchos Beach Club — Cozumel ($95.00/person)", price: 95, limit: null, isNoThanks: false },
                { id: "sanchos-no", label: "No Thanks", price: 0, limit: null, isNoThanks: true },
              ],
              nextStepId: "step-6",
              infoPopup: {
                enabled: true,
                header: "Mr. Sanchos Beach Club — Cozumel",
                images: [],
                description: "Includes 20% gratuities.\n\nThe all-inclusive day pass includes: beachfront access, unlimited buffet, made-to-order dining, unlimited cocktails, beer, soft drinks, and bottled water.\n\nCovered, open-air seating, direct beach access, bar service, chair and umbrella rentals.\n\nGroup plans to reserve a designated restaurant area with beach and pool access for exclusive use, or a reserved section based on group size.\n\nDoes NOT include: Aquatic Park, towels, snorkeling equipment, liquor shots, or Starbucks® products. Towels are available for rent, or guests can bring their own.\n\nTransportation is NOT included. To reach the club, take a taxi or shared van (15-20 minutes, $17-$25 USD each way for up to four guests, cash recommended).\n\nAn advance payment is required to confirm the reservation.",
              },
            },

            // --- Hotel ---
            "step-6": {
              id: "step-6",
              type: "quantity",
              question: "Hotel — Hampton Inn ($235.00/night)",
              quantityChoices: [
                { id: "hotel-pre", label: "Pre-Cruise Night(s)", price: 235, limit: null, isNoThanks: false },
                { id: "hotel-post", label: "Post-Cruise Night(s)", price: 235, limit: null, isNoThanks: false },
                { id: "hotel-no", label: "No Hotel Needed", price: 0, limit: null, isNoThanks: true },
              ],
              nextStepId: "step-7",
              infoPopup: {
                enabled: true,
                header: "Hampton Inn — Hotel Stay & Cruise Package Details",
                images: [],
                description: "Check-in at 3:00 p.m., check-out at 11:00 a.m.\n\nDaily hot breakfast buffet included.\n\nComplimentary shuttle service to the cruise terminal for guests booked within the Cruise Package group block.\n\nShuttle sign-up required by 8:00 a.m. on departure day. Shuttle accommodates up to 14 guests plus luggage per trip.\n\nHotel parking available at a discounted rate of $20.00 per night (plus tax, per vehicle) compared to the cruise terminal rate of $25.00 per day.",
              },
            },

            // --- T-Shirts: Men's ---
            "step-7": {
              id: "step-7",
              type: "quantity",
              question: "Cruise Group T-Shirts — Men's Sizes",
              quantityChoices: [
                { id: "tshirt-m-sm", label: "Men's Small", price: 25, limit: null, isNoThanks: false },
                { id: "tshirt-m-med", label: "Men's Medium", price: 25, limit: null, isNoThanks: false },
                { id: "tshirt-m-lg", label: "Men's Large", price: 25, limit: null, isNoThanks: false },
                { id: "tshirt-m-xl", label: "Men's XL", price: 25, limit: null, isNoThanks: false },
                { id: "tshirt-m-xxl", label: "Men's XXL", price: 25, limit: null, isNoThanks: false },
                { id: "tshirt-m-no", label: "No Men's T-Shirt", price: 0, limit: null, isNoThanks: true },
              ],
              nextStepId: "step-8",
            },

            // --- T-Shirts: Women's ---
            "step-8": {
              id: "step-8",
              type: "quantity",
              question: "Cruise Group T-Shirts — Women's Sizes",
              quantityChoices: [
                { id: "tshirt-w-sm", label: "Women's Small", price: 25, limit: null, isNoThanks: false },
                { id: "tshirt-w-med", label: "Women's Medium", price: 25, limit: null, isNoThanks: false },
                { id: "tshirt-w-lg", label: "Women's Large", price: 25, limit: null, isNoThanks: false },
                { id: "tshirt-w-xl", label: "Women's XL", price: 25, limit: null, isNoThanks: false },
                { id: "tshirt-w-xxl", label: "Women's XXL", price: 25, limit: null, isNoThanks: false },
                { id: "tshirt-w-no", label: "No Women's T-Shirt", price: 0, limit: null, isNoThanks: true },
              ],
              nextStepId: "step-9",
            },

            // --- Post Cruise Transfers ---
            "step-9": {
              id: "step-9",
              type: "quantity",
              question: "Post Cruise Transfers — Cruise Terminal to Airport",
              quantityChoices: [
                { id: "transfer-airport", label: "Airport Transfer ($27.99/person)", price: 27.99, limit: null, isNoThanks: false },
                { id: "transfer-bus", label: "Bus Transfer ($90.00/person)", price: 90, limit: null, isNoThanks: false },
                { id: "transfer-no", label: "No Transfer Needed", price: 0, limit: null, isNoThanks: true },
              ],
              nextStepId: "step-10",
            },

            // --- Conclusion ---
            "step-10": {
              id: "step-10",
              type: "conclusion",
              question: "Thank You!",
              thankYouMessage: "Thank you for completing the Geno Delafose Zydeco Cruise 2026 form! Your selections have been submitted. The Events by LeVoyage team will be in touch regarding payment and confirmation details.",
              submitButtonText: "Submit Form",
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
