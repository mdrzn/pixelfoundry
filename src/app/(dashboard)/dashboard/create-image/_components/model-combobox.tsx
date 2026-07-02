"use client";

import { useState } from "react";
import { Check, ChevronsUpDown, Search } from "lucide-react";
import { Provider } from "@prisma/client";

import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type ModelOption = {
  value: string;
  label: string;
  description?: string | null;
  creditCost: number;
  providerLabel: string;
  provider: Provider;
  metadata: unknown;
};

type ModelComboboxProps = {
  models: ModelOption[];
  value: string;
  onValueChange: (value: string) => void;
  disabled?: boolean;
};

const providerColors: Record<Provider, string> = {
  [Provider.REPLICATE]: "bg-blue-100 text-blue-700 border-blue-200",
  [Provider.OPENAI]: "bg-green-100 text-green-700 border-green-200",
  [Provider.GEMINI]: "bg-purple-100 text-purple-700 border-purple-200",
  [Provider.FAL]: "bg-orange-100 text-orange-700 border-orange-200",
};

export function ModelCombobox({
  models,
  value,
  onValueChange,
  disabled = false,
}: ModelComboboxProps) {
  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const selectedModel = models.find((model) => model.value === value);

  const filteredModels = models.filter((model) => {
    const searchLower = searchQuery.toLowerCase();
    return (
      model.label.toLowerCase().includes(searchLower) ||
      model.providerLabel.toLowerCase().includes(searchLower) ||
      model.description?.toLowerCase().includes(searchLower)
    );
  });

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className="w-full justify-between"
        >
          {selectedModel ? (
            <div className="flex items-center gap-2 truncate">
              <span className="truncate">{selectedModel.label}</span>
              <Badge
                variant="outline"
                className={cn("text-xs", providerColors[selectedModel.provider])}
              >
                {selectedModel.providerLabel}
              </Badge>
              <Badge variant="secondary" className="ml-auto text-xs">
                {selectedModel.creditCost} credits
              </Badge>
            </div>
          ) : (
            <span className="text-muted-foreground">Select model...</span>
          )}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[600px] p-0" align="start">
        <Command shouldFilter={false}>
          <div className="flex items-center border-b px-3">
            <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
            <input
              placeholder="Search models..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="flex h-10 w-full rounded-md bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50"
            />
          </div>
          <CommandList>
            <CommandEmpty>No models found.</CommandEmpty>
            <CommandGroup>
              {filteredModels.map((model) => (
                <CommandItem
                  key={model.value}
                  value={model.value}
                  onSelect={() => {
                    onValueChange(model.value);
                    setOpen(false);
                    setSearchQuery("");
                  }}
                  className="flex flex-col items-start gap-2 px-4 py-3 aria-selected:bg-accent"
                >
                  <div className="flex w-full items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Check
                        className={cn(
                          "h-4 w-4",
                          value === model.value ? "opacity-100" : "opacity-0"
                        )}
                      />
                      <span className="font-medium">{model.label}</span>
                      <Badge
                        variant="outline"
                        className={cn("text-xs", providerColors[model.provider])}
                      >
                        {model.providerLabel}
                      </Badge>
                    </div>
                    <Badge variant="secondary" className="text-xs">
                      {model.creditCost} credits
                    </Badge>
                  </div>
                  {model.description ? (
                    <p className="text-xs text-muted-foreground line-clamp-2 pl-6">
                      {model.description}
                    </p>
                  ) : null}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
