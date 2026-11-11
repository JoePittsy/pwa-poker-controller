// local MQTT-over-WebSocket relay for testing
const A = require('aedes');
const http = require('http');
const ws = require('websocket-stream');
(async () => {
  const aedes = A.Aedes.createBroker ? await A.Aedes.createBroker() : new A.Aedes(); if (!A.Aedes.createBroker && aedes.listen) await aedes.listen();
  const server = http.createServer();
  ws.createServer({ server }, aedes.handle);
  server.listen(1884, () => console.log('relay on ws://localhost:1884'));
})();
