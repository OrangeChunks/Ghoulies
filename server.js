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

function calculate(hand){

  return hand.reduce((t,c) => {

    const v = c.slice(0,-1);

    if (v === "A") return t + 1;
    if (["J","Q","K"].includes(v)) return t + 10;

    return t + Number(v);

  },0);
}

function newGame(){

  const deck = createDeck();

  return {
    deck,
    discard:[deck.pop()],
    players:{},
    order:[],
    turn:0,
    scores:{},

    /* 10 mechanic */
    tenSwap:null,

    /* ghoulies */
    ghouliesCaller:null,
    finalTurn:false,

    gameOver:false
  };
}

const rooms = {};

function getRoom(socket){

  const room =
    [...socket.rooms].find(r => r !== socket.id);

  return rooms[room];
}

function roomId(socket){

  return [...socket.rooms]
    .find(r => r !== socket.id);
}

io.on("connection", socket => {

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
        hand:g.deck.splice(0,5),
        pending:null
      };

      g.order.push(socket.id);

      g.scores[socket.id] =
        g.scores[socket.id] || 0;
    }

    socket.emit("you", socket.id);

    io.to(room).emit("state", g);
  });

  function isTurn(g,id){
    return g.order[g.turn] === id;
  }

  /* DRAW */
  socket.on("draw", () => {

    const g = getRoom(socket);

    if (!g) return;
    if (!isTurn(g,socket.id)) return;

    const p = g.players[socket.id];

    if (p.pending) return;

    p.pending = g.deck.pop();

    io.to(roomId(socket)).emit("state", g);
  });

  /* TAKE DISCARD */
  socket.on("takeDiscard", () => {

    const g = getRoom(socket);

    if (!g) return;
    if (!isTurn(g,socket.id)) return;

    const p = g.players[socket.id];

    if (p.pending) return;
    if (!g.discard.length) return;

    p.pending = g.discard.pop();

    io.to(roomId(socket)).emit("state", g);
  });

  /* SWAP */
  socket.on("swap", card => {

    const g = getRoom(socket);

    if (!g) return;
    if (!isTurn(g,socket.id)) return;

    const p = g.players[socket.id];

    if (!p.pending) return;

    const i = p.hand.indexOf(card);

    if (i === -1) return;

    const discarded = p.hand[i];

    p.hand[i] = p.pending;

    p.pending = null;

    g.discard.push(discarded);

    /* 🔥 10 RULE */
    if (discarded.startsWith("10")){

      g.tenSwap = {
        player:socket.id,
        selectingOwn:true,
        ownCard:null
      };

      io.to(roomId(socket)).emit("state", g);
      return;
    }

    /* ghoulies final turn */
    if (g.finalTurn){

      finishRound(g);

    } else {

      nextTurn(g);
    }

    io.to(roomId(socket)).emit("state", g);
  });

  /* 🔥 10 OWN CARD */
  socket.on("tenOwn", card => {

    const g = getRoom(socket);

    if (!g?.tenSwap) return;

    if (g.tenSwap.player !== socket.id) return;

    g.tenSwap.ownCard = card;
    g.tenSwap.selectingOwn = false;

    io.to(roomId(socket)).emit("state", g);
  });

  /* 🔥 10 OPP CARD */
  socket.on("tenOpp", oppCard => {

    const g = getRoom(socket);

    if (!g?.tenSwap) return;

    const playerId = g.tenSwap.player;

    if (playerId !== socket.id) return;

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

    /* final ghoulies turn */
    if (g.finalTurn){

      finishRound(g);

    } else {

      nextTurn(g);
    }

    io.to(roomId(socket)).emit("state", g);
  });

  /* SNAP */
  socket.on("snap", card => {

    const g = getRoom(socket);

    if (!g) return;

    const p = g.players[socket.id];

    const top = g.discard.at(-1);

    if (!top) return;

    if (
      top.slice(0,-1) ===
      card.slice(0,-1)
    ){

      p.hand =
        p.hand.filter(c => c !== card);

      g.discard.push(card);
    }

    io.to(roomId(socket)).emit("state", g);
  });

  /* 🔥 FIXED GHOULIES */
  socket.on("callGhoulies", () => {

    const g = getRoom(socket);

    if (!g) return;

    if (g.ghouliesCaller) return;

    g.ghouliesCaller = socket.id;

    g.finalTurn = true;

    /* move to OTHER player */
    g.turn =
      (g.turn + 1) % g.order.length;

    io.to(roomId(socket)).emit("state", g);
  });

  function nextTurn(g){

    g.turn =
      (g.turn + 1) % g.order.length;
  }

  function finishRound(g){

    for (let id of g.order){

      const p = g.players[id];

      g.scores[id] += calculate(p.hand);

      if (g.scores[id] >= 51){
        g.gameOver = true;
      }
    }

    if (!g.gameOver){

      const deck = createDeck();

      g.deck = deck;

      g.discard = [deck.pop()];

      for (let id of g.order){

        g.players[id] = {
          hand:deck.splice(0,5),
          pending:null
        };
      }

      g.turn = 0;

      g.tenSwap = null;

      g.ghouliesCaller = null;
      g.finalTurn = false;
    }
  }

  /* RESTART */
  socket.on("restart", room => {

    rooms[room] = newGame();

    io.to(room).emit("state", rooms[room]);
  });
});

server.listen(
  process.env.PORT || 3000,
  () => console.log("Server running")
);