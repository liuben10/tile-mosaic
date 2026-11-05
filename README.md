# Tile Mosaic

Rebuild a target image out of a folder of small images. Each cell of the target is
replaced by the tile whose average color is closest (CIELAB or plain RGB distance).

Everything runs in the browser. It's a React app built with Vite; the build is a
static `dist/` folder with no server-side code, so any static host works
(GitHub Pages, Netlify, Cloudflare Pages, S3).

- `src/App.jsx`: app state and the rebuild-on-change loop
- `src/components/`: the Tiles, Target image and Settings panels, and the zoomable viewer
- `src/mosaic/`: plain JS with no React: tile trimming, color matching, rendering, sample data
- `src/styles.css`: layout, colors and light/dark themes

## Run locally

Needs Node 18+.

```bash
npm install
npm run dev       # dev server with hot reload, at http://localhost:5173
npm run build     # production build into dist/
npm run preview   # serve dist/ locally to check the build
```

To host it, upload the contents of `dist/`. Asset paths are relative, so it also
works from a sub-path such as a GitHub Pages project site.

## Docker

The `Dockerfile` builds the site with Node and serves `dist/` with nginx on port 80.

```bash
docker build -t tile-mosaic .
docker run --rm -p 8080:80 tile-mosaic   # http://localhost:8080
```

## Deploy to AWS (one EC2 instance)

`infra/terraform/` creates:

- a small VPC with one public subnet
- an ECR repository for the image
- a `t3.micro` Amazon Linux 2023 instance with an Elastic IP

The instance runs the container under systemd and opens port 80 only, with no SSH.
For a shell, use Session Manager. Needs Terraform 1.5+, the AWS CLI with credentials
configured, and Docker. The IAM user running Terraform needs the permissions in
`infra/deployer-iam-policy.json` (or `AdministratorAccess`). It deploys to
`us-east-2` by default; change `region` in `terraform.tfvars` if your account
allows other regions.

```bash
terraform -chdir=infra/terraform init
terraform -chdir=infra/terraform apply   # creates everything, builds and deploys the app, prints the URL
```

`terraform apply` does the whole deploy: it builds the image with your local Docker,
pushes it to ECR and restarts the container on the instance. It hashes the app's
source files, so later applies rebuild only when something in `src/`, `index.html`,
the Dockerfile or the package files changed. Run `terraform apply` again for every
new version. On the first apply the instance may need a minute or two after
Terraform finishes; it retries every 30 seconds until it has pulled the image.

To manage images some other way, set `build_image = false` in `terraform.tfvars`.
`scripts/deploy.sh` still works on its own: it builds, pushes and restarts without
touching Terraform state. To get a shell on the instance:

```bash
aws ssm start-session --target "$(terraform -chdir=infra/terraform output -raw instance_id)"
```

`terraform destroy` removes everything, including the ECR repository and its images.

The site is served over plain HTTP. For HTTPS, put a domain on the Elastic IP and add
TLS, for example with a load balancer and ACM, or Caddy on the instance.

## Test tiles

`scripts/scrape_pokemondb_sprites.py` downloads Pokémon sprite PNGs from
https://pokemondb.net/sprites into `test-tiles/` (git-ignored). It needs Python 3.9+
and nothing else.

```bash
python scripts/scrape_pokemondb_sprites.py              # one icon per Pokémon (~1,000 files)
python scripts/scrape_pokemondb_sprites.py --limit 20   # quick test
python scripts/scrape_pokemondb_sprites.py --deep --include "black-white/normal/"
```

`--deep` visits every Pokémon's page and can fetch 100k+ sprites across all games;
use `--include` to pick the games/variants you want. The script waits between
requests per the site's robots.txt and skips files it already has, so you can stop
and resume it.

The sprites belong to Nintendo / Game Freak; keep them as local test data and don't
publish them with the site.
