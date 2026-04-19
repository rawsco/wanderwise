import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ProfileCardProps {
  profileId: string;
  name: string;
  type: "adult" | "child" | "dog" | "cat";
  age?: number;
  notes?: string;
  likes: string[];
  dislikes: string[];
}

const typeEmoji: Record<string, string> = { adult: "👤", child: "🧒", dog: "🐶", cat: "🐱" };

export function ProfileCard({ profileId, name, type, age, notes, likes, dislikes }: ProfileCardProps) {
  return (
    <Card>
      <CardContent className="pt-5">
        <div className="flex items-start justify-between gap-2 mb-3">
          <div className="flex items-center gap-2">
            <span className="text-2xl">{typeEmoji[type]}</span>
            <div>
              <p className="font-semibold text-gray-900">{name}</p>
              <p className="text-xs text-gray-500 capitalize">{type}{age !== undefined ? `, age ${age}` : ""}</p>
            </div>
          </div>
          <Link href={`/profiles/${profileId}`}>
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <Pencil className="h-3.5 w-3.5" />
            </Button>
          </Link>
        </div>

        {notes && <p className="text-xs text-gray-500 mb-3">{notes}</p>}

        {likes.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-1.5">
            {likes.map(tag => (
              <span key={tag} className="px-2 py-0.5 rounded-full text-xs bg-emerald-100 text-emerald-800">{tag}</span>
            ))}
          </div>
        )}
        {dislikes.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {dislikes.map(tag => (
              <span key={tag} className="px-2 py-0.5 rounded-full text-xs bg-red-100 text-red-800">{tag}</span>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
