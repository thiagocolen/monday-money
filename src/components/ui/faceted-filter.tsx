import * as React from "react"
import { Check, PlusCircle, XCircle } from "lucide-react"
import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Separator } from "@/components/ui/separator"

interface DataTableFacetedFilterProps {
  title?: string
  options: {
    label: string
    value: string
    icon?: React.ComponentType<{ className?: string }>
  }[]
  selectedValues: Record<string, 'include' | 'exclude'>
  onSelect: (values: Record<string, 'include' | 'exclude'>) => void
}

export function DataTableFacetedFilter({
  title,
  options,
  selectedValues,
  onSelect,
}: DataTableFacetedFilterProps) {
  const activeCount = Object.keys(selectedValues).length

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="h-8 border-dashed text-xs">
          <PlusCircle className="mr-2 h-4 w-4" />
          {title}
          {activeCount > 0 && (
            <>
              <Separator orientation="vertical" className="mx-2 h-4" />
              <Badge
                variant="secondary"
                className="rounded-sm px-1 font-normal lg:hidden"
              >
                {activeCount}
              </Badge>
              <div className="hidden space-x-1 lg:flex">
                {activeCount > 2 ? (
                  <Badge
                    variant="secondary"
                    className="rounded-sm px-1 font-normal"
                  >
                    {activeCount} selected
                  </Badge>
                ) : (
                  options
                    .filter((option) => selectedValues[option.value])
                    .map((option) => (
                      <Badge
                        variant="secondary"
                        key={option.value}
                        className={cn(
                          "rounded-sm px-1 font-normal",
                          selectedValues[option.value] === 'exclude' && "bg-destructive/10 text-destructive border-destructive/20"
                        )}
                      >
                        {selectedValues[option.value] === 'exclude' && <XCircle className="mr-1 h-3 w-3 inline" />}
                        {option.label}
                      </Badge>
                    ))
                )}
              </div>
            </>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[200px] p-0" align="start">
        <Command>
          <CommandInput placeholder={title} />
          <CommandList>
            <CommandEmpty>No results found.</CommandEmpty>
            <CommandGroup>
              {options.map((option) => {
                const state = selectedValues[option.value]
                return (
                  <CommandItem
                    key={option.value}
                    onSelect={() => {
                      const newValues = { ...selectedValues }
                      if (!state) {
                        newValues[option.value] = 'include'
                      } else if (state === 'include') {
                        newValues[option.value] = 'exclude'
                      } else {
                        delete newValues[option.value]
                      }
                      onSelect(newValues)
                    }}
                    className="flex items-center gap-2"
                  >
                    <div
                      className={cn(
                        "mr-2 flex h-4 w-4 items-center justify-center rounded-sm border",
                        state === 'include' && "bg-primary text-primary-foreground border-primary",
                        state === 'exclude' && "bg-destructive text-destructive-foreground border-destructive",
                        !state && "opacity-50 border-input"
                      )}
                    >
                      {state === 'include' && <Check className="h-3 w-3" />}
                      {state === 'exclude' && <XCircle className="h-3 w-3" />}
                    </div>
                    {option.icon && (
                      <option.icon className="mr-2 h-4 w-4 text-muted-foreground" />
                    )}
                    <span className={cn(state === 'exclude' && "text-muted-foreground line-through")}>
                      {option.label}
                    </span>
                    {state === 'include' && <Badge variant="secondary" className="ml-auto text-[8px] h-3.5 px-1 py-0">Inc</Badge>}
                    {state === 'exclude' && <Badge variant="destructive" className="ml-auto text-[8px] h-3.5 px-1 py-0 bg-destructive/20 text-destructive hover:bg-destructive/20 border-none">Exc</Badge>}
                  </CommandItem>
                )
              })}
            </CommandGroup>
            {activeCount > 0 && (
              <>
                <CommandSeparator />
                <CommandGroup>
                  <CommandItem
                    onSelect={() => onSelect({})}
                    className="justify-center text-center"
                  >
                    Clear filters
                  </CommandItem>
                </CommandGroup>
              </>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
