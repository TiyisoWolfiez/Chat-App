# Chat-App
This is a Chat app socket io node js

# How to Setup
- sudo apt update
- sudo apt install nodejs npm
- sudo npm init -y
- sudo npm install express socket.io --save

## Verification of the installation:
  - node -v
  - npm -v

**Random JavaScript Code Snippet**:
  ```javascript
  const app = express();
  const server = require("http").createServer(app);
  const io = require("socket.io")(server);
  app.use(express.static(path.join(__dirname+"/public")));
  ``` 

