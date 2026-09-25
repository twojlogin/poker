/* app.js — interfejs hotseat. Cała logika gry jest w engine.js (testowanej). */
const $ = id => document.getElementById(id);
const E = window.PokerEngine;

let game = null;
let names = [];
let chips = 1000;
const stats = { hands: 0, winners: {}, maxPot: 0, history: [] };

const LABEL = {
  fold: 'FOLD', check: 'CHECK', call: 'CALL', raise: 'RAISE', 'allin': 'ALL-IN'
};

function cardEl(c, face) {
  const d = document.createElement('div');
  d.className = 'card ' + (face ? 'face' : (c.s === 'h' || c.s === 'd' ? 'red' : 'black'));
  d.textContent = face ? '?' : c.r + c.s;
  return d;
}

function logLine(msg) {
  const box = $('log');
  const d = document.createElement('div');
  const t = document.createElement('span');
  t.className = 't';
  t.textContent = '[' + new Date().toLocaleTimeString('pl-PL') + '] ';
  d.appendChild(t);
  d.appendChild(document.createTextNode(msg));
  box.appendChild(d);
  box.scrollTop = box.scrollHeight;
}

function setStatus(t) { $('status').textContent = t; }

function renderSetup() {
  const n = Math.max(2, Math.min(6, parseInt($('count').value, 10) || 3));
  $('count').value = n;
  const box = $('setupRows');
  box.innerHTML = '';
  for (let i = 0; i < n; i++) {
    const label = document.createElement('label');
    label.textContent = 'Gracz ' + (i + 1);
    const inp = document.createElement('input');
    inp.value = names[i] || ('Gracz ' + (i + 1));
    inp.addEventListener('input', () => { names[i] = inp.value; });
    label.appendChild(document.createElement('br'));
    label.appendChild(inp);
    box.appendChild(label);
  }
}

function newGame() {
  const n = Math.max(2, Math.min(6, parseInt($('count').value, 10) || 3));
  names = names.slice(0, n);
  while (names.length < n) names.push('Gracz ' + (names.length + 1));
  chips = parseInt($('chips').value, 10) || 1000;
  const sb = parseInt($('sb').value, 10) || 10;
  const bb = parseInt($('bb').value, 10) || 20;
  game = new E.TexasHoldem(names, { smallBlind: sb, bigBlind: bb, startChips: chips });
  stats.hands = 0; stats.winners = {}; stats.maxPot = 0; stats.history = [];
  $('setup').classList.add('hide');
  $('game').classList.remove('hide');
  $('log').innerHTML = '';
  logLine('Nowa gra: ' + names.join(', ') + ' | blindy ' + sb + '/' + bb + ' | ' + chips + ' żetonów');
  nextHand();
}

function nextHand() {
  game.startHand();
  for (const l of game.log) logLine(l);
  game.log = [];
  $('btnNext').classList.add('hide');
  render();
}

function render() {
  const seats = $('seats');
  seats.innerHTML = '';
  const showAll = game.finished;
  for (const p of game.players) {
    const s = document.createElement('div');
    s.className = 'seat' + (p.folded ? ' folded' : '') +
      (!game.finished && p.id === game.currentId ? ' active' : '') +
      (showAll && game.winners.some(w => w.id === p.id) ? ' winner' : '');
    const head = document.createElement('div');
    head.className = 'seat-head';
    const nm = document.createElement('span');
    nm.className = 'seat-name';
    nm.textContent = p.name;
    const ch = document.createElement('span');
    ch.className = 'seat-chips';
    ch.textContent = p.chips;
    head.append(nm, ch);
    s.appendChild(head);

    const badge = document.createElement('span');
    badge.className = 'seat-badge';
    if (p.allIn && !p.folded) badge.textContent = 'ALL-IN';
    else if (p.lastAction) badge.textContent = LABEL[p.lastAction] || p.lastAction;
    if (badge.textContent) s.appendChild(badge);

    const cards = document.createElement('div');
    cards.className = 'cards';
    const ownTurn = !game.finished && p.id === game.currentId;
    for (const c of p.cards) cards.appendChild(cardEl(c, !(showAll || ownTurn)));
    s.appendChild(cards);

    if (showAll) {
      const d = document.createElement('div');
      d.className = 'hand-desc';
      const w = game.winners.find(x => x.id === p.id && x.hand);
      if (w) d.textContent = E.HAND_NAMES[w.hand.category];
      else d.textContent = p.folded ? 'zrezygnował' : '';
      if (d.textContent) s.appendChild(d);
    }
    seats.appendChild(s);
  }

  const board = $('board');
  board.innerHTML = '';
  const back = document.createElement('div');
  back.className = 'card face';
  back.textContent = '■';
  board.appendChild(back);
  for (const c of game.community) board.appendChild(cardEl(c, false));
  while (game.community.length + 1 < 5) board.appendChild(cardEl(null, true));

  $('pot').textContent = 'PULA: ' + game.pot;
  renderActions();
  renderNotepad();
}

function renderActions() {
  const box = $('actions');
  box.innerHTML = '';
  if (game.finished) {
    setStatus(game.winners.length
      ? '🏆 ' + game.winners.map(w => w.name + ' +' + w.amount).join(', ')
      : 'Runda zakończona');
    $('btnNext').classList.remove('hide');
    for (const l of game.log) logLine(l);
    game.log = [];
    return;
  }
  const p = game.players[game.currentId];
  const a = game.actionsFor(p);
  setStatus('Runda: ' + game.bettingRound + ' | gra: ' + p.name + ' | dołożenie: ' + a.toCall);

  const fold = document.createElement('button');
  fold.className = 'mag'; fold.textContent = 'FOLD (F)';
  fold.onclick = () => doAct('fold');
  box.appendChild(fold);

  const callBtn = document.createElement('button');
  callBtn.className = 'gr';
  callBtn.textContent = a.canCheck ? 'CHECK (C)' : 'CALL ' + a.toCall + ' (C)';
  callBtn.disabled = a.canCheck ? false : !a.canCall;
  callBtn.onclick = () => doAct(a.canCheck ? 'check' : 'call');
  box.appendChild(callBtn);

  const amt = document.createElement('input');
  amt.type = 'number'; amt.min = String(a.minRaiseTo); amt.max = String(a.maxTo);
  amt.value = String(a.minRaiseTo); amt.style.width = '110px'; amt.id = 'raiseAmt';
  box.appendChild(amt);

  if (a.canRaise) {
    const raise = document.createElement('button');
    raise.className = 'gold'; raise.textContent = 'RAISE (R)';
    raise.onclick = () => doAct('raise', parseInt($('raiseAmt').value, 10));
    box.appendChild(raise);
  }

  const allin = document.createElement('button');
  allin.className = 'gold'; allin.textContent = 'ALL-IN (A)';
  allin.disabled = p.chips <= 0;
  allin.onclick = () => doAct('allin');
  box.appendChild(allin);
}

function doAct(action, amount) {
  try {
    const before = game.pot;
    game.act(game.currentId, action, amount || 0);
    for (const l of game.log) logLine(l);
    game.log = [];
    if (game.finished) {
      stats.hands++;
      const pot = before;
      if (pot > stats.maxPot) stats.maxPot = pot;
      for (const w of game.winners) {
        stats.winners[w.name] = (stats.winners[w.name] || 0) + 1;
        stats.history.unshift('Ręka #' + stats.hands + ': ' + w.name + ' +' + w.amount +
          (w.hand ? ' (' + E.HAND_NAMES[w.hand.category] + ')' : ''));
      }
      if (stats.history.length > 30) stats.history.pop();
    }
    render();
  } catch (e) {
    logLine('⚠️ ' + e.message);
  }
}

function renderNotepad() {
  const box = $('npStats');
  box.innerHTML = '';
  const add = (label, val) => {
    const d = document.createElement('div');
    d.className = 'stat';
    const l = document.createElement('span'); l.textContent = label;
    const v = document.createElement('b'); v.textContent = String(val);
    d.append(l, v); box.appendChild(d);
  };
  add('Ręki rozegrane', stats.hands);
  add('Największa pula', stats.maxPot);
  if (game) for (const p of game.players) add('Wygrane: ' + p.name, stats.winners[p.name] || 0);
  const h = $('npHist');
  h.innerHTML = '';
  for (const line of stats.history) {
    const d = document.createElement('div');
    d.textContent = line;
    h.appendChild(d);
  }
}

document.addEventListener('keydown', e => {
  if ($('game').classList.contains('hide')) return;
  if (e.target.tagName === 'INPUT') return;
  const k = e.key.toLowerCase();
  if (k === 'f') doAct('fold');
  else if (k === 'c' || k === ' ') {
    const p = game && game.players[game.currentId];
    if (p) { const a = game.actionsFor(p); doAct(a.canCheck ? 'check' : 'call'); }
  } else if (k === 'r') {
    const inp = $('raiseAmt');
    if (inp) doAct('raise', parseInt(inp.value, 10));
  } else if (k === 'a') doAct('allin');
});

$('count').addEventListener('input', renderSetup);
$('btnNew').addEventListener('click', newGame);
$('btnNext').addEventListener('click', nextHand);
$('btnQuit').addEventListener('click', () => location.reload());
$('np').addEventListener('click', () => $('npBox').classList.toggle('open'));
renderSetup();
