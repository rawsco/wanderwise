"use client";

import { useRef, useState, useCallback, useEffect } from "react";
import { Avatar } from "./Avatar";
import { Loader2, Camera, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";

const PREVIEW_SIZE = 256;

interface AvatarUploaderProps {
  profileId: string;
  name: string;
  type: string;
  currentSrc?: string | null;
}

interface Transform {
  x: number;
  y: number;
  scale: number;
}

export function AvatarUploader({ profileId, name, type, currentSrc }: AvatarUploaderProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [src, setSrc] = useState(currentSrc ?? null);
  const [rawDataUrl, setRawDataUrl] = useState<string | null>(null);
  const [transform, setTransform] = useState<Transform>({ x: 0, y: 0, scale: 1 });
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dragState = useRef<{ startX: number; startY: number; startTX: number; startTY: number } | null>(null);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      setRawDataUrl(ev.target?.result as string);
      setTransform({ x: 0, y: 0, scale: 1 });
    };
    reader.readAsDataURL(file);
  }

  // Wheel to zoom
  function onWheel(e: React.WheelEvent) {
    e.preventDefault();
    setTransform(t => ({ ...t, scale: Math.min(4, Math.max(0.5, t.scale - e.deltaY * 0.001)) }));
  }

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    dragState.current = { startX: e.clientX, startY: e.clientY, startTX: transform.x, startTY: transform.y };
  }, [transform]);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragState.current) return;
    const dx = e.clientX - dragState.current.startX;
    const dy = e.clientY - dragState.current.startY;
    setTransform(t => ({ ...t, x: dragState.current!.startTX + dx, y: dragState.current!.startTY + dy }));
  }, []);

  const onPointerUp = useCallback(() => { dragState.current = null; }, []);

  async function handleSave() {
    if (!rawDataUrl || !canvasRef.current) return;
    setUploading(true);
    setError(null);

    try {
      const img = new Image();
      // Set onload before src — data URLs can resolve synchronously
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error("Failed to load image"));
        img.src = rawDataUrl;
      });

      const canvas = canvasRef.current;
      canvas.width = PREVIEW_SIZE;
      canvas.height = PREVIEW_SIZE;
      const ctx = canvas.getContext("2d")!;

      ctx.beginPath();
      ctx.arc(PREVIEW_SIZE / 2, PREVIEW_SIZE / 2, PREVIEW_SIZE / 2, 0, Math.PI * 2);
      ctx.clip();

      const baseScale = Math.max(PREVIEW_SIZE / img.naturalWidth, PREVIEW_SIZE / img.naturalHeight);
      const totalScale = baseScale * transform.scale;
      const drawW = img.naturalWidth * totalScale;
      const drawH = img.naturalHeight * totalScale;
      const drawX = (PREVIEW_SIZE - drawW) / 2 + transform.x;
      const drawY = (PREVIEW_SIZE - drawH) / 2 + transform.y;

      ctx.drawImage(img, drawX, drawY, drawW, drawH);

      const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, "image/png"));
      if (!blob) throw new Error("Failed to export canvas");

      const form = new FormData();
      form.append("photo", blob, "avatar.png");
      const res = await fetch(`/api/profiles/${profileId}/photo`, { method: "POST", body: form });
      if (!res.ok) throw new Error("Upload failed");

      const data = await res.json();
      setSrc(data.avatarLg);
      setRawDataUrl(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  function handleCancel() {
    setRawDataUrl(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  // Initial fill scale for the preview
  const [previewScale, setPreviewScale] = useState(1);
  useEffect(() => {
    if (!rawDataUrl) return;
    const img = new Image();
    img.onload = () => {
      setPreviewScale(Math.max(PREVIEW_SIZE / img.naturalWidth, PREVIEW_SIZE / img.naturalHeight));
    };
    img.src = rawDataUrl;
  }, [rawDataUrl]);

  return (
    <div className="flex flex-col items-center gap-3">
      {rawDataUrl ? (
        <>
          <div
            className="rounded-full overflow-hidden cursor-grab active:cursor-grabbing select-none border-2 border-emerald-400"
            style={{ width: PREVIEW_SIZE, height: PREVIEW_SIZE, position: "relative" }}
            onWheel={onWheel}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              ref={imgRef}
              src={rawDataUrl}
              alt="preview"
              draggable={false}
              style={{
                position: "absolute",
                transformOrigin: "center",
                transform: `translate(calc(-50% + ${transform.x}px), calc(-50% + ${transform.y}px)) scale(${previewScale * transform.scale})`,
                top: "50%",
                left: "50%",
                maxWidth: "none",
                userSelect: "none",
              }}
            />
          </div>
          <p className="text-xs text-gray-400">Drag to reposition · scroll to zoom</p>
          <div className="flex gap-2">
            <Button onClick={handleSave} disabled={uploading}>
              {uploading ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Check className="h-4 w-4 mr-1" />}
              Save photo
            </Button>
            <Button variant="outline" onClick={handleCancel} disabled={uploading}>
              <X className="h-4 w-4 mr-1" />
              Cancel
            </Button>
          </div>
          {error && <p className="text-xs text-red-500">{error}</p>}
        </>
      ) : (
        <>
          <div className="relative cursor-pointer group" onClick={() => fileInputRef.current?.click()}>
            <Avatar name={name} type={type} src={src} size="lg" />
            <div className="absolute inset-0 rounded-full bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
              <Camera className="h-8 w-8 text-white" />
            </div>
          </div>
          <p className="text-xs text-gray-400">Click to upload a photo</p>
        </>
      )}

      <canvas ref={canvasRef} className="hidden" />
      <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
    </div>
  );
}
