import type { MeasurementStatus } from "@/lib/db/generated/enums";
import { STATUS_LABELS, STATUS_TONES, type StatusTone } from "@/lib/services/status-machine";
import { cn } from "@/lib/utils";

const TONE_CLASSES: Record<StatusTone, string> = {
  gray: "bg-status-gray-bg text-status-gray border-status-gray/30",
  amber: "bg-status-amber-bg text-status-amber border-status-amber/30",
  blue: "bg-status-blue-bg text-status-blue border-status-blue/30",
  green: "bg-status-green-bg text-status-green border-status-green/30",
  red: "bg-status-red-bg text-status-red border-status-red/30",
};

export function StatusBadge({
  status,
  className,
}: {
  status: MeasurementStatus;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center whitespace-nowrap rounded-sm border px-1.5 py-0.5 text-xs font-medium",
        TONE_CLASSES[STATUS_TONES[status]],
        className,
      )}
    >
      {STATUS_LABELS[status]}
    </span>
  );
}
