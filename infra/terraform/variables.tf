variable "region" {
  description = "AWS region to deploy into."
  type        = string
  default     = "us-east-2"
}

variable "app_name" {
  description = "Name used for the ECR repository, instance and other resources."
  type        = string
  default     = "tile-mosaic"
}

variable "instance_type" {
  description = "EC2 instance type. The app is a static site served by nginx, so a small instance is plenty."
  type        = string
  default     = "t3.micro"
}

variable "vpc_cidr" {
  description = "CIDR block for the app's VPC."
  type        = string
  default     = "10.42.0.0/16"
}

variable "image_tag" {
  description = "Image tag the instance pulls from ECR and runs."
  type        = string
  default     = "latest"
}

variable "allowed_http_cidrs" {
  description = "CIDR blocks allowed to reach the site on port 80. Defaults to everyone."
  type        = list(string)
  default     = ["0.0.0.0/0"]
}

variable "build_image" {
  description = "Build the app image with local Docker, push it to ECR and restart the container during `terraform apply`. Needs Docker and the AWS CLI on the machine running Terraform."
  type        = bool
  default     = true
}

variable "protect_data" {
  description = "Guard user data: deletion protection on the database and user pool, and keep the media bucket from being deleted while it has files. Set to false before `terraform destroy`."
  type        = bool
  default     = true
}

variable "db_instance_class" {
  description = "RDS instance class for the metadata database."
  type        = string
  default     = "db.t4g.micro"
}

variable "db_engine_version" {
  description = "PostgreSQL major version for RDS."
  type        = string
  default     = "17"
}

variable "extra_origins" {
  description = "More site origins allowed to upload to and download from the media bucket, e.g. [\"https://mosaic.example.com\"]. The Elastic IP's http:// origin is always allowed."
  type        = list(string)
  default     = []
}

variable "db_backup_retention_days" {
  description = "Days of automated database backups. AWS free-plan accounts allow at most 1; raise it (up to 35) once the account is upgraded."
  type        = number
  default     = 1
}
