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
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Cable as CableIcon, Scan, Camera } from "lucide-react";
import { OcrDialog } from "./OcrDialog";
import { normalizeCircuitId } from "@/lib/circuitIdUtils";
import { getNextCableName } from "@/lib/cableNaming";

export type CableFormSubmit = InsertCable & { spliceCircuitIds?: string[] };

// Matches how the cable is built on submit: "prefix,start-end" lines that
// don't parse are skipped and add no fibers.
function lineFiberCount(line: string): number {
  const parts = normalizeCircuitId(line.trim()).split(',');
  if (parts.length !== 2) return 0;
  const range = parts[1].split('-');
  if (range.length !== 2) return 0;
  const start = parseInt(range[0]);
  const end = parseInt(range[1]);
  if (isNaN(start) || isNaN(end) || end < start) return 0;
  return end - start + 1;
}

interface CableFormProps {
  cable?: Cable;
  onSubmit: (data: CableFormSubmit) => void;
  onCancel: () => void;
  isLoading?: boolean;
  mode?: "fiber" | "copper";
  existingCables?: Cable[];
  splicedFromCable?: Cable; // When set, this is a sub-splice from a distribution cable
  onTakePicture?: () => void;
  cameraOcrImage?: string;
  onCameraOcrImageUsed?: () => void;
}

export function CableForm({ cable, onSubmit, onCancel, isLoading, mode = "fiber", existingCables = [], splicedFromCable, onTakePicture, cameraOcrImage, onCameraOcrImageUsed }: CableFormProps) {
  const [ocrDialogOpen, setOcrDialogOpen] = useState(false);
  const [spliceFlags, setSpliceFlags] = useState<boolean[]>([]);
  const userEditedName = useRef(false);

  // When a camera OCR image arrives, open the OCR dialog with it
  useEffect(() => {
    if (cameraOcrImage) {
      setOcrDialogOpen(true);
    }
  }, [cameraOcrImage]);

  const hasFeedCable = existingCables.some(c => c.type === "Feed");
  // Sub-splices are always Distribution; otherwise use the standard default logic
  const defaultType = cable
    ? (cable.type as "Feed" | "Distribution")
    : (splicedFromCable ? "Distribution" : (hasFeedCable ? "Distribution" : "Feed"));
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
  const showSpliceColumn = !cable && watchedType === "Distribution";
  const watchedCircuitIds = form.watch("circuitIds") ?? [];
  const watchedFiberCount = Number(form.watch("fiberCount")) || 0;
  const enteredFibers = watchedCircuitIds.reduce((sum, line) => sum + lineFiberCount(line), 0);
  const fiberDelta = enteredFibers - watchedFiberCount;
  const unitLabel = mode === "fiber" ? "Strands" : "Pairs";

  useEffect(() => {
    if (!cable && !userEditedName.current) {
      form.setValue("name", getNextCableName(watchedType as "Feed" | "Distribution", existingCables));
    }
  }, [watchedType]);

  // Custom submit handler that normalizes circuit IDs
  const handleFormSubmit = (data: InsertCable) => {
    const spliceCircuitIds = showSpliceColumn
      ? (data.circuitIds ?? [])
          .filter((line, i) => spliceFlags[i] && line.trim())
          .map(line => normalizeCircuitId(line.trim()))
      : [];
    // Normalize circuit IDs if they exist
    if (data.circuitIds && data.circuitIds.length > 0) {
      data.circuitIds = data.circuitIds.map(id => normalizeCircuitId(id.trim()));
    }
    onSubmit({ ...data, spliceCircuitIds });
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(handleFormSubmit)} className="space-y-6">

        {splicedFromCable && watchedType === "Distribution" && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 text-sm text-blue-700 dark:text-blue-300">
            <CableIcon className="h-4 w-4 shrink-0" />
            <span>Splicing from: <strong>{splicedFromCable.name}</strong></span>
          </div>
        )}

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
              <div className="grid grid-cols-2 items-center gap-3">
                <FormControl>
                  <Input
                    type="number"
                    placeholder={mode === "fiber" ? "e.g., 24, 48, 72" : "e.g., 25, 50, 100"}
                    {...field}
                    onChange={(e) => field.onChange(parseInt(e.target.value) || 0)}
                    data-testid="input-fiber-count"
                  />
                </FormControl>
                {!cable && (
                  <span
                    className="justify-self-end text-right text-sm text-muted-foreground"
                    data-testid="text-new-cable-fiber-total"
                  >
                    {mode === "fiber" ? "Total Fiber Count" : "Total Pair Count"}: {enteredFibers}/{watchedFiberCount}
                  </span>
                )}
              </div>
              {!cable && (
                <div className="flex justify-center">
                  <span
                    className={fiberDelta === 0
                      ? "rounded-md border border-green-300 bg-green-100 px-4 py-1 text-sm font-bold text-green-700 dark:border-green-800 dark:bg-green-950/50 dark:text-green-300"
                      : "rounded-md border border-red-300 bg-red-100 px-4 py-1 text-sm font-bold text-red-700 dark:border-red-800 dark:bg-red-950/50 dark:text-red-300"}
                    data-testid="text-new-cable-fiber-delta"
                  >
                    {fiberDelta === 0
                      ? `All ${unitLabel} Accounted For`
                      : fiberDelta > 0
                        ? `${fiberDelta} ${unitLabel} Over`
                        : `${Math.abs(fiberDelta)} ${unitLabel} Under`}
                  </span>
                </div>
              )}
              <FormMessage />
            </FormItem>
          )}
        />

        {!cable && (
          <FormField
            control={form.control}
            name="circuitIds"
            render={({ field }) => {
              const lines = field.value ?? [];
              return (
              <FormItem>
                <div className="flex flex-nowrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    {showSpliceColumn && (
                      <span className="w-12 shrink-0 text-center text-sm font-medium">Splice</span>
                    )}
                    <FormLabel className="whitespace-nowrap">Circuit IDs (Optional)</FormLabel>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setOcrDialogOpen(true)}
                      title="Extract text from image (OCR)"
                      className="px-2"
                      data-testid="button-open-cable-ocr"
                    >
                      <Scan className="h-4 w-4 sm:mr-1" />
                      <span className="hidden sm:inline">Scan Image</span>
                    </Button>
                    {onTakePicture && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={onTakePicture}
                        title="Take a picture with your camera for OCR"
                        className="px-2"
                        data-testid="button-open-camera-ocr"
                      >
                        <Camera className="h-4 w-4 sm:mr-1" />
                        <span className="hidden sm:inline">Take Picture</span>
                      </Button>
                    )}
                  </div>
                </div>
                <div className="flex gap-2">
                  {showSpliceColumn && (
                    <div className="flex w-12 shrink-0 flex-col items-center rounded-md border border-input py-2">
                      {lines.map((line, i) => (
                        <div key={i} className="flex h-5 items-center">
                          {line.trim() && (
                            <Checkbox
                              checked={!!spliceFlags[i]}
                              onCheckedChange={(checked) => {
                                setSpliceFlags(prev => {
                                  const next = [...prev];
                                  next[i] = checked === true;
                                  return next;
                                });
                              }}
                              aria-label={`Splice ${line.trim()}`}
                              data-testid={`checkbox-new-splice-${i}`}
                            />
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                  <FormControl>
                    <Textarea
                      placeholder="Enter circuit IDs, one per line&#10;e.g.,&#10;b,1-2 or b 1 2&#10;n,15-16 or n 15 16&#10;lg,33-36 or lg 33 36"
                      value={lines.join('\n')}
                      onChange={(e) => {
                        field.onChange(e.target.value.split('\n'));
                      }}
                      data-testid="textarea-circuit-ids"
                      rows={Math.max(6, lines.length)}
                      wrap="off"
                      className="min-w-0 flex-1 font-mono text-sm leading-5 resize-none overflow-x-auto"
                    />
                  </FormControl>
                </div>
                <FormDescription className="text-xs">
                  Use spaces or standard format (prefix,start-end). {mode === "fiber" ? "Fiber" : "Pair"} positions will be auto-calculated.
                </FormDescription>
                <FormMessage />
              </FormItem>
              );
            }}
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
        onOpenChange={(isOpen) => {
          setOcrDialogOpen(isOpen);
          if (!isOpen) onCameraOcrImageUsed?.();
        }}
        initialImage={cameraOcrImage}
        onTextExtracted={(text) => {
          // Get current circuit IDs
          const currentValue = form.getValues('circuitIds') || [];
          const currentText = currentValue.join('\n');

          // Append extracted text
          const newText = currentText ? `${currentText}\n${text}` : text;
          const newLines = newText.split('\n').filter(line => line.trim());

          // Update form
          form.setValue('circuitIds', newLines);
          onCameraOcrImageUsed?.();
        }}
      />
    </Form>
  );
}
