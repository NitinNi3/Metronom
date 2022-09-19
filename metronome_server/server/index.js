const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http,{path: '/jamsocket'});
const PORT = process.env.PORT || 4001;
const path = require('path');

let socketList = {};

app.use(express.static(path.join(__dirname, 'public')));

// if (process.env.NODE_ENV === 'production') {
//   app.use(express.static(path.join(__dirname, '../client/build')));

//   app.get('/*', function (req, res) {
//     res.sendFile(path.join(__dirname, '../client/build/index.html'));
//   });
// }

// Route
app.get('/ping', (req, res) => {
  res
    .send({
      success: true,
    })
    .status(200);
});

// Socket
io.on('connection', (socket) => {
  console.log(`New User connected: ${socket.id}`);

  socket.on('disconnect', () => {
    socket.disconnect();
    console.log('User disconnected!',socket);
    // io.to('test').emit("socket-disconnected",{userId:socket.id})
  });

  socket.on('BE-check-user', ({ roomId, userName }) => {
    let error = false;

    io.sockets.in(roomId).clients((err, clients) => {
      console.log("clients", clients)
      clients.forEach((client) => {
        if (socketList[client] === userName) {
          error = true;
        }
      });
      socket.emit('FE-error-user-exist', { error });
    });
  });

  /**
   * Join Room
   */
  socket.on('BE-join-room', ({ roomId, userName }) => {
    // Socket Join RoomName
    socket.join(roomId);
    // socketList[socket.id] = { userName, video: true, audio: true };
    socketList[socket.id] = { userName, video: true, audio: true,roomId };

    // Set User List
    io.sockets.in(roomId).clients((err, clients) => {
      try {
        // socket id wise
        const users = [];
        clients.forEach((client) => {
          // Add User List
          // if(clients.includes(client.info.userName)) users.push({ userId: client, info: socketList[client] });
          users.push({ userId: client, info: socketList[client] });
        });

        // send event to all sockets except the sender
        socket.broadcast.to(roomId).emit('FE-user-join', users);
        // io.sockets.in(roomId).emit('FE-user-join', users);
        console.log("users", users)
      } catch (e) {
        io.sockets.in(roomId).emit('FE-error-user-exist', { err: true });
      }
    });
  });

  socket.on('BE-call-user', ({ userToCall, from, signal }) => {
    io.to(userToCall).emit('FE-receive-call', {
      signal,
      from,
      info: socketList[socket.id],
    });
  });

  socket.on('BE-accept-call', ({ signal, to }) => {
    io.to(to).emit('FE-call-accepted', {
      signal,
      answerId: socket.id,
    });
  });

  socket.on('BE-send-message', ({ roomId, msg, sender }) => {
    io.sockets.in(roomId).emit('FE-receive-message', { msg, sender });
  });

  socket.on('BE-leave-room', ({ roomId, leaver }) => {
    delete socketList[socket.id];
    socket.broadcast
      .to(roomId)
      .emit('FE-user-leave', { userId: socket.id, userName: [socket.id] });
    io.sockets.sockets[socket.id].leave(roomId);
  });

  socket.on('BE-toggle-camera-audio', ({ roomId, switchTarget }) => {
    if (switchTarget === 'video') {
      socketList[socket.id].video = !socketList[socket.id].video;
    } else {
      socketList[socket.id].audio = !socketList[socket.id].audio;
    }
    socket.broadcast
      .to(roomId)
      .emit('FE-toggle-camera', { userId: socket.id, switchTarget });
  });


  socket.on('My-AudioQuality-Change', ({ roomId, audioData }) => {
    // Send the quality to the rest of room's client
    
  })

  socket.on('My-Ping-Change', ({ roomId, pingData }) => {
    // Send the ping to the rest of room's client
  })




});

http.listen(PORT, () => {
  console.log(`Connected : ${PORT}`);
});
