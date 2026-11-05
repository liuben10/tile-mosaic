import { useEffect, useState } from "react";
import { buildMosaic } from "../mosaic/render.js";
import { makeSampleTarget, makeSampleTiles } from "../mosaic/sample.js";

// Pictures for the front page: a real mosaic built from
// the sample data, and product mockups that wear it.

const DEMO_SETTINGS = {
  cols: 56, tileSize: 12, detail: 2, metric: "lab", bgMode: "auto", bgColor: "#ffffff",
  variety: 1, tint: 0, avoidRepeats: true, pixelArt: true,
};

let demoPromise = null; // built once per page load, whoever asks first

// after the page has painted, so the log-in box never waits on the demo
const idle = () => new Promise((r) => (window.requestIdleCallback ? requestIdleCallback(r, { timeout: 800 }) : setTimeout(r, 200)));

function buildDemo() {
  demoPromise ??= (async () => {
    await idle();
    const target = makeSampleTarget();
    const res = await buildMosaic({ tiles: makeSampleTiles(), target, settings: DEMO_SETTINGS, onProgress: () => {}, isCancelled: () => false });
    return { photo: target.previewUrl, mosaic: res.canvas.toDataURL("image/png") };
  })().catch(() => (demoPromise = null));
  return demoPromise;
}

// { photo, mosaic } data URLs, or null while building
export function useDemoMosaic() {
  const [demo, setDemo] = useState(null);
  useEffect(() => {
    let live = true;
    buildDemo().then((d) => { if (live && d) setDemo(d); });
    return () => { live = false; };
  }, []);
  return demo;
}

export function Mockup({ kind, src }) {
  const art = src ? { backgroundImage: `url(${src})` } : undefined;
  return (
    <div className={`mock mock-${kind}`} aria-hidden="true">
      <div className="art" style={art} />
      {kind === "cards" && <div className="art" style={art} />}
    </div>
  );
}

// pictures for the first two workflow steps: a photo plus small tiles, and the finished mosaic
export function WorkflowArt({ step, demo }) {
  if (step === 1) {
    return (
      <div className="pair">
        {demo ? <img src={demo.photo} alt="A sunset photo used as the main picture" /> : <div className="ph" />}
        <div className="mini-tiles" aria-hidden="true">{Array.from({ length: 9 }, (_, i) => <span key={i} style={{ "--h": (i * 47) % 360 }} />)}</div>
      </div>
    );
  }
  return demo ? <img className="pix" src={demo.mosaic} alt="The same sunset rebuilt from small images" /> : <div className="ph" />;
}
