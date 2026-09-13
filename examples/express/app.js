const express = require('express');
const { profiler } = require('@api-profiler/express');

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function createApp() {
  const app = express();
  const p = profiler();

  app.use(p);

  app.get('/users/:id', (req, res) => {
    res.json({ id: req.params.id });
  });

  app.get('/slow', async (req, res) => {
    await wait(200);
    res.send('slow');
  });

  app.get('/error', (req, res) => {
    res.status(500).send('failed');
  });

  const api = express.Router();
  api.get('/orders', (req, res) => {
    res.json([]);
  });
  app.use('/api', api);

  return { app, stats: () => p.stats() };
}

module.exports = { createApp };
