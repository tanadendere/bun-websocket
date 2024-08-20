import type { ServerWebSocket } from "bun";

// const server = Bun.serve({
//   port: 3000,
//   fetch(req, server) {
//     if (server.upgrade(req)) {
//       return;
//     }
//     return new Response("Bun!");
//   },
//   websocket: {
//     open(ws) {
//       const welcomeMessage =
//         "Welcome to the Time Server. Ask what is the time and I will answer.";
//       ws.send(welcomeMessage);
//       console.log("connection opened");
//     },
//     message(ws, message) {
//       console.log(`incoming message: ${message}`);

//       // const messageString =
//       //   typeof message === "string"
//       //     ? message
//       //     : new TextDecoder().decode(message);
//       // if (messageString.trim().toLowerCase() === "whats the time") {
//       //   const currentTime = new Date().toLocaleDateString();

//       //   ws.send(`The time is ${currentTime}`);
//       //   return;
//       // } else {
//       //   ws.send("I can only tell the time");
//       // }
//       ws.send(message);
//     },
//     close(ws) {
//       console.log("connection closed");
//     },
//   },
// });

// Create a server to serve index.html page
// BL - might not need this
// Bun.serve({
//   port: 3000,
//   fetch() {
//     return new Response("Bun WebSocket!");
//   },
// });

export interface IUser {
  username: string;
}

export interface IMessage {
  text: string;
  username: string | undefined;
  timestamp: number;
}

// Create another server for the WebSocket server
const messages: IMessage[] = [];
let users: String[] = [];

const server = Bun.serve({
  port: 4000,
  fetch(req, server) {
    // upgrade the request to a WebSocket

    const success = server.upgrade(req, {
      // Set username to semi-random text, collisions probably do not use in production
      data: { username: "user_" + Math.random().toString(16).slice(12) },
    });

    return success
      ? undefined
      : new Response("Upgrade failed :(", { status: 500 });
  },
  websocket: {
    open(ws: ServerWebSocket<IUser>) {
      console.log(ws);
      console.log("connection opened");
      // Store username
      users.push(ws.data.username);

      const joinedNotification: IMessage = {
        text: `${ws.data.username} has joined the chat`,
        username: undefined,
        timestamp: Date.now(),
      };
      messages.push(joinedNotification);

      // Subscribe to pubsub channel to send/receive broadcasted messages,
      // without this the socket could not send events to other clients
      ws.subscribe("chat");

      // Broadcast that a user joined
      server.publish(
        "chat",
        JSON.stringify({ type: "USERS_ADD", data: ws.data.username })
      );
      server.publish(
        "chat",
        JSON.stringify({ type: "MESSAGES_ADD", data: joinedNotification })
      );

      // Send message to the newly connected client containing existing users and messages
      ws.send(JSON.stringify({ type: "USERS_SET", data: users }));
      ws.send(JSON.stringify({ type: "MESSAGES_SET", data: messages }));
    },
    message(ws, data) {
      console.log(`incoming message: ${data}`);
      // Data is sent as a buffer so convert it so it is a string then we can parse to object
      const dataString =
        typeof data === "string" ? data : new TextDecoder().decode(data);
      const message: IMessage = JSON.parse(dataString);
      console.log(ws.data);
      message.username = ws.data.username;
      message.timestamp = Date.now();

      messages.push(message);

      // Send message to all clients subscribed to the chat channel with new message
      // (have to publish to server, publishing to ws - would publish to everyone else but sender ws)
      server.publish(
        "chat",
        JSON.stringify({ type: "MESSAGES_ADD", data: message })
      );
    },
    close(ws) {
      users = users.filter((username) => username !== ws.data.username);

      const leftNotification: IMessage = {
        text: `${ws.data.username} has left the chat`,
        username: undefined,
        timestamp: Date.now(),
      };
      messages.push(leftNotification);

      // Send message to all clients STILL subscribed to the chat channel that user left (use ws.publish instead of server.publish)
      server.publish(
        "chat",
        JSON.stringify({ type: "USERS_REMOVE", data: ws.data.username })
      );
      server.publish(
        "chat",
        JSON.stringify({ type: "MESSAGES_ADD", data: leftNotification })
      );
      console.log("connection closed");
    },
  },
});

console.log(`Listening on http://localhost:${server.port} ...`);
