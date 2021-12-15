let express = require('express');

let app = express();
let port = 80;

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
const bodyParser = require('body-parser');
const { SocketAddress } = require('net');
const wrap = middleware => (socket, next) => middleware(socket.request, {}, next);

const db_config = require('./src/db-config');
const gameHandler = require('./src/gameHandler');
const lobbyHandler = require('./src/lobbyHandler');
let roomList = new Array();


app.set('view engine', 'ejs'); // 렌더링 엔진 모드를 ejs로 설정
app.set('views',  __dirname + '/views'); // ejs이 있는 폴더를 지정

app.use(compression());
app.use(express.static('public'));



app.use(express.urlencoded({ extended: false }));
app.use(session({
    secret: '!@#$%^&*',
    store: new MySQLStore(db_config),
    resave: false,
    saveUninitialized: false
}));
app.use(passport.initialize());
app.use(passport.session());


// Passport.js setting
passport.use(new LocalStrategy(
    function(username, password, done) {
    let db = mysql.createConnection(db_config);
    db.connect();
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
    let db = mysql.createConnection(db_config);
    db.connect();
    db.query('SELECT * FROM user WHERE username=?', [username], function(err, results){
    if(err)
        return done(err, false);
    if(!results[0])
        return done(err, false);

    return done(null, results[0]);
    });
});

// Socket IO namespace setting

let lobbyIO = io.of('/lobby');

lobbyIO.use(wrap(session({ secret: "!@#$%^&*", store: new MySQLStore(db_config), resave: false, saveUninitialized: false })));
lobbyIO.use(wrap(passport.initialize()));
lobbyIO.use(wrap(passport.session()));
lobbyIO.use((socket, next) => {
    if (socket.request.user) {
        next();
    } else {
        next(new Error("unauthorized"))
    }
});

let gameIO = io.of('/game');

gameIO.use(wrap(session({ secret: "!@#$%^&*", store: new MySQLStore(db_config), resave: false, saveUninitialized: false })));
gameIO.use(wrap(passport.initialize()));
gameIO.use(wrap(passport.session()));
gameIO.use((socket, next) => {
    if (socket.request.user) {
        next();
    } else {
        next(new Error("unauthorized"))
    }
});

// Express.js get,post request code

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
    let db = mysql.createConnection(db_config);
    db.connect();
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
    let db = mysql.createConnection(db_config);
    db.connect();
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
        res.render('newroom', {message: ''});
    }
});

app.post('/newroom', (req, res) => {
    if(!req.user) {
        res.redirect('/login');
    } else {
        roomList.forEach((elem) => {
            if(elem.name == req.body.roomname) {
                res.redirect('/newroom', {message: 'A room with the same name already exists.'});
            }
        });
        let room = {
            name: req.body.roomname,
            players: new Array(),
            max_player_count: req.body.max,
            ready: 0,
            started: false,
            ended: false
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
            if(elem.players.length == elem.max_player_count || elem.started || elem.ended) {
                res.redirect('/lobby');
            }
        });
        if(!room) {
            res.redirect('/lobby');
        } else {
            res.render('RPSgame', {username: req.user.username, roomname: req.params.roomname, room: room});
        }
        
    }
});

// Lobby Socket IO Code

lobbyIO.on('connection', (socket) => {
    lobbyHandler(lobbyIO, socket, roomList);
});


// Game Socket IO Code

gameIO.on('connection', (socket) => {
    gameHandler(gameIO, lobbyIO, socket, roomList)
});

server.listen(port, function() {
  console.log(`Listening on http://localhost:${port}/`);
});