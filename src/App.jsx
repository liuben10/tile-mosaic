import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import TilesPanel from "./components/TilesPanel.jsx";
import TargetPanel from "./components/TargetPanel.jsx";
import SettingsPanel from "./components/SettingsPanel.jsx";
import MosaicViewer from "./components/MosaicViewer.jsx";
import AccountBar from "./components/AccountBar.jsx";
import AuthDialog from "./components/AuthDialog.jsx";
import Library from "./components/Library.jsx";
import Landing from "./components/Landing.jsx";
import TileSetBuilder from "./components/TileSetBuilder.jsx";
import { useAccount } from "./account/AccountContext.jsx";
import { loadTileSet, saveMosaic, saveTileSet } from "./account/library.js";
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

// Pages, by URL path. nginx and Vite serve index.html for every path, so these work as direct links.
const PATHS = { home: "/", studio: "/studio", library: "/library" };
const viewOf = (path) => Object.keys(PATHS).find((v) => PATHS[v] === (path.replace(/\/+$/, "") || "/")) ?? "home";

function useView() {
  const [view, set] = useState(() => viewOf(location.pathname));
  useEffect(() => {
    const onPop = () => set(viewOf(location.pathname));
    addEventListener("popstate", onPop);
    return () => removeEventListener("popstate", onPop);
  }, []);
  const go = useCallback((v, { replace = false } = {}) => {
    if (PATHS[v] !== location.pathname) history[replace ? "replaceState" : "pushState"](null, "", PATHS[v]);
    set(v);
    scrollTo(0, 0);
  }, []);
  return [view, go];
}

// a name for a set of tile files: the folder they came from, else today's date
function setName(files) {
  const dir = files.find((f) => f.webkitRelativePath)?.webkitRelativePath.split("/")[0];
  return dir || `Tiles ${new Date().toLocaleDateString()}`;
}

export default function App() {
  const acct = useAccount();
  // files/name/savedId are kept for "Save to library"; savedId is set once the set is in the library
  const [tiles, setTiles] = useState(() => ({ list: makeSampleTiles(), source: "sample", note: "", files: null, name: "", savedId: null }));
  const [tileStatus, setTileStatus] = useState(null);
  const [target, setTarget] = useState(makeSampleTarget);
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [result, setResult] = useState(null);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState({ msg: "" });
  const [saving, setSaving] = useState(false);
  const [view, setView] = useView();
  // the studio builds its first mosaic only once someone opens it, not on the front page
  const [started, setStarted] = useState(view !== "home");
  useEffect(() => { if (view !== "home") setStarted(true); }, [view]);

  // the front page is for visitors: once signed in (or remembered) you land in the studio,
  // and the library needs a sign-in
  useEffect(() => {
    if (!acct.ready) return;
    if (acct.user && view === "home") setView("studio", { replace: true });
    else if (!acct.user && view === "library") setView("home", { replace: true });
  }, [acct.ready, acct.user, view, setView]);
  const [authOpen, setAuthOpen] = useState(false);
  const [tileSave, setTileSave] = useState(null); // progress text while saving tiles to the library
  const [mosaicSave, setMosaicSave] = useState(null); // { busy } or { savedFor: canvas }
  const [libraryKey, setLibraryKey] = useState(0);
  const [builder, setBuilder] = useState(null); // { name, files } the tile set builder starts from, while open
  const buildId = useRef(0);

  const grid = useMemo(() => layout(settings, target), [settings, target]);
  const onSetting = useCallback((key, value) => setSettings((s) => ({ ...s, [key]: value })), []);

  // rebuild shortly after tiles, target or settings change; a newer build cancels an older one
  useEffect(() => {
    if (!started) return;
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
  }, [started, tiles.list, target, settings]); // only the tile images matter, not their library state

  async function handleTileFiles(files, saved = null) {
    const res = await readTiles(files, (done, total) => setTileStatus(`Reading tiles… ${done} / ${total}`));
    if (!res.total) return setTileStatus("No images found there. Pick a folder that contains PNG, JPG, GIF or WebP files.");
    if (!res.tiles.length) return setTileStatus("None of those images could be used as tiles (they were empty or unreadable).");
    const notes = [];
    if (res.empty) notes.push(`${res.empty} blank skipped`);
    if (res.failed) notes.push(`${res.failed} unreadable`);
    setTiles({
      list: res.tiles, source: saved ? "library" : "yours", note: notes.join(", "),
      files, name: saved?.name ?? setName(files), savedId: saved?.id ?? null,
    });
    setTileStatus(null);
  }

  // signed-out users are asked to sign in first; returns false if they aren't signed in yet
  const needUser = () => { if (acct.user) return true; setAuthOpen(true); return false; };

  // open the builder on the current set (unless it's the sample), plus any dropped files
  function openBuilder(extra = []) {
    const mine = tiles.source !== "sample" && tiles.files ? tiles.files : [];
    setBuilder({ name: tiles.source !== "sample" ? tiles.name : "", files: [...mine, ...extra] });
  }

  function applyBuiltTiles({ name, files, tiles: list }, savedId = null) {
    setTiles({ list, source: savedId ? "library" : "yours", note: "", files, name, savedId });
    setTileStatus(null);
    setBuilder(null);
  }

  async function saveBuiltTiles(set, progress) {
    const res = await saveTileSet(acct.api, set.name, set.files, progress);
    applyBuiltTiles(set, res.id);
    setStatus({ msg: `Saved “${set.name}” to your library (${res.tileCount.toLocaleString()} tiles, ${res.uploaded.toLocaleString()} new).` });
    setLibraryKey((k) => k + 1);
  }

  async function handleSaveTiles() {
    if (!needUser()) return;
    try {
      setTileSave("Preparing…");
      const res = await saveTileSet(acct.api, tiles.name, tiles.files, setTileSave);
      setTiles((t) => ({ ...t, savedId: res.id, source: "library" }));
      setStatus({ msg: `Saved “${tiles.name}” to your library (${res.tileCount.toLocaleString()} tiles, ${res.uploaded.toLocaleString()} new).` });
      setLibraryKey((k) => k + 1);
    } catch (e) {
      setStatus({ msg: `Couldn't save the tiles: ${e.message}`, err: true });
    } finally {
      setTileSave(null);
    }
  }

  async function handleUseTileSet(set) {
    const { files } = await loadTileSet(acct.api, set.id, setTileStatus);
    setView("studio");
    await handleTileFiles(files, { id: set.id, name: set.name });
  }

  async function handleSaveMosaic() {
    if (!needUser()) return;
    const canvas = result.canvas;
    setMosaicSave({ busy: true });
    try {
      setStatus({ msg: "Encoding PNG…" });
      const png = await new Promise((r) => canvas.toBlob(r, "image/png"));
      if (!png) throw new Error("The browser couldn't encode an image this large.");
      setStatus({ msg: `Uploading ${(png.size / 1048576).toFixed(1)} MB…` });
      const title = target.name.replace(/\.[^.]+$/, "") + " mosaic";
      await saveMosaic(acct.api, {
        canvas, png, title, targetName: target.name, tileSetId: tiles.savedId,
        settings: { ...settings, cols: result.cols, rows: result.rows, tiles: tiles.list.length },
      });
      setMosaicSave({ savedFor: canvas });
      setStatus({ msg: `Saved “${title}” to your library.` });
      setLibraryKey((k) => k + 1);
    } catch (e) {
      setMosaicSave(null);
      setStatus({ msg: `Couldn't save the mosaic: ${e.message}`, err: true });
    }
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
          <h1><button className="brand" type="button" onClick={() => setView("home")}>Tile Mosaic</button></h1>
          {view === "home" ? (
            <nav className="home-nav">
              {!acct.user && <button className="btn open-studio" type="button" onClick={() => setView("studio")}>Open the studio</button>}
              <AccountBar view={view} onView={setView} onSignIn={() => setAuthOpen(true)} hideSignIn />
            </nav>
          ) : <>
          <p>Rebuild a picture out of a folder of small images. Every cell of the target is replaced by the tile whose average color is closest. It all runs in your browser; nothing is uploaded unless you save it to your library.</p>
          <AccountBar view={view} onView={setView} onSignIn={() => setAuthOpen(true)} />
          </>}
        </div>
      </header>
      <AuthDialog open={authOpen} onClose={() => setAuthOpen(false)} />
      <TileSetBuilder
        open={!!builder} seed={builder} target={target} bg={bg} cellMode={settings.bgMode === "cell"} metric={settings.metric}
        canSave={!!acct.user} signInHint={acct.enabled ? "Log in to save tile sets to your library for future mosaics." : null}
        onUse={applyBuiltTiles} onSave={saveBuiltTiles} onClose={() => setBuilder(null)}
      />

      {view === "home" && (acct.user || acct.restoringRemembered) ? (
        // logged in, or checking this browser's "Remember me": the studio is about to open
        <main className="landing" aria-busy="true" />
      ) : view === "home" ? (
        <Landing onStart={() => setView("studio")} onSignedIn={() => setView("studio")} />
      ) : view === "library" && acct.user ? (
        <main className="wrap">
          <Library onUseTileSet={handleUseTileSet} refreshKey={libraryKey} />
        </main>
      ) : (
      <main className="wrap app">
        <aside className="panel">
          <TilesPanel
            tiles={tiles.list} source={tiles.source} note={tiles.note} status={tileStatus}
            bg={bg} cellMode={settings.bgMode === "cell"} onBuild={openBuilder}
            account={acct.enabled ? {
              canSave: tiles.source === "yours" && !!tiles.files && !tileSave,
              saved: !!tiles.savedId, progress: tileSave, name: tiles.name, onSave: handleSaveTiles,
            } : null}
          />
          <TargetPanel target={target} isSample={!!target.sample} onFile={handleTargetFile} />
          <SettingsPanel settings={settings} onChange={onSetting} grid={grid} autoBg={settings.bgMode === "auto" ? result?.bgHex : null} />
        </aside>

        <section className="stage">
          <MosaicViewer canvas={result?.canvas ?? null} progress={progress} canSave={!!result} saving={saving} onSave={handleSave}>
            {acct.enabled && (
              <button className="btn" type="button" disabled={!result || mosaicSave?.busy || mosaicSave?.savedFor === result?.canvas}
                onClick={handleSaveMosaic}>
                {mosaicSave?.busy ? "Saving…" : mosaicSave?.savedFor && mosaicSave.savedFor === result?.canvas ? "Saved ✓" : "Save to library"}
              </button>
            )}
          </MosaicViewer>
          <div className={status.err ? "status err" : "status"}>{status.msg}</div>
          <p className="hint">Scroll or use the slider to zoom. Drag to pan. Double-click to zoom in on a spot.</p>
        </section>
      </main>
      )}
    </>
  );
}
