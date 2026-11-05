import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import TilesPanel from "./components/TilesPanel.jsx";
import TargetPanel from "./components/TargetPanel.jsx";
import SettingsPanel from "./components/SettingsPanel.jsx";
import MosaicViewer from "./components/MosaicViewer.jsx";
import { hexToRgb } from "./mosaic/color.js";
import { saveBlob } from "./mosaic/files.js";
import { buildMosaic, layout } from "./mosaic/render.js";
import { makeSampleTarget, makeSampleTiles } from "./mosaic/sample.js";
import { loadTargetFile } from "./mosaic/target.js";
import { readTiles } from "./mosaic/tiles.js";

const DEFAULT_SETTINGS = {
  cols: 80, tileSize: 32, detail: 2, metric: "lab",
  bgMode: "auto", bgColor: "#ffffff",
  variety: 1, tint: 0, avoidRepeats: true, pixelArt: true,
};
const BUILD_DELAY = 180; // ms to wait after the last change before rebuilding

export default function App() {
  const [tiles, setTiles] = useState(() => ({ list: makeSampleTiles(), source: "sample", note: "" }));
  const [tileStatus, setTileStatus] = useState(null);
  const [target, setTarget] = useState(makeSampleTarget);
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [result, setResult] = useState(null);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState({ msg: "" });
  const [saving, setSaving] = useState(false);
  const buildId = useRef(0);

  const grid = useMemo(() => layout(settings, target), [settings, target]);
  const onSetting = useCallback((key, value) => setSettings((s) => ({ ...s, [key]: value })), []);

  // rebuild shortly after tiles, target or settings change; a newer build cancels an older one
  useEffect(() => {
    const id = ++buildId.current;
    const timer = setTimeout(async () => {
      setProgress(0);
      setStatus({ msg: "Matching colors…" });
      try {
        const res = await buildMosaic({
          tiles: tiles.list, target, settings,
          onProgress: (f, row, rows) => { setProgress(f); setStatus({ msg: `Placing tiles… row ${row} of ${rows}` }); },
          isCancelled: () => id !== buildId.current,
        });
        if (!res || id !== buildId.current) return;
        setResult(res);
        setProgress(0);
        setStatus({
          msg: `${(res.cols * res.rows).toLocaleString()} tiles placed · avg color error ${settings.metric === "lab" ? "ΔE" : "RGB"} ${res.error.toFixed(1)} · ` +
            `${res.distinct.toLocaleString()} of ${tiles.list.length.toLocaleString()} distinct tiles used · ` +
            `${res.canvas.width.toLocaleString()} × ${res.canvas.height.toLocaleString()} px · ${res.ms} ms`,
        });
      } catch (e) {
        if (id === buildId.current) { setProgress(0); setStatus({ msg: e.message, err: true }); }
      }
    }, BUILD_DELAY);
    return () => clearTimeout(timer);
  }, [tiles, target, settings]);

  async function handleTileFiles(files) {
    const res = await readTiles(files, (done, total) => setTileStatus(`Reading tiles… ${done} / ${total}`));
    if (!res.total) return setTileStatus("No images found there. Pick a folder that contains PNG, JPG, GIF or WebP files.");
    if (!res.tiles.length) return setTileStatus("None of those images could be used as tiles (they were empty or unreadable).");
    const notes = [];
    if (res.empty) notes.push(`${res.empty} blank skipped`);
    if (res.failed) notes.push(`${res.failed} unreadable`);
    setTiles({ list: res.tiles, source: "yours", note: notes.join(", ") });
    setTileStatus(null);
  }

  async function handleTargetFile(file) {
    try {
      const next = await loadTargetFile(file);
      setTarget((prev) => {
        if (prev.previewUrl.startsWith("blob:")) URL.revokeObjectURL(prev.previewUrl);
        return next;
      });
    } catch {
      setStatus({ msg: `Couldn't read ${file.name} as an image. Try a PNG, JPG or WebP.`, err: true });
    }
  }

  async function handleSave() {
    setSaving(true);
    try {
      setStatus({ msg: "Encoding PNG…" });
      const blob = await new Promise((r) => result.canvas.toBlob(r, "image/png"));
      if (!blob) throw new Error("The browser couldn't encode an image this large.");
      const filename = target.name.replace(/\.[^.]+$/, "") + "-mosaic.png";
      await saveBlob(blob, filename);
      setStatus({ msg: `Saved ${filename}` });
    } catch (e) {
      if (e?.code === "declined") setStatus({ msg: "Save cancelled." });
      else setStatus({ msg: e?.message ? `Couldn't save: ${e.message}` : "Couldn't save the image.", err: true });
    } finally {
      setSaving(false);
    }
  }

  // the background tiles are composited over, for the palette strip
  const bgHex = settings.bgMode === "auto" ? (result?.bgHex ?? settings.bgColor) : settings.bgColor;
  const bg = useMemo(() => hexToRgb(bgHex), [bgHex]);

  return (
    <>
      <header className="top">
        <div className="wrap">
          <h1>Tile Mosaic</h1>
          <p>Rebuild a picture out of a folder of small images. Every cell of the target is replaced by the tile whose average color is closest. It all runs in your browser; nothing is uploaded anywhere.</p>
        </div>
      </header>

      <main className="wrap app">
        <aside className="panel">
          <TilesPanel
            tiles={tiles.list} source={tiles.source} note={tiles.note} status={tileStatus}
            bg={bg} cellMode={settings.bgMode === "cell"} onFiles={handleTileFiles}
          />
          <TargetPanel target={target} isSample={!!target.sample} onFile={handleTargetFile} />
          <SettingsPanel settings={settings} onChange={onSetting} grid={grid} autoBg={settings.bgMode === "auto" ? result?.bgHex : null} />
        </aside>

        <section className="stage">
          <MosaicViewer canvas={result?.canvas ?? null} progress={progress} canSave={!!result} saving={saving} onSave={handleSave} />
          <div className={status.err ? "status err" : "status"}>{status.msg}</div>
          <p className="hint">Scroll or use the slider to zoom. Drag to pan. Double-click to zoom in on a spot.</p>
        </section>
      </main>
    </>
  );
}
