import AuthForm from "./AuthForm.jsx";
import { Mockup, WorkflowArt, useDemoMosaic } from "./Showcase.jsx";

// What a visitor who isn't logged in sees: the log-in box first, then the workflow in
// three panels that alternate picture and banner.
const PANELS = [
  { n: 1, title: "Take photos", body: "Come prepared with a folder of photos: family snapshots, pets, trips, team headshots. Pick one more to be the big picture." },
  { n: 2, title: "Create Mosaics", body: "Generate a mosaic: every patch of the big picture is rebuilt from the photo in your folder whose colors match it best." },
  { n: 3, title: "Make Products!", body: "Put your mosaic on prints, canvas, puzzles, mugs and more, to keep, gift or sell. Ordering here is coming soon; for now, download a print-ready PNG." },
];

function ProductsArt({ src }) {
  return (
    <div className="panel-products">
      <Mockup kind="frame" src={src} />
      <Mockup kind="mug" src={src} />
      <Mockup kind="tee" src={src} />
    </div>
  );
}

export default function Landing({ onStart, onSignedIn }) {
  const demo = useDemoMosaic();

  return (
    <main className="landing">
      <section className="wrap gate">
        <div className="gate-copy">
          <p className="eyebrow">Photo mosaics, made for printing</p>
          <h2>Turn your photos into one big picture, then put it on anything.</h2>
        </div>
        <div className="gate-box">
          <AuthForm onDone={onSignedIn} heading={false} />
        </div>
        <button className="link gate-skip" type="button" onClick={onStart}>Or try the studio without an account</button>
      </section>

      <section className="wrap panels" aria-label="How it works">
        {PANELS.map((p) => (
          <article key={p.n} className={p.n % 2 ? "panel-row" : "panel-row flip"}>
            <div className="panel-art">
              {p.n === 3 ? <ProductsArt src={demo?.mosaic} /> : <WorkflowArt step={p.n} demo={demo} />}
            </div>
            <div className="panel-banner">
              <span className="panel-n">{p.n}</span>
              <h3>{p.title}</h3>
              <p>{p.body}</p>
            </div>
          </article>
        ))}
      </section>
    </main>
  );
}
