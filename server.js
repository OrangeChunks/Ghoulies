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

    if (["J","Q","K"].includes(v)){
      return t + 10;
    }

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

    /* 10 RULE */
    tenSwap:null,

    /* GHOULIES */
    ghouliesCaller:null,
    finalTurnPlayer:null,

    gameOver:false
  };
}

const rooms = {};

function getRoom(socket){

  const room =
    [...socket.rooms]
      .find(r => r !== socket.id);

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
      g.finalTurnPlayer = null;
    }
  }

  function endTurn(g,id){

    if (
      g.finalTurnPlayer &&
      id === g.finalTurnPlayer
    ){

      finishRound(g);

    } else {

      nextTurn(g);
    }
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

        /* stage 1 = choose own */
        selectingOwn:true,

        ownIndex:null
      };

      io.to(roomId(socket)).emit("state", g);

      return;
    }

    endTurn(g,socket.id);

    io.to(roomId(socket)).emit("state", g);
  });

  /* 🔥 10 PICK OWN CARD */
  socket.on("tenOwn", index => {

    const g = getRoom(socket);

    if (!g) return;

    if (!g.tenSwap) return;

    if (g.tenSwap.player !== socket.id){
      return;
    }

    g.tenSwap.ownIndex = index;

    /* move to opponent selection */
    g.tenSwap.selectingOwn = false;

    io.to(roomId(socket)).emit("state", g);
  });

  /* 🔥 10 PICK OPPONENT CARD */
  socket.on("tenOpp", oppIndex => {

    const g = getRoom(socket);

    if (!g) return;

    if (!g.tenSwap) return;

    const playerId = g.tenSwap.player;

    if (playerId !== socket.id){
      return;
    }

    const oppId =
      g.order.find(id => id !== playerId);

    const p1 = g.players[playerId];
    const p2 = g.players[oppId];

    const i1 = g.tenSwap.ownIndex;
    const i2 = oppIndex;

    if (
      i1 == null ||
      i2 == null
    ){
      return;
    }

    const temp = p1.hand[i1];

    p1.hand[i1] = p2.hand[i2];
    p2.hand[i2] = temp;

    g.tenSwap = null;

    endTurn(g,playerId);

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

  /* GHOULIES */
  socket.on("callGhoulies", () => {

    const g = getRoom(socket);

    if (!g) return;

    if (g.ghouliesCaller) return;

    const caller = socket.id;

    const other =
      g.order.find(id => id !== caller);

    g.ghouliesCaller = caller;

    /* ONLY opponent gets final turn */
    g.finalTurnPlayer = other;

    g.turn =
      g.order.indexOf(other);

    io.to(roomId(socket)).emit("state", g);
  });

  /* RESTART */
  socket.on("restart", room => {

    rooms[room] = newGame();

    io.to(room).emit(
      "state",
      rooms[room]
    );
  });

  socket.on("disconnect", () => {

    const room =
      roomId(socket);

    if (!room) return;

    const g = rooms[room];

    if (!g) return;

    delete g.players[socket.id];

    g.order =
      g.order.filter(
        id => id !== socket.id
      );

    io.to(room).emit("state", g);
  });
});

server.listen(
  process.env.PORT || 3000,
  () => console.log("Server running")
);