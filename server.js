const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static("public"));

/* =========================
   DECK
========================= */
const SUITS = ["♠","♥","♦","♣"];
const VALUES = ["A","2","3","4","5","6","7","8","9","10","J","Q","K"];

function shuffle(a){
  return a.sort(()=>Math.random()-0.5);
}

function createDeck(){
  let d=[];
  for(let s of SUITS){
    for(let v of VALUES){
      d.push(v+s);
    }
  }
  return shuffle(d);
}

/* =========================
   GAME STATE
========================= */
const rooms = {};

function createGame(){
  const deck = createDeck();

  return {
    deck,
    discard:[deck.pop()],
    players:{},
    order: [], // 🔥 turn order
    turn: 0,
    phase:"choose",
    message:""
  };
}

/* =========================
   SOCKET
========================= */
io.on("connection",(socket)=>{

  let roomId = null;

  socket.on("join",(id)=>{

    roomId = id;

    if(!rooms[roomId]){
      rooms[roomId] = createGame();
    }

    const game = rooms[roomId];

    if(Object.keys(game.players).length < 2){

      game.players[socket.id] = {
        id: socket.id,
        hand: game.deck.splice(0,4),
        pendingDraw: null
      };

      game.order.push(socket.id); // 🔥 add to turn order
    }

    socket.join(roomId);

    socket.emit("you", socket.id);

    io.to(roomId).emit("state",game);
  });

  function isMyTurn(game, socket){
    return game.order[game.turn] === socket.id;
  }

  function nextTurn(game){
    game.turn = (game.turn + 1) % game.order.length;
  }

  /* DRAW */
  socket.on("draw",()=>{

    const game = rooms[roomId];
    const p = game.players[socket.id];

    if(!game || game.phase !== "choose") return;
    if(!isMyTurn(game, socket)) return;

    const drawn = game.deck.pop();

    p.pendingDraw = drawn;
    game.phase = "resolve";

    game.message = `Player drew a card`;

    io.to(roomId).emit("state",game);
  });

  /* TAKE DISCARD */
  socket.on("takeDiscard",(clientCard)=>{

    const game = rooms[roomId];
    const p = game.players[socket.id];

    if(!game || game.phase !== "choose") return;
    if(!isMyTurn(game, socket)) return;

    const topCard = game.discard.at(-1);
    if (clientCard !== topCard) return;

    game.discard.pop();

    p.pendingDraw = topCard;
    game.phase = "resolve";

    game.message = `Player took discard`;

    io.to(roomId).emit("state",game);
  });

  /* SWAP */
  socket.on("swap",(card)=>{

    const game = rooms[roomId];
    const p = game.players[socket.id];

    if(!p?.pendingDraw) return;
    if(!isMyTurn(game, socket)) return;

    const i = p.hand.indexOf(card);
    if(i === -1) return;

    const old = p.hand[i];

    p.hand[i] = p.pendingDraw;
    game.discard.push(old);

    p.pendingDraw = null;

    game.phase = "choose";

    nextTurn(game); // 🔥 TURN SWITCH

    io.to(roomId).emit("state",game);
  });

});

server.listen(process.env.PORT || 3000, () => {
  console.log("Server running");
});