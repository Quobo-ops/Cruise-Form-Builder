import express, { type Express } from "express";
import fs from "fs";
import path from "path";
import { injectOgTags } from "./og-tags";

export function serveStatic(app: Express) {
  const distPath = path.resolve(__dirname, "public");
  if (!fs.existsSync(distPath)) {
    throw new Error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`,
    );
  }

  app.use(express.static(distPath));

  // fall through to index.html if the file doesn't exist
  // Inject dynamic OG tags for share URLs before serving
  const indexPath = path.resolve(distPath, "index.html");
  app.use("/{*path}", async (req, res) => {
    try {
      let html = await fs.promises.readFile(indexPath, "utf-8");
      html = await injectOgTags(html, req.originalUrl);
      res.status(200).set({ "Content-Type": "text/html" }).end(html);
    } catch {
      res.sendFile(indexPath);
    }
  });
}
