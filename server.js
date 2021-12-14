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
let card = require('./src/card');
// let Table = require('./src/table');
const db_config = require('./src/db-config');
let bodyParser = require('body-parser');
const { SocketAddress } = require('net');
const wrap = middleware => (socket, next) => middleware(socket.request, {}, next);

let tableList = new Array();


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
    db.query('SELECT * FROM users WHERE username=?', [username], (err, results) => {
        if(err) return done(err);
        if(!results[0]) 
            return done('please check your username.');
        else {
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
    db.query('SELECT * FROM users WHERE username=?', [username], function(err, results){
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
    db.query('SELECT * FROM users WHERE username=?', [req.body.username], (err, results) => {
        if(err)
            res.render('signup', {message: 'input sign up data'});
        if(!!results[0])
            res.render('signup', {message: 'Already existing username'});
        else {
            const randomSalt = crypto.randomBytes(32).toString("hex");
            crypto.pbkdf2(req.body.password, randomSalt, 65536, 64, "sha512", (err, encryptedPassword) => {
                const passwordWithSalt = encryptedPassword.toString("hex")+"$"+randomSalt;
                db.query("insert into users(username, password) values(?,?)",  [req.body.username, passwordWithSalt], (err2)=> {
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
        let tableNameList = new Array();
        tableList.forEach((elem) => {
            tableNameList.push(elem.name);
        });
        let userList = new Array();
        let socketList = lobbyIO.sockets;
        //console.log(socketList);
        if(socketList.size > 0) {
            socketList.forEach((value, key, map) => {
                userList.push({
                    id: key,
                    username: value.request.user.username
                });
            });
            console.log(userList);
            res.render('lobby', {username: req.user.username, tableNameList: tableNameList, userList: userList});
        }
        else {
            res.render('lobby', {username: req.user.username, tableNameList: tableNameList, userList: []});
        }
        
        
    }
});

app.get('/newtable', (req, res) => {
    if(!req.user) {
        res.redirect('/login');
    } else {
        
        res.render('newTable');
    }
});

app.post('/newtable', (req, res) => {
    if(!req.user) {
        res.redirect('/login');
    } else {
        tableList.forEach((elem) => {
            if(elem.name == req.body.tablename) {
                res.redirect('/newtable');
            }
        });
        let table = {
            name: '',
            players: new Array(),
        };
        tableList.push(table);
        
        res.redirect('/game/' + req.body.tablename);
    }
});

app.get('/game/:tableName', (req, res) => {
    if(!req.user) {
        res.redirect('/login');
    } else {
        res.render('RSPgame', {username: req.user.username, tablename: req.body.tablename});
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

    socket.on('lobby:sendChat', (msg, username) => {
        console.log('lobbyIO(' + socket.request.user.username + ') : ' + msg);
        lobbyIO.emit('lobby:emitChat', msg, socket.request.user.username);
    });

    socket.on('lobby:sendWhisper', (msg, userList) => {
        userList.forEach((elem) => {
            lobbyIO.to(elem).emit('lobby:emitChat', "(Whisper)" + msg, socket.request.user.username);
        });
    });

    socket.on('reqUserList', () => {
        let userList = new Array();
        let socketList = lobbyIO.sockets;
        if(socketList.legth > 0) {
            socketList.forEach((elem) => {
                userList.push({
                    id: elem.id,
                    username: elem.request.user.username
                });
            });
        }
        socket.emit('resUserList', userList);
    });

});


gameIO.on('connection', (socket) => {   //연결이 들어오면 실행되는 이벤트
    // socket 변수에는 실행 시점에 연결한 상대와 연결된 소켓의 객체가 들어있다.
    socket.on('newPlayer', (tablename) => {
        socket.data.tablename = tablename;
        socket.join(tablename);
        tableList.forEach((elem) => {
            if(elem.name == tablename) {
                elem.players.push(socket.request.user);
            }
        });
        gameIO.to(socket.data.tablename).emit('message', socket.request.user.username + ' joined!!')
    });
    

    socket.on('sendChat', (msg, username) => {
        gameIO.emit('emitChat', msg, username);
    });

    socket.on('reqInviteUser', (selectedUser) => {
        lobbyIO.to(selectedUser).emit('sendInvite', socket.data.tableName);
    });

    socket.on('reqUserList', () => {
        let userList = new Array();
        let socketList = lobbyIO.sockets;
        if(socketList.legth > 0) {
            socketList.forEach((elem) => {
                userList.push({
                    id: elem.id,
                    username: elem.request.user.username
                });
            });
        }
        socket.emit('resUserList', userList);
    });

    // socket.data.player = {
    //     username: socket.request.user.username,
    //     chip: 1000,
    //     hand: new Array(), // 현재 패
    //     currentBet: 0,  // 현재 라운드에서 얼마 베팅 했는지
    //     folded: false,
    //     allIn: false,
    //     status: false, // 현재 라운드에서 행동 했는지 확인
    //     pos: 0 // table.players 배열에서의 위치
    // }
    // table.players.push(socket.data.player);
    // socket.data.player.pos = table.players.indexOf(socket.data.player);
    
    // socket.on('newplayer',(msg) => { // 새로운 플레이어 입장
    //     socket.emit('setStatus', {playerCount: gameIO.fetchSockets().length,player: socket.data.player}); // 새로운 플레이어 정보 설정
        
    //     if(gameIO.fetchSockets().length > 1) { // 3명 이상 입장시 자동 게임 시작
    //         console.log('Start Game!');
    //         table.startGame(); // 게임 시작
    //         console.log(table);
    //         gameIO.emit('startGame', {currentPlayer: table.currentPlayer, dealer: table.dealer, SB: table.SB, BB: table.BB});
    //     }
    // });

    // socket.on('reqGameData', (msg) => { // 각 연결된 소켓들이 데이터 전송을 받기 위한 요청
    //     //console.log(socket.data.player);
    //     socket.emit('resGameData', socket.data.player, {board: table.board, currentPlayer: table.currentPlayer, pot: table.pot, round: table.round});
    // });

    // socket.on('bet', (msg) => {
    //     console.log(socket.data.player);
    //     table.bet(socket.data.player, msg);
    //     if(socket.data.player.allIn == true) { // 플레이어가 올인 했을시
    //         gameIO.emit('message', socket.data.player.username + " All In!!!");
    //     } else {
    //         gameIO.emit('message', socket.data.player.username + " bet " + msg);
    //     }
    // });
    // socket.on('check', (msg) => {
    //     table.call(socket.data.player);
    //     //table.check(socket.data.player);
    //     gameIO.emit('message', socket.data.player.username + " check");
    // });
    // socket.on('call', (msg) => {
    //     table.call(socket.data.player);
    //     gameIO.emit('message', socket.data.player.username + " call");
    // });
    // socket.on('fold', (msg) => {
    //     table.fold(socket.data.player);
    //     gameIO.emit('message', socket.data.player.username + " fold");
    // });
});

server.listen(port, function() {
  console.log(`Listening on http://localhost:${port}/`);
});