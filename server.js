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


app.set('view engine', 'ejs'); // Set render engine mode to ejs
app.set('views',  __dirname + '/views'); // Specify the folder where ejs is located

app.use(compression());
app.use(express.static('public')); // Set static file location



app.use(express.urlencoded({ extended: false }));
app.use(session({ // Session settings
    secret: '!@#$%^&*',
    store: new MySQLStore(db_config),
    resave: false,
    saveUninitialized: false,
    cookie: {
        maxAge: 6000 * 60 * 60 // 쿠키 유효기간 6시간
    }
}));
app.use(passport.initialize()); // passport.js initialization
app.use(passport.session());


// Passport.js setting
passport.use(new LocalStrategy(
    function(username, password, done) {
    let db = mysql.createConnection(db_config);
    db.connect();
    // Get user data from DB to check password
    db.query('SELECT * FROM user WHERE username=?', [username], (err, results) => {
        if(err) return done(err);
        if(!results[0]) // Wrong username
            return done('please check your username.');
        else {
            db.query('UPDATE user SET last_connection=NOW() WHERE username=?', [username]); // Set last connection datetime
            db.end();
            let user = results[0];
            const [encrypted, salt] = user.password.split("$"); // splitting password and salt
            crypto.pbkdf2(password, salt, 65536, 64, 'sha512', (err, derivedKey) => { // Encrypting input password
                if(err) return done(err);
                if(derivedKey.toString("hex") === encrypted) // Check its same
                    return done(null, user);
                else
                    return done('please check your password.');
            });//pbkdf2
        }
    });//query

    }
));
passport.serializeUser(function(user, done) { // passport.js serializing
    done(null, user.username);
});

passport.deserializeUser(function(username, done) { // passport.js deserializing with checking Data Existence
    let db = mysql.createConnection(db_config);
    db.connect();
    db.query('SELECT * FROM user WHERE username=?', [username], function(err, results){
    if(err)
        return done(err, false);
    if(!results[0])
        return done(err, false);
    db.end();
    return done(null, results[0]);
    });
});

// Socket IO namespace setting

let lobbyIO = io.of('/lobby');
let gameIO = io.of('/game');

// Settings for using socket.io with passport.js middleware
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

app.get('/', (req, res) => { // Default entry
    if(!req.user) {
        res.redirect('/login');
    } else {
        res.redirect('/lobby');
    }
});

app.get('/login', (req, res) => { // Login page
    if(!req.user) {
        res.render('login', {message: 'input your id and password'});        
    } else {
        res.redirect('/lobby');
    }
});

app.post('/login', // When a login request is received
    passport.authenticate('local', {
        successRedirect: '/lobby',
        failureRedirect: '/login',
        failureFlash: true
    })
);

app.get('/logout', (req, res) => { // Logout request
    let db = mysql.createConnection(db_config);
    db.connect();
    db.query('UPDATE user SET last_connection=NOW() WHERE username=?', [req.user.username]);
    db.end();
    req.logout();
    res.redirect('/login');
});

app.get('/signup', (req, res) => { // signup page
    if(!req.user) {
        res.render('signup', {message: 'input sign up data'});
    } else {
        res.redirect('/lobby', {message: req.user.username});
    }
});

app.post('/signup', (req, res) => { // Sign Up request
    let db = mysql.createConnection(db_config);
    db.connect();
    console.log(res.body)
    db.query('SELECT * FROM user WHERE username=?', [req.body.username], (err, results) => {
        if(err)
            res.render('signup', {message: 'Please input sign up data'});
        if(!!results[0])
            res.render('signup', {message: 'Already existing username!!'});
        else {
            // Encrypting password with random salt and inserting new user data in database
            const randomSalt = crypto.randomBytes(32).toString("hex");
            crypto.pbkdf2(req.body.password, randomSalt, 65536, 64, "sha512", (err, encryptedPassword) => { 
                const passwordWithSalt = encryptedPassword.toString("hex")+"$"+randomSalt;
                db.query(
                    "insert into user(username, password, email, win, loss, draw,last_connection) values(?,?,?, 0, 0, 0, NOW())",  
                    [req.body.username, passwordWithSalt, req.body.email], (err2)=> {
                        db.end();
                        if(err2) 
                            res.render('signup', {message: 'failed creating new account'}); // if error occurred
                        else
                            res.redirect('/login');
                });
            });
        }
    });
});

app.get('/lobby', (req, res) => { // Lobby page
    if(!req.user) {
        res.redirect('/login');
    } else {
        res.render('lobby', {username: req.user.username});
    }
});

app.get('/newroom', (req, res) => { // Making new room page
    if(!req.user) {
        res.redirect('/login');
    } else {
        res.render('newroom', {message: ''});
    }
});

app.post('/newroom', (req, res) => { // Making new room request
    if(!req.user) {
        res.redirect('/login');
    } else {
        roomList.forEach((elem) => {
            if(elem.name == req.body.roomname) { // If already exist
                res.redirect('/newroom', {message: 'A room with the same name already exists.'});
            }
        });
        let room = { // Create new room data
            name: req.body.roomname,
            players: new Array(),
            max_player_count: req.body.max,
            ready: 0,
            started: false,
            ended: false
        };
        roomList.push(room);
        lobbyIO.emit('lobby:resRoomList', roomList);

        res.redirect('/game/' + req.body.roomname);
    }
});

app.get('/game/:roomname', (req, res) => { // Entering game room
    if(!req.user) {
        res.redirect('/login');
    } else {
        let room;
        roomList.forEach((elem) => { // Find room data from roomList
            if(req.params.roomname == elem.name) {
                room = elem;
            }
            if(elem.players.length == elem.max_player_count || elem.started || elem.ended) {
                res.redirect('/lobby'); // If room is full or game already started or game already ended
            }
        });
        if(!room) { // If room is not exist
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

server.listen(port, function() { // Open server
  console.log(`Listening on http://localhost:${port}/`);
});