# Chat-App
This is a real-time chat application built using Node.js and Socket.io. The app allows multiple users to join a chat room and interact with each other in a group chat setting.

## Features

- Real-time communication between users
- Multiple users can join the chat simultaneously
- Messages are broadcasted to all connected users
- User-friendly interface

## How to Setup
1. Update your package list:
   ```sh
   sudo apt update
   sudo apt install nodejs npm
   sudo npm init -y
   sudo npm install express socket.io --save
   ```


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

