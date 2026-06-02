// game.js

let socket = io({
  reconnection: true,
  reconnectionAttempts: 99999,
  reconnectionDelay: 1000
});

let state      = null;
let myId       = null;
let revealed   = [];
let memoryDone = false;
let shownRoundPopup = false;

// When true, render() shows all cards face-up (end-of-round reveal)
let revealAll = false;

// ─── socket boilerplate ────────────────────────────────────────────────────

function connectToRoom(){
  socket.emit("join", "room1");
}

socket.on("connect", () => { connectToRoom(); });
socket.on("you",     id  => { myId = id; });

// ─── helpers ───────────────────────────────────────────────────────────────

function me(){
  return state?.players?.[myId];
}

function oppId(){
  return state?.order?.find(id => id !== myId);
}

function areaForPlayer(playerId){
  if (playerId === myId){
    return {
      hand:    document.getElementById("hand"),
      pending: document.getElementById("pending")
    };
  }
  return {
    hand:    document.getElementById("opponentHand"),
    pending: document.getElementById("opponentPending")
  };
}

function centerOf(el){
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

// ─── SMOOTH animation ─────────────────────────────────────────────────────
// Uses transform:translate() instead of left/top so the browser can animate
// entirely on the compositor thread — no layout reflow, no jitter.
// The double-rAF ensures the browser has painted the starting position before
// we add the transition and set the destination, giving a clean first frame.

function animateCard(fromEl, toEl, image){
  if (!fromEl || !toEl || !image) return;

  const fx    = document.getElementById("fxLayer");
  const start = centerOf(fromEl);
  const end   = centerOf(toEl);

  const img       = document.createElement("img");
  img.src         = image;
  img.className   = "flyingCard";
  // Position at origin; translate to start position (no transition yet)
  img.style.cssText = `
    position:absolute;
    left:0; top:0;
    width:80px;
    will-change:transform,opacity;
    transform: translate(${start.x}px, ${start.y}px) translate(-50%,-50%);
  `;
  fx.appendChild(img);

  // Double-rAF: first frame paints the starting position,
  // second frame starts the transition to the end position.
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      img.style.transition = "transform 0.55s cubic-bezier(0.22,0.61,0.36,1), opacity 0.55s ease";
      img.style.transform  = `translate(${end.x}px, ${end.y}px) translate(-50%,-50%) rotate(12deg)`;
    });
  });

  setTimeout(() => img.remove(), 650);
}

// ─── UI helpers ───────────────────────────────────────────────────────────

function showText(text, color = "#fff"){
  const fx  = document.getElementById("fxLayer");
  const div = document.createElement("div");
  div.className   = "effectText";
  div.style.color = color;
  div.innerText   = text;
  fx.appendChild(div);
  setTimeout(() => div.remove(), 1100);
}

function pulseCard(selector){
  const el = document.querySelector(selector);
  if (!el) return;
  el.style.transition = "box-shadow 0.2s, transform 0.2s";
  el.style.boxShadow  = "0 0 30px #00ff88";
  el.style.transform  = "scale(1.15)";
  setTimeout(() => {
    el.style.boxShadow = "";
    el.style.transform = "";
  }, 700);
}

function highlightCard(el, color = "#00ff88"){
  if (!el) return;
  el.style.transition = "outline 0.15s, box-shadow 0.15s, transform 0.15s";
  el.style.outline    = `5px solid ${color}`;
  el.style.boxShadow  = `0 0 22px ${color}`;
  el.style.transform  = "scale(1.2) translateY(-10px)";
  el.style.zIndex     = "10";
  setTimeout(() => {
    el.style.outline   = "";
    el.style.boxShadow = "";
    el.style.transform = "";
    el.style.zIndex    = "";
  }, 950);
}

// ─── state handler ────────────────────────────────────────────────────────

socket.on("state", g => {

  state = g;
  render();

  if (g.effect){

    const actor = areaForPlayer(g.effect.player);

    switch(g.effect.type){

      // ── draw from deck ──────────────────────────────────────────────────
      case "drawDeck": {
        showText("DRAW", "#00d0ff");
        animateCard(
          document.getElementById("deck"),
          actor.pending,
          "/cards/back.png"
        );
        break;
      }

      // ── take discard ────────────────────────────────────────────────────
      case "takeDiscard": {
        showText("TAKE", "#00ff88");
        animateCard(
          document.getElementById("discard"),
          actor.pending,
          document.querySelector("#discard img")?.src
        );
        break;
      }

      // ── discard pending ─────────────────────────────────────────────────
      case "discard": {
        showText("DISCARD", "#ff4444");
        animateCard(
          actor.pending,
          document.getElementById("discard"),
          "/cards/back.png"
        );
        break;
      }

      // ── regular swap ────────────────────────────────────────────────────
      // Cards stay face-down throughout — we highlight and animate position
      // only, so each player knows WHICH slot moved but not WHAT the card is.
      case "swap": {
        showText("SWAP", "#ffd000");

        const isMe = g.effect.player === myId;

        const handSelector = isMe
          ? `#hand img[data-index="${g.effect.handIndex}"]`
          : `#opponentHand img[data-oppindex="${g.effect.handIndex}"]`;

        const handEl = document.querySelector(handSelector);

        // Highlight the slot that was swapped
        highlightCard(handEl, "#ffd000");

        if (handEl){
          handEl.classList.add("swapping");
          setTimeout(() => handEl.classList.remove("swapping"), 450);
        }

        // Animate: pending → hand slot, then hand slot → discard
        const source = isMe
          ? actor.pending
          : document.getElementById("opponentPendingCard");

        setTimeout(() => {
          animateCard(source, handEl, "/cards/back.png");
          setTimeout(() => {
            animateCard(
              handEl,
              document.getElementById("discard"),
              "/cards/back.png"
            );
          }, 200);
        }, 180);

        setTimeout(() => pulseCard(handSelector), 320);

        break;
      }

      // ── ghoulies called ─────────────────────────────────────────────────
      // If the OPPONENT called ghoulies this is MY last turn — make it dramatic.
      case "ghoulies": {
        showText("GHOULIES!", "#ff4444");

        document.body.classList.add("ghouliesFlash");
        setTimeout(() => document.body.classList.remove("ghouliesFlash"), 600);

        // If I am the player who must play the final turn, show the warning
        const iAmFinalPlayer = g.finalTurnPlayer === myId;

        if (iAmFinalPlayer){
          showLastTurnWarning();
        }

        break;
      }

      // ── turn skipped ────────────────────────────────────────────────────
      case "skip": {
        showText("TURN SKIPPED", "#ff8800");
        break;
      }

      // ── snap success ────────────────────────────────────────────────────
      case "snapSuccess": {
        showText("SNAP!", "#00ff88");
        document.body.classList.add("snapFlash");
        setTimeout(() => document.body.classList.remove("snapFlash"), 250);
        break;
      }

      // ── snap fail ───────────────────────────────────────────────────────
      case "snapFail": {
        showText("MISS!", "#ff0000");
        break;
      }

      // ── special-10 swap ─────────────────────────────────────────────────
      // Cards stay face-down. Both slots are highlighted in different colours
      // so each player can see exactly which card came to them and which left,
      // without revealing the values.
      case "tenSwap": {
        showText("SPECIAL 10", "gold");

        const mine = g.effect.player === myId;

        const ownSelector = mine
          ? `#hand img[data-index="${g.effect.ownIndex}"]`
          : `#opponentHand img[data-oppindex="${g.effect.ownIndex}"]`;

        const oppSelector = mine
          ? `#opponentHand img[data-oppindex="${g.effect.oppIndex}"]`
          : `#hand img[data-index="${g.effect.oppIndex}"]`;

        const ownEl = document.querySelector(ownSelector);
        const oppEl = document.querySelector(oppSelector);

        // Colour-code: cyan = card that moved to/from the 10-player's slot
        //              magenta = card that moved to/from the opponent's slot
        highlightCard(ownEl, "#00ffcc");
        highlightCard(oppEl, "#ff00ff");

        if (ownEl){
          ownEl.classList.add("swapping");
          setTimeout(() => ownEl.classList.remove("swapping"), 450);
        }
        if (oppEl){
          oppEl.classList.add("swapping");
          setTimeout(() => oppEl.classList.remove("swapping"), 450);
        }

        // Animate the two cards crossing (both back-face)
        setTimeout(() => {
          animateCard(ownEl, oppEl, "/cards/back.png");
          animateCard(oppEl, ownEl, "/cards/back.png");
        }, 200);

        break;
      }
    }
  }

  // ── end-of-round: reveal all cards for 5 s, then show scores ────────────
  if (state.roundResult && !shownRoundPopup){

    shownRoundPopup = true;

    // Show all cards face-up immediately
    revealAll = true;
    render();

    // After 5 seconds flip them back and show the score alert
    setTimeout(() => {

      revealAll = false;

      const result = state.roundResult[myId];

      const scoreDisplay = result.label
        ? `${result.score} (${result.label})`
        : `${result.score}`;

      const totalScore = state.scores[myId] ?? 0;

      alert(
`ROUND OVER

You scored:
${scoreDisplay}

TOTAL SCORE:
${totalScore}`
      );

      memoryDone = false;
      revealed   = [];

    }, 5000);
  }

  if (!state.roundResult){
    shownRoundPopup = false;
  }
});

socket.on("forceReload", () => location.reload());

// ─── "Last Turn!" dramatic warning ────────────────────────────────────────
// Shown to the player who must play the final turn after ghoulies is called.

function showLastTurnWarning(){

  // Pulse the hand border red
  const hand = document.getElementById("hand");
  hand.classList.add("lastTurnPulse");
  setTimeout(() => hand.classList.remove("lastTurnPulse"), 3000);

  // Big overlay banner
  const fx      = document.getElementById("fxLayer");
  const banner  = document.createElement("div");
  banner.className = "lastTurnBanner";
  banner.innerText = "⚠️ LAST TURN!";
  fx.appendChild(banner);
  setTimeout(() => banner.remove(), 3200);
}

// ─── card path helpers ────────────────────────────────────────────────────

function file(card){
  const v = card.slice(0, -1);
  const s = card.slice(-1);
  const suitMap  = { "♠":"s", "♥":"h", "♦":"d", "♣":"c" };
  const valueMap = {
    "A":"01","2":"02","3":"03","4":"04","5":"05","6":"06",
    "7":"07","8":"08","9":"09","10":"10","J":"11","Q":"12","K":"13"
  };
  return `/cards/${suitMap[s]}${valueMap[v]}.png`;
}

function back(){
  return "/cards/back.png";
}

function clickedDeck(el){
  return el.id === "deck" || el.closest("#deck");
}

// ─── render ───────────────────────────────────────────────────────────────

function render(){

  if (!state || !myId) return;

  const p    = me();
  const o    = state.players?.[oppId()];
  const turn = state.order[state.turn] === myId;

  document.getElementById("hand").classList.toggle("activeTurn", turn);

  // Status text
  let statusText = "";

  if (!memoryDone){
    statusText = `Memorise 2 cards (${revealed.length}/2)`;
  } else if (state.tenSwap && state.tenSwap.player === myId){
    statusText = state.tenSwap.selectingOwn
      ? "Choose YOUR card"
      : "Choose OPPONENT card";
  } else {
    statusText = turn ? "YOUR TURN" : "OPPONENT TURN";
  }

  if (state.message && state.message[myId]){
    statusText = state.message[myId];
  }

  document.getElementById("status").innerText   = statusText;
  document.getElementById("scores").innerHTML   =
    `You: ${state.scores?.[myId] ?? 0} | Opponent: ${state.scores?.[oppId()] ?? 0}`;

  // My hand — show face if: memory-peek, OR revealAll
  document.getElementById("hand").innerHTML =
    p?.hand?.map((c, i) => {
      const visible = revealAll || revealed.includes(i);
      const tenGlow =
        state.tenSwap &&
        state.tenSwap.player === myId &&
        state.tenSwap.selectingOwn;
      return `<img
        class="card ${tenGlow ? "tenGlow" : ""}"
        data-card="${c}"
        data-index="${i}"
        src="${visible ? file(c) : back()}"
      >`;
    }).join("") || "";

  // Opponent hand — show face only during revealAll
  document.getElementById("opponentHand").innerHTML =
    o?.hand?.map((c, i) => {
      const tenGlow =
        state.tenSwap &&
        state.tenSwap.player === myId &&
        !state.tenSwap.selectingOwn;
      return `<img
        class="card ${tenGlow ? "tenGlow" : ""}"
        data-oppindex="${i}"
        src="${revealAll ? file(c) : back()}"
      >`;
    }).join("") || "";

  // Discard
  const top = state.discard?.at(-1);
  document.getElementById("discard").innerHTML =
    top ? `<img class="card pop" src="${file(top)}">` : "";

  // My pending card
  const pending = p?.pending;
  document.getElementById("pending").innerHTML =
    pending && turn
      ? `<div>
           <div style="margin-bottom:8px">Picked Up</div>
           <img class="card flip bigCard" src="${file(pending)}">
         </div>`
      : "";

  // Opponent pending card visibility
  const opponentPendingCard = document.getElementById("opponentPendingCard");
  if (opponentPendingCard){
    const oppHasPending = !!(state.players?.[oppId()]?.pending);
    opponentPendingCard.style.display = oppHasPending ? "block" : "none";
  }

  // Buttons
  document.getElementById("noSwapBtn").style.display =
    (state.tenSwap &&
     state.tenSwap.player === myId &&
     state.tenSwap.selectingOwn)
      ? "inline-block" : "none";

  document.getElementById("restartBtn").style.display =
    state.gameOver ? "block" : "none";
}

// ─── click handler ────────────────────────────────────────────────────────

document.addEventListener("click", e => {

  if (!state) return;

  // Memory phase
  if (!memoryDone){
    if (e.target.dataset.index !== undefined){
      if (revealed.length >= 2) return;
      const i = Number(e.target.dataset.index);
      if (!revealed.includes(i)){
        revealed.push(i);
        render();
        if (revealed.length === 2){
          setTimeout(() => {
            revealed   = [];
            memoryDone = true;
            render();
          }, 5000);
        }
      }
    }
    return;
  }

  if (e.target.id === "noSwapBtn"){
    socket.emit("tenOwn", null);
    return;
  }

  if (state.tenSwap &&
      state.tenSwap.player === myId &&
      state.tenSwap.selectingOwn &&
      e.target.dataset.index !== undefined){
    socket.emit("tenOwn", Number(e.target.dataset.index));
    return;
  }

  if (state.tenSwap &&
      state.tenSwap.player === myId &&
      !state.tenSwap.selectingOwn &&
      e.target.dataset.oppindex !== undefined){
    socket.emit("tenOpp", Number(e.target.dataset.oppindex));
    return;
  }

  if (clickedDeck(e.target)){
    document.getElementById("deck").classList.add("deckShake");
    setTimeout(() => document.getElementById("deck").classList.remove("deckShake"), 300);
    socket.emit("draw");
    return;
  }

  if (e.target.closest("#discard")){
    me()?.pending
      ? socket.emit("discardPending")
      : socket.emit("takeDiscard");
    return;
  }

  if (e.target.dataset.card && me()?.pending){
    socket.emit("swap", e.target.dataset.card);
    return;
  }

  if (e.target.id === "ghouliesBtn"){ socket.emit("callGhoulies"); return; }
  if (e.target.id === "restartBtn") { socket.emit("restart",   "room1"); return; }
  if (e.target.id === "resetBtn")   { socket.emit("fullReset", "room1"); return; }
});

// ─── double-click → snap ──────────────────────────────────────────────────

document.addEventListener("dblclick", e => {
  if (!memoryDone) return;
  const c = e.target.dataset.card;
  if (c) socket.emit("snap", c);
});