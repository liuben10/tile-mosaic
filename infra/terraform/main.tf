# ---------------------------------------------------------------------------
# Network: one public subnet in its own VPC, so nothing depends on a default VPC
# ---------------------------------------------------------------------------

data "aws_availability_zones" "available" {
  state = "available"
}

resource "aws_vpc" "this" {
  cidr_block           = var.vpc_cidr
  enable_dns_support   = true
  enable_dns_hostnames = true

  tags = { Name = var.app_name }
}

resource "aws_internet_gateway" "this" {
  vpc_id = aws_vpc.this.id
  tags   = { Name = var.app_name }
}

resource "aws_subnet" "public" {
  vpc_id                  = aws_vpc.this.id
  cidr_block              = cidrsubnet(var.vpc_cidr, 8, 1)
  availability_zone       = data.aws_availability_zones.available.names[0]
  map_public_ip_on_launch = true

  tags = { Name = "${var.app_name}-public" }
}

resource "aws_route_table" "public" {
  vpc_id = aws_vpc.this.id

  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.this.id
  }

  tags = { Name = "${var.app_name}-public" }
}

resource "aws_route_table_association" "public" {
  subnet_id      = aws_subnet.public.id
  route_table_id = aws_route_table.public.id
}

# HTTP in, everything out. No SSH: use Session Manager (`aws ssm start-session`) for a shell.
resource "aws_security_group" "web" {
  name        = "${var.app_name}-web"
  description = "HTTP to the Tile Mosaic site"
  vpc_id      = aws_vpc.this.id

  ingress {
    description = "HTTP"
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = var.allowed_http_cidrs
  }

  egress {
    description = "All outbound (ECR, OS packages, SSM)"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

# ---------------------------------------------------------------------------
# Container registry
# ---------------------------------------------------------------------------

resource "aws_ecr_repository" "app" {
  name                 = var.app_name
  image_tag_mutability = "MUTABLE"
  force_delete         = true # lets `terraform destroy` remove the repo even with images in it

  image_scanning_configuration {
    scan_on_push = true
  }
}

# the API (accounts and library) is a second image
resource "aws_ecr_repository" "api" {
  name                 = "${var.app_name}-api"
  image_tag_mutability = "MUTABLE"
  force_delete         = true

  image_scanning_configuration {
    scan_on_push = true
  }
}

resource "aws_ecr_lifecycle_policy" "app" {
  for_each   = { web = aws_ecr_repository.app.name, api = aws_ecr_repository.api.name }
  repository = each.value

  policy = jsonencode({
    rules = [{
      rulePriority = 1
      description  = "Keep the 10 most recent images"
      selection = {
        tagStatus   = "any"
        countType   = "imageCountMoreThan"
        countNumber = 10
      }
      action = { type = "expire" }
    }]
  })
}

moved {
  from = aws_ecr_lifecycle_policy.app
  to   = aws_ecr_lifecycle_policy.app["web"]
}

# ---------------------------------------------------------------------------
# Instance role: pull from ECR, and be reachable through SSM for deploys and shells
# ---------------------------------------------------------------------------

resource "aws_iam_role" "instance" {
  name = "${var.app_name}-instance"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "ec2.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

resource "aws_iam_role_policy_attachment" "ecr_read" {
  role       = aws_iam_role.instance.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonEC2ContainerRegistryReadOnly"
}

resource "aws_iam_role_policy_attachment" "ssm" {
  role       = aws_iam_role.instance.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
}

resource "aws_iam_instance_profile" "instance" {
  name = "${var.app_name}-instance"
  role = aws_iam_role.instance.name
}

# ---------------------------------------------------------------------------
# The instance: Amazon Linux 2023 running the app's container under systemd
# ---------------------------------------------------------------------------

data "aws_ssm_parameter" "al2023_ami" {
  name = "/aws/service/ami-amazon-linux-latest/al2023-ami-kernel-default-x86_64"
}

resource "aws_instance" "app" {
  ami                    = data.aws_ssm_parameter.al2023_ami.value
  instance_type          = var.instance_type
  subnet_id              = aws_subnet.public.id
  vpc_security_group_ids = [aws_security_group.web.id]
  iam_instance_profile   = aws_iam_instance_profile.instance.name

  user_data = templatefile("${path.module}/user_data.sh.tftpl", {
    region    = var.region
    registry  = split("/", aws_ecr_repository.app.repository_url)[0]
    image     = "${aws_ecr_repository.app.repository_url}:${var.image_tag}"
    api_image = "${aws_ecr_repository.api.repository_url}:${var.image_tag}"
    api_env   = aws_ssm_parameter.api_env.name
    app_name  = var.app_name
  })
  user_data_replace_on_change = true

  metadata_options {
    http_tokens                 = "required" # IMDSv2 only
    http_put_response_hop_limit = 2          # lets containers reach the instance role's credentials
  }

  root_block_device {
    volume_type = "gp3"
    volume_size = 30 # the AL2023 AMI's snapshot is 30 GiB, so it can't be smaller
    encrypted   = true
  }

  # a newer AMI shouldn't replace a running server; rebuild deliberately with `terraform apply -replace`
  lifecycle {
    ignore_changes = [ami]
  }

  tags = { Name = var.app_name }
}

# stable public address that survives stop/start and instance replacement
resource "aws_eip" "app" {
  domain   = "vpc"
  instance = aws_instance.app.id
  tags     = { Name = var.app_name }

  depends_on = [aws_internet_gateway.this]
}
