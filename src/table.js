var card = require('./card');

module.exports = function() {
    this.board = new Array(); // 현재 테이블에 공개된 카드
    this.pot = 0;
    this.betting = 0; // 마지막으로 베팅된 금액
    this.players = new Array();
    this.dealer = 0;
    this.SB = 0; // small blind 인 플레이어 index
    this.BB = 0; // big blind 인 플레이어 index
    this.currentPlayer = 0; // 현재 턴인 플레이어 배열 번호
    this.endPlayer = 0;
    this.round = 0; // 현재 라운드
    this.smallBlind = 10;
    this.bigBlind = 20;
    this.deck = new Array(); // 아직 안뽑힌 남은 카드
    this.startGame = function() {
        this.deck = card.slice(); // 카드 정보를 덱으로 깊은 복사
        this.players.forEach((element) => { // 카드 패 돌리기
            var pick = this.deck.splice(Math.floor(Math.random() * this.deck.length),1)[0];
            element.hand.push(pick);

            pick = this.deck.splice(Math.floor(Math.random() * this.deck.length),1)[0];
            element.hand.push(pick);
        });
        this.dealer = Math.floor(Math.random() * this.players.length); // 딜러 설정
        this.currentPlayer = this.dealer;
        this.SB = this.nextPlayer();  // SB 플레이어 설정
        this.players[this.SB].chip -= this.smallBlind;
        this.pot += this.smallBlind;
        this.players[this.SB].status = true;

        this.BB = this.nextPlayer(); // BB 플레이어 설정
        this.players[this.BB].chip -= this.bigBlind;
        this.pot += this.bigBlind;
        this.players[this.BB].status = true;
        this.betting = this.bigBlind;

        this.nextPlayer();
        this.endPlayer = this.BB;
    };
    this.nextPlayer = function() {
        if(this.currentPlayer == (this.players.length - 1)) {  // 배열 마지막 번호이면 다시 처음으로
            this.currentPlayer = 0;
            if(this.players[this.currentPlayer].folded == true || this.players[this.currentPlayer].allIn == true) { // 이미 올인 했거나 폴드 했는지 확인
                return this.nextPlayer();
            }
            else {
                if(this.players[this.currentPlayer].status == true) {
                    return this.nextRound();
                }
                else {
                    return this.currentPlayer;
                }
            }
        } else {
            this.currentPlayer = this.currentPlayer + 1;
            if(this.players[this.currentPlayer].folded == true || this.players[this.currentPlayer].allIn == true) { // 이미 올인 했거나 폴드 했는지 확인
                return this.nextPlayer();
            }
            else {
                if(this.players[this.currentPlayer].status == true) {
                    return this.nextRound();
                }
                else {
                    return this.currentPlayer;
                }
            }
        }
    };
    this.nextRound = function() {
        if(this.round == 0) { // 처음에는 3장을 뽑아야 하니 3장을 뽑는다
            var pick = this.deck.splice(Math.floor(Math.random() * this.deck.length),1)[0];
            this.board.push(pick);

            pick = this.deck.splice(Math.floor(Math.random() * this.deck.length),1)[0];
            this.board.push(pick);

            pick = this.deck.splice(Math.floor(Math.random() * this.deck.length),1)[0];
            this.board.push(pick);

            this.betting = 0;
            this.round += 1;
            this.players.forEach((element) => {
                element.status = false;
                element.currentBet = 0;
            });

            this.currentPlayer = this.SB;
            return this.currentPlayer;
        } else if(this.round < 4) { // 한장씩 카드 뽑기
            var pick = this.deck.splice(Math.floor(Math.random() * this.deck.length),1)[0];
            this.board.push(pick);

            this.betting = 0;
            this.round += 1;
            this.players.forEach((element) => {
                element.status = false;
                element.currentBet = 0;
            });

            this.currentPlayer = this.SB;
            return this.currentPlayer;
        } else { // 라운드 끝나서 게임 끝내는 부분

        }
        this.currentPlayer = this.SB;
        return this.currentPlayer;
    };
    this.bet = function(player, msg) {
        let raise = parseInt(msg) + (this.betting - player.currentBet);
        if(raise > player.chip) { // 베팅한 금액이 현재 칩보다 많으면 올인으로 처리
            console.log(raise, player);
            player.allIn = true;
            this.pot += player.chip;
            this.betting += player.chip;
            player.currentBet = player.chip;
            player.chip = 0;
        } else {
            this.pot += raise;
            this.betting += raise;
            player.currentBet += raise;
            player.chip -= raise;
        }
        this.players.forEach((elem) => { // 새로 베팅 했으므로 다시 턴을 한바퀴 돌기 위해 상태 재설정
            elem.status = false;
        });
        player.status = true;
        this.nextPlayer();
    };
    this.check = function(player) {
        player.status = true;
        this.nextPlayer();
    };
    this.call = function(player) {
        if(player.currentBet < this.betting) {
            if((this.betting - player.currentBet) > player.chip) { // 베팅한 금액이 현재 칩보다 많으면 올인으로 처리
                player.allIn = true;
                this.pot += player.chip;
                this.betting += player.chip;
                player.currentBet = player.chip;
                player.chip = 0;
            } else {
                this.pot += (this.betting - player.currentBet);
                player.currentBet += (this.betting - player.currentBet);
                player.chip -= (this.betting - player.currentBet);
            }
        }
        player.status = true;
        this.nextPlayer();
    };
    this.fold = function(player) {
        player.folded = true;
        player.status = true;
        this.nextPlayer();
    };
}
