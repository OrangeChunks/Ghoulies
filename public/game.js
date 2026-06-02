// game.js

let socket = io({
  reconnection:true,
  reconnectionAttempts:99999,
  reconnectionDelay:1000
});

let state = null;
let myId = null;

let revealed = [];
let memoryDone = false;

let shownRoundPopup = false;

function connectToRoom(){

  socket.emit("join", "room1");
}

socket.on("connect", () => {

  connectToRoom();
});

socket.on("you", id => {

  myId = id;
});

function me(){

  return state?.players?.[myId];
}

function oppId(){

  return state?.order?.find(
    id => id !== myId
  );
}

function areaForPlayer(playerId){

  if (playerId === myId){

    return {
      hand: document.getElementById("hand"),
      pending: document.getElementById("pending")
    };
  }

  return {
    hand: document.getElementById("opponentHand"),
    pending: document.getElementById("opponentPending")
  };
}

function centerOf(el){

  const r = el.getBoundingClientRect();

  return {
    x: r.left + r.width / 2,
    y: r.top  + r.height / 2
  };
}

function animateCard(fromEl, toEl, image){

  if (!fromEl || !toEl || !image) return;

  const fx = document.getElementById("fxLayer");

  const start = centerOf(fromEl);
  const end   = centerOf(toEl);

  const img = document.createElement("img");

  img.src       = image;
  img.className = "flyingCard";
  img.style.left = start.x + "px";
  img.style.top  = start.y + "px";

  fx.appendChild(img);

  requestAnimationFrame(() => {
    img.style.left      = end.x + "px";
    img.style.top       = end.y + "px";
    img.style.transform = "rotate(12deg)";
  });

  setTimeout(() => img.remove(), 600);
}

function showText(text, color="#fff"){

  const fx  = document.getElementById("fxLayer");
  const div = document.createElement("div");

  div.className  = "effectText";
  div.style.color = color;
  div.innerText  = text;

  fx.appendChild(div);

  setTimeout(() => div.remove(), 1000);
}

function pulseCard(selector){

  const el = document.querySelector(selector);

  if (!el) return;

  el.style.transition = "0.2s";
  el.style.boxShadow  = "0 0 30px #00ff88";
  el.style.transform  = "scale(1.15)";

  setTimeout(() => {
    el.style.boxShadow = "";
    el.style.transform = "";
  }, 700);
}

function highlightCard(el, color="#00ff88"){

  if (!el) return;

  el.style.outline    = `5px solid ${color}`;
  el.style.boxShadow  = `0 0 20px ${color}`;
  el.style.transform  = "scale(1.2) translateY(-10px)";
  el.style.zIndex     = "10";
  el.style.transition = "0.15s";

  setTimeout(() => {
    el.style.outline   = "";
    el.style.boxShadow = "";
    el.style.transform = "";
    el.style.zIndex    = "";
  }, 900);
}

// ---------------------------------------------------------------------------
// FIX 1 + 2 + 3: render() is now called BEFORE effects are processed.
// This means all animations and highlights query the LIVE, up-to-date DOM
// that render() just built — not stale/detached nodes from the previous frame.
// FIX 1 (duplicate cards): opponentPendingCard visibility is managed entirely
// inside render() based on state, so it can never get out of sync with the
// hand cards drawn by render().
// ---------------------------------------------------------------------------
socket.on("state", g => {

  // Commit the new state and rebuild the DOM first.
  state = g;
  render();

  // Now run visual effects against the freshly-rendered DOM.
  if (g.effect){

    const actor = areaForPlayer(g.effect.player);

    switch(g.effect.type){

      case "drawDeck": {

        showText("DRAW", "#00d0ff");

        animateCard(
          document.getElementById("deck"),
          actor.pending,
          "/cards/back.png"
        );

        break;
      }

      case "takeDiscard": {

        showText("TAKE", "#00ff88");

        animateCard(
          document.getElementById("discard"),
          actor.pending,
          document.querySelector("#discard img")?.src
        );

        break;
      }

      case "discard": {

        showText("DISCARD", "#ff4444");

        animateCard(
          actor.pending,
          document.getElementById("discard"),
          "/cards/back.png"
        );

        break;
      }

      // FIX 2: opponent swap now queries the correct live DOM nodes because
      // render() has already run. The card image that was swapped in is shown
      // briefly via a temporary overlay so the opponent's card face is visible
      // to the local player during the animation before it flips back to hidden.
      case "swap": {

        showText("SWAP", "#ffd000");

        const isMe = g.effect.player === myId;

        const handSelector = isMe
          ? `#hand img[data-index="${g.effect.handIndex}"]`
          : `#opponentHand img[data-oppindex="${g.effect.handIndex}"]`;

        const handEl = document.querySelector(handSelector);

        // Show the card value that was just swapped INTO this slot
        // (the server has already updated the hand, so g.players gives us
        // the new card sitting at handIndex right now)
        const swappedInCard =
          g.players[g.effect.player]?.hand?.[g.effect.handIndex];

        if (!isMe && handEl && swappedInCard){

          // Briefly reveal the face of the card the opponent swapped in
          // so the watching player can see what they received.
          handEl.src = file(swappedInCard);

          setTimeout(() => {
            // Flip back to hidden after the reveal window
            if (handEl) handEl.src = back();
          }, 1800);
        }

        if (handEl){
          handEl.classList.add("swapping");
          setTimeout(() => handEl.classList.remove("swapping"), 400);
        }

        highlightCard(handEl, "#ffd000");

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
          }, 150);
        }, 200);

        setTimeout(() => {
          pulseCard(handSelector);
        }, 300);

        break;
      }

      case "ghoulies": {

        showText("GHOULIES!", "#ff4444");

        document.body.classList.add("ghouliesFlash");

        setTimeout(() => {
          document.body.classList.remove("ghouliesFlash");
        }, 500);

        break;
      }

      case "skip": {

        showText("TURN SKIPPED", "#ff8800");
        break;
      }

      case "snapSuccess": {

        showText("SNAP!", "#00ff88");

        document.body.classList.add("snapFlash");

        setTimeout(() => {
          document.body.classList.remove("snapFlash");
        }, 200);

        break;
      }

      case "snapFail": {

        showText("MISS!", "#ff0000");
        break;
      }

      // FIX 3: tenSwap now queries live DOM nodes (render already ran).
      // Additionally we briefly reveal the actual card faces to BOTH players
      // so everyone can see exactly which card moved where.
      case "tenSwap": {

        showText("SPECIAL 10", "gold");

        const mine = g.effect.player === myId;

        // From each player's perspective:
        //   ownEl  = the slot belonging to whoever played the 10
        //   oppEl  = the slot belonging to the other player
        const ownSelector = mine
          ? `#hand img[data-index="${g.effect.ownIndex}"]`
          : `#opponentHand img[data-oppindex="${g.effect.ownIndex}"]`;

        const oppSelector = mine
          ? `#opponentHand img[data-oppindex="${g.effect.oppIndex}"]`
          : `#hand img[data-index="${g.effect.oppIndex}"]`;

        const ownEl = document.querySelector(ownSelector);
        const oppEl = document.querySelector(oppSelector);

        // The server has already swapped the cards in state, so:
        //   ownEl now holds what the 10-player RECEIVED (oppCard)
        //   oppEl now holds what the other player RECEIVED (ownCard)
        const tenPlayerId = g.effect.player;
        const otherPlayerId = g.order.find(id => id !== tenPlayerId);

        const cardNowAtOwn =
          g.players[tenPlayerId]?.hand?.[g.effect.ownIndex];

        const cardNowAtOpp =
          g.players[otherPlayerId]?.hand?.[g.effect.oppIndex];

        // Briefly show actual card faces so both players see what moved
        if (ownEl && cardNowAtOwn){
          ownEl.src = file(cardNowAtOwn);
          setTimeout(() => { if (ownEl) ownEl.src = back(); }, 1800);
        }

        if (oppEl && cardNowAtOpp && !mine){
          // The opponent's slot is one of MY cards — keep it face-up
          // (render() already shows my cards face-down; just let the
          // timed flip handle it)
          oppEl.src = file(cardNowAtOpp);
          setTimeout(() => { if (oppEl) oppEl.src = back(); }, 1800);
        }

        if (ownEl){
          ownEl.classList.add("swapping");
          setTimeout(() => ownEl.classList.remove("swapping"), 400);
        }

        if (oppEl){
          oppEl.classList.add("swapping");
          setTimeout(() => oppEl.classList.remove("swapping"), 400);
        }

        highlightCard(ownEl, "#00ffcc");
        highlightCard(oppEl, "#ff00ff");

        setTimeout(() => {
          animateCard(ownEl, oppEl, "/cards/back.png");
          animateCard(oppEl, ownEl, "/cards/back.png");
        }, 200);

        break;
      }
    }
  }

  // Round result popup
  if (state.roundResult && !shownRoundPopup){

    shownRoundPopup = true;

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
  }

  if (!state.roundResult){
    shownRoundPopup = false;
  }
});

socket.on("forceReload", () => {
  location.reload();
});

function file(card){

  const v = card.slice(0,-1);
  const s = card.slice(-1);

  const suitMap = {
    "♠":"s",
    "♥":"h",
    "♦":"d",
    "♣":"c"
  };

  const valueMap = {
    "A":"01","2":"02","3":"03","4":"04",
    "5":"05","6":"06","7":"07","8":"08",
    "9":"09","10":"10","J":"11","Q":"12","K":"13"
  };

  return `/cards/${suitMap[s]}${valueMap[v]}.png`;
}

function back(){
  return "/cards/back.png";
}

function clickedDeck(el){
  return el.id === "deck" || el.closest("#deck");
}

function render(){

  if (!state || !myId) return;

  const p    = me();
  const o    = state.players?.[oppId()];
  const turn = state.order[state.turn] === myId;

  document
    .getElementById("hand")
    .classList.toggle("activeTurn", turn);

  // --- Status text ---
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

  document.getElementById("status").innerText = statusText;

  // --- Scores ---
  document.getElementById("scores").innerHTML =
    `You: ${state.scores?.[myId] ?? 0} | Opponent: ${state.scores?.[oppId()] ?? 0}`;

  // --- My hand ---
  document.getElementById("hand").innerHTML =
    p?.hand?.map((c,i) => {

      const visible = revealed.includes(i);

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

  // --- Opponent hand ---
  document.getElementById("opponentHand").innerHTML =
    o?.hand?.map((c,i) => {

      const tenGlow =
        state.tenSwap &&
        state.tenSwap.player === myId &&
        !state.tenSwap.selectingOwn;

      return `<img
        class="card ${tenGlow ? "tenGlow" : ""}"
        data-oppindex="${i}"
        src="${back()}"
      >`;
    }).join("") || "";

  // --- Discard ---
  const top = state.discard?.at(-1);

  document.getElementById("discard").innerHTML =
    top ? `<img class="card pop" src="${file(top)}">` : "";

  // --- My pending card ---
  const pending = p?.pending;

  document.getElementById("pending").innerHTML =
    pending && turn
      ? `<div>
           <div style="margin-bottom:8px">Picked Up</div>
           <img class="card flip bigCard" src="${file(pending)}">
         </div>`
      : "";

  // FIX 1: opponentPendingCard visibility is driven entirely by state here,
  // so it never gets out of sync with the hand cards render() just stamped.
  const opponentPendingCard =
    document.getElementById("opponentPendingCard");

  if (opponentPendingCard){

    const oppPlayer    = state.players?.[oppId()];
    const oppHasPending = !!(oppPlayer?.pending);

    opponentPendingCard.style.display =
      oppHasPending ? "block" : "none";
  }

  // --- No-swap button ---
  document.getElementById("noSwapBtn").style.display =
    (state.tenSwap &&
     state.tenSwap.player === myId &&
     state.tenSwap.selectingOwn)
      ? "inline-block"
      : "none";

  // --- Restart button ---
  document.getElementById("restartBtn").style.display =
    state.gameOver ? "block" : "none";
}

// ---------------------------------------------------------------------------
// Click handler
// ---------------------------------------------------------------------------
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

  // No-swap button
  if (e.target.id === "noSwapBtn"){
    socket.emit("tenOwn", null);
    return;
  }

  // Ten-swap: select own card
  if (
    state.tenSwap &&
    state.tenSwap.player === myId &&
    state.tenSwap.selectingOwn &&
    e.target.dataset.index !== undefined
  ){
    socket.emit("tenOwn", Number(e.target.dataset.index));
    return;
  }

  // Ten-swap: select opponent card
  if (
    state.tenSwap &&
    state.tenSwap.player === myId &&
    !state.tenSwap.selectingOwn &&
    e.target.dataset.oppindex !== undefined
  ){
    socket.emit("tenOpp", Number(e.target.dataset.oppindex));
    return;
  }

  // Draw from deck
  if (clickedDeck(e.target)){

    document.getElementById("deck").classList.add("deckShake");

    setTimeout(() => {
      document.getElementById("deck").classList.remove("deckShake");
    }, 300);

    socket.emit("draw");
    return;
  }

  // Discard pile
  if (e.target.closest("#discard")){

    if (me()?.pending){
      socket.emit("discardPending");
    } else {
      socket.emit("takeDiscard");
    }

    return;
  }

  // Swap card from hand
  if (e.target.dataset.card && me()?.pending){
    socket.emit("swap", e.target.dataset.card);
    return;
  }

  // Ghoulies button
  if (e.target.id === "ghouliesBtn"){
    socket.emit("callGhoulies");
    return;
  }

  // Restart button
  if (e.target.id === "restartBtn"){
    socket.emit("restart", "room1");
    return;
  }

  // Reset button
  if (e.target.id === "resetBtn"){
    socket.emit("fullReset", "room1");
    return;
  }
});

// ---------------------------------------------------------------------------
// Double-click → snap
// ---------------------------------------------------------------------------
document.addEventListener("dblclick", e => {

  if (!memoryDone) return;

  const c = e.target.dataset.card;

  if (c){
    socket.emit("snap", c);
  }
});