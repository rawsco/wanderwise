import { Entity } from "electrodb";
import { docClient, TABLE_NAME } from "./client";

export const TripEntity = new Entity(
  {
    model: { entity: "trip", version: "1", service: "wanderwise" },
    attributes: {
      tripId: { type: "string", required: true },
      userId: { type: "string", required: true },
      name: { type: "string", required: true },
      description: { type: "string" },
      startDate: { type: "string" },
      endDate: { type: "string" },
      adults: { type: "number", default: 1 },
      dogs: { type: "number", default: 0 },
      createdAt: { type: "string", default: () => new Date().toISOString() },
      updatedAt: { type: "string", default: () => new Date().toISOString() },
    },
    indexes: {
      byUser: {
        pk: { field: "pk", composite: ["userId"] },
        sk: { field: "sk", composite: ["tripId"] },
      },
    },
  },
  { table: TABLE_NAME, client: docClient }
);
