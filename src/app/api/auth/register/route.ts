import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { randomUUID } from "crypto";
import { UserEntity } from "@/lib/db/user.entity";
import { bootstrapTable } from "@/lib/db/bootstrap";

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().min(1).optional(),
});

export async function POST(req: Request) {
  try {
    await bootstrapTable();
    const body = await req.json();
    const { email, password, name } = schema.parse(body);

    const existing = await UserEntity.query.byEmail({ email }).go();
    if (existing.data.length > 0) {
      return NextResponse.json({ error: "Email already registered" }, { status: 409 });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const id = randomUUID();

    await UserEntity.put({ id, email, passwordHash, name }).go();

    return NextResponse.json({ id, email, name }, { status: 201 });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.issues }, { status: 400 });
    }
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
