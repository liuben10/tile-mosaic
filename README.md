# Tile Mosaic

Rebuild a target image out of a folder of small images. Each cell of the target is
replaced by the tile whose average color is closest (CIELAB or plain RGB distance).

Everything runs in the browser. `index.html` is the whole app, with no build step
and no server-side code, so any static host works (GitHub Pages, Netlify,
Cloudflare Pages, S3, `python -m http.server`).

## Run locally

```bash
python -m http.server 8000
```

Then open http://localhost:8000.

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
