const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static("public"));

process.on("uncaughtException", console.error);
process.on("unhandledRejection", console.error);

const SUITS = ["♠","♥","♦","♣"];
const VALUES = ["A","2","3","4","5","6","7","8","9","10","J","Q","K"];

function shuffle(a){ return a.sort(() => Math.random() - 0.5); }

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
    loser: null
  };
}

const rooms = {};

function getRoom(socket){
  const id = [...socket.rooms].find(r => r !== socket.id);
  return rooms[id];
}

function roomId(socket){
  return [...socket.rooms].find(r => r !== socket.id);
}

function checkWin(g){
  for (let id in g.scores){
    if (g.scores[id] >= 51){
      g.gameOver = true;
      g.loser = id;
    }
  }
}

io.on("connection", (socket) => {

  socket.on("join", (room) => {
    if (!rooms[room]) rooms[room] = newGame();

    const g = rooms[room];
    socket.join(room);

    if (!g.players[socket.id] && Object.keys(g.players).length < 2){
      g.players[socket.id] = {
        hand: g.deck.splice(0,4),
        pending: null
      };

      g.order.push(socket.id);
      g.scores[socket.id] = 0;
    }

    socket.emit("you", socket.id);
    io.to(room).emit("state", g);
  });

  const isTurn = (g) => g.order[g.turn] === socket.id;

  socket.on("draw", () => {
    const g = getRoom(socket);
    if (!g || g.gameOver) return;
    if (!isTurn(g)) return;

    g.players[socket.id].pending = g.deck.pop();
    io.to(roomId(socket)).emit("state", g);
  });

  socket.on("takeDiscard", () => {
    const g = getRoom(socket);
    const p = g.players[socket.id];

    if (!p.pending && g.discard.length){
      p.pending = g.discard.pop();
    }

    io.to(roomId(socket)).emit("state", g);
  });

  socket.on("swap", (card) => {
    const g = getRoom(socket);
    const p = g.players[socket.id];

    const i = p.hand.indexOf(card);
    if (i === -1) return;

    const old = p.hand[i];
    p.hand[i] = p.pending;
    g.discard.push(old);
    p.pending = null;

    g.turn = (g.turn + 1) % g.order.length;

    io.to(roomId(socket)).emit("state", g);
  });

  socket.on("snap", (card) => {
    const g = getRoom(socket);
    if (!g || g.gameOver) return;

    const p = g.players[socket.id];
    const top = g.discard.at(-1);

    if (top && card.slice(0,-1) === top.slice(0,-1)){
      p.hand = p.hand.filter(c => c !== card);
      g.discard.push(card);
    }

    io.to(roomId(socket)).emit("state", g);
  });

  socket.on("restart", (room) => {
    const deck = createDeck();

    rooms[room] = {
      deck,
      discard: [deck.pop()],
      players: {},
      order: [],
      turn: 0,
      scores: {},
      gameOver: false,
      loser: null
    };

    io.to(room).emit("state", rooms[room]);
  });

});

const PORT = process.env.PORT || 3000;

server.listen(PORT, () => console.log("Running on", PORT));