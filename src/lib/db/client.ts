import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";

const isLocal = process.env.DYNAMODB_ENDPOINT !== undefined;

const client = new DynamoDBClient({
  region: process.env.AWS_REGION ?? "eu-west-1",
  ...(isLocal && {
    endpoint: process.env.DYNAMODB_ENDPOINT,
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID ?? "local",
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY ?? "local",
    },
  }),
});

// `removeUndefinedValues: true` strips `undefined` from items at marshal time,
// so optional fields on cached objects (e.g. SearchCacheEntity.results: { rating?, summary? })
// don't blow up DynamoDB writes. Without it the SDK throws
// "Pass options.removeUndefinedValues=true to remove undefined values…".
export const docClient = DynamoDBDocumentClient.from(client, {
  marshallOptions: { removeUndefinedValues: true },
});
export const TABLE_NAME = process.env.DYNAMODB_TABLE_NAME ?? "wanderwise";
