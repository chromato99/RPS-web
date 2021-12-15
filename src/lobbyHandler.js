let mysql = require('mysql');
const db_config = require('./db-config');

module.exports = (lobbyIO, socket, roomList) => {
    let db = mysql.createConnection(db_config);
    db.connect();


    socket.on('lobby:newplayer',() => { // 새로운 플레이어 입장
        lobbyIO.emit('lobby:emitChat', 'Joined Lobby!!', socket.request.user.username);
    });

    socket.on('lobby:sendChat', (msg) => {
        if(msg.includes("$$:")) {
            const [destUsername, message] = msg.split("$$:");
            let socketList = lobbyIO.sockets;
            if(socketList.size > 0) {
                socketList.forEach((elem) => {
                    if(elem.request.user.username == destUsername) {
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


    socket.on('lobby:reqUserList', () => {
        let userList = new Array();
        userList.push({
            id: socket.id,
            username: socket.request.user.username
        });
        let socketList = lobbyIO.sockets;
        if(socketList.size > 0) {
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

    socket.on('lobby:reqRoomList', () => {
        socket.emit('lobby:resRoomList', roomList);
    });

    socket.on('lobby:reqUserData', (username) => {
        db.query('SELECT * FROM user WHERE username=?', [username], (err, results) => {
            results[0].password = '';
            socket.emit('lobby:resUserData', results[0]);
        });
    });

    socket.on('disconnect', (reason) => {
        db.query('UPDATE user SET last_connection=NOW() WHERE username=?', [socket.request.user.username]);
    });
}