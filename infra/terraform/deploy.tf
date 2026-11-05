# ---------------------------------------------------------------------------
# Build and ship the app image as part of `terraform apply`
#
# Terraform hashes the files that go into the image. When the hash changes it
# builds the image with your local Docker, pushes it to ECR, and tells the
# instance (through SSM) to restart the container on the new image.
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

resource "terraform_data" "restart" {
  count = var.build_image ? 1 : 0

  triggers_replace = [terraform_data.image[0].id, aws_instance.app.id]

  # On a brand-new instance the SSM agent may not be registered yet, so this can
  # fail. That's fine: the instance's service retries every 30 seconds until it
  # has pulled and started the image on its own.
  provisioner "local-exec" {
    on_failure = continue
    command    = "aws ssm send-command --region ${var.region} --instance-ids ${aws_instance.app.id} --document-name AWS-RunShellScript --comment \"deploy ${var.app_name} ${local.build_tag}\" --parameters \"commands=systemctl restart ${var.app_name}.service\" --query Command.CommandId --output text"
  }
}
