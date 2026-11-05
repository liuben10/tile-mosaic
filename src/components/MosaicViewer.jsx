import { useCallback, useEffect, useRef, useState } from "react";

const dpr = () => window.devicePixelRatio || 1;

// Zoomable, draggable view of the finished mosaic canvas.
// Scale is CSS px per image px; "1:1" means one image pixel per physical screen pixel.
export default function MosaicViewer({ canvas, progress, canSave, saving, onSave }) {
  const viewerRef = useRef(null), innerRef = useRef(null);
  const scaleRef = useRef(1), shownRef = useRef(false), dragRef = useRef(null);
  const [zoom, setZoom] = useState({ slider: 0, label: "—" });

  const bounds = useCallback(() => {
    const v = viewerRef.current, vw = v.clientWidth - 24, vh = v.clientHeight - 24;
    const fit = Math.min(vw / canvas.width, vh / canvas.height);
    return { min: Math.min(fit, 1 / dpr()), max: Math.max(8 / dpr(), fit), fit };
  }, [canvas]);

  // zoom to `sc`, keeping the image point under (cx, cy) in the viewer fixed
  const applyScale = useCallback((sc, cx, cy) => {
    if (!canvas) return;
    const v = viewerRef.current, b = bounds(), old = scaleRef.current;
    sc = Math.min(b.max, Math.max(b.min, sc));
    if (cx === undefined) { cx = v.clientWidth / 2; cy = v.clientHeight / 2; }
    const ux = (v.scrollLeft + cx - canvas.offsetLeft) / old, uy = (v.scrollTop + cy - canvas.offsetTop) / old;
    scaleRef.current = sc;
    canvas.style.width = `${canvas.width * sc}px`; canvas.style.height = `${canvas.height * sc}px`;
    const z = sc * dpr();
    canvas.style.imageRendering = z >= 0.999 ? "pixelated" : "auto";
    v.scrollLeft = ux * sc + canvas.offsetLeft - cx; v.scrollTop = uy * sc + canvas.offsetTop - cy;
    setZoom({
      slider: Math.round(1000 * Math.log(sc / b.min) / Math.log(b.max / b.min || 1)) || 0,
      label: z >= 0.999 ? `${z.toFixed(z < 10 ? 1 : 0)}×` : `${Math.round(z * 100)}%`,
    });
  }, [canvas, bounds]);

  const fit = useCallback(() => { if (canvas) applyScale(bounds().fit); }, [canvas, applyScale, bounds]);

  // show each new build; fit the first one, keep the current zoom after that
  useEffect(() => {
    if (!canvas) return;
    const sc = shownRef.current ? scaleRef.current : bounds().fit;
    canvas.style.width = `${canvas.width * sc}px`; canvas.style.height = `${canvas.height * sc}px`;
    innerRef.current.replaceChildren(canvas);
    shownRef.current = true;
    applyScale(sc);
  }, [canvas]); // eslint-disable-line react-hooks/exhaustive-deps

  // wheel zoom needs a non-passive listener so it can stop the page scrolling
  useEffect(() => {
    const v = viewerRef.current;
    const onWheel = (e) => {
      if (!canvas) return;
      e.preventDefault();
      const r = v.getBoundingClientRect();
      applyScale(scaleRef.current * Math.exp(-e.deltaY * (e.deltaMode ? 0.05 : 0.0018)), e.clientX - r.left, e.clientY - r.top);
    };
    const onResize = () => applyScale(scaleRef.current);
    v.addEventListener("wheel", onWheel, { passive: false });
    window.addEventListener("resize", onResize);
    return () => { v.removeEventListener("wheel", onWheel); window.removeEventListener("resize", onResize); };
  }, [canvas, applyScale]);

  const at = (e) => { const r = viewerRef.current.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  const endDrag = () => { dragRef.current = null; viewerRef.current.classList.remove("dragging"); };

  return (
    <>
      <div className="toolbar">
        <div className="zoom">
          <button className="btn" type="button" onClick={fit}>Fit</button>
          <button className="btn" type="button" onClick={() => applyScale(1 / dpr())}>1:1</button>
          <input type="range" min="0" max="1000" aria-label="Zoom" value={zoom.slider}
            onChange={(e) => { const b = bounds(); applyScale(b.min * (b.max / b.min) ** (e.target.value / 1000)); }} />
          <span className="val">{zoom.label}</span>
        </div>
        <button className="btn primary" type="button" disabled={!canSave || saving} onClick={onSave}>Save PNG</button>
      </div>
      <div
        className="viewer"
        ref={viewerRef}
        onDoubleClick={(e) => applyScale(scaleRef.current * 2.5, ...at(e))}
        onPointerDown={(e) => {
          if (e.pointerType === "touch") return;
          const v = viewerRef.current;
          dragRef.current = { x: e.clientX, y: e.clientY, l: v.scrollLeft, t: v.scrollTop };
          v.setPointerCapture(e.pointerId); v.classList.add("dragging");
        }}
        onPointerMove={(e) => {
          const d = dragRef.current, v = viewerRef.current;
          if (!d) return;
          v.scrollLeft = d.l - (e.clientX - d.x); v.scrollTop = d.t - (e.clientY - d.y);
        }}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        <div className="progress"><div className="bar" style={{ width: `${Math.round(progress * 100)}%` }} /></div>
        <div className="inner" ref={innerRef} />
      </div>
    </>
  );
}
