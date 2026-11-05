const BG_HELP = {
  auto: "Tries white, black, grey and the image's average color, and keeps whichever matches best.",
  custom: "Transparent pixels are counted as this color when matching.",
  cell: "Each tile sits on its cell's color, and only opaque pixels are matched.",
};

export default function SettingsPanel({ settings, onChange, grid, autoBg }) {
  const s = settings;
  const num = (key) => (e) => onChange(key, +e.target.value);
  const bgHelp = s.bgMode === "auto" && autoBg
    ? `Using ${autoBg}, the background that matched this image best.`
    : BG_HELP[s.bgMode];

  return (
    <section className="step">
      <h2><span className="n">3</span>Settings</h2>

      <div className="field">
        <label htmlFor="cols">Tiles across</label><output>{s.cols}</output>
        <input type="range" id="cols" min="16" max="320" step="1" value={s.cols} onChange={num("cols")} />
      </div>

      <div className="field">
        <label htmlFor="tileSize">Tile size in output</label><output>{s.tileSize} px</output>
        <input type="range" id="tileSize" min="8" max="128" step="1" value={s.tileSize} onChange={num("tileSize")} />
      </div>

      <div className="field">
        <label htmlFor="detail">Match detail</label>
        <select id="detail" value={s.detail} onChange={num("detail")}>
          <option value="1">1×1: average color only</option>
          <option value="2">2×2: match light and dark halves</option>
          <option value="3">3×3: finest, slowest</option>
        </select>
        <p className="help">Compares a grid of colors inside each cell, so tiles follow edges and shading.</p>
      </div>

      <div className="field">
        <label htmlFor="metric">Color matching</label>
        <select id="metric" value={s.metric} onChange={(e) => onChange("metric", e.target.value)}>
          <option value="lab">Perceptual (CIELAB distance)</option>
          <option value="rgb">Plain RGB distance</option>
        </select>
      </div>

      <div className="field">
        <label htmlFor="bgMode">Behind transparent pixels</label>
        <div className="bgrow">
          <select id="bgMode" value={s.bgMode} onChange={(e) => onChange("bgMode", e.target.value)}>
            <option value="auto">Best fit for this image</option>
            <option value="custom">Solid color</option>
            <option value="cell">Target's color for that cell</option>
          </select>
          <input type="color" id="bgColor" aria-label="Background color" hidden={s.bgMode !== "custom"}
            value={s.bgColor} onChange={(e) => onChange("bgColor", e.target.value)} />
        </div>
        <p className="help">{bgHelp}</p>
      </div>

      <div className="field">
        <label htmlFor="variety">Variety</label><output>{s.variety === 1 ? "closest only" : `top ${s.variety}`}</output>
        <input type="range" id="variety" min="1" max="8" step="1" value={s.variety} onChange={num("variety")} />
        <p className="help">1 always uses the closest tile. Higher picks at random among the N closest.</p>
      </div>

      <div className="field">
        <label htmlFor="tint">Tint toward target</label><output>{s.tint}%</output>
        <input type="range" id="tint" min="0" max="70" step="1" value={s.tint} onChange={num("tint")} />
      </div>

      <label className="check">
        <input type="checkbox" id="avoidRepeats" checked={s.avoidRepeats} onChange={(e) => onChange("avoidRepeats", e.target.checked)} />
        Avoid repeating a tile next to itself
      </label>
      <label className="check">
        <input type="checkbox" id="pixelArt" checked={s.pixelArt} onChange={(e) => onChange("pixelArt", e.target.checked)} />
        Sharp pixel-art scaling
      </label>

      <p className="meta summary">
        Grid <b>{grid.cols} × {grid.rows}</b> = {(grid.cols * grid.rows).toLocaleString()} tiles<br />
        Output <b>{(grid.cols * grid.ts).toLocaleString()} × {(grid.rows * grid.ts).toLocaleString()} px</b>
        {grid.capped && <><br />Tile size reduced to {grid.ts} px to stay within browser canvas limits.</>}
      </p>
    </section>
  );
}
