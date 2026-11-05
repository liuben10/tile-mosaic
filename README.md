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
