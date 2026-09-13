const { createApp } = require('./app');
const { formatTable } = require('./table');

const port = Number(process.env.PORT) || 3000;
const { app, stats } = createApp();

app.listen(port, '127.0.0.1', () => {
  console.log(`Listening on http://127.0.0.1:${port}`);
  console.log('Try: /users/1  /slow  /error  /api/orders\n');
});

setInterval(() => {
  console.log(`\n${new Date().toLocaleTimeString()}\n${formatTable(stats())}`);
}, 5000);
