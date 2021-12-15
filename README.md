# RPS-web
Rock Paper Scissor online web game.<br>
Gachon university networking term project.

Page for testing : http://chromato99.com

# Description
This is a service that provides a rock-paper-scissors(RPS) web game.

It was developed with the goal of implementing experimental features for the realization of online web games. The game was implemented simply and focused on features such as account creation, management, game room creation, game invitation, and chatting.

- Main Features
Account management (login, signup, logout, etc.)<br>
Security (Passwords are encrypted with Node.js crypto library)<br>
Making game room (Managements with roomList array)<br>
Show other player's record<br>
Ingame chatting<br>
Error handling ex) player disconnected<br>
Inviting player

- Example Screenshots
<img src="https://user-images.githubusercontent.com/20539422/146131998-38e6b0a5-2e97-4d3e-976b-8820fa8e9fd2.png"  width="60%" height="60%"/>
<img src="https://user-images.githubusercontent.com/20539422/146132032-0946e456-896b-4f15-ae59-77470f1eacc9.png"  width="60%" height="60%"/>
<img src="https://user-images.githubusercontent.com/20539422/146132052-95b31e27-31aa-40c4-8f19-e18316f09dcf.png"  width="60%" height="60%"/>
<img src="https://user-images.githubusercontent.com/20539422/146132067-6ce270c5-90d5-4e34-811b-bcf453fcc0fc.png"  width="60%" height="60%"/>
<img src="https://user-images.githubusercontent.com/20539422/146132086-40dd3f02-5208-4c53-b887-aa466a973f3a.png"  width="60%" height="60%"/>

# Project Structure
<img src="https://user-images.githubusercontent.com/20539422/146131273-24622d6a-00cd-42f1-a97b-fe9d66572499.png"  width="40%" height="40%"/>

server.js : Main execution of this service

/public : A folder for static files, including image files, CSS, etc.<br>
&nbsp;&nbsp;&nbsp;&nbsp;/css : CSS files<br>
&nbsp;&nbsp;&nbsp;&nbsp;/img : Image files<br>
&nbsp;&nbsp;&nbsp;&nbsp;/js : JavaScript files<br>

/src : Source code of RPS-web modules.<br>
&nbsp;&nbsp;&nbsp;&nbsp;db.template.js : Configuration file of DB connection (Should be rename to db-config.js)<br>
&nbsp;&nbsp;&nbsp;&nbsp;gameHandler.js : A collection of functions used for game socket handling.<br>
&nbsp;&nbsp;&nbsp;&nbsp;lobbyHandler.js : A collection of functions used for lobby socket handling.


/views : Frontend ejs template directory.<br>
&nbsp;&nbsp;&nbsp;&nbsp;RPSgame.ejs : Main RPS game playing page.<br>
&nbsp;&nbsp;&nbsp;&nbsp;lobby.ejs : Main lobby page.<br>
&nbsp;&nbsp;&nbsp;&nbsp;login.ejs : Main login page.<br>
&nbsp;&nbsp;&nbsp;&nbsp;newroom.ejs : Page for making new room<br>
&nbsp;&nbsp;&nbsp;&nbsp;signup.ejs : Main signup page.
 
# Run on localhost
1) Set MySQL server and table structure as below. (If you want to use different table structure, you need to edit source code)
<img src="https://user-images.githubusercontent.com/20539422/146132430-468d0141-fcca-4092-b45b-97e36aabeb8b.png"  width="65%" height="65%"/>

2) Rename db.template.js to db-config.js and set with your db configuration.
```javascript
var dbConfig ={
    host:'example.com',
    user:'example',
    password:'password',
    database:'RPS'
});
```

3) Run Server with Node.js
```
cd <project directory>
npm install
node server.js
```

# Tech Stack
[FE] HTML / CSS / Javascript<br>
[BE] Node.js, Express, Passport.js, Socket.io, PM2<br>
[Database] MySQL<br>
Icon images from Flaticon and Adobe Stock : https://www.flaticon.com , https://stock.adobe.com/kr/ 
