import { Entity } from "electrodb";
import { docClient, TABLE_NAME } from "./client";

export const UserEntity = new Entity(
  {
    model: { entity: "user", version: "1", service: "wanderwise" },
    attributes: {
      id: { type: "string", required: true },
      email: { type: "string", required: true },
      name: { type: "string" },
      createdAt: { type: "string", default: () => new Date().toISOString() },
    },
    indexes: {
      primary: {
        pk: { field: "pk", composite: ["id"] },
        sk: { field: "sk", facets: [], composite: [] },
      },
      byEmail: {
        index: "GSI1",
        pk: { field: "gsi1pk", composite: ["email"] },
        sk: { field: "gsi1sk", facets: [], composite: [] },
      },
    },
  },
  { table: TABLE_NAME, client: docClient }
);
