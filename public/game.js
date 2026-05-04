let socket = io();
let state = null;
let myId = null;

socket.emit("join", "room1");

socket.on("you", (id) => (myId = id));
socket.on("state", (g) => {
  state = g;
  render();
});

function me() {
  return state?.players?.[myId];
}

function opp() {
  return Object.entries(state.players).find(([id]) => id !== myId)?.[1];
}

/* 🎴 CARD IMAGE */
function file(card) {
  const v = card.slice(0, -1);
  const s = card.slice(-1);

  const suitMap = { "♠": "s", "♥": "h", "♦": "d", "♣": "c" };
  const valMap = {
    A: "01",
    J: "11",
    Q: "12",
    K: "13",
  };

  const val = valMap[v] || v.padStart(2, "0");
  return `/cards/${suitMap[s]}${val}.png`;
}

function back() {
  return "/cards/back.png";
}

/* 🧠 RENDER */
function render() {
  if (!state || !myId) return;

  const p = me();
  const o = opp();
  if (!p) return;

  const isTurn = state.order[state.turn] === myId;

  document.getElementById("status").innerText = isTurn
    ? "Your turn"
    : "Their turn";

  /* 🏁 END SCREEN */
  if (state.gameOver) {
    const end = document.getElementById("endScreen");
    const txt = document.getElementById("endText");

    txt.innerText = state.loser === myId ? "YOU LOSE 💀" : "YOU WIN 🎉";
    end.classList.remove("hidden");
  } else {
    document.getElementById("endScreen").classList.add("hidden");
  }

  /* 🃏 DRAW / PEEK */
  if (state.peekActive && p.revealed) {
    document.getElementById("drawn").innerHTML = p.peek
      .map((c) => `<img class="card" src="${file(c)}">`)
      .join("");
  } else {
    document.getElementById("drawn").innerHTML = p.pending
      ? `<img class="card" src="${file(p.pending)}">`
      : "";
  }

  /* 🗑 DISCARD */
  const top = state.discard.at(-1);
  document.getElementById("discard").innerHTML = top
    ? `<img class="card" src="${file(top)}">`
    : "";

  /* 🧍 YOUR HAND */
  document.getElementById("hand").innerHTML = p.hand
    .map((c) => {
      let style = "";

      if (
        state.specialMode &&
        state.specialMode.step === 1 &&
        state.specialMode.player === myId
      ) {
        style = "border:2px solid red; transform:scale(1.05);";
      }

      return `<img class="card" data-card="${c}" src="${back()}" style="${style}">`;
    })
    .join("");

  /* 👀 OPPONENT HAND */
  document.getElementById("opponentHand").innerHTML = o
    ? o.hand
        .map((c) => {
          let style = "";

          if (
            state.specialMode &&
            state.specialMode.step === 2
          ) {
            style = "border:2px solid red; transform:scale(1.05);";
          }

          return `<img class="card" data-card="${c}" src="${back()}" style="${style}">`;
        })
        .join("")
    : "";

  /* 📊 SCORES */
  const scoreBox = document.getElementById("scores");

  if (state.scores) {
    scoreBox.innerHTML = Object.keys(state.players)
      .map((id) => {
        const label = id === myId ? "You" : "Opponent";
        return `<div>${label}: ${state.scores[id] || 0}</div>`;
      })
      .join("");
  }
}

/* 🎮 CLICK INPUTS */
document.addEventListener("click", (e) => {
  if (!state || state.gameOver) return;

  const p = me();
  const isTurn = state.order[state.turn] === myId;

  /* 🧠 10 RULE STEP */
  if (state.specialMode) {
    if (state.specialMode.step === 1 && e.target.dataset.card) {
      socket.emit("tenOwn", e.target.dataset.card);
      return;
    }

    if (state.specialMode.step === 2 && e.target.dataset.card) {
      socket.emit("tenOpp", e.target.dataset.card);
      return;
    }
  }

  /* 🃏 DRAW */
  if (e.target.id === "deck" && isTurn) {
    socket.emit("draw");
  }

  /* 🗑 DISCARD */
  if (e.target.closest("#discard")) {
    if (!p.pending) socket.emit("takeDiscard");
    else socket.emit("reject");
  }

  /* 🔁 SWAP */
  if (e.target.dataset.card && p.pending && isTurn) {
    socket.emit("swap", e.target.dataset.card);
  }

  /* ☠️ GHOULIES */
  if (e.target.id === "ghouliesBtn") {
    socket.emit("callGhoulies");
  }

  /* 🔁 RESTART */
  if (e.target.id === "restartBtn") {
    socket.emit("restartGame", "room1");
  }
});

/* ⚡ SNAP (DOUBLE CLICK) */
document.addEventListener("dblclick", (e) => {
  if (state?.gameOver) return;

  const card = e.target.dataset.card;
  if (card) socket.emit("snap", card);
});