# Chat-App
This is a Chat app socket io node js

# How to Setup
- sudo apt install nodejs npm

## Verification of the installation:
  - node -v
  - npm -v

**JavaScript**:
  ```markdown
  ``` const app = express();
  const server = require("http").createServer(app);
  const io = require("socket.io")(server);
  app.use(express.static(path.join(__dirname+"/public")));

