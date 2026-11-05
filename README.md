# Tile Mosaic

Rebuild a target image out of a folder of small images. Each cell of the target is
replaced by the tile whose average color is closest (CIELAB or plain RGB distance).

Building a mosaic runs entirely in the browser (React + Vite). Signing in is optional:
it adds a library where people save tile sets and finished mosaics and come back to them.

- `src/App.jsx`: app state and the rebuild-on-change loop
- `src/components/`: the Tiles, Target image and Settings panels, the zoomable viewer,
  the sign-in dialog and the library
- `src/mosaic/`: plain JS with no React: tile trimming, color matching, rendering, sample data
- `src/account/`: Cognito sign-in, the authenticated API client, saving and loading library items
- `src/styles.css`: layout, colors and light/dark themes
- `api/`: the Node.js (Express) API for accounts and the library

Without the API (for example `dist/` on a static host) the app works as before and
the sign-in button is hidden.

## Accounts and the library

| What | Where |
| --- | --- |
| Sign-up, sign-in, email codes, password reset | Amazon Cognito user pool (the browser talks to Cognito directly) |
| Tile images and mosaic PNGs | Private S3 bucket, under `u/<user id>/` |
| Users, tile sets, mosaics (metadata) | RDS PostgreSQL |

Files never pass through the API: it hands the browser short-lived presigned S3 URLs
for each upload and download, and records the metadata. Every request is checked
against a Cognito ID token, and every query and S3 key is scoped to the caller's user
id, so one user can't see or touch another's files. Tiles are stored once per user by
content hash, so saving the same sprites in several sets doesn't store them twice.

Staying signed in depends on **Remember me next time** in the sign-in dialog:

- **Checked:** the API keeps the Cognito refresh token in an `HttpOnly`, `SameSite=Strict`
  cookie (`tm_session`, 30 days, scoped to `/api/session`). Page scripts can't read it; the
  page only ever holds the short-lived ID token, in memory. Sign out deletes the cookie and
  revokes the token.
- **Unchecked:** no cookie. The tokens stay in that tab's `sessionStorage`, so closing the
  tab signs you out.

Visitors who aren't signed in see the front page at `/`; signed-in (or remembered) users go
straight to the studio at `/studio`.
The API applies `api/migrations/*.sql` on startup.

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

### Local stack

`docker-compose.yml` runs the whole thing locally, with Postgres in place of RDS and
LocalStack in place of S3. Sign-in uses a dev mode there: any email signs you in with
no password, so you can try several users. (The API refuses dev mode in production.)

```bash
docker compose up --build   # site + API at http://localhost:8080
npm run dev                 # optional: hot reload at http://localhost:5173, proxies /api to the stack
```

## Docker

The `Dockerfile` builds the site with Node and serves `dist/` with nginx on port 80.

```bash
docker build -t tile-mosaic .
docker run --rm -p 8080:80 tile-mosaic   # http://localhost:8080
```

## Deploy to AWS (one EC2 instance)

`infra/terraform/` creates:

- a small VPC with one public subnet, and two private subnets for the database
- ECR repositories for the web and API images
- a `t3.micro` Amazon Linux 2023 instance with an Elastic IP
- a Cognito user pool, a private S3 bucket for media, and a `db.t4g.micro` RDS
  PostgreSQL database (private; only the instance can reach it, password kept in
  Secrets Manager by RDS)

The instance runs two containers under systemd: nginx on port 80 serving the site and
proxying `/api/` to the API container. It opens port 80 only, with no SSH.
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

User data is protected by default (`protect_data = true`): the database and user pool
have deletion protection and the media bucket can't be deleted while it holds files.
To tear everything down, set `protect_data = false`, run `terraform apply`, then
`terraform destroy`.

Rough monthly cost: instance and Elastic IP about $10-12, RDS about $13-15 (free tier
on new accounts), plus S3 storage. Cognito's built-in email sender is limited to about
50 emails a day; switch the user pool to SES before opening sign-ups widely.

The site is served over plain HTTP. Passwords go straight from the browser to Cognito
over HTTPS, but a plain-HTTP page could still be tampered with in transit, so add HTTPS
before real users sign up: put a domain on the Elastic IP and add TLS (for example a
load balancer with ACM, or Caddy on the instance), and add the new origin to
`extra_origins`.

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
