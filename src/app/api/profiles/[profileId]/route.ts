import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/lib/auth-helpers";
import { ProfileEntity } from "@/lib/db/profile.entity";

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  type: z.enum(["adult", "child", "dog", "cat"]).optional(),
  yearOfBirth: z.number().int().min(1900).max(new Date().getFullYear()).optional(),
  notes: z.string().optional(),
  likes: z.array(z.string()).optional(),
  dislikes: z.array(z.string()).optional(),
});

export async function PATCH(req: Request, { params }: { params: Promise<{ profileId: string }> }) {
  try {
    const user = await requireAuth();
    const { profileId } = await params;
    const data = updateSchema.parse(await req.json());
    await ProfileEntity.update({ userId: user.id, profileId }).set(data).go();
    return NextResponse.json({ profileId, ...data });
  } catch (err) {
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.issues }, { status: 400 });
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ profileId: string }> }) {
  try {
    const user = await requireAuth();
    const { profileId } = await params;
    await ProfileEntity.delete({ userId: user.id, profileId }).go();
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
