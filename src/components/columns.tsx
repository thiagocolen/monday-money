"use client"

import type { ColumnDef } from "@tanstack/react-table"
import type { Transaction } from "@/lib/api"
import { format, parseISO } from "date-fns"
import { Checkbox } from "@/components/ui/checkbox"
import { Badge } from "@/components/ui/badge"
import { Tag } from "lucide-react"

export const columns: ColumnDef<Transaction>[] = [
  {
    id: "select",
    header: ({ table }) => (
      <Checkbox
        checked={
          table.getIsAllPageRowsSelected() ||
          (table.getIsSomePageRowsSelected() && "indeterminate")
        }
        onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
        aria-label="Select all"
      />
    ),
    cell: ({ row }) => (
      <Checkbox
        checked={row.getIsSelected()}
        onCheckedChange={(value) => row.toggleSelected(!!value)}
        aria-label="Select row"
        onClick={(e) => e.stopPropagation()}
      />
    ),
    enableSorting: false,
    enableHiding: false,
  },
  {
    accessorKey: "date",
    header: "Date",
    cell: ({ row }) => {
      const dateStr = row.getValue("date") as string
      try {
        const date = parseISO(dateStr)
        return <div className="font-mono text-xs">{format(date, "dd/MM/yyyy")}</div>
      } catch (e) {
        return <div className="font-mono text-xs">{dateStr}</div>
      }
    },
  },
  {
    accessorKey: "description",
    header: "Description",
    meta: {
      className: "w-full max-w-[1px]"
    },
    cell: ({ row }) => {
      return <div className="w-full text-left truncate" title={row.getValue("description")}>
        {row.getValue("description")}
      </div>
    }
  },
  {
    accessorKey: "amount",
    header: () => <div className="text-right w-full block">Amount</div>,
    cell: ({ row }) => {
      const amount = parseFloat(row.getValue("amount"))
      const formatted = new Intl.NumberFormat("pt-BR", {
        style: "currency",
        currency: "BRL",
      }).format(amount)

      return <div className={`text-right font-mono text-xs font-medium ${amount < 0 ? "text-destructive" : "text-emerald-600"}`}>
        {formatted}
      </div>
    },
  },
  {
    accessorKey: "category",
    header: "Category",
    cell: ({ row, table }) => {
      const category = row.getValue("category") as string
      const meta = table.options.meta as any
      const categoryMeta = meta?.categoriesMeta?.find((c: any) => c.name === category)
      const color = categoryMeta?.color || "#94a3b8" // Default slate-400

      return (
        <div 
          className="capitalize text-[10px] px-1.5 py-0.5 rounded-sm inline-block cursor-pointer hover:opacity-80 transition-opacity font-bold border"
          style={{ 
            backgroundColor: `${color}15`, 
            color: color,
            borderColor: `${color}30`
          }}
          onClick={(e) => {
            e.stopPropagation()
            meta?.onEditCategory?.(row.original)
          }}
        >
          {category || "Uncategorized"}
        </div>
      )
    }
  },
  {
    accessorKey: "tags",
    header: "Tags",
    cell: ({ row, table }) => {
      const tagsStr = row.getValue("tags") as string
      const meta = table.options.meta as any
      
      const handleClick = (e: React.MouseEvent) => {
        e.stopPropagation()
        meta?.onEditTags?.(row.original)
      }

      if (!tagsStr) {
        return (
          <div 
            className="w-full h-6 cursor-pointer hover:bg-indigo-50/30 rounded transition-colors group flex items-center px-1" 
            onClick={handleClick}
          >
            <Tag className="h-3 w-3 text-muted-foreground/0 group-hover:text-indigo-400 transition-colors" />
          </div>
        )
      }
      
      const tags = tagsStr.split(",").map(t => t.trim()).filter(Boolean)
      
      return (
        <div 
          className="flex flex-wrap gap-1 max-w-[150px] cursor-pointer hover:bg-muted/50 rounded-sm transition-colors"
          onClick={handleClick}
        >
          {tags.map((tag, i) => {
            const tagMeta = meta?.tagsMeta?.find((t: any) => t.name === tag)
            const color = tagMeta?.color || "#6366f1" // Default indigo-500
            return (
              <Badge 
                key={i} 
                variant="secondary" 
                className="text-[9px] px-1.5 py-0 h-4 border transition-colors font-bold uppercase"
                style={{ 
                  backgroundColor: `${color}15`, 
                  color: color,
                  borderColor: `${color}30`
                }}
              >
                {tag}
              </Badge>
            )
          })}
        </div>
      )
    }
  },
  {
    accessorKey: "owner",
    header: "Owner",
    cell: ({ row }) => {
      const owner = row.getValue("owner") as string
      return <div className="text-[10px] text-muted-foreground">{owner || "No owner"}</div>
    }
  }
]
