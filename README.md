## Phase 1 : Broadcast Web Messenger that works without Wi-Fi or internet.
## How the LAN-Based Messenger Works

In order to make the messenger work in an offline manner, we created a **LAN Network** and connected our two systems to it. Because of this, we are able to communicate with each other directly using a **local IP address** (of the host computer).

### Frontend Part

The web application is divided into two parts:
- **Online Users List** – Shows people who are currently online or using the messenger.
- **Chat Box** – Allows users to write and send their messages.

To access it, users enter the server’s local IP address (e.g., `http://192.168.1.1`) in their browser.

### Backend Setup

- We created the web server using **Node.js** and **Express.js**.
- For real-time communication, we used the JS library: **Socket.io**.
- The server is hosted on the IP address `0.0.0.0` so that it would be accessible to everyone connected via our LAN network.
- It mainly serves two purposes:
  1. Displaying the live chat to users.
  2. Displaying the list of online users.

### Client-Side Logic (`script.js`)

When the user opens the messenger:
1. A prompt asks them to enter their name.
2. The entered name is sent to the server (and appears in the "online users" section).
3. The user can now write their chat message in the chat box – this message is sent to the server using `socket.emit()`.
4. On the other hand, the user also listens for:
   - New incoming messages
   - The updated list of online users

### Server-Side Logic (`server.js`)

1. The user enters their name on the frontend.
2. They are given a unique **socket ID**.
3. The username is stored in a **JavaScript Map** corresponding to this socket ID.
4. The updated list of all users is then sent to everyone in the chat using `socket.emit()`.
5. When a user sends a message, it is received by the server and broadcast in real-time to all other online users.

### Deployed Link : https://drdo-messenger.onrender.com/ 

### -> Web Messenger UI
<img src="Photo%201.jpg" alt="Messenger UI" width="500"/>

### -> Connection 
<img src="Photo%202.jpg" alt="Chat Screenshot" width="500"/>
The blue colored wire is the ethernet cable ( CAT-6) that is serving as the transmission media for transferring the messages.


## Phase 2: One-to-One and Group Web Messenger

### How it Works
Phase 2 extends our previous broadcast messenger to support private one-to-one chats and group messaging. Users can now create groups, invite others, and chat in real-time over the internet.

### Frontend
- **Contacts & Groups List** – Shows all your friends and groups.
- **Chat Box** – Write messages for individuals or groups.

### Backend
- Built with **Node.js** and **Express.js**.
- **Socket.io** handles real-time messaging.
- **MongoDB** stores contacts, groups, and messages.
- Each user and group has its own **socket room**, enabling instant message delivery.

### Client Logic
- Users register with a name or ID.
- Can send messages to contacts or groups.
- Messages are updated live on all connected clients.

### Server Logic
- Maintains active users and their sockets.
- Handles creating/deleting contacts and groups.
- Emits new messages in real-time to relevant users or group members.

### Deployed Link : https://drdo-messenger-app-1.onrender.com
