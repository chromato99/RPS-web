let mysql = require('mysql');
const db_config = require('./db-config');

module.exports = (gameIO, lobbyIO, socket, roomList) => {

    // Functions for updating user record
    function updateDraw(userList) { 
        userList.forEach((elem) => {
            let db = mysql.createConnection(db_config);
            db.connect();
            db.query('UPDATE user SET draw=draw+1 WHERE username=?', [elem.name]);
            db.end();
        });
    }
    
    function updateWinLoss(userList, winSelection) {
        userList.forEach((elem) => {
            let db = mysql.createConnection(db_config);
            db.connect();
            if(elem.selection == winSelection) {
                db.query('UPDATE user SET win=win+1 WHERE username=?', [elem.name]);
            } else {
                db.query('UPDATE user SET loss=loss+1 WHERE username=?', [elem.name]);
            }
            db.end();
        });
    }


    // Entering new player request
    socket.on('newPlayer', (roomname) => {
        socket.data.roomname = roomname;
        socket.join(roomname);
        
        roomList.forEach((elem) => {  // Find room
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

        // Protocol call to update information when a new user arrives
        gameIO.to(socket.data.roomname).emit('resRoomData', socket.data.room);
        gameIO.to(socket.data.roomname).emit('message', socket.request.user.username + ' joined!!');
    });


    // Protocol request to update room data
    socket.on('reqRoomData', () => {
        socket.emit('resRoomData', socket.data.room);
    });

    // Protocol request that the user is ready
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

        // If every user ready, Start game
        if(socket.data.room.players.length > 1 && socket.data.room.players.length == socket.data.room.ready) {
            socket.data.room.ready = 0;
            socket.data.room.started = true;
            gameIO.to(socket.data.roomname).emit('gameStarted');
        }
    });
    
    // Protocol for selecting RPS after game started
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

        // If every user selected RPS, Set game ended and compute to find winner
        if(socket.data.room.players.length == socket.data.room.ready) {
            socket.data.room.ready = 0;
            socket.data.room.started = false;
            socket.data.room.ended = true;

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
            
            if(rock > 0 && paper > 0 && scissor > 0) { // If every selection is appear
                updateDraw(socket.data.room.players);
                gameIO.to(socket.data.roomname).emit('resRoomData', socket.data.room);
                gameIO.to(socket.data.roomname).emit('draw');
            } else if((rock == 0 && scissor == 0) || (rock == 0 && paper == 0) || (scissor == 0 && paper == 0)) {
                updateDraw(socket.data.room.players); // If ever selection by user is same
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

    socket.on('sendChat', (msg, username) => { // Protocol request to send chat
        gameIO.to(socket.data.roomname).emit('emitChat', msg, username);
    });

    socket.on('reqInviteUser', (id) => { // Protocol request to invite user to the room
        lobbyIO.to(id).emit('lobby:invite', socket.request.user.username, socket.data.roomname);
    });

    socket.on('reqLobbyUserList', () => { // Protocol request to get user list in lobby
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

    socket.on('disconnect', (reason) => { // Protocol request when connection is lost
        let db = mysql.createConnection(db_config);
        db.connect();
        db.query('UPDATE user SET last_connection=NOW() WHERE username=?', [socket.request.user.username]);
        db.end();
        // Delete user data from room
        for(let i = 0; i < socket.data.room.players.length; i++) {
            if(socket.data.room.players[i].name == socket.request.user.username) {
                socket.data.room.players.splice(i, 1);
                if(socket.data.room.started) { // If game is started and some player is disconnected, Stop game and send alert
                    gameIO.to(socket.data.roomname).emit('resRoomData', socket.data.room);
                    gameIO.to(socket.data.roomname).emit('gameBroked');
                    gameIO.to(socket.data.roomname).disconnectSockets();
                }
                break;
            }
        }
        if(socket.data.room.players.length == 0) { // If no one in room, remove room data from roomList
            for(let i = 0; i < roomList.length; i++) {
                if(roomList[i].name == socket.data.room.name) {
                    roomList.splice(i, 1);
                    lobbyIO.emit('lobby:resRoomList', roomList);
                    return;
                }
            }
        }

        // Update room data
        gameIO.to(socket.data.roomname).emit('resRoomData', socket.data.room);
        gameIO.to(socket.data.roomname).emit('userDisconnected', socket.request.user.username);
    });
}