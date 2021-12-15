let mysql = require('mysql');
const db_config = require('./db-config');

module.exports = (gameIO, lobbyIO, socket, roomList) => {
    let db = mysql.createConnection(db_config);
    db.connect();

    function updateDraw(userList) {
        userList.forEach((elem) => {
            db.query('UPDATE user SET draw=draw+1 WHERE username=?', [elem.name]);
        });
    }
    
    function updateWinLoss(userList, winSelection) {
        userList.forEach((elem) => {
            if(elem.selection == winSelection) {
                db.query('UPDATE user SET win=win+1 WHERE username=?', [elem.name]);
            } else {
                db.query('UPDATE user SET loss=loss+1 WHERE username=?', [elem.name]);
            }
        });
    }

    socket.on('newPlayer', (roomname) => {
        socket.data.roomname = roomname;
        socket.join(roomname);
        
        
        roomList.forEach((elem) => {
            if(elem.name == roomname) {
                elem.players.push({
                    name: socket.request.user.username,
                    ready: false,
                    status: '',
                    selection: 0,
                });
                socket.data.room = elem;
            }
        });
        gameIO.to(socket.data.roomname).emit('resRoomData', socket.data.room);
        gameIO.to(socket.data.roomname).emit('message', socket.request.user.username + ' joined!!');
    });

    socket.on('reqRoomData', () => {
        socket.emit('resRoomData', socket.data.room);
    });

    socket.on('ready', () => {
        console.log(socket.request.user.username, " ready");
        socket.data.room.players.forEach((elem) => {
            if(elem.name == socket.request.user.username) {
                elem.ready = true;
                elem.status = 'ready';
            }
        });
        socket.data.room.ready++;
        gameIO.to(socket.data.roomname).emit('resRoomData', socket.data.room);
        gameIO.to(socket.data.roomname).emit('message', socket.request.user.username + ' Ready');
        if(socket.data.room.players.length == socket.data.room.ready) {
            socket.data.room.ready = 0;
            socket.data.room.started = true;
            gameIO.to(socket.data.roomname).emit('gameStarted');
        }
    });
    
    socket.on('setSelection', (selectionName, selection) => {
        console.log(socket.request.user.username, " selected ", selectionName);
        socket.data.room.players.forEach((elem) => {
            if(elem.name == socket.request.user.username) {
                elem.status = selectionName;
                elem.selection = selection;
            }
        });
        socket.data.room.ready++;
        gameIO.to(socket.data.roomname).emit('message', socket.request.user.username + ' Selected');
        if(socket.data.room.players.length == socket.data.room.ready) {
            socket.data.room.ready = 0;

            // Find winner
            let rock = 0;
            let paper = 0;
            let scissor = 0;

            socket.data.room.players.forEach((elem) => {
                if(elem.selection == 1) {
                    rock++;
                } else if(elem.selection == 2) {
                    paper++;
                } else if(elem.selection == 3) {
                    scissor++;
                } else {
                    console.log('Something wrong when collect selection');
                }
            });

            if(rock > 0 && paper > 0 && scissor > 0) {
                updateDraw(socket.data.room.players);
                gameIO.to(socket.data.roomname).emit('resRoomData', socket.data.room);
                gameIO.to(socket.data.roomname).emit('draw');
            } else if((rock == 0 && scissor == 0) || (rock == 0 && paper == 0) || (scissor == 0 && paper == 0)) {
                updateDraw(socket.data.room.players);
                gameIO.to(socket.data.roomname).emit('resRoomData', socket.data.room);
                gameIO.to(socket.data.roomname).emit('draw');
            } else if(rock == 0) {
                updateWinLoss(socket.data.room.players, 3);
                gameIO.to(socket.data.roomname).emit('resRoomData', socket.data.room);
                gameIO.to(socket.data.roomname).emit('winloss', socket.data.room.players, 3);
            } else if(paper == 0) {
                updateWinLoss(socket.data.room.players, 1);
                gameIO.to(socket.data.roomname).emit('resRoomData', socket.data.room);
                gameIO.to(socket.data.roomname).emit('winloss', socket.data.room.players, 1);
            } else if(scissor == 0) {
                updateWinLoss(socket.data.room.players, 2);
                gameIO.to(socket.data.roomname).emit('resRoomData', socket.data.room);
                gameIO.to(socket.data.roomname).emit('winloss', socket.data.room.players, 2);
            } else {
                console.log('Something wrong when find winner');
            }
        }
    });

    socket.on('sendChat', (msg, username) => {
        gameIO.to(socket.data.roomname).emit('emitChat', msg, username);
    });

    socket.on('reqInviteUser', (id) => {
        lobbyIO.to(id).emit('lobby:invite', socket.request.user.username, socket.data.roomname);
    });

    socket.on('reqLobbyUserList', () => {
        let userList = new Array();
        let socketList = lobbyIO.sockets;
        if(socketList.size > 0) {
            socketList.forEach((elem) => {
                userList.push({
                    id: elem.id,
                    username: elem.request.user.username
                });
            });
        }
        socket.emit('resLobbyUserList', userList);
    });

    socket.on('disconnect', (reason) => {
        db.query('UPDATE user SET last_connection=NOW() WHERE username=?', [socket.request.user.username]);

        for(let i = 0; i < socket.data.room.players.length; i++) {
            if(socket.data.room.players[i].name == socket.request.user.username) {
                socket.data.room.players.splice(i, 1);
                if(socket.data.room.players.length < 2) {
                    gameIO.to(socket.data.roomname).emit('resRoomData', socket.data.room);
                    gameIO.to(socket.data.roomname).emit('gameBroked');
                }
                break;
            }
        }
        if(socket.data.room.players.length == 0) {
            for(let i = 0; i < roomList.length; i++) {
                if(roomList[i].name == socket.data.room.name) {
                    roomList.splice(i, 1);
                    return;
                }
            }
        }
        gameIO.to(socket.data.roomname).emit('resRoomData', socket.data.room);
        gameIO.to(socket.data.roomname).emit('userDisconnected', socket.request.user.username);
    });
}