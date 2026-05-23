// server.js

const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);

const io = new Server(server);

app.use(express.static("public"));

const SUITS = ["♠","♥","♦","♣"];

const VALUES = [
  "A","2","3","4","5",
  "6","7","8","9","10",
  "J","Q","K"
];

function shuffle(a){

  return a.sort(
    () => Math.random() - 0.5
  );
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

    const s = c.slice(-1);

    if (
      v === "K" &&
      (s === "♥" || s === "♦")
    ){
      return t;
    }

    if (v === "A"){
      return t + 1;
    }

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

    startingPlayer:0,

    scores:{},

    tenSwap:null,

    ghouliesCaller:null,

    finalTurnPlayer:null,

    gameOver:false,

    losers:[],

    message:{},

    roundResult:null,

    skipTurn:{},

    effect:null
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

function roomIdFromGame(targetGame){

  return Object.keys(rooms)
    .find(r => rooms[r] === targetGame);
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

        hand:g.deck.splice(0,4),

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

    do {

      g.turn =
        (g.turn + 1) % g.order.length;

      const id =
        g.order[g.turn];

      if (g.skipTurn[id]){

        delete g.skipTurn[id];

        g.effect = {
          type:"skip",
          player:id
        };

      } else {

        break;
      }

    } while(true);
  }

  function finishRound(g){

    const roundScores = {};

    for (let id of g.order){

      const p = g.players[id];

      let score =
        calculate(p.hand);

      if (g.ghouliesCaller === id){

        const other =
          g.order.find(x => x !== id);

        const myScore =
          calculate(g.players[id].hand);

        const otherScore =
          calculate(g.players[other].hand);

        if (myScore < otherScore){

          score -= 5;

          roundScores[id] =
            `${score} (-5 Ghoulies Bonus)`;

        } else {

          score += 5;

          roundScores[id] =
            `${score} (+5 Ghoulies Penalty)`;
        }

      } else {

        roundScores[id] = score;
      }

      g.scores[id] += score;
    }

    g.roundResult = roundScores;

    io.to(roomIdFromGame(g))
      .emit("state", g);

    const overPlayers =
      Object.entries(g.scores)
        .filter(([id,score]) =>
          score >= 51
        );

    if (overPlayers.length){

      const highest =
        Math.max(
          ...overPlayers.map(x => x[1])
        );

      g.losers =
        overPlayers
          .filter(x => x[1] === highest)
          .map(x => x[0]);

      g.gameOver = true;

      return;
    }

    setTimeout(() => {

      const deck = createDeck();

      g.deck = deck;

      g.discard = [deck.pop()];

      for (let id of g.order){

        g.players[id] = {

          hand:deck.splice(0,4),

          pending:null
        };
      }

      g.startingPlayer =
        (g.startingPlayer + 1)
        % g.order.length;

      g.turn =
        g.startingPlayer;

      g.tenSwap = null;

      g.ghouliesCaller = null;

      g.finalTurnPlayer = null;

      g.message = {};

      g.roundResult = null;

      g.effect = null;

      io.to(roomIdFromGame(g))
        .emit("state", g);

    },6000);
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

  socket.on("draw", () => {

    const g = getRoom(socket);

    if (!g) return;

    if (!isTurn(g,socket.id)) return;

    const p =
      g.players[socket.id];

    if (p.pending) return;

    if (g.deck.length <= 0){

      finishRound(g);

      io.to(roomId(socket))
        .emit("state", g);

      return;
    }

    p.pending = g.deck.pop();

    g.effect = {

      type:"drawDeck",

      player:socket.id
    };

    io.to(roomId(socket))
      .emit("state", g);
  });

  socket.on("takeDiscard", () => {

    const g = getRoom(socket);

    if (!g) return;

    if (!isTurn(g,socket.id)) return;

    const p =
      g.players[socket.id];

    if (p.pending) return;

    if (!g.discard.length) return;

    p.pending =
      g.discard.pop();

    g.effect = {

      type:"takeDiscard",

      player:socket.id
    };

    io.to(roomId(socket))
      .emit("state", g);
  });

  socket.on("discardPending", () => {

    const g = getRoom(socket);

    if (!g) return;

    const p =
      g.players[socket.id];

    if (!p.pending) return;

    g.discard.push(p.pending);

    p.pending = null;

    g.effect = {

      type:"discard",

      player:socket.id
    };

    endTurn(g,socket.id);

    io.to(roomId(socket))
      .emit("state", g);
  });

  socket.on("swap", card => {

    const g = getRoom(socket);

    if (!g) return;

    const p =
      g.players[socket.id];

    if (!p.pending) return;

    const i =
      p.hand.indexOf(card);

    if (i === -1) return;

    const discarded =
      p.hand[i];

    p.hand[i] =
      p.pending;

    p.pending = null;

    g.discard.push(discarded);

    g.effect = {

      type:"swap",

      player:socket.id,

      handIndex:i
    };

    if (discarded.startsWith("10")){

      const other =
        g.order.find(
          id => id !== socket.id
        );

      g.message = {};

      g.message[socket.id] =
        "You used a SPECIAL 10.";

      g.message[other] =
        "Opponent used a SPECIAL 10.";

      g.tenSwap = {

        player:socket.id,

        selectingOwn:true,

        ownIndex:null
      };

      io.to(roomId(socket))
        .emit("state", g);

      return;
    }

    endTurn(g,socket.id);

    io.to(roomId(socket))
      .emit("state", g);
  });

  socket.on("tenOwn", index => {

    const g = getRoom(socket);

    if (!g) return;

    if (!g.tenSwap) return;

    if (index == null){

      g.effect = {

        type:"noSwap",

        player:socket.id
      };

      g.tenSwap = null;

      endTurn(g,socket.id);

      io.to(roomId(socket))
        .emit("state", g);

      return;
    }

    g.tenSwap.ownIndex = index;

    g.tenSwap.selectingOwn = false;

    io.to(roomId(socket))
      .emit("state", g);
  });

  socket.on("tenOpp", oppIndex => {

    const g = getRoom(socket);

    if (!g) return;

    const playerId =
      g.tenSwap.player;

    const oppId =
      g.order.find(
        id => id !== playerId
      );

    const p1 =
      g.players[playerId];

    const p2 =
      g.players[oppId];

    const i1 =
      g.tenSwap.ownIndex;

    const temp =
      p1.hand[i1];

    p1.hand[i1] =
      p2.hand[oppIndex];

    p2.hand[oppIndex] =
      temp;

    g.effect = {

      type:"tenSwap",

      player:playerId,

      ownIndex:i1,

      oppIndex:oppIndex
    };

    g.tenSwap = null;

    endTurn(g,playerId);

    io.to(roomId(socket))
      .emit("state", g);
  });

  socket.on("snap", card => {

    const g = getRoom(socket);

    if (!g) return;

    const p =
      g.players[socket.id];

    const top =
      g.discard.at(-1);

    if (!top) return;

    if (
      top.slice(0,-1) ===
      card.slice(0,-1)
    ){

      const index =
        p.hand.indexOf(card);

      if (index !== -1){

        p.hand.splice(index,1);
      }

      g.discard.push(card);

      g.effect = {

        type:"snapSuccess",

        player:socket.id
      };

    } else {

      g.skipTurn[socket.id] = true;

      g.effect = {

        type:"snapFail",

        player:socket.id
      };
    }

    io.to(roomId(socket))
      .emit("state", g);
  });

  socket.on("callGhoulies", () => {

    const g = getRoom(socket);

    if (!g) return;

    if (g.ghouliesCaller) return;

    const caller =
      socket.id;

    const other =
      g.order.find(
        id => id !== caller
      );

    g.message = {};

    g.message[caller] =
      "You called GHOULIES.";

    g.message[other] =
      "Opponent called GHOULIES.";

    g.effect = {

      type:"ghoulies",

      player:caller
    };

    g.ghouliesCaller =
      caller;

    g.finalTurnPlayer =
      other;

    g.turn =
      g.order.indexOf(other);

    io.to(roomId(socket))
      .emit("state", g);
  });

  socket.on("fullReset", room => {

    delete rooms[room];

    io.to(room)
      .emit("forceReload");

    setTimeout(() => {

      io.sockets.sockets
        .forEach(s => {

          s.leave(room);
        });

    },200);
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

    io.to(room)
      .emit("state", g);
  });
});

server.listen(
  process.env.PORT || 3000,
  () => console.log("Server running")
);