import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertCableSchema, type InsertCable, type Cable } from "@shared/schema";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface CableFormProps {
  cable?: Cable;
  onSubmit: (data: InsertCable) => void;
  onCancel: () => void;
  isLoading?: boolean;
}

const cableTypes = ["Feed", "Cable", "Distribution"];
const fiberCounts = [12, 24, 48, 72, 96, 144, 288];
const ribbonSizes = [12];

export function CableForm({ cable, onSubmit, onCancel, isLoading }: CableFormProps) {
  const form = useForm<InsertCable>({
    resolver: zodResolver(insertCableSchema),
    defaultValues: cable || {
      name: "",
      fiberCount: 48,
      ribbonSize: 12,
      type: "Cable",
    },
  });

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Cable Name</FormLabel>
              <FormControl>
                <Input
                  placeholder="e.g., Cable2, Feed1, Distribution-24"
                  {...field}
                  data-testid="input-cable-name"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

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
          name="fiberCount"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Fiber Count</FormLabel>
              <Select
                onValueChange={(value) => field.onChange(parseInt(value))}
                defaultValue={field.value.toString()}
              >
                <FormControl>
                  <SelectTrigger data-testid="select-fiber-count">
                    <SelectValue placeholder="Select fiber count" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {fiberCounts.map((count) => (
                    <SelectItem key={count} value={count.toString()} data-testid={`option-fiber-count-${count}`}>
                      {count}
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
          name="ribbonSize"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Ribbon Size</FormLabel>
              <Select
                onValueChange={(value) => field.onChange(parseInt(value))}
                defaultValue={field.value?.toString() || "12"}
              >
                <FormControl>
                  <SelectTrigger data-testid="select-ribbon-size">
                    <SelectValue placeholder="Select ribbon size" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {ribbonSizes.map((size) => (
                    <SelectItem key={size} value={size.toString()} data-testid={`option-ribbon-size-${size}`}>
                      {size}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />

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
    </Form>
  );
}
