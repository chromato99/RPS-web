let socket = io('/game');
socket.emit('newPlayer', roomname);
socket.emit('reqRoomData');

let chatform = document.getElementById('chatform');
let modal = document.getElementById('myModal');

function showLobbyUserList() {
    let userlist = document.getElementById('userlist');
    if(document.getElementById('userlist').style.display == 'none') {
        document.getElementById('userlist').style.display = "block";
        socket.emit('reqLobbyUserList');
    } else {
        document.getElementById('userlist').style.display = "none";
    }
}

function closeModal() {
    modal.style.display = 'none';
}

function closeGame() {
    modal.style.display = 'none';
    socket.disconnect();
    window.location.href = '/lobby';
}

function invite(id) {
    let button = document.getElementById(id);
    button.innerHTML = 'Invited';
    button.disabled = true;
    socket.emit('reqInviteUser', id);
}

function setReady() {
    let readybtn = document.getElementById('readybtn');
    readybtn.disabled = true;
    socket.emit('ready');
}

function setRock() {
    modal.style.display = 'none';
    socket.emit('setSelection', 'rock', 1);
}

function setPaper() {
    modal.style.display = 'none';
    socket.emit('setSelection', 'paper', 2);
}

function setScissor() {
    modal.style.display = 'none';
    socket.emit('setSelection', 'scissor', 3);
}

socket.on('gameStarted', (data) => { // 게임 시작됩을 알려주는 응답
    let showbtn = document.getElementById('showbtn');
    showbtn.style.display = 'none';
    let insideModal = document.getElementById('insideModal');
    modal.style.display = 'block';
    insideModal.innerHTML = `
        <h2>Game Started!!</h2>
        <h3>Select your choice</h3>
        <button onclick="setRock()">Rock</button>
        <button onclick="setScissor()">Scissor</button>
        <button onclick="setPaper()">Paper</button>
    `;
});

socket.on('draw', () => {
    let insideModal = document.getElementById('insideModal');
    let chatarea = document.getElementById('chatarea');
    chatarea.append("\n" + 'Game Ended');

    modal.style.display = 'block';
    insideModal.innerHTML = `
        <h2>You Draw</h2>
        <button onclick="closeModal()">Show Results</button>
        <button onclick="closeGame()">Back To Lobby</button>
    `;
});

socket.on('winloss', (players, winSelection) => {
    let insideModal = document.getElementById('insideModal');
    let chatarea = document.getElementById('chatarea');
    chatarea.append("\n" + 'Game Ended');

    let player;
    players.forEach((elem) => {
        if(elem.name == username) {
            player = elem;
        }
    });

    if(player.selection == winSelection) {
        insideModal.innerHTML = `
            <h2>You Win!!</h2>
            <button onclick="closeModal()">Show Results</button>
            <button onclick="closeGame()">Back To Lobby</button>
        `;
    } else {
        insideModal.innerHTML = `
            <h2>You Lose T.T</h2>
            <button onclick="closeModal()">Show Results</button>
            <button onclick="closeGame()">Back To Lobby</button>
        `;
    }
    modal.style.display = 'block';
});

// 메시지 수신시 HTML에 메시지 내용 작성
socket.on('message', (msg) => {
    let chatarea = document.getElementById('chatarea');
    chatarea.append("\n" + msg);
});

socket.on('emitChat', (msg, username) => {
    let chatarea = document.getElementById('chatarea');
    chatarea.append("\n" + username + " : " + msg);
});

socket.on('resRoomData', (data) => {
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

socket.on('resLobbyUserList', (data) => {
    let userList = document.getElementById('userlist');
    userList.innerHTML = '';
    data.forEach((elem) => {
        userList.innerHTML += `
        <li >${elem.username}<button id="${elem.id}" onclick="invite('${elem.id}')" >Invite</button></li>
        `;
    });
});

socket.on('userDisconnected', (username) => {

});
chatform.onsubmit = (e) => {
    e.preventDefault();
    let chatinput = document.getElementById('chatinput');

    // socket.emit으로 서버에 채팅 전달
    socket.emit('sendChat', chatinput.value, username);

    chatinput.value = "";
};