variable "region" {
  description = "AWS region to deploy into."
  type        = string
  default     = "us-west-2"
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
