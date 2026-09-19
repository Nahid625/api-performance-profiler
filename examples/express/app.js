const express = require("express");
const { profiler } = require("@api-profiler/express");

const DEMO_TOKEN = "demo-secret-token-1234";

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function createApp(options = {}) {
  const app = express();
  const p = profiler(options);

  app.use(p);
  app.use(express.json());

  app.get("/users/:id", (req, res) => {
    res.json({ id: req.params.id });
  });

  app.get("/slow", async (req, res) => {
    await wait(200);
    res.send("slow");
  });
  app.get("/hallow", async (req, res) => {
    res.send("hallow");
  });

  app.get("/error", (req, res) => {
    res.status(500).send("failed");
  });

  app.post("/login", (req, res) => {
    if (req.headers.authorization !== `Bearer ${DEMO_TOKEN}`) {
      res.status(401).json({ error: "bad token" });
      return;
    }
    // Handlers often strip secrets; the recording still holds what the client sent.
    const body = req.body ?? {};
    delete body.password;
    res.json({ user: body.email ?? null });
  });

  const api = express.Router();
  api.get("/orders", (req, res) => {
    res.json([]);
  });
  app.use("/api", api);

  return { app, profiler: p };
}

module.exports = { createApp, DEMO_TOKEN };
