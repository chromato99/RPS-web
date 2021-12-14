let express = require('express');

let app = express();
let port = 8000;

let server = require('http').createServer(app);
let session = require('express-session');
let MySQLStore = require('express-mysql-session')(session);
let flash = require('connect-flash');
let compression = require('compression');
let crypto = require('crypto');
let passport = require('passport');
let LocalStrategy = require('passport-local').Strategy;
let ejs = require('ejs');
let mysql = require('mysql');
let io = require('socket.io')(server);
let poker = require('pokersolver').Hand;
const db_config = require('./src/db-config');
let bodyParser = require('body-parser');
const { SocketAddress } = require('net');
const wrap = middleware => (socket, next) => middleware(socket.request, {}, next);

let roomList = new Array();


app.set('view engine', 'ejs'); // 렌더링 엔진 모드를 ejs로 설정
app.set('views',  __dirname + '/views'); // ejs이 있는 폴더를 지정

app.use(compression());
app.use(express.static('public'));

let db = mysql.createConnection(db_config);
db.connect();

app.use(express.urlencoded({ extended: false }));
app.use(session({
    secret: '!@#$%^&*',
    store: new MySQLStore(db_config),
    resave: false,
    saveUninitialized: false
}));
app.use(passport.initialize());
app.use(passport.session());

passport.use(new LocalStrategy(
    function(username, password, done) {
    db.query('SELECT * FROM user WHERE username=?', [username], (err, results) => {
        if(err) return done(err);
        if(!results[0]) 
            return done('please check your username.');
        else {
            db.query('UPDATE user SET last_connection=NOW() WHERE username=?', [username]);
            let user = results[0];
            const [encrypted, salt] = user.password.split("$");
            crypto.pbkdf2(password, salt, 65536, 64, 'sha512', (err, derivedKey) => {
                if(err) return done(err);
                if(derivedKey.toString("hex") === encrypted)
                    return done(null, user);
                else
                    return done('please check your password.');
            });//pbkdf2
        }
    });//query
    }
));
passport.serializeUser(function(user, done) {
    done(null, user.username);
});

passport.deserializeUser(function(username, done) {
    db.query('SELECT * FROM user WHERE username=?', [username], function(err, results){
    if(err)
        return done(err, false);
    if(!results[0])
        return done(err, false);

    return done(null, results[0]);
    });
});


let lobbyIO = io.of('/lobby');

lobbyIO.use(wrap(session({ secret: "!@#$%^&*", store: new MySQLStore(db_config), resave: false, saveUninitialized: false })));
lobbyIO.use(wrap(passport.initialize()));
lobbyIO.use(wrap(passport.session()));


let gameIO = io.of('/game');

gameIO.use(wrap(session({ secret: "!@#$%^&*", store: new MySQLStore(db_config), resave: false, saveUninitialized: false })));
gameIO.use(wrap(passport.initialize()));
gameIO.use(wrap(passport.session()));

app.get('/', (req, res) => {
    if(!req.user) {
        res.redirect('/login');
    } else {
        res.redirect('/lobby');
    }
});

app.get('/login', (req, res) => {
    if(!req.user) {
        res.render('login', {message: 'input your id and password'});        
    } else {
        res.redirect('/lobby');
    }
});

app.post('/login', // 로그인 요청이 들어왔을때
    passport.authenticate('local', {
        successRedirect: '/lobby',
        failureRedirect: '/login',
        failureFlash: true
    })
);

app.get('/logout', (req, res) => {
    db.query('UPDATE user SET last_connection=NOW() WHERE username=?', [req.user.username]);
    req.logout();
    res.redirect('/login');
});

app.get('/signup', (req, res) => {
    if(!req.user) {
        res.render('signup', {message: 'input sign up data'});
    } else {
        res.redirect('/lobby', {message: req.user.username});
    }
});

app.post('/signup', (req, res) => {
    db.query('SELECT * FROM user WHERE username=?', [req.body.username], (err, results) => {
        if(err)
            res.render('signup', {message: 'input sign up data'});
        if(!!results[0])
            res.render('signup', {message: 'Already existing username'});
        else {
            const randomSalt = crypto.randomBytes(32).toString("hex");
            crypto.pbkdf2(req.body.password, randomSalt, 65536, 64, "sha512", (err, encryptedPassword) => {
                const passwordWithSalt = encryptedPassword.toString("hex")+"$"+randomSalt;
                db.query("insert into user(username, password, email, win, loss, draw,last_connection) values(?,?,?, 0, 0, 0, NOW())",  [req.body.username, passwordWithSalt, req.body.email], (err2)=> {
                    if(err2) 
                        res.render('signup', {message: 'failed creating new account'});
                    else
                        res.redirect('/login');
                });
            });
        }
    });
});

app.get('/lobby', (req, res) => {
    if(!req.user) {
        res.redirect('/login');
    } else {
        res.render('lobby', {username: req.user.username});
    }
});

app.get('/newroom', (req, res) => {
    if(!req.user) {
        res.redirect('/login');
    } else {
        res.render('newroom');
    }
});

app.post('/newroom', (req, res) => {
    if(!req.user) {
        res.redirect('/login');
    } else {
        roomList.forEach((elem) => {
            if(elem.name == req.body.roomname) {
                res.redirect('/newroom');
            }
        });
        let room = {
            name: req.body.roomname,
            players: new Array(),
            max_player_count: req.body.max,
            ready: 0
        };
        roomList.push(room);
        
        res.redirect('/game/' + req.body.roomname);
    }
});

app.get('/game/:roomname', (req, res) => {
    if(!req.user) {
        res.redirect('/login');
    } else {
        let room;
        roomList.forEach((elem) => {
            if(req.params.roomname == elem.name) {
                room = elem;
            }
            if(elem.players.length == elem.max_player_count) {
                res.redirect('/lobby');
            }
        });
        if(!room) {
            console.log("no such room : ", roomname, "| username : ",req.user.username);
            res.redirect('/lobby');
        } else {
            res.render('RPSgame', {username: req.user.username, roomname: req.params.roomname, room: room});
        }
        
    }
});


lobbyIO.use((socket, next) => {
    if (socket.request.user) {
        console.log("Authorized", socket.request.user.username);
        next();
    } else {
        next(new Error("unauthorized"))
    }
});

lobbyIO.on('connection', (socket) => {
    socket.on('lobby:newplayer',(msg) => { // 새로운 플레이어 입장
        console.log('lobbyIO : ', msg);
        lobbyIO.emit('lobby:chatemit', 'Joined Lobby!!', socket.request.user.username);
    });

    socket.on('lobby:sendChat', (msg) => {
        if(msg.includes("$$:")) {
            const [destUsername, message] = msg.split("$$:");
            let socketList = lobbyIO.sockets;
            if(socketList.size > 0) {
                socketList.forEach((elem) => {
                    if(elem.request.user.username == destUsername) {
                        console.log('lobby:emitChat', `(Whisper) : ` + message);
                        lobbyIO.to(elem.id).emit('lobby:emitChat', `(Whisper) : ` + message, socket.request.user.username);
                        lobbyIO.to(socket.id).emit('lobby:emitChat', `(Whisper) : ` + message, socket.request.user.username);
                    }
                });
            }
        } else {
            console.log('lobbyIO(' + socket.request.user.username + ') : ' + msg);
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
    });
});

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

gameIO.on('connection', (socket) => {   //연결이 들어오면 실행되는 이벤트
    // socket 변수에는 실행 시점에 연결한 상대와 연결된 소켓의 객체가 들어있다.
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
        socket.data.room.players.forEach((elem) => {
            if(elem.name == socket.request.user.username) {
                elem.ready = true;
                elem.status = 'ready';
            }
        });
        socket.data.room.ready++;
        socket.emit('resRoomData', socket.data.room);
        gameIO.to(socket.data.roomname).emit('message', socket.request.user.username + ' Ready');
        if(socket.data.room.players.length == socket.data.room.ready) {
            socket.data.room.ready = 0;
            socket.emit('gameStarted');
        }
    });
    
    socket.on('setSelection', (selectionName, selection) => {
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
                gameIO.to(socket.data.roomname).emit('winloss', socket.data.room.players,3);
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
        console.log(reason, socket.request.user.username);
        for(let i = 0; i < socket.data.room.players.length; i++) {
            if(socket.data.room.players[i].name == socket.request.user.username) {
                socket.data.room.players.splice(i, 1);
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
});

server.listen(port, function() {
  console.log(`Listening on http://localhost:${port}/`);
});