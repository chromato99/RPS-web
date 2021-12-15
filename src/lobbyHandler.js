let mysql = require('mysql');
const db_config = require('./db-config');

module.exports = (lobbyIO, socket, roomList) => {
    let db = mysql.createConnection(db_config);
    db.connect();


    socket.on('lobby:newplayer',() => { // Protocol request that new player is joined
        db.query('SELECT * FROM user WHERE username=?', [socket.request.user.username], (err, results) => {
            results[0].password = '';
            socket.emit('lobby:resUserData', results[0]);
        });
        lobbyIO.emit('lobby:emitChat', 'Joined Lobby!!', socket.request.user.username);
    });

    socket.on('lobby:sendChat', (msg) => { // Protocol request for sending chat
        if(msg.includes("$$:")) { // Check if it is a whisper and if yes, send chat only to the person whispering
            const [destUsername, message] = msg.split("$$:");
            let socketList = lobbyIO.sockets;
            if(socketList.size > 0) {
                socketList.forEach((elem) => {
                    if(elem.request.user.username == destUsername) { // Send chat to particular user
                        //console.log('lobby:emitChat', `(Whisper) ` + message);
                        lobbyIO.to(elem.id).emit('lobby:emitChat', `(Whisper) ` + message, socket.request.user.username);
                        lobbyIO.to(socket.id).emit('lobby:emitChat', `(Whisper) ` + message, socket.request.user.username);
                    }
                });
            }
        } else {
            lobbyIO.emit('lobby:emitChat', msg, socket.request.user.username);
        }
    });


    socket.on('lobby:reqUserList', () => { // Protocol request to get user list in lobby
        let userList = new Array();
        userList.push({ // Push own sockets information first.
            id: socket.id,
            username: socket.request.user.username
        });
        let socketList = lobbyIO.sockets;
        if(socketList.size > 0) { // Get all of sockets data that connection to lobby socket io namespace
            socketList.forEach((elem) => {
                if(elem != socket) {
                    userList.push({
                        id: elem.id,
                        username: elem.request.user.username
                    });
                }
            }); 
        }
        socket.emit('lobby:resUserList', userList);
    });

    socket.on('lobby:reqRoomList', () => { // Protocol request to get room list
        socket.emit('lobby:resRoomList', roomList);
    });

    socket.on('lobby:reqUserData', (username) => { // Protocol request to get user account data
        db.query('SELECT * FROM user WHERE username=?', [username], (err, results) => {
            results[0].password = '';
            socket.emit('lobby:resUserData', results[0]);
        });
    });

    socket.on('disconnect', (reason) => { // When socket is disconnected
        db.query('UPDATE user SET last_connection=NOW() WHERE username=?', [socket.request.user.username]);
        lobbyIO.emit('lobby:emitChat', ' Disconnected', socket.request.user.username);
    });
}