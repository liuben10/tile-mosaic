import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import DropZone from "./DropZone.jsx";
import { rgbToHex } from "../mosaic/color.js";
import { coverage } from "../mosaic/coverage.js";
import { isImage, makeTile, tileColor } from "../mosaic/tiles.js";

const MAX_TILES = 5000; // the library's limit per set (api/src/config.js)
const fileKey = (f) => `${f.webkitRelativePath || f.name}|${f.size}|${f.lastModified}`;

// Read one image into a tile; { tile } or { problem }.
async function readOne(file) {
  try {
    const bmp = await createImageBitmap(file);
    const tile = makeTile(file.webkitRelativePath || file.name, bmp, bmp.width, bmp.height);
    bmp.close();
    if (!tile || tile.cov < 0.03) return { problem: "Blank, won't be used" };
    return { tile };
  } catch {
    return { problem: "Couldn't read this image" };
  }
}

// A large dialog for putting a tile set together: add images (several at once, a whole
// folder, or by dropping them), remove any, and watch how well they cover the picture.
//   seed:   { name, files } to start from (the current set, or files dropped on the studio)
//   onUse:  ({ name, files, tiles }) puts the set in the studio
//   onSave: ({ name, files, tiles }, progress) saves to the library, then puts it in the studio
export default function TileSetBuilder({ open, seed, target, bg, cellMode, metric, canSave, signInHint, onUse, onSave, onClose }) {
  const ref = useRef(null);
  const [items, setItemsState] = useState([]); // { key, file, url, reading?, tile?, problem? }, newest first
  const itemsRef = useRef([]);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(null); // progress text while saving
  const [error, setError] = useState(null);
  const queue = useRef(Promise.resolve());
  const generation = useRef(0); // bumps on reset, so reads from a cleared set are dropped

  // every change goes through here, so the ref is always current for the next one
  const commit = (next) => { itemsRef.current = next; setItemsState(next); };

  // open / close the native dialog, starting from the seed each time
  useEffect(() => {
    const d = ref.current;
    if (open && !d.open) {
      reset();
      setName(seed?.name || "");
      if (seed?.files?.length) add(seed.files);
      d.showModal();
    }
    if (!open && d.open) { d.close(); reset(); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  useEffect(() => () => reset(), []); // eslint-disable-line react-hooks/exhaustive-deps

  function reset() {
    generation.current++;
    for (const i of itemsRef.current) URL.revokeObjectURL(i.url);
    commit([]); setSaving(null); setError(null);
  }

  // add files, skipping non-images and ones already in the set; read them one at a time
  const add = useCallback((files) => {
    setError(null);
    const cur = itemsRef.current, have = new Set(cur.map((i) => i.key)), fresh = [];
    let over = 0;
    for (const f of files) {
      if (!isImage(f)) continue;
      const key = fileKey(f);
      if (have.has(key)) continue;
      if (cur.length + fresh.length >= MAX_TILES) { over++; continue; }
      have.add(key);
      fresh.push({ key, file: f, url: URL.createObjectURL(f), reading: true });
    }
    if (over) setError(`A tile set can hold up to ${MAX_TILES.toLocaleString()} images; ${over.toLocaleString()} were left out.`);
    if (!fresh.length) return;
    commit([...fresh.slice().reverse(), ...cur]);
    const gen = generation.current;
    for (const x of fresh) {
      queue.current = queue.current.then(async () => {
        if (gen !== generation.current || !itemsRef.current.some((i) => i.key === x.key)) return; // removed meanwhile
        const res = await readOne(x.file);
        if (gen !== generation.current) return;
        commit(itemsRef.current.map((i) => (i.key === x.key ? { ...i, ...res, reading: false } : i)));
      });
    }
  }, []);

  const remove = (key) => {
    const gone = itemsRef.current.find((i) => i.key === key);
    if (gone) URL.revokeObjectURL(gone.url);
    commit(itemsRef.current.filter((i) => i.key !== key));
  };
  const clearAll = () => reset();

  const usable = useMemo(() => items.filter((i) => i.tile), [items]);
  const reading = items.some((i) => i.reading);
  const problems = items.filter((i) => i.problem).length;

  // closest-color preview, recomputed shortly after the tiles stop changing
  const [cov, setCov] = useState(null);
  const canvas = useRef(null);
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => setCov(coverage({ target, tiles: usable.map((i) => i.tile), bg, cellMode, metric })), 250);
    return () => clearTimeout(t);
  }, [open, usable, target, bg, cellMode, metric]);
  useEffect(() => {
    const cv = canvas.current;
    if (!cv || !cov) return;
    cv.width = cov.cols; cv.height = cov.rows;
    cv.getContext("2d").putImageData(new ImageData(cov.pixels, cov.cols, cov.rows), 0, 0);
  }, [cov]);

  const payload = () => ({ name: name.trim() || "My tile set", files: usable.map((i) => i.file), tiles: usable.map((i) => i.tile) });
  const ready = usable.length > 0 && !reading && !saving;

  async function save() {
    setError(null);
    try {
      setSaving("Preparing…");
      await onSave(payload(), setSaving);
    } catch (e) {
      setError(`Couldn't save the tile set: ${e.message}`);
    } finally {
      setSaving(null);
    }
  }

  const pick = (e) => { add([...e.target.files]); e.target.value = ""; };

  return (
    <dialog ref={ref} className="dialog builder" onClose={onClose} onCancel={(e) => { if (saving) e.preventDefault(); else onClose(); }} aria-label="Build a tile set">
      <header className="builder-head">
        <div className="builder-title">
          <h2>Build a tile set</h2>
          <p>Add the photos your mosaic will be made of. Remove any you don't want; the preview shows how well they cover your picture.</p>
        </div>
        <button type="button" className="btn ghost" onClick={onClose} disabled={!!saving} aria-label="Close">✕</button>
      </header>

      <div className="builder-body">
        <section className="builder-tiles">
          <DropZone onFiles={add}>
            <span className="lead">Drop images or a folder here, or choose them. You can pick many at once.</span>
            <label className="btn primary" htmlFor="builderFiles">Add images</label>
            <label className="btn" htmlFor="builderDir">Add a folder</label>
            <input type="file" id="builderFiles" multiple accept="image/png,image/jpeg,image/gif,image/webp,image/bmp" hidden onChange={pick} />
            <input type="file" id="builderDir" webkitdirectory="" directory="" multiple hidden onChange={pick} />
          </DropZone>

          <div className="builder-bar">
            <span className="meta">
              <b>{usable.length.toLocaleString()}</b> tile{usable.length === 1 ? "" : "s"}
              {reading && ` · reading ${items.filter((i) => i.reading).length.toLocaleString()}…`}
              {problems > 0 && ` · ${problems} can't be used`}
            </span>
            {items.length > 0 && <button type="button" className="link" onClick={clearAll} disabled={!!saving}>Remove all</button>}
          </div>

          {items.length === 0 ? (
            <p className="builder-empty">No images yet. Add PNGs, JPGs, GIFs or WebPs: sprites, icons, photos.</p>
          ) : (
            <ul className="builder-grid">
              {items.map((i) => <TileCard key={i.key} item={i} bg={bg} cellMode={cellMode} onRemove={() => remove(i.key)} disabled={!!saving} />)}
            </ul>
          )}
        </section>

        <aside className="builder-preview" aria-label="Color coverage preview">
          <h3>Closest colors</h3>
          <p className="meta">Your picture with every area painted in the average color of its closest tile.</p>
          <div className="preview-pair">
            <figure>
              <img src={target.previewUrl} alt="Your picture" />
              <figcaption>Picture</figcaption>
            </figure>
            <figure>
              {usable.length ? <canvas ref={canvas} aria-label="Picture in the closest tile colors" /> : <div className="ph" />}
              <figcaption>Closest tile colors</figcaption>
            </figure>
          </div>
          {cov?.avg != null && usable.length > 0 && (
            <>
              <div className="coverage-meter" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(cov.covered * 100)} aria-label="Picture covered by a close tile color">
                <span style={{ width: `${cov.covered * 100}%` }} />
              </div>
              <p className="meta"><b>{Math.round(cov.covered * 100)}%</b> of the picture has a close match · average difference {metric === "lab" ? "ΔE" : "RGB"} {cov.avg.toFixed(1)}</p>
              {cov.gaps.length > 0 ? (
                <div className="gaps">
                  <span className="strip-label">Colors still missing: add photos like these</span>
                  <ul>
                    {cov.gaps.map((g) => (
                      <li key={g.hex} title={`${g.hex} · ${Math.round(g.share * 100)}% of the picture`}>
                        <span className="swatch" style={{ background: g.hex }} />
                        <span className="meta">{Math.round(g.share * 100)}%</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : <p className="meta">Every part of the picture has a close tile color.</p>}
            </>
          )}
        </aside>
      </div>

      <footer className="builder-foot">
        <label className="input builder-name">
          <span>Tile set name</span>
          <input value={name} maxLength={120} placeholder="My tile set" onChange={(e) => setName(e.target.value)} disabled={!!saving} />
        </label>
        <div className="builder-actions">
          {error && <p className="msg err" role="status">{error}</p>}
          {saving && <p className="msg" role="status">{saving}</p>}
          {!canSave && signInHint && <p className="meta">{signInHint}</p>}
          <button type="button" className="btn" onClick={onClose} disabled={!!saving}>Cancel</button>
          <button type="button" className={canSave ? "btn" : "btn primary"} disabled={!ready} onClick={() => onUse(payload())}>Use these tiles</button>
          {canSave && <button type="button" className="btn primary" disabled={!ready} onClick={save}>{saving ? "Saving…" : "Save to library"}</button>}
        </div>
      </footer>
    </dialog>
  );
}

function TileCard({ item, bg, cellMode, onRemove, disabled }) {
  const c = item.tile ? tileColor(item.tile, bg, cellMode) : null;
  const hex = c ? rgbToHex(c) : null;
  const label = item.file.webkitRelativePath || item.file.name;
  return (
    <li className={item.problem ? "tcard bad" : "tcard"}>
      <div className="tcard-img"><img src={item.url} alt="" loading="lazy" /></div>
      <div className="tcard-info">
        <span className="tcard-name" title={label}>{item.file.name}</span>
        {item.reading ? <span className="meta">Reading…</span>
          : item.problem ? <span className="meta">{item.problem}</span>
          : <span className="tcard-color"><span className="swatch" style={{ background: hex }} />{hex}</span>}
      </div>
      <button type="button" className="tcard-x" onClick={onRemove} disabled={disabled} aria-label={`Remove ${item.file.name}`}>✕</button>
    </li>
  );
}
