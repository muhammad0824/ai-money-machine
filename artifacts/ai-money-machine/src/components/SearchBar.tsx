import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { GraphNode } from "@workspace/api-client-react";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface Props {
  nodes: GraphNode[];
  onSelect: (node: GraphNode) => void;
}

export default function SearchBar({ nodes, onSelect }: Props) {
  const [open, setOpen] = useState(false);

  const sortedNodes = useMemo(() => {
    return [...nodes].sort((a, b) => {
      const aVal = a.marketValueUsd ?? 0;
      const bVal = b.marketValueUsd ?? 0;
      return bVal - aVal;
    });
  }, [nodes]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          role="combobox"
          aria-expanded={open}
          className="w-64 justify-between font-mono text-xs bg-background/70 backdrop-blur-md border-border/50 hover:bg-accent/50 h-8"
        >
          <span className="flex items-center gap-2 text-muted-foreground">
            <Search className="h-3 w-3" />
            Search companies...
          </span>
          <kbd className="hidden sm:inline-flex pointer-events-none h-4 select-none items-center gap-1 rounded border bg-muted px-1 font-mono text-[9px] font-medium text-muted-foreground">
            ⌘K
          </kbd>
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-[320px] p-0 bg-background/95 backdrop-blur-xl border-border/60"
      >
        <Command shouldFilter={true}>
          <CommandInput placeholder="Search by name or sector..." className="text-xs" />
          <CommandList>
            <CommandEmpty>No companies found.</CommandEmpty>
            <CommandGroup>
              {sortedNodes.map((node) => (
                <CommandItem
                  key={node.id}
                  value={`${node.name} ${node.sector}`}
                  onSelect={() => {
                    onSelect(node);
                    setOpen(false);
                  }}
                  className="flex items-center justify-between gap-2 cursor-pointer"
                >
                  <div className="flex flex-col min-w-0">
                    <span className="text-sm font-medium truncate">{node.name}</span>
                    <span className="text-[10px] text-muted-foreground font-mono uppercase tracking-wider">
                      {node.sector.replace("_", " ")}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {node.isManual && (
                      <Badge
                        variant="outline"
                        className="text-[8px] h-4 px-1 border-amber-500/40 text-amber-400 uppercase"
                      >
                        Manual
                      </Badge>
                    )}
                    <span className="text-[10px] font-mono text-muted-foreground">
                      {node.marketValueLabel}
                    </span>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
