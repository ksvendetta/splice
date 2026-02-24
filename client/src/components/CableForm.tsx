import { useState, useRef, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertCableSchema, type InsertCable, type Cable, cableTypes } from "@shared/schema";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Scan } from "lucide-react";
import { OcrDialog } from "./OcrDialog";
import { normalizeCircuitId } from "@/lib/circuitIdUtils";

interface CableFormProps {
  cable?: Cable;
  onSubmit: (data: InsertCable) => void;
  onCancel: () => void;
  isLoading?: boolean;
  mode?: "fiber" | "copper";
  existingCables?: Cable[];
}

function getNextCableName(type: "Feed" | "Distribution", existingCables: Cable[]): string {
  const prefix = type === "Feed" ? "f" : "d";
  const count = existingCables.filter(c => c.type === type).length;
  return `${prefix}${count + 1}`;
}

export function CableForm({ cable, onSubmit, onCancel, isLoading, mode = "fiber", existingCables = [] }: CableFormProps) {
  const [ocrDialogOpen, setOcrDialogOpen] = useState(false);
  const userEditedName = useRef(false);

  const hasFeedCable = existingCables.some(c => c.type === "Feed");
  const defaultType = cable
    ? (cable.type as "Feed" | "Distribution")
    : (hasFeedCable ? "Distribution" : "Feed");
  const defaultName = cable ? cable.name : getNextCableName(defaultType, existingCables);

  const form = useForm<InsertCable>({
    resolver: zodResolver(insertCableSchema),
    defaultValues: cable ? {
      name: cable.name,
      fiberCount: cable.fiberCount,
      type: cable.type as "Feed" | "Distribution",
    } : {
      name: defaultName,
      fiberCount: mode === "fiber" ? 24 : 50,
      type: defaultType,
      circuitIds: [],
    },
  });

  const watchedType = form.watch("type");

  useEffect(() => {
    if (!cable && !userEditedName.current) {
      form.setValue("name", getNextCableName(watchedType as "Feed" | "Distribution", existingCables));
    }
  }, [watchedType]);

  // Custom submit handler that normalizes circuit IDs
  const handleFormSubmit = (data: InsertCable) => {
    // Normalize circuit IDs if they exist
    if (data.circuitIds && data.circuitIds.length > 0) {
      data.circuitIds = data.circuitIds.map(id => normalizeCircuitId(id.trim()));
    }
    onSubmit(data);
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(handleFormSubmit)} className="space-y-6">
        <FormField
          control={form.control}
          name="type"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Cable Type</FormLabel>
              <Select onValueChange={field.onChange} defaultValue={field.value}>
                <FormControl>
                  <SelectTrigger data-testid="select-cable-type">
                    <SelectValue placeholder="Select cable type" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {cableTypes.map((type) => (
                    <SelectItem key={type} value={type} data-testid={`option-cable-type-${type}`}>
                      {type}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Cable Name</FormLabel>
              <FormControl>
                <Input
                  placeholder="e.g., f1, d2"
                  {...field}
                  onChange={(e) => {
                    userEditedName.current = true;
                    field.onChange(e);
                  }}
                  data-testid="input-cable-name"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="fiberCount"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{mode === "fiber" ? "Fiber Count" : "Pair Count"}</FormLabel>
              <FormControl>
                <Input
                  type="number"
                  placeholder={mode === "fiber" ? "e.g., 24, 48, 72" : "e.g., 25, 50, 100"}
                  {...field}
                  onChange={(e) => field.onChange(parseInt(e.target.value) || 0)}
                  data-testid="input-fiber-count"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {!cable && (
          <FormField
            control={form.control}
            name="circuitIds"
            render={({ field }) => (
              <FormItem>
                <div className="flex items-center justify-between">
                  <FormLabel>Circuit IDs (Optional)</FormLabel>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setOcrDialogOpen(true)}
                    title="Extract text from image (OCR)"
                    data-testid="button-open-cable-ocr"
                  >
                    <Scan className="h-4 w-4 mr-2" />
                    Scan Image
                  </Button>
                </div>
                <FormControl>
                  <Textarea
                    placeholder="Enter circuit IDs, one per line&#10;e.g.,&#10;b,1-2 or b 1 2&#10;n,15-16 or n 15 16&#10;lg,33-36 or lg 33 36"
                    value={field.value?.join('\n') || ''}
                    onChange={(e) => {
                      const lines = e.target.value.split('\n');
                      field.onChange(lines);
                    }}
                    data-testid="textarea-circuit-ids"
                    rows={6}
                    className="font-mono text-sm resize-none"
                  />
                </FormControl>
                <FormDescription className="text-xs">
                  Use spaces or standard format (prefix,start-end). {mode === "fiber" ? "Fiber" : "Pair"} positions will be auto-calculated.
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        )}

        <div className="flex gap-2 justify-end pt-4">
          <Button
            type="button"
            variant="outline"
            onClick={onCancel}
            disabled={isLoading}
            data-testid="button-cancel-cable"
          >
            Cancel
          </Button>
          <Button type="submit" disabled={isLoading} data-testid="button-save-cable">
            {isLoading ? "Saving..." : cable ? "Update Cable" : "Create Cable"}
          </Button>
        </div>
      </form>

      <OcrDialog
        open={ocrDialogOpen}
        onOpenChange={setOcrDialogOpen}
        onTextExtracted={(text) => {
          // Get current circuit IDs
          const currentValue = form.getValues('circuitIds') || [];
          const currentText = currentValue.join('\n');

          // Append extracted text
          const newText = currentText ? `${currentText}\n${text}` : text;
          const newLines = newText.split('\n').filter(line => line.trim());

          // Update form
          form.setValue('circuitIds', newLines);
        }}
      />
    </Form>
  );
}
