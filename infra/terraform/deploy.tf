# ---------------------------------------------------------------------------
# Build and ship the app images as part of `terraform apply`
#
# Terraform hashes the files that go into each image (the web site and the API).
# When a hash changes it builds that image with your local Docker, pushes it to
# ECR, and tells the instance (through SSM) to restart the containers.
#
# The commands avoid shell-specific syntax so they run the same from cmd.exe on
# Windows and from sh on macOS/Linux. Set build_image = false to skip all of this
# and push images some other way (for example scripts/deploy.sh).
# ---------------------------------------------------------------------------

locals {
  repo_root = abspath("${path.module}/../..")

  # everything the Dockerfile copies into the image
  image_inputs = sort(concat(
    ["Dockerfile", "nginx.conf", "index.html", "package.json", "package-lock.json", "vite.config.js"],
    tolist(fileset(local.repo_root, "src/**")),
  ))

  source_hash = sha1(join("", [for f in local.image_inputs : "${f}:${filesha1("${local.repo_root}/${f}")}"]))
  build_tag   = substr(local.source_hash, 0, 12)

  api_root = "${local.repo_root}/api"
  api_inputs = sort(concat(
    ["Dockerfile", "package.json", "package-lock.json"],
    tolist(fileset(local.api_root, "src/**")),
    tolist(fileset(local.api_root, "migrations/**")),
  ))
  api_hash      = sha1(join("", [for f in local.api_inputs : "${f}:${filesha1("${local.api_root}/${f}")}"]))
  api_build_tag = substr(local.api_hash, 0, 12)

  registry = split("/", aws_ecr_repository.app.repository_url)[0]
}

resource "terraform_data" "image" {
  count = var.build_image ? 1 : 0

  triggers_replace = [local.source_hash, aws_ecr_repository.app.repository_url]

  provisioner "local-exec" {
    working_dir = local.repo_root
    # EC2 runs x86_64; --platform keeps the image right when building on an ARM Mac
    command = join(" && ", [
      "aws ecr get-login-password --region ${var.region} | docker login --username AWS --password-stdin ${local.registry}",
      "docker build --platform linux/amd64 -t ${aws_ecr_repository.app.repository_url}:${local.build_tag} -t ${aws_ecr_repository.app.repository_url}:${var.image_tag} .",
      "docker push ${aws_ecr_repository.app.repository_url}:${local.build_tag}",
      "docker push ${aws_ecr_repository.app.repository_url}:${var.image_tag}",
    ])
  }
}

resource "terraform_data" "api_image" {
  count = var.build_image ? 1 : 0

  triggers_replace = [local.api_hash, aws_ecr_repository.api.repository_url]

  provisioner "local-exec" {
    working_dir = local.api_root
    command = join(" && ", [
      "aws ecr get-login-password --region ${var.region} | docker login --username AWS --password-stdin ${local.registry}",
      "docker build --platform linux/amd64 -t ${aws_ecr_repository.api.repository_url}:${local.api_build_tag} -t ${aws_ecr_repository.api.repository_url}:${var.image_tag} .",
      "docker push ${aws_ecr_repository.api.repository_url}:${local.api_build_tag}",
      "docker push ${aws_ecr_repository.api.repository_url}:${var.image_tag}",
    ])
  }
}

resource "terraform_data" "restart" {
  count = var.build_image ? 1 : 0

  triggers_replace = [
    terraform_data.image[0].id, terraform_data.api_image[0].id, aws_instance.app.id, aws_ssm_parameter.api_env.version,
  ]

  # On a brand-new instance the SSM agent may not be registered yet, so this can
  # fail. That's fine: the instance's service retries every 30 seconds until it
  # has pulled and started the image on its own.
  #
  # The command has no quoted arguments on purpose: Terraform runs it through
  # cmd.exe on Windows, which mangles the escaped quotes Go adds. The instance's
  # run script (pull + replace the container) takes no arguments, so no spaces.
  provisioner "local-exec" {
    on_failure = continue
    command    = "aws ssm send-command --region ${var.region} --instance-ids ${aws_instance.app.id} --document-name AWS-RunShellScript --comment deploy-${var.app_name}-${local.build_tag} --parameters commands=/usr/local/bin/${var.app_name}-run --query Command.CommandId --output text"
  }
}
