# ---------------------------------------------------------------------------
# Accounts and the user library: Cognito for sign-in, S3 for images, RDS
# PostgreSQL for metadata. The API container on the instance ties them together.
# ---------------------------------------------------------------------------

# ----- Cognito: email + password accounts -----------------------------------

resource "aws_cognito_user_pool" "users" {
  name                     = var.app_name
  username_attributes      = ["email"]
  auto_verified_attributes = ["email"]
  deletion_protection      = var.protect_data ? "ACTIVE" : "INACTIVE"

  password_policy {
    minimum_length                   = 8
    require_lowercase                = true
    require_uppercase                = true
    require_numbers                  = true
    require_symbols                  = false
    temporary_password_validity_days = 7
  }

  account_recovery_setting {
    recovery_mechanism {
      name     = "verified_email"
      priority = 1
    }
  }

  verification_message_template {
    default_email_option = "CONFIRM_WITH_CODE"
    email_subject        = "Your Tile Mosaic code"
    email_message        = "Your Tile Mosaic verification code is {####}"
  }

  # Cognito's built-in sender: fine to start with, limited to about 50 emails a day.
  # Switch to SES (email_configuration) before opening sign-ups widely.
  email_configuration {
    email_sending_account = "COGNITO_DEFAULT"
  }
}

# The browser app signs users in directly against Cognito (no client secret).
resource "aws_cognito_user_pool_client" "web" {
  name         = "${var.app_name}-web"
  user_pool_id = aws_cognito_user_pool.users.id

  generate_secret               = false
  explicit_auth_flows           = ["ALLOW_USER_PASSWORD_AUTH", "ALLOW_REFRESH_TOKEN_AUTH"]
  prevent_user_existence_errors = "ENABLED"
  enable_token_revocation       = true

  id_token_validity      = 60
  access_token_validity  = 60
  refresh_token_validity = 30
  token_validity_units {
    id_token      = "minutes"
    access_token  = "minutes"
    refresh_token = "days"
  }
}

# ----- S3: users' tiles and mosaics ------------------------------------------

resource "aws_s3_bucket" "media" {
  bucket_prefix = "${var.app_name}-media-"
  force_destroy = !var.protect_data
}

resource "aws_s3_bucket_public_access_block" "media" {
  bucket                  = aws_s3_bucket.media.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_ownership_controls" "media" {
  bucket = aws_s3_bucket.media.id
  rule {
    object_ownership = "BucketOwnerEnforced"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "media" {
  bucket = aws_s3_bucket.media.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

# Browsers upload and download directly with presigned URLs, so the site's origin needs CORS.
resource "aws_s3_bucket_cors_configuration" "media" {
  bucket = aws_s3_bucket.media.id
  cors_rule {
    allowed_origins = concat(["http://${aws_eip.app.public_ip}"], var.extra_origins)
    allowed_methods = ["GET", "PUT", "HEAD"]
    allowed_headers = ["*"]
    expose_headers  = ["ETag"]
    max_age_seconds = 3600
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "media" {
  bucket = aws_s3_bucket.media.id
  rule {
    id     = "abort-incomplete-uploads"
    status = "Enabled"
    filter {}
    abort_incomplete_multipart_upload {
      days_after_initiation = 1
    }
  }
}

# ----- RDS PostgreSQL: users, tile sets, mosaics ------------------------------

# RDS needs subnets in two availability zones, even for a single-AZ database.
resource "aws_subnet" "private" {
  count             = 2
  vpc_id            = aws_vpc.this.id
  cidr_block        = cidrsubnet(var.vpc_cidr, 8, 10 + count.index)
  availability_zone = data.aws_availability_zones.available.names[count.index]

  tags = { Name = "${var.app_name}-private-${count.index}" }
}

resource "aws_db_subnet_group" "db" {
  name       = var.app_name
  subnet_ids = aws_subnet.private[*].id
}

# Only the app instance can reach the database.
resource "aws_security_group" "db" {
  name        = "${var.app_name}-db"
  description = "Postgres from the Tile Mosaic instance"
  vpc_id      = aws_vpc.this.id

  ingress {
    description     = "Postgres from the app instance"
    from_port       = 5432
    to_port         = 5432
    protocol        = "tcp"
    security_groups = [aws_security_group.web.id]
  }
}

resource "aws_db_instance" "db" {
  identifier     = var.app_name
  engine         = "postgres"
  engine_version = var.db_engine_version
  instance_class = var.db_instance_class

  allocated_storage     = 20
  max_allocated_storage = 100
  storage_type          = "gp3"
  storage_encrypted     = true

  db_name  = "tilemosaic"
  username = "tilemosaic"
  # RDS creates the password and keeps it in Secrets Manager; the API reads it from there
  manage_master_user_password = true

  db_subnet_group_name   = aws_db_subnet_group.db.name
  vpc_security_group_ids = [aws_security_group.db.id]
  publicly_accessible    = false
  multi_az               = false

  backup_retention_period    = var.db_backup_retention_days
  auto_minor_version_upgrade = true
  deletion_protection        = var.protect_data
  skip_final_snapshot        = !var.protect_data
  final_snapshot_identifier  = var.protect_data ? "${var.app_name}-final" : null
  apply_immediately          = true
}

# ----- The API container's settings --------------------------------------------
# Kept in Parameter Store rather than user data, so changing one only needs a
# container restart (done by deploy.tf), not a new instance. Nothing secret here:
# the database password stays in Secrets Manager.

resource "aws_ssm_parameter" "api_env" {
  name = "/${var.app_name}/api-env"
  type = "String"
  value = join("\n", [
    "NODE_ENV=production",
    "AWS_REGION=${var.region}",
    "AUTH_MODE=cognito",
    "COGNITO_USER_POOL_ID=${aws_cognito_user_pool.users.id}",
    "COGNITO_CLIENT_ID=${aws_cognito_user_pool_client.web.id}",
    "S3_BUCKET=${aws_s3_bucket.media.bucket}",
    "DB_HOST=${aws_db_instance.db.address}",
    "DB_PORT=${aws_db_instance.db.port}",
    "DB_NAME=${aws_db_instance.db.db_name}",
    "DB_SECRET_ARN=${aws_db_instance.db.master_user_secret[0].secret_arn}",
    "DB_SSL=require",
    "DB_CA_FILE=/etc/ssl/rds-global-bundle.pem",
  ])
}

# ----- What the instance's API container is allowed to do --------------------

resource "aws_iam_role_policy" "api" {
  name = "${var.app_name}-api"
  role = aws_iam_role.instance.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid      = "MediaObjects"
        Effect   = "Allow"
        Action   = ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"]
        Resource = "${aws_s3_bucket.media.arn}/u/*"
      },
      {
        # HeadObject on a missing key returns 404 (not 403) only with ListBucket
        Sid      = "MediaList"
        Effect   = "Allow"
        Action   = "s3:ListBucket"
        Resource = aws_s3_bucket.media.arn
      },
      {
        Sid      = "ApiSettings"
        Effect   = "Allow"
        Action   = "ssm:GetParameter"
        Resource = aws_ssm_parameter.api_env.arn
      },
      {
        Sid      = "DatabasePassword"
        Effect   = "Allow"
        Action   = "secretsmanager:GetSecretValue"
        Resource = aws_db_instance.db.master_user_secret[0].secret_arn
      },
    ]
  })
}
