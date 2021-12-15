var socket = io('/lobby');

// Request general information for the lobby
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

// When show user data onclicked
function getUserData(username) {
    modal.style.display = "block";
    console.log(username);
    socket.emit('lobby:reqUserData', username);
}

// When whisper button onclicked
function whisper(username) {
    modal.style.display = "none";
    var userData = document.getElementById('userdata');
    userData.innerHTML = '';
    var chatInput = document.getElementById('chatInput'); // Set the whisper form to the chat input box
    chatInput.value = username + '$$:';
}

// Close modal window button onclicked
function closeModal() {
    modal.style.display = "none";
    var userData = document.getElementById('userdata');
    userData.innerHTML = '';
}

// Chat message from server
socket.on('lobby:emitChat', (msg, username) => {
    var chatArea = document.getElementById('chatArea');
    chatArea.append("\n" + username + " : " + msg);
});

// Room list data from server
socket.on('lobby:resRoomList', (data) => {
    var roomList = document.getElementById('roomlist');
    roomList.innerHTML = `
        <th>Room Name</th>
        <th>Max</th>
        <th>Current</th>
        <th>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</th>
    `;
    data.forEach((elem) => {
        if(!elem.started && !elem.ended) {
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


// User list data from server
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

// Specific user data from server
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


// Inviting request from server
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

// Chat send button onclicked
chatForm.onsubmit = (e) => {
    e.preventDefault();
    var chatInput = document.getElementById('chatInput');

    // Send message to server with socket.emit
    socket.emit('lobby:sendChat', chatInput.value);

    chatInput.value = "";
};