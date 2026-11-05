import { Mockup, WORKFLOW, WorkflowArt, useDemoMosaic } from "./Showcase.jsx";

const PRODUCTS = [
  { id: "frame", name: "Framed print", note: "Wall art at poster size" },
  { id: "canvas", name: "Gallery canvas", note: "Wrapped and ready to hang" },
  { id: "puzzle", name: "Jigsaw puzzle", note: "Every piece is a photo" },
  { id: "mug", name: "Mug", note: "A gift that gets used daily" },
  { id: "tee", name: "T-shirt", note: "For reunions and teams" },
  { id: "cards", name: "Cards", note: "Invitations and thank-yous" },
];

const USES = [
  { title: "Keep it", body: "Turn a year of family photos into a single print that hangs on the wall." },
  { title: "Gift it", body: "Wedding, graduation, retirement: a picture made from all the moments that led there." },
  { title: "Sell it", body: "Design mosaic products for your shop, your team or your fans, and offer them to customers." },
];

export default function Landing({ onStart, onSignIn, signedIn, onLibrary }) {
  const demo = useDemoMosaic();
  const src = demo?.mosaic;

  return (
    <main className="landing">
      <section className="hero wrap">
        <div className="hero-copy">
          <p className="eyebrow">Photo mosaics, made for printing</p>
          <h2>Turn your photos into one big picture, then print it on anything.</h2>
          <p className="lede">
            Pick a photo, fill it with hundreds of your own smaller pictures, and take the finished mosaic
            to prints, canvas, puzzles, mugs and more. Keep it, gift it or sell it.
          </p>
          <div className="cta-row">
            <button className="btn primary big" type="button" onClick={onStart}>Start your mosaic</button>
            {signedIn
              ? <button className="btn big" type="button" onClick={onLibrary}>My library</button>
              : onSignIn && <button className="btn big" type="button" onClick={onSignIn}>Sign in</button>}
          </div>
          <p className="fine">Free to try, no account needed. Your photos stay in your browser until you choose to save them.</p>
        </div>
        <div className="hero-art">
          <Mockup kind="frame" src={src} />
        </div>
      </section>

      <section className="band">
        <div className="wrap">
          <h2 className="section-title">How it works</h2>
          <ol className="steps">
            {WORKFLOW.map((s) => (
              <li key={s.n} className="how">
                <div className="how-art"><WorkflowArt step={s.n} demo={demo} /></div>
                <h3><span className="n">{s.n}</span>{s.title}</h3>
                <p>{s.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="wrap products-sec">
        <h2 className="section-title">Make it into something</h2>
        <p className="section-lede">One mosaic, many products. The studio exports at full resolution, so it holds up at print sizes.</p>
        <ul className="products">
          {PRODUCTS.map((p) => (
            <li key={p.id} className="product">
              <div className="product-art"><Mockup kind={p.id} src={src} /></div>
              <b>{p.name}</b>
              <span>{p.note}</span>
            </li>
          ))}
        </ul>
        <p className="soon">
          Ordering products right here is coming soon. Today you can download a print-ready PNG of your
          mosaic and take it to any print shop or print-on-demand service.
        </p>
      </section>

      <section className="band">
        <div className="wrap">
          <h2 className="section-title">Yours to keep, give or sell</h2>
          <ul className="uses">
            {USES.map((u) => (
              <li key={u.title}><h3>{u.title}</h3><p>{u.body}</p></li>
            ))}
          </ul>
          <p className="fine">Selling? Use photos you took yourself or have permission to use.</p>
        </div>
      </section>

      <section className="wrap closer">
        <h2>Ready to make yours?</h2>
        <p>It takes a minute to see your first mosaic.</p>
        <button className="btn primary big" type="button" onClick={onStart}>Start your mosaic</button>
      </section>
    </main>
  );
}
