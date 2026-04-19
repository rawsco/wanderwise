import { Entity } from "electrodb";
import { docClient, TABLE_NAME } from "./client";

export const StopEntity = new Entity(
  {
    model: { entity: "stop", version: "1", service: "wanderwise" },
    attributes: {
      stopId: { type: "string", required: true },
      tripId: { type: "string", required: true },
      order: { type: "number", required: true },
      name: { type: "string", required: true },
      address: { type: "string", required: true },
      lat: { type: "number", required: true },
      lng: { type: "number", required: true },
      arrivalDate: { type: "string" },
      departureDate: { type: "string" },
      createdAt: { type: "string", default: () => new Date().toISOString() },
    },
    indexes: {
      byTrip: {
        pk: { field: "pk", composite: ["tripId"] },
        sk: { field: "sk", composite: ["order", "stopId"] },
      },
    },
  },
  { table: TABLE_NAME, client: docClient }
);
