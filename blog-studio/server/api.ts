/* Vite plugin: a small JSON API over the posts folder, only active in `npm run dev`. */
import type { Plugin } from "vite";
import type { IncomingMessage, ServerResponse } from "node:http";
import path from "node:path";
import { createPost, exportPost, HttpError, listPosts, loadSite, readPost, STUDIO_DIR, writePost } from "./posts.ts";

function body(req: IncomingMessage): Promise<any> {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (c) => (data += c));
    req.on("end", () => { try { resolve(data ? JSON.parse(data) : {}); } catch (e) { reject(new HttpError(400, "Body is not JSON")); } });
    req.on("error", reject);
  });
}

function send(res: ServerResponse, status: number, payload: unknown) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(payload));
}

export function studioApi(): Plugin {
  return {
    name: "blog-studio-api",
    configureServer(server) {
      server.middlewares.use("/api", async (req, res) => {
        const url = new URL(req.url || "/", "http://x");
        const parts = url.pathname.split("/").filter(Boolean); // ["posts", slug?, action?]
        try {
          if (parts[0] === "site" && req.method === "GET") return send(res, 200, loadSite());
          if (parts[0] !== "posts") throw new HttpError(404, "Not found");
          const [, slug, action] = parts;
          if (!slug && req.method === "GET") return send(res, 200, listPosts());
          if (!slug && req.method === "POST") {
            const b = await body(req);
            return send(res, 201, createPost(String(b.slug || ""), String(b.title || ""), b.starter === "article" ? "article" : "simulation"));
          }
          if (slug && !action && req.method === "GET") return send(res, 200, readPost(slug));
          if (slug && !action && req.method === "PUT") {
            const b = await body(req);
            writePost({ slug, meta: b.meta, body: String(b.body ?? ""), simHtml: String(b.simHtml ?? ""), simJs: String(b.simJs ?? ""), simCss: String(b.simCss ?? ""), figJs: String(b.figJs ?? ""), figCss: String(b.figCss ?? "") });
            return send(res, 200, { ok: true });
          }
          if (slug && action === "export" && req.method === "POST") {
            const r = exportPost(slug);
            return send(res, 200, { ...r, file: path.relative(path.resolve(STUDIO_DIR, ".."), r.file).replace(/\\/g, "/") });
          }
          throw new HttpError(405, "Method not allowed");
        } catch (e) {
          const status = e instanceof HttpError ? e.status : 500;
          send(res, status, { error: e instanceof Error ? e.message : String(e) });
        }
      });
    },
  };
}
