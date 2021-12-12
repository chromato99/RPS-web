let express = require('express');

let app = express();
let port = 8000;

let server = require('http').createServer(app);
let session = require('express-session');
let MySQLStore = require('express-mysql-session')(session);
let flash = require('connect-flash');
let compression = require('compression');
let crypto = require('crypto');
let passport = require('passport'); // https://strongstar.tistory.com/42
let LocalStrategy = require('passport-local').Strategy;
let ejs = require('ejs');
let mysql = require('mysql');
let io = require('socket.io')(server);
let poker = require('pokersolver').Hand;
let card = require('./src/card');
let Table = require('./src/table');
const db_config = require('./src/db-config');
let bodyParser = require('body-parser');

let table = new Table();


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

app.get('/lobby', (req, res) => {
    if(!req.user) {
        res.redirect('/login');
    } else {
        res.render('lobby', {username: req.user.username});
    }
});

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

app.post('/login', // 로그인 요청이 들어왔을때
    passport.authenticate('local', {
        successRedirect: '/lobby',
        failureRedirect: '/login',
        failureFlash: true
    })
);

io.on('connection', (socket) => {   //연결이 들어오면 실행되는 이벤트
    // socket 변수에는 실행 시점에 연결한 상대와 연결된 소켓의 객체가 들어있다.
    socket.data.player = {
        username: '',
        chip: 1000,
        hand: new Array(), // 현재 패
        currentBet: 0,  // 현재 라운드에서 얼마 베팅 했는지
        folded: false,
        allIn: false,
        status: false, // 현재 라운드에서 행동 했는지 확인
        pos: 0 // table.players 배열에서의 위치
    }
    table.players.push(socket.data.player);
    socket.data.player.pos = table.players.indexOf(socket.data.player);
    
    socket.on('newplayer',(msg) => { // 새로운 플레이어 입장
        socket.data.player.username = msg;
        socket.emit('setStatus', {playerCount: io.engine.clientsCount,player: socket.data.player}); // 새로운 플레이어 정보 설정
        
        if(io.engine.clientsCount > 1) { // 3명 이상 입장시 자동 게임 시작
            console.log('Start Game!');
            table.startGame(); // 게임 시작
            console.log(table);
            io.emit('startGame', {currentPlayer: table.currentPlayer, dealer: table.dealer, SB: table.SB, BB: table.BB});
        }
    });

    socket.on('getPlayerData', (msg) => { // 각 연결된 소켓들이 데이터 전송을 받기 위한 요청
        //console.log(socket.data.player);
        socket.emit('updateData', socket.data.player, {board: table.board, currentPlayer: table.currentPlayer, pot: table.pot, round: table.round});
    });

    socket.on('chatsend', (msg, username) => {
        io.emit('chatemit', msg, username);
    });

    socket.on('bet', (msg) => {
        console.log(socket.data.player);
        table.bet(socket.data.player, msg);
        if(socket.data.player.allIn == true) { // 플레이어가 올인 했을시
            io.emit('message', socket.data.player.username + " All In!!!");
        } else {
            io.emit('message', socket.data.player.username + " bet " + msg);
        }
    });
    socket.on('check', (msg) => {
        table.call(socket.data.player);
        //table.check(socket.data.player);
        io.emit('message', socket.data.player.username + " check");
    });
    socket.on('call', (msg) => {
        table.call(socket.data.player);
        io.emit('message', socket.data.player.username + " call");
    });
    socket.on('fold', (msg) => {
        table.fold(socket.data.player);
        io.emit('message', socket.data.player.username + " fold");
    });
});

server.listen(port, function() {
  console.log(`Listening on http://localhost:${port}/`);
});