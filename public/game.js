const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static("public"));

const SUITS = ["♠","♥","♦","♣"];
const VALUES = ["A","2","3","4","5","6","7","8","9","10","J","Q","K"];

function shuffle(a){
  return a.sort(() => Math.random() - 0.5);
}

function createDeck(){
  let d = [];

  for (let s of SUITS){
    for (let v of VALUES){
      d.push(v + s);
    }
  }

  return shuffle(d);
}

function newGame(){

  const deck = createDeck();

  return {
    deck,
    discard: [deck.pop()],
    players: {},
    order: [],
    turn: 0,
    scores: {},
    gameOver: false,

    tenSwap: null
  };
}

const rooms = {};

function getRoom(socket){
  const room = [...socket.rooms].find(r => r !== socket.id);
  return rooms[room];
}

function roomId(socket){
  return [...socket.rooms].find(r => r !== socket.id);
}

io.on("connection", (socket) => {

  socket.on("join", room => {

    if (!rooms[room]){
      rooms[room] = newGame();
    }

    const g = rooms[room];

    socket.join(room);

    if (
      !g.players[socket.id] &&
      Object.keys(g.players).length < 2
    ){

      g.players[socket.id] = {
        hand: g.deck.splice(0,5),
        pending: null
      };

      g.order.push(socket.id);
      g.scores[socket.id] = 0;
    }

    socket.emit("you", socket.id);

    io.to(room).emit("state", g);
  });

  const isTurn = g =>
    g.order[g.turn] === socket.id;

  /* DRAW */
  socket.on("draw", () => {

    const g = getRoom(socket);

    if (!g || g.gameOver) return;
    if (!isTurn(g)) return;

    g.players[socket.id].pending = g.deck.pop();

    io.to(roomId(socket)).emit("state", g);
  });

  /* TAKE DISCARD */
  socket.on("takeDiscard", () => {

    const g = getRoom(socket);
    const p = g.players[socket.id];

    if (!p.pending && g.discard.length){
      p.pending = g.discard.pop();
    }

    io.to(roomId(socket)).emit("state", g);
  });

  /* SWAP */
  socket.on("swap", card => {

    const g = getRoom(socket);
    const p = g.players[socket.id];

    const i = p.hand.indexOf(card);

    if (i === -1) return;

    const old = p.hand[i];

    p.hand[i] = p.pending;

    g.discard.push(old);

    p.pending = null;

    /* 🔥 10 RULE */
    if (old.startsWith("10")){

      g.tenSwap = {
        player: socket.id,
        step: 1,
        ownCard: null
      };

    } else {

      g.turn =
        (g.turn + 1) % g.order.length;
    }

    io.to(roomId(socket)).emit("state", g);
  });

  /* 10 SELECT OWN */
  socket.on("tenOwn", card => {

    const g = getRoom(socket);

    if (!g.tenSwap) return;

    g.tenSwap.ownCard = card;
    g.tenSwap.step = 2;

    io.to(roomId(socket)).emit("state", g);
  });

  /* 10 SELECT OPPONENT */
  socket.on("tenOpp", oppCard => {

    const g = getRoom(socket);

    if (!g.tenSwap) return;

    const playerId = g.tenSwap.player;

    const oppId =
      g.order.find(id => id !== playerId);

    const p1 = g.players[playerId];
    const p2 = g.players[oppId];

    const i1 =
      p1.hand.indexOf(g.tenSwap.ownCard);

    const i2 =
      p2.hand.indexOf(oppCard);

    if (i1 === -1 || i2 === -1) return;

    const temp = p1.hand[i1];

    p1.hand[i1] = p2.hand[i2];
    p2.hand[i2] = temp;

    g.tenSwap = null;

    /* END TURN */
    g.turn =
      (g.turn + 1) % g.order.length;

    io.to(roomId(socket)).emit("state", g);
  });

  /* GHOULIES */
  socket.on("callGhoulies", () => {

    const g = getRoom(socket);

    if (!g) return;

    g.turn =
      (g.turn + 1) % g.order.length;

    io.to(roomId(socket)).emit("state", g);
  });

});