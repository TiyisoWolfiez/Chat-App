const express = require("express");
const path    = require("path");
const { initSocketHandlers } = require("./socketHandlers");

const app    = express();
const server = require("http").createServer(app);
const io     = require("socket.io")(server);

app.use(express.static(path.join(__dirname, "public")));

initSocketHandlers(io);

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
    console.log(`ChatOS server running → http://localhost:${PORT}`);
});