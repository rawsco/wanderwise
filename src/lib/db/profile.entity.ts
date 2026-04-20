import { Entity } from "electrodb";
import { docClient, TABLE_NAME } from "./client";

export const ProfileEntity = new Entity(
  {
    model: { entity: "profile", version: "1", service: "wanderwise" },
    attributes: {
      profileId: { type: "string", required: true },
      userId: { type: "string", required: true },
      name: { type: "string", required: true },
      type: { type: ["adult", "child", "dog", "cat"] as const, required: true },
      yearOfBirth: { type: "number" },
      notes: { type: "string" },
      likes: { type: "list", items: { type: "string" }, default: () => [] },
      dislikes: { type: "list", items: { type: "string" }, default: () => [] },
      avatarSm: { type: "string" },
      avatarMd: { type: "string" },
      avatarLg: { type: "string" },
      createdAt: { type: "string", default: () => new Date().toISOString() },
    },
    indexes: {
      byUser: {
        pk: { field: "pk", composite: ["userId"] },
        sk: { field: "sk", composite: ["profileId"] },
      },
    },
  },
  { table: TABLE_NAME, client: docClient }
);
