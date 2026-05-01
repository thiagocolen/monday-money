import path from "path";
import { fileURLToPath } from "url";
import { defineConfig, type ViteDevServer, type Connect } from "vite";
import type { ServerResponse } from "node:http";
import react from "@vitejs/plugin-react";
import { reactCompilerPreset } from "@vitejs/plugin-react";
import babel from "@rolldown/plugin-babel";
import tailwindcss from "@tailwindcss/vite";
import electron from "vite-plugin-electron/simple";
import {
  handleGetCsvData,
  handleGetOwners,
  handleImportFile,
  handleDeleteImport,
  handleGetImportHistory,
  handleSaveCategory,
  handleBulkSaveMetadata,
  handleGetMetadata,
  handleSaveMetadata,
  handleBackupCategories,
  handleGetBackupInfo,
} from "./backend/index.js";

const currentDir = path.dirname(fileURLToPath(import.meta.url));

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const isWeb = mode === "web";

  return {
    base: "./",
    optimizeDeps: {
      include: ["@phosphor-icons/react"],
    },
    server: {
      watch: {
        ignored: ["**/core/**"],
      },
    },
    plugins: [
      react(),
      babel({ presets: [reactCompilerPreset()] }),
      tailwindcss(),
      !isWeb &&
        electron({
          main: {
            entry: "electron/main.ts",
          },
          preload: {
            input: "electron/preload.ts",
          },
        }),
      {
        name: "csv-api",
        configureServer(server: ViteDevServer) {
          server.middlewares.use(
            async (
              req: Connect.IncomingMessage,
              res: ServerResponse,
              next: Connect.NextFunction,
            ) => {
              try {
                if (req.url?.startsWith("/api/data/")) {
                  const fileName = req.url
                    .replace("/api/data/", "")
                    .split("?")[0];
                  const data = await handleGetCsvData(fileName);
                  res.setHeader("Content-Type", "text/csv");
                  res.setHeader(
                    "Cache-Control",
                    "no-store, no-cache, must-revalidate, proxy-revalidate",
                  );
                  res.setHeader("Pragma", "no-cache");
                  res.setHeader("Expires", "0");
                  res.end(data);
                  return;
                }

                if (req.url === "/api/owners" && req.method === "GET") {
                  const owners = await handleGetOwners();
                  res.statusCode = 200;
                  res.setHeader("Content-Type", "application/json");
                  res.end(JSON.stringify(owners));
                  return;
                }

                if (req.url === "/api/import-file" && req.method === "POST") {
                  let body = "";
                  req.on("data", (chunk: Buffer) => {
                    body += chunk.toString();
                  });
                  req.on("end", async () => {
                    try {
                      const { owner, fileName, fileContent } = JSON.parse(body);
                      const result = await handleImportFile(
                        owner,
                        fileName,
                        fileContent,
                      );
                      res.statusCode = 200;
                      res.setHeader("Content-Type", "application/json");
                      res.end(JSON.stringify(result));
                    } catch (e: any) {
                      res.statusCode = e.message.includes("Security")
                        ? 403
                        : 400;
                      res.end(
                        JSON.stringify({ success: false, error: e.message }),
                      );
                    }
                  });
                  return;
                }

                if (req.url === "/api/delete-import" && req.method === "POST") {
                  let body = "";
                  req.on("data", (chunk: Buffer) => {
                    body += chunk.toString();
                  });
                  req.on("end", async () => {
                    try {
                      const { owner, fileName } = JSON.parse(body);
                      const result = await handleDeleteImport(owner, fileName);
                      res.statusCode = 200;
                      res.setHeader("Content-Type", "application/json");
                      res.end(JSON.stringify(result));
                    } catch (e: any) {
                      res.statusCode = e.message.includes("Security")
                        ? 403
                        : 400;
                      res.end(
                        JSON.stringify({ success: false, error: e.message }),
                      );
                    }
                  });
                  return;
                }

                if (req.url === "/api/import-history" && req.method === "GET") {
                  const history = await handleGetImportHistory();
                  res.statusCode = 200;
                  res.setHeader("Content-Type", "application/json");
                  res.end(JSON.stringify(history));
                  return;
                }

                if (req.url === "/api/save-category" && req.method === "POST") {
                  let body = "";
                  req.on("data", (chunk: Buffer) => {
                    body += chunk.toString();
                  });
                  req.on("end", async () => {
                    try {
                      const { transactionHash, category, tags } =
                        JSON.parse(body);
                      const result = await handleSaveCategory(
                        transactionHash,
                        category,
                        tags,
                      );
                      res.statusCode = 200;
                      res.setHeader("Content-Type", "application/json");
                      res.end(JSON.stringify(result));
                    } catch (e: any) {
                      res.statusCode = 400;
                      res.end(
                        JSON.stringify({ success: false, error: e.message }),
                      );
                    }
                  });
                  return;
                }

                if (
                  req.url === "/api/bulk-save-metadata" &&
                  req.method === "POST"
                ) {
                  let body = "";
                  req.on("data", (chunk: Buffer) => {
                    body += chunk.toString();
                  });
                  req.on("end", async () => {
                    try {
                      const updates = JSON.parse(body);
                      const result = await handleBulkSaveMetadata(updates);
                      res.statusCode = 200;
                      res.setHeader("Content-Type", "application/json");
                      res.end(JSON.stringify(result));
                    } catch (e: any) {
                      res.statusCode = 400;
                      res.end(
                        JSON.stringify({ success: false, error: e.message }),
                      );
                    }
                  });
                  return;
                }

                if (req.url === "/api/metadata" && req.method === "GET") {
                  const metadata = await handleGetMetadata();
                  res.statusCode = 200;
                  res.setHeader("Content-Type", "application/json");
                  res.end(JSON.stringify(metadata));
                  return;
                }

                if (req.url === "/api/metadata" && req.method === "POST") {
                  let body = "";
                  req.on("data", (chunk: Buffer) => {
                    body += chunk.toString();
                  });
                  req.on("end", async () => {
                    try {
                      const { type, data } = JSON.parse(body);
                      const result = await handleSaveMetadata(type, data);
                      res.statusCode = 200;
                      res.setHeader("Content-Type", "application/json");
                      res.end(JSON.stringify(result));
                    } catch (e: any) {
                      res.statusCode = 400;
                      res.end(
                        JSON.stringify({ success: false, error: e.message }),
                      );
                    }
                  });
                  return;
                }

                if (
                  req.url === "/api/backup-categories" &&
                  req.method === "POST"
                ) {
                  try {
                    const result = await handleBackupCategories();
                    res.statusCode = 200;
                    res.setHeader("Content-Type", "application/json");
                    res.end(JSON.stringify(result));
                  } catch (e: any) {
                    res.statusCode = 404;
                    res.end(
                      JSON.stringify({ success: false, error: e.message }),
                    );
                  }
                  return;
                }

                if (req.url === "/api/backup-info" && req.method === "GET") {
                  const info = await handleGetBackupInfo();
                  res.statusCode = 200;
                  res.setHeader("Content-Type", "application/json");
                  res.end(JSON.stringify(info));
                  return;
                }
              } catch (e: any) {
                console.error(e);
                res.statusCode = 500;
                res.end(JSON.stringify({ success: false, error: String(e) }));
                return;
              }
              next();
            },
          );
        },
      },
    ].filter(Boolean) as any[],
    resolve: {
      alias: {
        "@": path.resolve(currentDir, "./src"),
      },
    },
  };
});
