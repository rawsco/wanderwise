#!/usr/bin/env bash
# bin/lib/bootstrap-stack.sh — create the DynamoDB table and MinIO bucket
# in a fresh worktree's local Docker stack. Idempotent: re-running is safe.
#
# Run from a worktree root after `docker compose up -d`. Reads endpoint /
# table / bucket config from .env.local + .env.development.local + .env.compose
# in Next.js precedence order.
#
# Without this, NextAuth's signIn callback hits an empty DynamoDB Local and
# throws "Cannot do operations on a non-existent table", redirecting the
# user to /api/auth/error?error=... — observed on SCRUM-7's first re-run
# after the test-env-https fix.

set -euo pipefail

# Source env in Next.js precedence order (later wins for matching keys).
[ -f .env.local ] && { set -a; . ./.env.local; set +a; }
[ -f .env.development.local ] && { set -a; . ./.env.development.local; set +a; }
[ -f .env.compose ] && { set -a; . ./.env.compose; set +a; }

DDB_ENDPOINT="${DYNAMODB_ENDPOINT:-http://localhost:8000}"
S3_ENDPOINT_URL="${S3_ENDPOINT:-http://localhost:9002}"
TABLE_NAME="${DYNAMODB_TABLE_NAME:-wanderwise}"
BUCKET="${S3_BUCKET:-wanderwise}"

log() { printf '[bootstrap-stack] %s\n' "$*"; }

# Wait for a TCP host:port (parsed from a scheme://host:port URL).
wait_for_url() {
  local url="$1" name="$2" host port
  host=$(echo "$url" | sed -E 's|^https?://([^:/]+).*|\1|')
  port=$(echo "$url" | sed -E 's|^https?://[^:/]+:([0-9]+).*|\1|')
  for _ in $(seq 1 30); do
    nc -z "$host" "$port" 2>/dev/null && {
      log "$name reachable at $host:$port"
      return 0
    }
    sleep 1
  done
  log "ERROR: $name never came up at $host:$port"
  return 1
}

wait_for_url "$DDB_ENDPOINT" "DynamoDB Local"
wait_for_url "$S3_ENDPOINT_URL" "MinIO"

log "creating DynamoDB table '$TABLE_NAME' (idempotent)"
DYNAMODB_ENDPOINT="$DDB_ENDPOINT" DYNAMODB_TABLE_NAME="$TABLE_NAME" node -e "
const { DynamoDBClient, CreateTableCommand } = require('@aws-sdk/client-dynamodb');
const client = new DynamoDBClient({
  region: 'eu-west-1',
  endpoint: process.env.DYNAMODB_ENDPOINT,
  credentials: { accessKeyId: 'local', secretAccessKey: 'local' },
});
client.send(new CreateTableCommand({
  TableName: process.env.DYNAMODB_TABLE_NAME,
  AttributeDefinitions: [
    { AttributeName: 'pk', AttributeType: 'S' },
    { AttributeName: 'sk', AttributeType: 'S' },
    { AttributeName: 'gsi1pk', AttributeType: 'S' },
    { AttributeName: 'gsi1sk', AttributeType: 'S' },
  ],
  KeySchema: [
    { AttributeName: 'pk', KeyType: 'HASH' },
    { AttributeName: 'sk', KeyType: 'RANGE' },
  ],
  GlobalSecondaryIndexes: [{
    IndexName: 'GSI1',
    KeySchema: [
      { AttributeName: 'gsi1pk', KeyType: 'HASH' },
      { AttributeName: 'gsi1sk', KeyType: 'RANGE' },
    ],
    Projection: { ProjectionType: 'ALL' },
  }],
  BillingMode: 'PAY_PER_REQUEST',
})).then(() => console.log('table created'))
  .catch(e => {
    if (e.name === 'ResourceInUseException') console.log('table already exists');
    else { console.error('table create failed:', e.message); process.exit(1); }
  });
"

log "creating MinIO bucket '$BUCKET' (idempotent)"
S3_ENDPOINT="$S3_ENDPOINT_URL" S3_BUCKET="$BUCKET" node -e "
const { S3Client, CreateBucketCommand } = require('@aws-sdk/client-s3');
const client = new S3Client({
  region: 'eu-west-1',
  endpoint: process.env.S3_ENDPOINT,
  forcePathStyle: true,
  credentials: { accessKeyId: 'minioadmin', secretAccessKey: 'minioadmin' },
});
client.send(new CreateBucketCommand({ Bucket: process.env.S3_BUCKET }))
  .then(() => console.log('bucket created'))
  .catch(e => {
    if (e.name === 'BucketAlreadyOwnedByYou' || e.name === 'BucketAlreadyExists')
      console.log('bucket already exists');
    else { console.error('bucket create failed:', e.message); process.exit(1); }
  });
"

log "OK — DynamoDB table and MinIO bucket ready"
