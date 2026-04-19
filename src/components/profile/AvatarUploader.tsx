"use client";

import { useRef, useState } from "react";
import { Avatar } from "./Avatar";
import { Loader2, Camera } from "lucide-react";

interface AvatarUploaderProps {
  profileId: string;
  name: string;
  type: string;
  currentSrc?: string | null;
}

export function AvatarUploader({ profileId, name, type, currentSrc }: AvatarUploaderProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [src, setSrc] = useState(currentSrc ?? null);
  const [uploading, setUploading] = useState(false);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    const form = new FormData();
    form.append("photo", file);

    const res = await fetch(`/api/profiles/${profileId}/photo`, { method: "POST", body: form });
    if (res.ok) {
      const data = await res.json();
      setSrc(data.avatarLg);
    }
    setUploading(false);
  }

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="relative cursor-pointer group" onClick={() => inputRef.current?.click()}>
        <Avatar name={name} type={type} src={src} size="lg" />
        <div className="absolute inset-0 rounded-full bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
          {uploading
            ? <Loader2 className="h-8 w-8 text-white animate-spin" />
            : <Camera className="h-8 w-8 text-white" />
          }
        </div>
      </div>
      <p className="text-xs text-gray-400">Click to upload a photo</p>
      <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />
    </div>
  );
}
