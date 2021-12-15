var socket = io('/lobby');
socket.emit('lobby:newplayer');
socket.emit('lobby:reqRoomList');
socket.emit('lobby:reqUserList');

var chatForm = document.getElementById('chatForm');
var whisperForm = document.getElementById('whisperForm');

var modal = document.getElementById('myModal');

// Get the <span> element that closes the modal
var modalspan = document.getElementsByClassName("close")[0];

// When the user clicks on <span> (x), close the modal
modalspan.onclick = function () {
    modal.style.display = "none";
    var userData = document.getElementById('userdata');
    userData.innerHTML = '';
}

// When the user clicks anywhere outside of the modal, close it
window.onclick = function (event) {
    if (event.target == modal) {
        modal.style.display = "none";
        var userData = document.getElementById('userdata');
        userData.innerHTML = '';
    }
}

function getUserData(username) {
    modal.style.display = "block";
    console.log(username);
    socket.emit('lobby:reqUserData', username);
}

function whisper(username) {
    modal.style.display = "none";
    var userData = document.getElementById('userdata');
    userData.innerHTML = '';
    var chatInput = document.getElementById('chatInput');
    chatInput.value = username + '$$:';
}

function closeModal() {
    modal.style.display = "none";
    var userData = document.getElementById('userdata');
    userData.innerHTML = '';
}


socket.on('lobby:emitChat', (msg, username) => {
    var chatArea = document.getElementById('chatArea');
    chatArea.append("\n" + username + " : " + msg);
});

socket.on('lobby:resRoomList', (data) => {
    var roomList = document.getElementById('roomlist');
    roomList.innerHTML = `
        <th>Room Name</th>
        <th>Max</th>
        <th>Current</th>
        <th>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</th>
    `;
    data.forEach((elem) => {
        if(!elem.started) {
            roomList.innerHTML += '<tr>'
            roomList.innerHTML += `
                <td>${elem.name}</td>
                <td>${elem.max_player_count}</td>
                <td>${elem.players.length}</td>
                <td><a href="/game/${elem.name}">Join</a></td>
            `;
            roomList.innerHTML += '</tr>';
        }
    })
});

socket.on('lobby:resUserList', (data) => {
    var userList = document.getElementById('userlist');
    userList.innerHTML = '';
    userList.innerHTML += `
    <li style="margin-top: 5px; margin-bottom: 5px;">${data[0].username}&nbsp;&nbsp;&nbsp;<button onclick="getUserData('${data[0].username}')" style="display: inline-block;">Show Data</button></li>
    `;
    data.shift();
    data.forEach((elem) => {
        userList.innerHTML += `
        <li style="margin-top: 5px; margin-bottom: 5px;">${elem.username}&nbsp;&nbsp;&nbsp;<button onclick="getUserData('${elem.username}')" style="display: inline-block;">Show Data</button>&nbsp;&nbsp;<button onclick="whisper('${elem.username}')" style="display: inline-block;">Whisper</button></li>
        `;
    });
});

socket.on('lobby:resUserData', (data) => {
    var userData = document.getElementById('userdata');
    userData.innerHTML = `
        <p>User name : ${data.username}</p>
        <p>User email : ${data.email}</p>
        <p>Win : ${data.win}</p>
        <p>Loss : ${data.loss}</p>
        <p>Draw : ${data.draw}</p>
        <p>Last Login : ${data.last_connection}</p>
    `;
    if (data.username != inputname) {
        userData.innerHTML += `<button onclick="whisper('${data.username}')">Whisper</button>`;
    }
});

socket.on('lobby:invite', (username, roomname) => {
    modal.style.display = "block";
    var userData = document.getElementById('userdata');
    userData.innerHTML = `
        <p>User name : ${username}</p>
        <p>Invited you to </p>
        <button><a href="/game/${roomname}">Accept Invite</a></button>
        <button onclick="closeModal()">Cancel</button>
    `;
});


chatForm.onsubmit = (e) => {
    e.preventDefault();
    var chatInput = document.getElementById('chatInput');

    // socket.emit으로 서버에 신호를 전달
    socket.emit('lobby:sendChat', chatInput.value);

    chatInput.value = "";
};