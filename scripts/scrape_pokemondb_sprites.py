#!/usr/bin/env python3
"""Download Pokémon sprite PNGs from https://pokemondb.net/sprites into a local
folder, for use as tiles in Tile Mosaic.

Two modes:
  default   The index page only: one icon per Pokémon (~1,000 files, a few minutes).
  --deep    Also visit every Pokémon's own page (/sprites/<name>) and grab every
            PNG listed there: all games, front/back, normal/shiny (~100k+ files,
            many hours). Narrow it with --include.

Files keep the site's folder layout, e.g.
  test-tiles/scarlet-violet/icon/bulbasaur.png
  test-tiles/black-white/normal/bulbasaur.png
Point Tile Mosaic's "Choose folder" at test-tiles (or a subfolder of it).

Re-running skips files that already exist, so an interrupted run can be resumed.
Requests are spaced out to respect the site's robots.txt Crawl-delay.

Examples:
  python scripts/scrape_pokemondb_sprites.py
  python scripts/scrape_pokemondb_sprites.py --limit 20
  python scripts/scrape_pokemondb_sprites.py --deep --include "(black-white|emerald)/normal/"
"""

import argparse
import re
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path
from urllib.parse import urljoin, urlparse

SITE = "https://pokemondb.net"
INDEX_URL = SITE + "/sprites"
USER_AGENT = "tile-mosaic-sprite-fetcher/1.0 (personal test data)"
PAGE_DELAY = 2.0  # robots.txt: Crawl-delay: 2

PNG_RE = re.compile(r'(?:src|href|data-src)="(https://img\.pokemondb\.net/sprites/[^"]+?\.png)"')
POKEMON_LINK_RE = re.compile(r'href="(/sprites/[a-z0-9-]+)"')


def fetch(url, retries=3):
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    for attempt in range(1, retries + 1):
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                return resp.read()
        except urllib.error.HTTPError as e:
            if e.code == 404:
                raise
            err = e
        except (urllib.error.URLError, TimeoutError) as e:
            err = e
        if attempt < retries:
            time.sleep(2 * attempt)
    raise err


def unique(items):
    return list(dict.fromkeys(items))


def local_path(out_dir, url):
    # https://img.pokemondb.net/sprites/<game>/<variant>/<name>.png -> out_dir/<game>/<variant>/<name>.png
    rel = urlparse(url).path.removeprefix("/sprites/")
    path = (out_dir / rel).resolve()
    if out_dir.resolve() not in path.parents:
        raise ValueError(f"refusing to write outside {out_dir}: {url}")
    return path


def collect_urls(args):
    print(f"Reading {INDEX_URL}")
    index_html = fetch(INDEX_URL).decode("utf-8", "replace")
    pages = unique(POKEMON_LINK_RE.findall(index_html))
    if args.limit:
        pages = pages[: args.limit]

    if not args.deep:
        urls = unique(PNG_RE.findall(index_html))
        if args.limit:
            names = {p.rsplit("/", 1)[1] for p in pages}
            urls = [u for u in urls if Path(urlparse(u).path).stem in names]
        return urls

    urls = []
    for i, page in enumerate(pages, 1):
        time.sleep(PAGE_DELAY)
        try:
            html = fetch(urljoin(SITE, page)).decode("utf-8", "replace")
        except Exception as e:  # keep going; one bad page shouldn't stop the crawl
            print(f"  [{i}/{len(pages)}] {page}: failed ({e})", file=sys.stderr)
            continue
        found = PNG_RE.findall(html)
        urls.extend(found)
        print(f"  [{i}/{len(pages)}] {page}: {len(found)} PNGs")
    return unique(urls)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--out", type=Path, default=Path(__file__).resolve().parent.parent / "test-tiles",
                    help="output folder (default: test-tiles/ in the project)")
    ap.add_argument("--deep", action="store_true", help="visit every Pokémon's page and grab all of its sprites")
    ap.add_argument("--include", help="only download URLs matching this regex, e.g. '/normal/'")
    ap.add_argument("--limit", type=int, help="only the first N Pokémon (handy for a quick test)")
    ap.add_argument("--delay", type=float, default=0.3, help="seconds between image downloads (default 0.3)")
    args = ap.parse_args()

    urls = collect_urls(args)
    if not urls:
        sys.exit("No sprite URLs found. The page layout may have changed.")
    if args.include:
        pat = re.compile(args.include)
        urls = [u for u in urls if pat.search(u)]
        if not urls:
            sys.exit(f"None of the sprite URLs match --include {args.include!r}.")

    args.out.mkdir(parents=True, exist_ok=True)
    print(f"Downloading {len(urls)} PNGs into {args.out}")
    saved = skipped = failed = 0
    for i, url in enumerate(urls, 1):
        dest = local_path(args.out, url)
        if dest.exists():
            skipped += 1
            continue
        try:
            data = fetch(url)
        except Exception as e:
            failed += 1
            print(f"  failed: {url} ({e})", file=sys.stderr)
            continue
        dest.parent.mkdir(parents=True, exist_ok=True)
        tmp = dest.with_suffix(".part")
        tmp.write_bytes(data)
        tmp.replace(dest)
        saved += 1
        if saved % 50 == 0 or i == len(urls):
            print(f"  {i}/{len(urls)}")
        time.sleep(args.delay)

    print(f"Done: {saved} saved, {skipped} already present, {failed} failed -> {args.out}")


if __name__ == "__main__":
    main()
