output "url" {
  description = "Where the site is served."
  value       = "http://${aws_eip.app.public_ip}"
}

output "public_ip" {
  description = "The instance's Elastic IP. Point a DNS record here if you add a domain."
  value       = aws_eip.app.public_ip
}

output "ecr_repository_url" {
  description = "Push the app image here."
  value       = aws_ecr_repository.app.repository_url
}

output "instance_id" {
  description = "For SSM deploys and `aws ssm start-session --target <id>`."
  value       = aws_instance.app.id
}

output "region" {
  value = var.region
}

output "app_name" {
  value = var.app_name
}

output "image" {
  description = "The image tag built from the current source (only when build_image is true)."
  value       = var.build_image ? "${aws_ecr_repository.app.repository_url}:${local.build_tag}" : null
}

output "api_ecr_repository_url" {
  description = "Push the API image here."
  value       = aws_ecr_repository.api.repository_url
}

output "media_bucket" {
  description = "S3 bucket holding users' tiles and mosaics."
  value       = aws_s3_bucket.media.bucket
}

output "db_endpoint" {
  description = "RDS PostgreSQL address (reachable only from the instance)."
  value       = aws_db_instance.db.address
}

output "cognito_user_pool_id" {
  value = aws_cognito_user_pool.users.id
}

output "cognito_client_id" {
  value = aws_cognito_user_pool_client.web.id
}
