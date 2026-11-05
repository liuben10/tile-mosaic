import { useEffect, useState } from "react";
import { buildMosaic } from "../mosaic/render.js";
import { makeSampleTarget, makeSampleTiles } from "../mosaic/sample.js";

// Pictures shared by the front page and the sign-in dialog: a real mosaic built from
// the sample data, and product mockups that wear it.

const DEMO_SETTINGS = {
  cols: 56, tileSize: 12, detail: 2, metric: "lab", bgMode: "auto", bgColor: "#ffffff",
  variety: 1, tint: 0, avoidRepeats: true, pixelArt: true,
};

let demoPromise = null; // built once per page load, whoever asks first

function buildDemo() {
  demoPromise ??= (async () => {
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

// the three-step workflow, as pictures with a line each
export const WORKFLOW = [
  { n: 1, title: "Come with a folder of photos", body: "One photo for the big picture, plus a folder of small ones to build it from." },
  { n: 2, title: "Generate your mosaic", body: "Each patch of the big picture becomes the small photo whose colors match it best." },
  { n: 3, title: "Create products", body: "Put the finished mosaic on prints, canvas, puzzles, mugs and more." },
];

export function WorkflowArt({ step, demo }) {
  if (step === 1) {
    return (
      <div className="pair">
        {demo ? <img src={demo.photo} alt="A sunset photo used as the main picture" /> : <div className="ph" />}
        <div className="mini-tiles" aria-hidden="true">{Array.from({ length: 9 }, (_, i) => <span key={i} style={{ "--h": (i * 47) % 360 }} />)}</div>
      </div>
    );
  }
  if (step === 2) return demo ? <img className="pix" src={demo.mosaic} alt="The same sunset rebuilt from small images" /> : <div className="ph" />;
  return (
    <div className="trio">
      <Mockup kind="mug" src={demo?.mosaic} />
      <Mockup kind="puzzle" src={demo?.mosaic} />
    </div>
  );
}

// compact version for under the sign-in form
export function WorkflowStrip() {
  const demo = useDemoMosaic();
  return (
    <ol className="flow-strip" aria-label="How Tile Mosaic works">
      {WORKFLOW.map((s) => (
        <li key={s.n}>
          <div className="how-art"><WorkflowArt step={s.n} demo={demo} /></div>
          <b><span className="n">{s.n}</span>{s.title}</b>
        </li>
      ))}
    </ol>
  );
}
