const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static("public"));

const SUITS = ["♠","♥","♦","♣"];
const VALUES = ["A","2","3","4","5","6","7","8","9","10","J","Q","K"];

function shuffle(a){ return a.sort(()=>Math.random()-0.5); }

function createDeck(){
  let d=[];
  for(let s of SUITS){
    for(let v of VALUES){
      d.push(v+s);
    }
  }
  return shuffle(d);
}

function value(card){
  const v=card.slice(0,-1);
  const s=card.slice(-1);

  if(v==="A") return 1;
  if(v==="J"||v==="Q"||v==="K"){
    if(v==="K"&&(s==="♥"||s==="♦")) return 0;
    return 10;
  }
  return parseInt(v);
}

const rooms={};

function createGame(){
  const deck=createDeck();

  return {
    deck,
    discard:[deck.pop()],
    players:{},
    order:[],
    turn:0,

    scores:{},
    gameOver:false,
    loser:null,

    roundEnding:false,
    finalTurns:0,

    specialMode:null,
    peekActive:false
  };
}

function has2(g){ return Object.keys(g.players).length===2; }
function nextTurn(g){ g.turn=(g.turn+1)%g.order.length; }

function startPeek(room,g){
  g.peekActive=true;

  Object.values(g.players).forEach(p=>{
    p.peek=[p.hand[0],p.hand[1]];
    p.revealed=true;
  });

  io.to(room).emit("state",g);

  setTimeout(()=>{
    g.peekActive=false;
    Object.values(g.players).forEach(p=>{
      p.peek=[];
      p.revealed=false;
    });
    io.to(room).emit("state",g);
  },3000);
}

function endRound(game,room){

  /* ADD SCORES */
  for(const id in game.players){
    game.scores[id]=(game.scores[id]||0)+
      game.players[id].hand.reduce((a,c)=>a+value(c),0);
  }

  /* CHECK LOSER */
  for(const id in game.scores){
    if(game.scores[id] >= 51){
      game.gameOver = true;
      game.loser = id;
    }
  }

  if(game.gameOver){
    io.to(room).emit("state",game);
    return;
  }

  /* RESET ROUND */
  const deck=createDeck();

  game.deck=deck;
  game.discard=[deck.pop()];

  game.roundEnding=false;
  game.finalTurns=0;
  game.specialMode=null;

  for(const id in game.players){
    game.players[id].hand=deck.splice(0,4);
    game.players[id].pending=null;
  }

  game.turn=0;

  startPeek(room,game);

  io.to(room).emit("state",game);
}

let currentRoom=null;

io.on("connection",(socket)=>{

  socket.on("join",(id)=>{
    currentRoom=id;

    if(!rooms[id]) rooms[id]=createGame();
    const g=rooms[id];

    if(Object.keys(g.players).length<2){
      g.players[socket.id]={
        hand:g.deck.splice(0,4),
        pending:null,
        peek:[],
        revealed:false
      };

      g.order.push(socket.id);
      g.scores[socket.id]=0;
    }

    socket.join(id);
    socket