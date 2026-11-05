// Everything the API reads from its environment, in one place.
const env = process.env;

const config = {
  port: Number(env.PORT || 3000),
  production: env.NODE_ENV === "production",
  region: env.AWS_REGION || "us-east-2",

  db: {
    // local dev: a full connection string
    url: env.DATABASE_URL || null,
    // AWS: host + the RDS-managed Secrets Manager secret holding the username/password
    host: env.DB_HOST || null,
    port: Number(env.DB_PORT || 5432),
    name: env.DB_NAME || "tilemosaic",
    secretArn: env.DB_SECRET_ARN || null,
    ssl: env.DB_SSL === "require",
    caFile: env.DB_CA_FILE || null,
  },

  s3: {
    bucket: env.S3_BUCKET,
    // local dev (MinIO): the address the API uses, and the one browsers use for presigned URLs
    endpoint: env.S3_ENDPOINT || null,
    publicEndpoint: env.S3_PUBLIC_ENDPOINT || env.S3_ENDPOINT || null,
  },

  auth: {
    // "cognito" in AWS; "dev" trusts an email in the Authorization header, for local testing only
    mode: env.AUTH_MODE || "cognito",
    userPoolId: env.COGNITO_USER_POOL_ID || null,
    clientId: env.COGNITO_CLIENT_ID || null,
  },

  admin: {
    // Cognito account ids (the "sub", shown on the library page) allowed into the admin panel
    subs: (env.ADMIN_SUBS || "").split(",").map((s) => s.trim()).filter(Boolean),
  },

  limits: {
    tilesPerSet: 5000,
    tileBytes: 10 * 1024 * 1024,
    mosaicBytes: 300 * 1024 * 1024,
    thumbBytes: 4 * 1024 * 1024,
    urlTtl: 3600, // seconds a presigned URL stays valid
  },
};

if (!config.s3.bucket) throw new Error("S3_BUCKET is not set");
if (config.auth.mode === "dev" && config.production) {
  throw new Error("AUTH_MODE=dev is for local development and can't be used with NODE_ENV=production");
}
if (config.auth.mode === "cognito" && (!config.auth.userPoolId || !config.auth.clientId)) {
  throw new Error("COGNITO_USER_POOL_ID and COGNITO_CLIENT_ID must be set when AUTH_MODE=cognito");
}

export default config;
