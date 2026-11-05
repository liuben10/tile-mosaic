#!/bin/bash
# Runs inside LocalStack when it's ready: create the media bucket, with the same
# CORS rules the real bucket gets from Terraform (browser uploads and downloads).
set -euo pipefail
awslocal s3api create-bucket --bucket tile-mosaic-media --create-bucket-configuration LocationConstraint=us-east-2
awslocal s3api put-bucket-cors --bucket tile-mosaic-media --cors-configuration '{
  "CORSRules": [{
    "AllowedOrigins": ["http://localhost:8080", "http://localhost:5173"],
    "AllowedMethods": ["GET", "PUT", "HEAD"],
    "AllowedHeaders": ["*"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3600
  }]
}'
echo "media bucket ready"
