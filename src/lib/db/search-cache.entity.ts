import { Entity } from "electrodb";
import { docClient, TABLE_NAME } from "./client";

export const SearchCacheEntity = new Entity(
  {
    model: { entity: "searchCache", version: "1", service: "wanderwise" },
    attributes: {
      stopId: { type: "string", required: true },
      queryHash: { type: "string", required: true },
      radiusKm: { type: "number", required: true },
      results: { type: "any" },
      createdAt: { type: "string", default: () => new Date().toISOString() },
      // Epoch seconds. Top-level `ttl` attribute → DynamoDB auto-expires items.
      ttl: { type: "number", required: true },
    },
    indexes: {
      byStop: {
        pk: { field: "pk", composite: ["stopId"] },
        sk: { field: "sk", composite: ["queryHash", "radiusKm"] },
      },
    },
  },
  { table: TABLE_NAME, client: docClient }
);
