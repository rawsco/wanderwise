import Link from "next/link";
import { Calendar, MapPin, CheckCircle2, Clock } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

const typeEmoji: Record<string, string> = { adult: "👤", child: "🧒", dog: "🐶", cat: "🐱" };

const statusConfig: Record<string, { icon: (complete: boolean) => React.ReactNode; label: string }> = {
  "bookings-complete": {
    icon: (_complete) => <CheckCircle2 className="h-4 w-4 text-emerald-500" />,
    label: "All bookings confirmed",
  },
  "plan-incomplete": {
    icon: () => <Clock className="h-4 w-4 text-amber-400" />,
    label: "Planning in progress",
  },
};

const segmentColorHex: Record<string, string> = {
  confirmed: "#10b981",
  pending:   "#3b82f6",
  enquiry:   "#9ca3af",
  overlap:   "#ef4444",
  gap:       "#e5e7eb",
};

interface Member { name: string; type: string; }
interface Segment { status: string; length: number; }

interface TripCardProps {
  tripId: string;
  name: string;
  description?: string;
  startDate?: string;
  endDate?: string;
  members?: Member[];
  stopCount?: number;
  statuses?: string[];
  segments?: Segment[];
}

export function TripCard({ tripId, name, description, startDate, endDate, members = [], stopCount = 0, statuses = [], segments = [] }: TripCardProps) {
  return (
    <Link href={`/trips/${tripId}`}>
      <Card className="hover:shadow-md transition-colors cursor-pointer h-full overflow-hidden flex flex-col">
        <CardContent className="pt-6 flex-1">
          <div className="flex items-start justify-between gap-2 mb-3">
            <h3 className="font-semibold text-base leading-tight text-gray-900">{name}</h3>
            {statuses.length > 0 && (
              <div className="flex items-center gap-1.5 shrink-0">
                {statuses.map(s => statusConfig[s] && (
                  <span key={s} title={statusConfig[s].label}>
                    {statusConfig[s].icon(false)}
                  </span>
                ))}
              </div>
            )}
          </div>
          {description && (
            <p className="text-sm mb-4 line-clamp-2 text-gray-500">{description}</p>
          )}
          <div className="flex flex-wrap gap-3 text-xs text-gray-500">
            {(startDate || endDate) && (
              <span className="flex items-center gap-1">
                <Calendar className="h-3.5 w-3.5" />
                {startDate ? new Date(startDate).toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : "TBD"}
                {" – "}
                {endDate ? new Date(endDate).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "TBD"}
              </span>
            )}
            <span className="flex items-center gap-1">
              <MapPin className="h-3.5 w-3.5" />
              {stopCount} {stopCount === 1 ? "stop" : "stops"}
            </span>
            {members.length > 0 && (
              <span className="flex items-center gap-1">
                {members.map(m => typeEmoji[m.type] ?? "👤").join(" ")}
              </span>
            )}
          </div>
        </CardContent>

        {segments.length > 0 && (
          <div className="flex h-1.5 mt-auto">
            {segments.map((seg, i) => (
              <div
                key={i}
                style={{ flex: seg.length, backgroundColor: segmentColorHex[seg.status] ?? "#e5e7eb" }}
              />
            ))}
          </div>
        )}
      </Card>
    </Link>
  );
}
