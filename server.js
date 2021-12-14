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
            max_player_count: req.body.max
        };
        roomList.push(room);
        
        res.redirect('/game/' + req.body.roomname);
    }
});

app.get('/game/:roomname', (req, res) => {
    if(!req.user) {
        res.redirect('/login');
    } else {
        roomList.forEach((elem) => {
            if(elem.players.length == elem.max_player_count) {
                res.redirect('/lobby');
            }
        });
        res.render('RPSgame', {username: req.user.username, roomname: req.params.roomname});
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

});


gameIO.on('connection', (socket) => {   //연결이 들어오면 실행되는 이벤트
    // socket 변수에는 실행 시점에 연결한 상대와 연결된 소켓의 객체가 들어있다.
    socket.on('newPlayer', (roomname) => {
        socket.data.roomname = roomname;
        socket.join(roomname);
        roomList.forEach((elem) => {
            if(elem.name == roomname) {
                if(!elem.players.includes(socket.request.user.username)) {
                    elem.players.push(socket.request.user.username);
                }
            }
        });
        gameIO.to(socket.data.roomname).emit('message', socket.request.user.username + ' joined!!')
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
});

server.listen(port, function() {
  console.log(`Listening on http://localhost:${port}/`);
});