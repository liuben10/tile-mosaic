import express from "express";
import config from "./config.js";
import { connect } from "./db.js";
import { HttpError, publicAuthConfig, requireUser } from "./auth.js";
import tileSets from "./routes/tileSets.js";
import mosaics from "./routes/mosaics.js";
import session from "./session.js";

await connect();

const app = express();
app.disable("x-powered-by");
app.set("trust proxy", 1); // behind nginx
app.use(express.json({ limit: "2mb" })); // a 5000-tile manifest is well under this

app.get("/api/health", (_req, res) => res.json({ ok: true }));
app.get("/api/config", (_req, res) => res.json({ auth: publicAuthConfig() }));
app.use("/api/session", session); // "remember me" cookie; works while signed out

app.use("/api", requireUser);
app.get("/api/me", (req, res) => res.json(req.user));
app.use("/api/tile-sets", tileSets);
app.use("/api/mosaics", mosaics);

app.use("/api", (_req, _res) => { throw new HttpError(404, "Not found."); });

app.use((err, req, res, _next) => {
  const status = err.status || (err.type === "entity.too.large" ? 413 : 500);
  if (status >= 500) console.error(`${req.method} ${req.path}:`, err);
  res.status(status).json({ error: status >= 500 ? "Something went wrong on our side." : err.message });
});

app.listen(config.port, () => console.log(`tile-mosaic api listening on :${config.port} (auth: ${config.auth.mode})`));
