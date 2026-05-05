"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Loader2, Trash2, Pencil, Check, X, MapPin } from "lucide-react";
import type { Activity } from "@/types/stop";

interface Props {
  activities: Activity[];
  onUpdate: (activityId: string, note: string) => Promise<boolean>;
  onDelete: (activityId: string) => Promise<void>;
}

export function ActivityList({ activities, onUpdate, onDelete }: Props) {
  const [deleting, setDeleting] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  function startEdit(a: Activity) {
    setEditingId(a.activityId);
    setEditText(a.note ?? "");
    setEditError(null);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditText("");
    setEditError(null);
  }

  async function saveEdit(activityId: string) {
    setEditSaving(true);
    setEditError(null);
    const ok = await onUpdate(activityId, editText.trim());
    if (ok) {
      setEditingId(null);
      setEditText("");
    } else {
      setEditError("Could not save changes");
    }
    setEditSaving(false);
  }

  async function handleDelete(activityId: string) {
    setDeleting(activityId);
    await onDelete(activityId);
    setDeleting(null);
  }

  if (activities.length === 0) {
    return (
      <div className="py-8 text-center text-gray-400">
        <MapPin className="h-8 w-8 mx-auto mb-2 opacity-30" />
        <p className="text-sm">No activities yet — search for a place below to add one.</p>
      </div>
    );
  }

  const sorted = [...activities].sort((a, b) => a.order - b.order);

  return (
    <div className="space-y-3">
      {sorted.map(a => (
        <div
          key={a.activityId}
          className="group relative rounded-lg bg-gray-50 border border-gray-100 px-3 py-2.5"
        >
          {editingId === a.activityId ? (
            <div className="space-y-2">
              <p className="text-sm font-medium text-gray-900">{a.name}</p>
              <p className="text-xs text-gray-500">{a.address}</p>
              <textarea
                value={editText}
                onChange={e => setEditText(e.target.value)}
                onKeyDown={e => {
                  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) saveEdit(a.activityId);
                  if (e.key === "Escape") cancelEdit();
                }}
                rows={3}
                autoFocus
                placeholder="Add a note for this activity…"
                className="w-full rounded-md border border-gray-300 bg-white px-2.5 py-2 text-base text-gray-900 placeholder:text-gray-400 resize-none focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
              />
              {editError && (
                <p className="text-xs text-red-600" role="alert">{editError}</p>
              )}
              <div className="flex gap-1.5">
                <Button
                  size="sm"
                  className="h-7 text-xs px-2.5"
                  onClick={() => saveEdit(a.activityId)}
                  disabled={editSaving}
                >
                  {editSaving
                    ? <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                    : <Check className="h-3 w-3 mr-1" />
                  }
                  Save
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 text-xs px-2.5"
                  onClick={cancelEdit}
                  disabled={editSaving}
                >
                  <X className="h-3 w-3 mr-1" />
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <>
              <p className="text-sm font-medium text-gray-900">{a.name}</p>
              <p className="text-xs text-gray-500 mt-0.5">{a.address}</p>
              {a.note && (
                <p className="text-sm text-gray-700 whitespace-pre-wrap mt-2">{a.note}</p>
              )}
              <div className="flex items-center justify-end mt-1.5">
                <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => startEdit(a)}
                    className="text-gray-300 hover:text-emerald-500 p-1"
                    aria-label="Edit note"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => handleDelete(a.activityId)}
                    disabled={deleting === a.activityId}
                    className="text-gray-300 hover:text-red-400 p-1"
                    aria-label="Delete activity"
                  >
                    {deleting === a.activityId
                      ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      : <Trash2 className="h-3.5 w-3.5" />
                    }
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      ))}
    </div>
  );
}
