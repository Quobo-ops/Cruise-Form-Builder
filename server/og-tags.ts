import { storage } from "./storage";

/**
 * Generates dynamic Open Graph meta tags for shared form/cruise URLs.
 * Called server-side before serving index.html so SMS/social link previews
 * show cruise-specific information instead of generic defaults.
 */
export async function injectOgTags(html: string, url: string): Promise<string> {
  // Match /form/:shareId routes
  const formMatch = url.match(/^\/form\/([a-zA-Z0-9]+)/);
  if (!formMatch) return html;

  const shareId = formMatch[1];

  try {
    const ogData = await resolveOgData(shareId);
    if (!ogData) return html;

    const { title, description, imageUrl, canonicalUrl } = ogData;

    // Build replacement meta tags
    const ogTags = [
      `<meta property="og:title" content="${escapeAttr(title)}" />`,
      `<meta property="og:description" content="${escapeAttr(description)}" />`,
      `<meta property="og:type" content="website" />`,
      `<meta property="og:url" content="${escapeAttr(canonicalUrl)}" />`,
      imageUrl ? `<meta property="og:image" content="${escapeAttr(imageUrl)}" />` : "",
      // Twitter Card tags for better SMS/social previews
      `<meta name="twitter:card" content="${imageUrl ? "summary_large_image" : "summary"}" />`,
      `<meta name="twitter:title" content="${escapeAttr(title)}" />`,
      `<meta name="twitter:description" content="${escapeAttr(description)}" />`,
      imageUrl ? `<meta name="twitter:image" content="${escapeAttr(imageUrl)}" />` : "",
    ].filter(Boolean).join("\n    ");

    // Replace existing static OG tags
    html = html.replace(
      /<meta property="og:title"[^>]*\/>\s*<meta property="og:description"[^>]*\/>\s*<meta property="og:type"[^>]*\/>/,
      ogTags
    );

    // Also update the page <title>
    html = html.replace(
      /<title>[^<]*<\/title>/,
      `<title>${escapeHtml(title)}</title>`
    );
  } catch (err) {
    // If lookup fails, return original HTML with default tags
    console.error("OG tag injection error:", err);
  }

  return html;
}

async function resolveOgData(shareId: string): Promise<{
  title: string;
  description: string;
  imageUrl: string | null;
  canonicalUrl: string;
} | null> {
  const baseUrl = process.env.BASE_URL || "";

  // 1. Check cruise_forms
  const cruiseForm = await storage.getCruiseFormByShareId(shareId);
  if (cruiseForm) {
    const cruise = await storage.getCruise(cruiseForm.cruiseId);
    if (cruise) {
      return {
        title: `${cruise.name} - ${cruiseForm.label}`,
        description: cruise.description || `Sign up for ${cruise.name}`,
        imageUrl: cruise.learnMoreImages?.[0] || null,
        canonicalUrl: `${baseUrl}/form/${shareId}`,
      };
    }
  }

  // 2. Check cruises
  const cruise = await storage.getCruiseByShareId(shareId);
  if (cruise) {
    return {
      title: cruise.name,
      description: cruise.description || `Sign up for ${cruise.name}`,
      imageUrl: cruise.learnMoreImages?.[0] || null,
      canonicalUrl: `${baseUrl}/form/${shareId}`,
    };
  }

  // 3. Check templates (legacy)
  const template = await storage.getTemplateByShareId(shareId);
  if (template) {
    return {
      title: template.name,
      description: `Fill out the ${template.name} form`,
      imageUrl: null,
      canonicalUrl: `${baseUrl}/form/${shareId}`,
    };
  }

  return null;
}

function escapeAttr(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
