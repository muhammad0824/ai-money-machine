import { useState, useMemo } from "react";
import {
  GraphNode,
  useCreateManualCompany,
  useCreateManualDeal,
  getGetGraphQueryKey,
  getGetGraphSummaryQueryKey,
  getGetGraphTimelineQueryKey,
  getListManualCompaniesQueryKey,
  getListManualDealsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Plus, Check, ChevronsUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const SECTORS = [
  { value: "tech", label: "Big Tech" },
  { value: "ai_lab", label: "AI Lab" },
  { value: "infrastructure", label: "Infrastructure / GPU" },
  { value: "media", label: "Media / Rights" },
  { value: "publisher", label: "Publisher" },
  { value: "studio", label: "Studio" },
  { value: "investor", label: "Investor" },
] as const;

const DEAL_TYPES = [
  { value: "investment", label: "Investment" },
  { value: "acquisition", label: "Acquisition" },
  { value: "licensing", label: "Licensing" },
  { value: "partnership", label: "Partnership" },
  { value: "infrastructure", label: "Infrastructure" },
  { value: "lawsuit", label: "Lawsuit" },
  { value: "venture_capital", label: "Venture Capital" },
] as const;

type Sector = (typeof SECTORS)[number]["value"];
type DealType = (typeof DEAL_TYPES)[number]["value"];

interface Props {
  nodes: GraphNode[];
}

export default function AddEntryDialog({ nodes }: Props) {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: getGetGraphQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetGraphSummaryQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetGraphTimelineQueryKey() });
    queryClient.invalidateQueries({ queryKey: getListManualCompaniesQueryKey() });
    queryClient.invalidateQueries({ queryKey: getListManualDealsQueryKey() });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="font-mono text-xs bg-background/50 backdrop-blur-md border-border/50 hover:bg-accent/50 h-8"
        >
          <Plus className="h-3 w-3 mr-1.5" />
          Add Entry
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg bg-background/95 backdrop-blur-xl border-border/60">
        <DialogHeader>
          <DialogTitle className="font-mono uppercase tracking-wider text-base">
            Add Entry
          </DialogTitle>
          <DialogDescription className="text-xs">
            Add a custom company or deal. Manual entries persist and merge into the live graph.
          </DialogDescription>
        </DialogHeader>
        <Tabs defaultValue="company" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="company">Company</TabsTrigger>
            <TabsTrigger value="deal">Deal</TabsTrigger>
          </TabsList>
          <TabsContent value="company" className="mt-4">
            <CompanyForm
              onSuccess={() => {
                invalidate();
                toast.success("Company added.");
                setOpen(false);
              }}
            />
          </TabsContent>
          <TabsContent value="deal" className="mt-4">
            <DealForm
              nodes={nodes}
              onSuccess={() => {
                invalidate();
                toast.success("Deal added.");
                setOpen(false);
              }}
            />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

function CompanyForm({ onSuccess }: { onSuccess: () => void }) {
  const [name, setName] = useState("");
  const [sector, setSector] = useState<Sector>("tech");
  const [marketValueLabel, setMarketValueLabel] = useState("");
  const [marketValueUsd, setMarketValueUsd] = useState("");
  const [description, setDescription] = useState("");
  const [country, setCountry] = useState("");

  const mutation = useCreateManualCompany();

  const submit = () => {
    if (!name.trim() || !marketValueLabel.trim()) {
      toast.error("Name and market value label are required.");
      return;
    }
    const usdNum = marketValueUsd ? Number(marketValueUsd) : null;
    mutation.mutate(
      {
        data: {
          name: name.trim(),
          sector,
          description: description.trim() || undefined,
          marketValueLabel: marketValueLabel.trim(),
          marketValueUsd: Number.isFinite(usdNum as number) ? (usdNum as number) : null,
          country: country.trim() || null,
        },
      },
      {
        onSuccess,
        onError: (err: unknown) => {
          const message = err instanceof Error ? err.message : "Failed to add company.";
          toast.error(message);
        },
      },
    );
  };

  return (
    <div className="flex flex-col gap-3">
      <Field label="Name *">
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Acme AI" />
      </Field>
      <Field label="Sector">
        <Select value={sector} onValueChange={(v) => setSector(v as Sector)}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SECTORS.map((s) => (
              <SelectItem key={s.value} value={s.value}>
                {s.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Market value label *">
          <Input
            value={marketValueLabel}
            onChange={(e) => setMarketValueLabel(e.target.value)}
            placeholder="$5B"
          />
        </Field>
        <Field label="Market value (USD, optional)">
          <Input
            type="number"
            value={marketValueUsd}
            onChange={(e) => setMarketValueUsd(e.target.value)}
            placeholder="5000000000"
          />
        </Field>
      </div>
      <Field label="Country (optional)">
        <Input value={country} onChange={(e) => setCountry(e.target.value)} placeholder="US" />
      </Field>
      <Field label="Description (optional)">
        <Textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="One-line description"
          rows={2}
        />
      </Field>
      <Button onClick={submit} disabled={mutation.isPending} className="mt-2">
        {mutation.isPending ? "Saving..." : "Add Company"}
      </Button>
    </div>
  );
}

function DealForm({
  nodes,
  onSuccess,
}: {
  nodes: GraphNode[];
  onSuccess: () => void;
}) {
  const [sourceId, setSourceId] = useState("");
  const [targetId, setTargetId] = useState("");
  const [dealType, setDealType] = useState<DealType>("investment");
  const [amountLabel, setAmountLabel] = useState("");
  const [amountUsd, setAmountUsd] = useState("");
  const [announcedAt, setAnnouncedAt] = useState(
    new Date().toISOString().slice(0, 10),
  );
  const [headline, setHeadline] = useState("");
  const [description, setDescription] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");

  const mutation = useCreateManualDeal();

  const submit = () => {
    if (!sourceId || !targetId || !amountLabel.trim() || !headline.trim()) {
      toast.error("Source, target, amount label and headline are required.");
      return;
    }
    if (sourceId === targetId) {
      toast.error("Source and target must be different.");
      return;
    }
    const usdNum = amountUsd ? Number(amountUsd) : null;
    mutation.mutate(
      {
        data: {
          sourceId,
          targetId,
          dealType,
          amountLabel: amountLabel.trim(),
          amountUsd: Number.isFinite(usdNum as number) ? (usdNum as number) : null,
          announcedAt,
          headline: headline.trim(),
          description: description.trim() || undefined,
          sourceUrl: sourceUrl.trim() || null,
        },
      },
      {
        onSuccess,
        onError: (err: unknown) => {
          const message = err instanceof Error ? err.message : "Failed to add deal.";
          toast.error(message);
        },
      },
    );
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Source *">
          <NodeCombobox
            nodes={nodes}
            value={sourceId}
            onChange={setSourceId}
            placeholder="From..."
          />
        </Field>
        <Field label="Target *">
          <NodeCombobox
            nodes={nodes}
            value={targetId}
            onChange={setTargetId}
            placeholder="To..."
          />
        </Field>
      </div>
      <Field label="Deal type">
        <Select value={dealType} onValueChange={(v) => setDealType(v as DealType)}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {DEAL_TYPES.map((d) => (
              <SelectItem key={d.value} value={d.value}>
                {d.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Amount label *">
          <Input
            value={amountLabel}
            onChange={(e) => setAmountLabel(e.target.value)}
            placeholder="$2B"
          />
        </Field>
        <Field label="Amount (USD, optional)">
          <Input
            type="number"
            value={amountUsd}
            onChange={(e) => setAmountUsd(e.target.value)}
            placeholder="2000000000"
          />
        </Field>
      </div>
      <Field label="Announced at">
        <Input
          type="date"
          value={announcedAt}
          onChange={(e) => setAnnouncedAt(e.target.value)}
        />
      </Field>
      <Field label="Headline *">
        <Input
          value={headline}
          onChange={(e) => setHeadline(e.target.value)}
          placeholder="X invests $2B in Y"
        />
      </Field>
      <Field label="Description (optional)">
        <Textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Short summary"
          rows={2}
        />
      </Field>
      <Field label="Source URL (optional)">
        <Input
          value={sourceUrl}
          onChange={(e) => setSourceUrl(e.target.value)}
          placeholder="https://..."
        />
      </Field>
      <Button onClick={submit} disabled={mutation.isPending} className="mt-2">
        {mutation.isPending ? "Saving..." : "Add Deal"}
      </Button>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <Label className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
        {label}
      </Label>
      {children}
    </div>
  );
}

function NodeCombobox({
  nodes,
  value,
  onChange,
  placeholder,
}: {
  nodes: GraphNode[];
  value: string;
  onChange: (id: string) => void;
  placeholder: string;
}) {
  const [open, setOpen] = useState(false);
  const sorted = useMemo(
    () =>
      [...nodes].sort(
        (a, b) => (b.marketValueUsd ?? 0) - (a.marketValueUsd ?? 0),
      ),
    [nodes],
  );
  const selected = nodes.find((n) => n.id === value);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between font-normal text-xs h-9"
        >
          <span className={cn("truncate", !selected && "text-muted-foreground")}>
            {selected ? selected.name : placeholder}
          </span>
          <ChevronsUpDown className="ml-2 h-3 w-3 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[300px] p-0" align="start">
        <Command>
          <CommandInput placeholder="Search company..." className="text-xs" />
          <CommandList>
            <CommandEmpty>No company found.</CommandEmpty>
            <CommandGroup>
              {sorted.map((node) => (
                <CommandItem
                  key={node.id}
                  value={`${node.name} ${node.sector}`}
                  onSelect={() => {
                    onChange(node.id);
                    setOpen(false);
                  }}
                  className="cursor-pointer"
                >
                  <Check
                    className={cn(
                      "mr-2 h-3 w-3",
                      value === node.id ? "opacity-100" : "opacity-0",
                    )}
                  />
                  <div className="flex flex-col">
                    <span className="text-sm">{node.name}</span>
                    <span className="text-[9px] text-muted-foreground font-mono uppercase">
                      {node.sector.replace("_", " ")}
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
