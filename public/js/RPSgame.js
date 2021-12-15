let socket = io('/game');
socket.emit('newPlayer', roomname);
socket.emit('reqRoomData');

let chatform = document.getElementById('chatform');
let modal = document.getElementById('myModal');

function showLobbyUserList() { // Show lobby user list button onclicked
    let userlist = document.getElementById('userlist');
    if(document.getElementById('userlist').style.display == 'none') {
        document.getElementById('userlist').style.display = "block";
        socket.emit('reqLobbyUserList');
    } else {
        document.getElementById('userlist').style.display = "none";
    }
}

function closeModal() { // Close modal window button onclicked
    modal.style.display = 'none';
}

function closeGame() { // Close game button onclicked
    modal.style.display = 'none';
    socket.disconnect();
    window.location.href = '/lobby';
}

function invite(id) { // Invite button onclicked
    let button = document.getElementById(id);
    button.innerHTML = 'Invited';
    button.disabled = true;
    socket.emit('reqInviteUser', id);
}

function setReady() { // Ready button onclicked
    let readybtn = document.getElementById('readybtn');
    readybtn.disabled = true;
    socket.emit('ready');
}

function setRock() { // Rock selection onlicked
    modal.style.display = 'none';
    socket.emit('setSelection', 'rock', 1);
}

function setPaper() { // Paper selection onlicked
    modal.style.display = 'none';
    socket.emit('setSelection', 'paper', 2);
}

function setScissor() { // Scissor selection onclicked
    modal.style.display = 'none';
    socket.emit('setSelection', 'scissor', 3);
}

socket.on('gameStarted', (data) => { // A response indicating that the game is about to start
    let showbtn = document.getElementById('showbtn');
    showbtn.style.display = 'none';
    let insideModal = document.getElementById('insideModal');
    modal.style.display = 'block';

    // Popup modal window to indicate game started and to choose selection
    insideModal.innerHTML = ` 
        <h2>Game Started!!</h2>
        <h3>Select your choice</h3>
        <button onclick="setRock()" style="height: 100px; width: 100px;"><img style="width: 100%;" src="https://t3.ftcdn.net/jpg/00/60/63/86/240_F_60638664_Fv7a3fZFPiV2UzGzHJ5m4Fh2Hr4Auxf0.jpg"></button>
        <button onclick="setScissor()" style="height: 100px; width: 100px;"><img style="width: 100%;" src="https://t3.ftcdn.net/jpg/00/60/63/36/240_F_60633690_3o9vxNFlhh9tCJK30Rzq1AErRHbfJ5jC.jpg"></button>
        <button onclick="setPaper()" style="height: 100px; width: 100px;"><img style="width: 100%;" src="https://t3.ftcdn.net/jpg/00/60/69/84/240_F_60698479_hBqzKxYyI5XC2f0E8WkcFUFAUNiTnM2K.jpg"></button>
    `;
});

socket.on('draw', () => { // When game is draw
    let insideModal = document.getElementById('insideModal');
    let chatarea = document.getElementById('chatarea');
    chatarea.append("\n" + 'Game Ended');

    modal.style.display = 'block';
    insideModal.innerHTML = `
        <h2>You Draw</h2>
        <h3>Game records are stored in your account information.</h3><br>
        <table style="display: inline-block;">
        <tr>
            <td><button onclick="closeModal()" style="height: 50px; width: 100px;">Show Results</button></td>
            <td><button onclick="closeGame()" style="height: 50px; width: 100px;">Back To Lobby</button></td>
        </tr>
        </table>
    `;
});

socket.on('winloss', (players, winSelection) => { // When game has winner and loser
    let insideModal = document.getElementById('insideModal');
    let chatarea = document.getElementById('chatarea');
    chatarea.append("\n" + 'Game Ended');

    let player;
    players.forEach((elem) => {
        if(elem.name == username) {
            player = elem;
        }
    });

    if(player.selection == winSelection) { // Check win or loss
        insideModal.innerHTML = `
            <h2>You Win!!</h2>
            <h3>Game records are stored in your account information.</h3><br>
            <table style="display: inline-block;">
            <tr>
                <td><button onclick="closeModal()" style="height: 50px; width: 100px;">Show Results</button></td>
                <td><button onclick="closeGame()" style="height: 50px; width: 100px;">Back To Lobby</button></td>
            </tr>
            </table>
        `;
    } else {
        insideModal.innerHTML = `
            <h2>You Lose T.T</h2>
            <h3>Game records are stored in your account information.</h3><br>
            <table style="display: inline-block;">
            <tr>
                <td><button onclick="closeModal()" style="height: 50px; width: 100px;">Show Results</button></td>
                <td><button onclick="closeGame()" style="height: 50px; width: 100px;">Back To Lobby</button></td>
            </tr>
            </table>
        `;
    }
    modal.style.display = 'block';
});

socket.on('message', (msg) => { // System message from server
    let chatarea = document.getElementById('chatarea');
    chatarea.append("\n" + msg);
});

socket.on('emitChat', (msg, username) => { // Chat message from server
    let chatarea = document.getElementById('chatarea');
    chatarea.append("\n" + username + " : " + msg);
    document.getElementById("chatarea").scrollTop = document.getElementById("chatarea").scrollHeight;
});

socket.on('resRoomData', (data) => { // Room data from server 
    for(let i = 0; i < data.players.length; i++) {
        let td = document.getElementById(i.toString());
        td.innerHTML = `
            <table>
                <tr>
                    <td class="status">${data.players[i].name}</td>
                </tr>
                <tr>
                    <td class="status">${data.players[i].status}</td>
                </tr>
            </table>
        `;
    }
});

socket.on('resLobbyUserList', (data) => { // Lobby user list from server
    let userList = document.getElementById('userlist');
    userList.innerHTML = '';
    data.forEach((elem) => {
        userList.innerHTML += `
        <li >${elem.username}<button id="${elem.id}" onclick="invite('${elem.id}')" >Invite</button></li>
        `;
    });
});

socket.on('gameBroked', () => { // When game is broked
    let chatarea = document.getElementById('chatarea');
    chatarea.append("\n" +"Game Broked!!! Please back to lobby.");
    let insideModal = document.getElementById('insideModal');

    modal.style.display = 'block';

    // Player must close game and back to lobby
    insideModal.innerHTML = `
        <h2>Game Broked!!!</h2>
        <p>The game broked because the player was disconnected. Records will not be saved, so please return to the lobby.</p>
        <button onclick="closeGame()" style="height: 100px; width: 100px;">Back To Lobby</button>
    `;
});

socket.on('userDisconnected', (username) => { // When some user in room disconnected
    let chatarea = document.getElementById('chatarea');
    chatarea.append("\n" + username +" Disconnected.");
});

chatform.onsubmit = (e) => { // When chat send button onlicked
    e.preventDefault();
    let chatinput = document.getElementById('chatinput');

    // socket.emit으로 서버에 채팅 전달
    socket.emit('sendChat', chatinput.value, username);

    chatinput.value = "";
};