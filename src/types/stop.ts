export interface StopNote {
  noteId: string;
  text: string;
  createdAt: string;
}

export interface Activity {
  activityId: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  placeId?: string;
  note?: string;
  order: number;
  source: "user" | "agent";
  createdAt: string;
  scheduledDate?: string;
  startTime?: string;
  durationMinutes?: number;
  suggestionId?: string;
}
