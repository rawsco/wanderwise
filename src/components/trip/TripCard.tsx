import Link from "next/link";
import { Calendar, MapPin, Users, Dog } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

interface TripCardProps {
  tripId: string;
  name: string;
  description?: string;
  startDate?: string;
  endDate?: string;
  adults: number;
  dogs: number;
  stopCount?: number;
}

export function TripCard({ tripId, name, description, startDate, endDate, adults, dogs, stopCount = 0 }: TripCardProps) {
  return (
    <Link href={`/trips/${tripId}`}>
      <Card className="hover:shadow-md transition-shadow cursor-pointer h-full">
        <CardContent className="pt-6">
          <div className="flex items-start justify-between gap-2 mb-3">
            <h3 className="font-semibold text-gray-900 text-base leading-tight">{name}</h3>
          </div>
          {description && (
            <p className="text-sm text-gray-500 mb-4 line-clamp-2">{description}</p>
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
            <span className="flex items-center gap-1">
              <Users className="h-3.5 w-3.5" />
              {adults}
            </span>
            {dogs > 0 && (
              <span className="flex items-center gap-1">
                <Dog className="h-3.5 w-3.5" />
                {dogs}
              </span>
            )}
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
