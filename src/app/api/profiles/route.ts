import { NextResponse } from "next/server";
import { z } from "zod";
import { randomUUID } from "crypto";
import { requireAuth } from "@/lib/auth-helpers";
import { ProfileEntity } from "@/lib/db/profile.entity";

const createSchema = z.object({
  name: z.string().min(1),
  type: z.enum(["adult", "child", "dog", "cat"]),
  age: z.number().int().min(0).optional(),
  notes: z.string().optional(),
  likes: z.array(z.string()).default([]),
  dislikes: z.array(z.string()).default([]),
});

export async function GET() {
  try {
    const user = await requireAuth();
    const result = await ProfileEntity.query.byUser({ userId: user.id }).go();
    return NextResponse.json(result.data);
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireAuth();
    const data = createSchema.parse(await req.json());
    const profileId = randomUUID();
    await ProfileEntity.put({ profileId, userId: user.id, ...data }).go();
    return NextResponse.json({ profileId, userId: user.id, ...data }, { status: 201 });
  } catch (err) {
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.issues }, { status: 400 });
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
