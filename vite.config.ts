import path from "path"
import fs from "fs"
import crypto from "crypto"
import { execSync } from "child_process"
import { defineConfig } from "vite"
import react, { reactCompilerPreset } from "@vitejs/plugin-react"
import babel from "@rolldown/plugin-babel"
import tailwindcss from "@tailwindcss/vite"

function getSha256(input: string | Buffer) {
  return crypto.createHash("sha256").update(input).digest("hex")
}

// https://vite.dev/config/
export default defineConfig({
  optimizeDeps: {
    include: ["@phosphor-icons/react"],
  },
  plugins: [
    react(),
    babel({ presets: [reactCompilerPreset()] }),
    tailwindcss(),
    {
      name: "csv-api",
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          const coreDir = path.resolve(__dirname, "../core")
          const dataDir = path.resolve(coreDir, "data")
          const protectedDir = path.resolve(coreDir, "protected")

          if (req.url?.startsWith("/api/data/")) {
            const fileName = req.url.replace("/api/data/", "").split("?")[0]
            const filePath = path.resolve(dataDir, fileName)
            if (fs.existsSync(filePath)) {
              res.setHeader("Content-Type", "text/csv")
              res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate")
              res.setHeader("Pragma", "no-cache")
              res.setHeader("Expires", "0")
              res.end(fs.readFileSync(filePath))
              return
            }
          }

          if (req.url === "/api/owners" && req.method === "GET") {
            const rawPath = path.resolve(protectedDir, "raw-statement-files")
            if (fs.existsSync(rawPath)) {
              const owners = fs.readdirSync(rawPath).filter(f => fs.statSync(path.join(rawPath, f)).isDirectory())
              res.statusCode = 200
              res.end(JSON.stringify(owners))
            } else {
              res.statusCode = 200
              res.end(JSON.stringify([]))
            }
            return
          }

          if (req.url === "/api/import-file" && req.method === "POST") {
            let body = ""
            req.on("data", (chunk) => { body += chunk.toString() })
            req.on("end", () => {
              try {
                const { owner, fileName, fileContent } = JSON.parse(body)
                if (!owner || !fileName || !fileContent) {
                  res.statusCode = 400
                  res.end(JSON.stringify({ success: false, error: "Missing required fields" }))
                  return
                }

                const ownerDir = path.resolve(protectedDir, "raw-statement-files", owner)
                if (!fs.existsSync(ownerDir)) {
                  fs.mkdirSync(ownerDir, { recursive: true })
                }

                const targetPath = path.join(ownerDir, fileName)
                if (fs.existsSync(targetPath)) {
                  res.statusCode = 400
                  res.end(JSON.stringify({ success: false, error: "File already exists in protected storage" }))
                  return
                }

                const buffer = Buffer.from(fileContent, 'utf-8')
                const fileHash = getSha256(buffer)

                // Check if hash already exists in chain-transactions
                const categoryCsvPath = path.resolve(dataDir, "monthly-transactions-category.csv")
                const transactionsCsvPath = path.resolve(dataDir, "monthly-transactions.csv")
                
                if (fs.existsSync(categoryCsvPath) && fs.existsSync(transactionsCsvPath)) {
                  const categories = fs.readFileSync(categoryCsvPath, "utf-8").split("\n").filter(l => l.trim())
                  const transactions = fs.readFileSync(transactionsCsvPath, "utf-8").split("\n").filter(l => l.trim())
                  
                  const chainHashes = categories
                    .filter(line => line.includes("chain-transaction"))
                    .map(line => line.split(",")[0]) // transaction-hash

                  const existingFileHashes = transactions
                    .filter(line => chainHashes.includes(line.split(",").slice(-1)[0])) // row-hash is last
                    .map(line => {
                      const parts = line.split(",")
                      // description is usually the 2nd column, but for chain-transactions it is the hash
                      // We need to be careful with parsing.
                      return parts[1]?.replace(/"/g, "")
                    })

                  if (existingFileHashes.includes(fileHash)) {
                    res.statusCode = 400
                    res.end(JSON.stringify({ success: false, error: "File content has already been imported (hash match)" }))
                    return
                  }
                }

                // Save file
                fs.writeFileSync(targetPath, buffer)

                // Run scripts
                const scriptsDir = path.resolve(coreDir, "scripts")
                const commands = [
                  `powershell -ExecutionPolicy Bypass -File "${path.join(scriptsDir, "reset-csv-files.ps1")}"`,
                  `powershell -ExecutionPolicy Bypass -File "${path.join(scriptsDir, "create-seed-transaction.ps1")}"`,
                  `powershell -ExecutionPolicy Bypass -File "${path.join(scriptsDir, "data-import-registration.ps1")}"`,
                  `powershell -ExecutionPolicy Bypass -File "${path.join(scriptsDir, "integrity-check.ps1")}"`
                ]

                for (const cmd of commands) {
                  console.log(`Executing: ${cmd}`)
                  execSync(cmd, { stdio: 'inherit' })
                }

                res.statusCode = 200
                res.end(JSON.stringify({ success: true }))
              } catch (e) {
                console.error(e)
                res.statusCode = 500
                res.end(JSON.stringify({ success: false, error: String(e) }))
              }
            })
            return
          }

          if (req.url === "/api/import-history" && req.method === "GET") {
            const sourcePath = path.resolve(dataDir, "source-statement-files")
            const history = []

            if (fs.existsSync(sourcePath)) {
              const owners = fs.readdirSync(sourcePath).filter(f => fs.statSync(path.join(sourcePath, f)).isDirectory())
              
              for (const owner of owners) {
                const processedPath = path.resolve(sourcePath, owner, "processed")
                if (fs.existsSync(processedPath)) {
                  const files = fs.readdirSync(processedPath).filter(f => f.startsWith("processed-"))
                  for (const file of files) {
                    const filePath = path.join(processedPath, file)
                    const stats = fs.statSync(filePath)
                    const content = fs.readFileSync(filePath, "utf-8")
                    const lines = content.split("\n").filter(l => l.trim())
                    
                    // Simple heuristic: count rows minus header
                    // This varies by file type, but we'll do a best effort
                    const totalRows = lines.length > 0 ? lines.length - 1 : 0
                    
                    // To get imported vs not imported, we'd need to parse the ledger.
                    // For now, let's assume all valid rows were imported if the script ran.
                    // Actually, let's just return what we can easily get.
                    history.push({
                      fileName: file.replace(/^processed-[a-f0-9]{6}-/, ""),
                      owner,
                      processedDate: stats.mtime.toISOString(),
                      totalTransactions: totalRows,
                      importedTransactions: totalRows, // placeholder
                      notImportedTransactions: 0 // placeholder
                    })
                  }
                }
              }
            }
            
            res.statusCode = 200
            res.end(JSON.stringify(history.sort((a, b) => new Date(b.processedDate).getTime() - new Date(a.processedDate).getTime())))
            return
          }

          if (req.url === "/api/save-category" && req.method === "POST") {
            let body = ""
            req.on("data", (chunk) => {
              body += chunk.toString()
            })
            req.on("end", () => {
              const { transactionHash, category, tags = "" } = JSON.parse(body)
              const categoryCsvPath = path.resolve(__dirname, "../core/data/monthly-transactions-category.csv")
              
              let lines: string[] = []
              if (fs.existsSync(categoryCsvPath)) {
                lines = fs.readFileSync(categoryCsvPath, "utf-8").split(/\r?\n/).filter(l => l.trim())
              } else {
                lines = ["transaction-hash,category,tags,row-hash"]
              }

              const header = lines[0]
              const dataLines = lines.slice(1)
              
              // Helper to parse a simple CSV line with quotes
              const parseCsvLine = (line: string) => {
                const parts = []
                let current = ""
                let inQuotes = false
                for (let i = 0; i < line.length; i++) {
                  const char = line[i]
                  if (char === '"') {
                    inQuotes = !inQuotes
                  } else if (char === "," && !inQuotes) {
                    parts.push(current)
                    current = ""
                  } else {
                    current += char
                  }
                }
                parts.push(current)
                return parts
              }

              let finalCategory = category
              let finalTags = tags

              const otherLines = dataLines.filter(line => {
                const parts = parseCsvLine(line)
                if (parts[0] === transactionHash) {
                  // Partial update support: if request is missing a field, use existing one
                  if (category === undefined) finalCategory = parts[1]
                  if (tags === undefined) finalTags = parts[2]
                  return false
                }
                return true
              })
              
              const escapeCsvField = (field: string) => {
                const f = field || ""
                if (f.includes(",") || f.includes('"') || f.includes("\n")) {
                  return `"${f.replace(/"/g, '""')}"`
                }
                return f
              }

              const escapedTxHash = escapeCsvField(transactionHash)
              const escapedCategory = escapeCsvField(finalCategory)
              const escapedTags = escapeCsvField(finalTags)
              const rowContentForHash = `${transactionHash},${finalCategory || ""},${finalTags || ""}`
              const rowHash = getSha256(rowContentForHash)
              const newLine = `${escapedTxHash},${escapedCategory},${escapedTags},${rowHash}`
              
              const newContent = [header, ...otherLines, newLine].join("\n") + "\n"
              fs.writeFileSync(categoryCsvPath, newContent, "utf-8")
              
              res.statusCode = 200
              res.end(JSON.stringify({ success: true }))
            })
            return
          }

          if (req.url === "/api/backup-categories" && req.method === "POST") {
            const categoryCsvPath = path.resolve(dataDir, "monthly-transactions-category.csv")
            const backupDir = path.resolve(protectedDir, "monthly-transactions-category-bkp")

            if (!fs.existsSync(backupDir)) {
              fs.mkdirSync(backupDir, { recursive: true })
            }

            if (fs.existsSync(categoryCsvPath)) {
              const now = new Date()
              const pad = (n: number) => n.toString().padStart(2, "0")
              const timestamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}-${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`
              const backupPath = path.resolve(backupDir, `monthly-transactions-category-${timestamp}-bkp.csv`)
              fs.copyFileSync(categoryCsvPath, backupPath)
              
              res.statusCode = 200
              res.end(JSON.stringify({ success: true, fileName: path.basename(backupPath) }))
            } else {
              res.statusCode = 404
              res.end(JSON.stringify({ success: false, error: "Category file not found" }))
            }
            return
          }

          if (req.url === "/api/backup-info" && req.method === "GET") {
            const backupDir = path.resolve(protectedDir, "monthly-transactions-category-bkp")

            if (fs.existsSync(backupDir)) {
              const files = fs.readdirSync(backupDir).filter(f => f.endsWith("-bkp.csv"))
              const count = files.length
              let latestDate = null

              if (count > 0) {
                // monthly-transactions-category-2026-04-07-15-39-19-bkp.csv
                const dates = files.map(f => {
                  const match = f.match(/(\d{4}-\d{2}-\d{2}-\d{2}-\d{2}-\d{2})/)
                  if (match) {
                    const parts = match[1].split("-")
                    // YYYY-MM-DD HH:MM:SS
                    return new Date(`${parts[0]}-${parts[1]}-${parts[2]}T${parts[3]}:${parts[4]}:${parts[5]}`).getTime()
                  }
                  return 0
                })
                latestDate = new Date(Math.max(...dates)).toISOString()
              }

              res.statusCode = 200
              res.end(JSON.stringify({ count, latestDate }))
            } else {
              res.statusCode = 200
              res.end(JSON.stringify({ count: 0, latestDate: null }))
            }
            return
          }
          next()
        })
      }
    }
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
})

