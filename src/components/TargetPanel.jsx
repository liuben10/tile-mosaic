import DropZone from "./DropZone.jsx";
import { isImage } from "../mosaic/tiles.js";

export default function TargetPanel({ target, isSample, onFile }) {
  const pick = (e) => { if (e.target.files[0]) onFile(e.target.files[0]); e.target.value = ""; };
  return (
    <section className="step">
      <h2><span className="n">2</span>Target image <span className="tag">{isSample ? "Sample" : "Yours"}</span></h2>
      <DropZone onFiles={(fs) => { const f = fs.find(isImage); if (f) onFile(f); }}>
        <div className="target-row">
          <img id="targetPreview" src={target.previewUrl} alt="Target image preview" />
          <div className="target-actions">
            <span>Drop an image here, or</span>
            <label className="btn primary" htmlFor="targetFile">Choose image</label>
          </div>
        </div>
        <input type="file" id="targetFile" accept="image/*" hidden onChange={pick} />
      </DropZone>
      <p className="meta"><b>{target.name}</b> · {target.width} × {target.height} px</p>
    </section>
  );
}
