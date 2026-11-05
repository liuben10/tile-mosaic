import { useEffect, useMemo, useRef } from "react";
import DropZone from "./DropZone.jsx";
import { hueOf } from "../mosaic/color.js";
import { tileColor } from "../mosaic/tiles.js";

const THUMBS = 40;

// onBuild(files?) opens the tile set builder, with any dropped files already added
export default function TilesPanel({ tiles, source, note, status, bg, cellMode, onBuild, account }) {
  const n = tiles.length;
  const thumbs = useMemo(() => {
    const step = Math.max(1, Math.floor(n / THUMBS)), out = [];
    for (let i = 0; i < n && out.length < THUMBS; i += step) out.push(tiles[i]);
    return out;
  }, [tiles, n]);

  return (
    <section className="step">
      <h2><span className="n">1</span>Tiles <span className="tag">{{ sample: "Sample", yours: "Yours", library: "Library" }[source]}</span></h2>
      <DropZone onFiles={(files) => onBuild(files)}>
        <span className="lead">Pick the photos your mosaic is made of: add many at once, review them, remove any.</span>
        <button className="btn primary" type="button" onClick={() => onBuild()}>
          {source === "sample" ? "Build tile set" : "Edit tile set"}
        </button>
        <span>or drop images here</span>
      </DropZone>
      <p className="meta">
        {status ?? (
          <>
            <b>{n.toLocaleString()}</b> tile{n === 1 ? "" : "s"} ready
            {note && ` · ${note}`}
            {source === "sample" && " · generated sprites"}
          </>
        )}
      </p>
      {account && source !== "sample" && (
        <div className="save-row">
          {account.saved ? <span className="meta">In your library as <b>{account.name}</b></span>
            : account.progress ? <span className="meta">{account.progress}</span>
            : <span className="meta">Keep <b>{account.name}</b> for next time</span>}
          {!account.saved && (
            <button className="btn" type="button" disabled={!account.canSave} onClick={account.onSave}>Save to library</button>
          )}
        </div>
      )}
      <span className="strip-label">Colors available, by hue</span>
      <PaletteStrip tiles={tiles} bg={bg} cellMode={cellMode} />
      <div className="thumbs">
        {thumbs.map((t) => <TileThumb key={t.name} tile={t} />)}
      </div>
    </section>
  );
}

// one pixel column per tile colour, sorted by hue
function PaletteStrip({ tiles, bg, cellMode }) {
  const ref = useRef(null);
  useEffect(() => {
    const cv = ref.current, x = cv.getContext("2d");
    const cols = tiles.map((t) => tileColor(t, bg, cellMode)).sort((a, b) => hueOf(...a) - hueOf(...b));
    cv.width = Math.max(1, Math.min(cols.length, 320)); cv.height = 1;
    for (let i = 0; i < cv.width && cols.length; i++) {
      const c = cols[Math.floor(i * cols.length / cv.width)];
      x.fillStyle = `rgb(${c[0]},${c[1]},${c[2]})`; x.fillRect(i, 0, 1, 1);
    }
  }, [tiles, bg, cellMode]);
  return <canvas id="paletteStrip" ref={ref} width="320" height="1" />;
}

function TileThumb({ tile }) {
  const ref = useRef(null);
  useEffect(() => {
    const x = ref.current.getContext("2d"), art = tile.art;
    x.clearRect(0, 0, 32, 32);
    x.imageSmoothingEnabled = art.width > 32; x.imageSmoothingQuality = "high";
    x.drawImage(art, 0, 0, 32, 32);
  }, [tile]);
  return <canvas ref={ref} width="32" height="32" title={tile.name} />;
}
