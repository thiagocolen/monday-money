import path from "path"
import { readFileSync } from "fs"
import { fileURLToPath } from "url"
import { defineConfig, type ViteDevServer } from "vite"
import react, { reactCompilerPreset } from "@vitejs/plugin-react"
import babel from "@rolldown/plugin-babel"
import tailwindcss from "@tailwindcss/vite"
import electron from "vite-plugin-electron/simple"
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
  handleGetAllocationTarget,
  handleSaveAllocationTarget,
  handleFullBackup,
  handleGetBackupInfo,
  handleRestoreBackup,
  handleResetApp,
  handleSetExportPath,
  getSettings
} from "./backend/index.js"

const currentDir = path.dirname(fileURLToPath(import.meta.url));

const pkg = JSON.parse(readFileSync(path.resolve(currentDir, "package.json"), "utf-8"));

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const isWeb = mode === 'web'

  return {
    base: './',
    define: {
      __APP_VERSION__: JSON.stringify(pkg.version),
    },
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
      !isWeb && electron({
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
        server.middlewares.use(async (req, res, next) => {
          try {
            // Dev-only API surface, including destructive endpoints
            // (reset-app, restore-backup, import-file). It has no auth, so a
            // malicious page open in the developer's browser could otherwise
            // reach it cross-origin (CSRF / DNS rebinding) while `npm run
            // dev` is running. Reject any state-changing request whose
            // Origin doesn't match this dev server.
            if (req.url?.startsWith("/api/") && req.method !== "GET") {
              const origin = req.headers.origin
              const expected = `${req.headers["x-forwarded-proto"] || "http"}://${req.headers.host}`
              if (origin && origin !== expected) {
                res.statusCode = 403
                res.end(JSON.stringify({ success: false, error: "Cross-origin request blocked" }))
                return
              }
            }

            if (req.url?.startsWith("/api/data/")) {
              const fileName = req.url.replace("/api/data/", "").split("?")[0]
              const data = await handleGetCsvData(fileName)
              res.setHeader("Content-Type", "text/csv")
              res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate")
              res.setHeader("Pragma", "no-cache")
              res.setHeader("Expires", "0")
              res.end(data)
              return
            }

            if (req.url === "/api/owners" && req.method === "GET") {
              const owners = await handleGetOwners()
              res.statusCode = 200
              res.setHeader("Content-Type", "application/json")
              res.end(JSON.stringify(owners))
              return
            }

            if (req.url === "/api/import-file" && req.method === "POST") {
              let body = ""
              req.on("data", (chunk: Buffer) => { body += chunk.toString() })
              req.on("end", async () => {
                try {
                  const { owner, fileName, fileContent } = JSON.parse(body)
                  const result = await handleImportFile(owner, fileName, fileContent)
                  res.statusCode = 200
                  res.setHeader("Content-Type", "application/json")
                  res.end(JSON.stringify(result))
                } catch (e: any) {
                  res.statusCode = e.message.includes('Security') ? 403 : 400
                  res.end(JSON.stringify({ success: false, error: e.message }))
                }
              })
              return
            }

            if (req.url === "/api/delete-import" && req.method === "POST") {
              let body = ""
              req.on("data", (chunk: Buffer) => { body += chunk.toString() })
              req.on("end", async () => {
                try {
                  const { owner, fileName } = JSON.parse(body)
                  const result = await handleDeleteImport(owner, fileName)
                  res.statusCode = 200
                  res.setHeader("Content-Type", "application/json")
                  res.end(JSON.stringify(result))
                } catch (e: any) {
                  res.statusCode = e.message.includes('Security') ? 403 : 400
                  res.end(JSON.stringify({ success: false, error: e.message }))
                }
              })
              return
            }

            if (req.url === "/api/import-history" && req.method === "GET") {
              const history = await handleGetImportHistory()
              res.statusCode = 200
              res.setHeader("Content-Type", "application/json")
              res.end(JSON.stringify(history))
              return
            }

            if (req.url === "/api/save-category" && req.method === "POST") {
              let body = ""
              req.on("data", (chunk: Buffer) => { body += chunk.toString() })
              req.on("end", async () => {
                try {
                  const { transactionHash, category, tags } = JSON.parse(body)
                  const result = await handleSaveCategory(transactionHash, category, tags)
                  res.statusCode = 200
                  res.setHeader("Content-Type", "application/json")
                  res.end(JSON.stringify(result))
                } catch (e: any) {
                  res.statusCode = 400
                  res.end(JSON.stringify({ success: false, error: e.message }))
                }
              })
              return
            }

            if (req.url === "/api/bulk-save-metadata" && req.method === "POST") {
              let body = ""
              req.on("data", (chunk: Buffer) => { body += chunk.toString() })
              req.on("end", async () => {
                try {
                  const updates = JSON.parse(body)
                  const result = await handleBulkSaveMetadata(updates)
                  res.statusCode = 200
                  res.setHeader("Content-Type", "application/json")
                  res.end(JSON.stringify(result))
                } catch (e: any) {
                  res.statusCode = 400
                  res.end(JSON.stringify({ success: false, error: e.message }))
                }
              })
              return
            }

            if (req.url === "/api/metadata" && req.method === "GET") {
              const metadata = await handleGetMetadata()
              res.statusCode = 200
              res.setHeader("Content-Type", "application/json")
              res.end(JSON.stringify(metadata))
              return
            }

            if (req.url === "/api/metadata" && req.method === "POST") {
              let body = ""
              req.on("data", (chunk: Buffer) => { body += chunk.toString() })
              req.on("end", async () => {
                try {
                  const { type, data } = JSON.parse(body)
                  const result = await handleSaveMetadata(type, data)
                  res.statusCode = 200
                  res.setHeader("Content-Type", "application/json")
                  res.end(JSON.stringify(result))
                } catch (e: any) {
                  res.statusCode = 400
                  res.end(JSON.stringify({ success: false, error: e.message }))
                }
              })
              return
            }

            if (req.url === "/api/allocation-target" && req.method === "GET") {
              const target = await handleGetAllocationTarget()
              res.statusCode = 200
              res.setHeader("Content-Type", "application/json")
              res.end(JSON.stringify(target))
              return
            }

            if (req.url === "/api/allocation-target" && req.method === "POST") {
              let body = ""
              req.on("data", (chunk: Buffer) => { body += chunk.toString() })
              req.on("end", async () => {
                try {
                  const target = JSON.parse(body)
                  const result = await handleSaveAllocationTarget(target)
                  res.statusCode = 200
                  res.setHeader("Content-Type", "application/json")
                  res.end(JSON.stringify(result))
                } catch (e: any) {
                  res.statusCode = 400
                  res.end(JSON.stringify({ success: false, error: e.message }))
                }
              })
              return
            }

            if (req.url === "/api/full-backup" && req.method === "POST") {
              try {
                const result = await handleFullBackup()
                res.statusCode = 200
                res.setHeader("Content-Type", "application/json")
                res.end(JSON.stringify(result))
              } catch (e: any) {
                res.statusCode = 404
                res.end(JSON.stringify({ success: false, error: e.message }))
              }
              return
            }

            if (req.url === "/api/backup-info" && req.method === "GET") {
              const info = await handleGetBackupInfo()
              res.statusCode = 200
              res.setHeader("Content-Type", "application/json")
              res.end(JSON.stringify(info))
              return
            }

            if (req.url === "/api/settings" && req.method === "GET") {
              const settings = getSettings()
              res.statusCode = 200
              res.setHeader("Content-Type", "application/json")
              res.end(JSON.stringify(settings))
              return
            }

            if (req.url === "/api/settings" && req.method === "POST") {
              let body = ""
              req.on("data", (chunk: Buffer) => { body += chunk.toString() })
              req.on("end", async () => {
                try {
                  const { exportPath } = JSON.parse(body)
                  const result = await handleSetExportPath(exportPath)
                  res.statusCode = 200
                  res.setHeader("Content-Type", "application/json")
                  res.end(JSON.stringify(result))
                } catch (e: any) {
                  res.statusCode = 400
                  res.end(JSON.stringify({ success: false, error: e.message }))
                }
              })
              return
            }

            if (req.url === "/api/restore-backup" && req.method === "POST") {
              let body = ""
              req.on("data", (chunk: Buffer) => { body += chunk.toString() })
              req.on("end", async () => {
                try {
                  const { zipPath } = JSON.parse(body)
                  const result = await handleRestoreBackup(zipPath)
                  res.statusCode = 200
                  res.setHeader("Content-Type", "application/json")
                  res.end(JSON.stringify(result))
                } catch (e: any) {
                  res.statusCode = 400
                  res.end(JSON.stringify({ success: false, error: e.message }))
                }
              })
              return
            }

            if (req.url === "/api/reset-app" && req.method === "POST") {
              const result = await handleResetApp()
              res.statusCode = 200
              res.setHeader("Content-Type", "application/json")
              res.end(JSON.stringify(result))
              return
            }
          } catch (e: any) {
            console.error(e)
            res.statusCode = 500
            res.end(JSON.stringify({ success: false, error: String(e) }))
            return
          }
          next()
        })
      }
    },
    ].filter(Boolean) as any[],
    resolve: {
      alias: {
        "@": path.resolve(currentDir, "./src"),
      },
    },
  }
})
