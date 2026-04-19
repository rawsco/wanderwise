import { NextResponse } from "next/server";
import sharp from "sharp";
import { requireAuth } from "@/lib/auth-helpers";
import { ProfileEntity } from "@/lib/db/profile.entity";
import { uploadBuffer, getObjectUrl } from "@/lib/s3";

const SIZES = [
  { name: "sm", px: 48 },
  { name: "md", px: 96 },
  { name: "lg", px: 256 },
] as const;

export async function POST(
  req: Request,
  { params }: { params: Promise<{ profileId: string }> }
) {
  try {
    const user = await requireAuth();
    const { profileId } = await params;

    const formData = await req.formData();
    const file = formData.get("photo") as File | null;
    if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 });

    const buffer = Buffer.from(await file.arrayBuffer());

    const keys: Record<string, string> = {};

    await Promise.all(
      SIZES.map(async ({ name, px }) => {
        const resized = await sharp(buffer)
          .resize(px, px, { fit: "cover", position: "centre" })
          .webp({ quality: 85 })
          .toBuffer();

        const key = `profiles/${profileId}/${name}.webp`;
        await uploadBuffer(key, resized, "image/webp");
        keys[name] = key;
      })
    );

    await ProfileEntity.update({ userId: user.id, profileId }).set({
      avatarSm: keys.sm,
      avatarMd: keys.md,
      avatarLg: keys.lg,
    }).go();

    return NextResponse.json({
      avatarSm: getObjectUrl(keys.sm),
      avatarMd: getObjectUrl(keys.md),
      avatarLg: getObjectUrl(keys.lg),
    });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}
