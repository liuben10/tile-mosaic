import { useEffect, useMemo, useRef } from "react";
import DropZone from "./DropZone.jsx";
import { hueOf } from "../mosaic/color.js";
import { tileColor } from "../mosaic/tiles.js";

const THUMBS = 40;

export default function TilesPanel({ tiles, source, note, status, bg, cellMode, onFiles }) {
  const pick = (e) => { onFiles([...e.target.files]); e.target.value = ""; };
  const n = tiles.length;
  const thumbs = useMemo(() => {
    const step = Math.max(1, Math.floor(n / THUMBS)), out = [];
    for (let i = 0; i < n && out.length < THUMBS; i += step) out.push(tiles[i]);
    return out;
  }, [tiles, n]);

  return (
    <section className="step">
      <h2><span className="n">1</span>Tiles <span className="tag">{source === "sample" ? "Sample" : "Yours"}</span></h2>
      <DropZone onFiles={onFiles}>
        <span className="lead">Drop a folder of PNGs here, or pick one.</span>
        <label className="btn primary" htmlFor="tileDir">Choose folder</label>
        <label className="btn" htmlFor="tileFiles">Choose files</label>
        <input type="file" id="tileDir" webkitdirectory="" directory="" multiple hidden onChange={pick} />
        <input type="file" id="tileFiles" multiple accept="image/*" hidden onChange={pick} />
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
