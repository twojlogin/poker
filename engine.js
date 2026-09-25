/* engine.js — logika Texas Hold'em. Czysta, bez DOM i zależności.
   Używane przez index.html (przeglądarka) i testy (Node).
   Zasady: standardowa ocena układów, rundy blindów, side poty, all-in. */

const SUITS = ['s', 'h', 'd', 'c'];
const RANK_VALUES = {
  '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7,
  '8': 8, '9': 9, 'T': 10, 'J': 11, 'Q': 12, 'K': 13, 'A': 14
};

const HAND_NAMES = {
  9: 'Royal Flush', 8: 'Straight Flush', 7: 'Cztery kolory', 6: 'Full House',
  5: 'Flush', 4: 'Straight', 3: 'Trójka', 2: 'Dwie pary', 1: 'Para', 0: 'Wysoka karta'
};

function makeDeck() {
  const d = [];
  for (const s of SUITS) for (const r of Object.keys(RANK_VALUES)) d.push({ r, s });
  return d;
}

function shuffle(deck, rng = Math.random) {
  const d = deck.slice();
  for (let i = d.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [d[i], d[j]] = [d[j], d[i]];
  }
  return d;
}

const rv = r => RANK_VALUES[r];

/* Ocena 5 kart. Kategoria 0..9 (9 = royal flush).
   tiebreak: tablica wartości rozstrzygających remis w kolejności ważności. */
function evaluateHand(cards) {
  if (cards.length !== 5) throw new Error('evaluateHand wymaga dokładnie 5 kart');
  const values = cards.map(c => rv(c.r)).sort((a, b) => b - a);
  const suits = cards.map(c => c.s);
  const isFlush = suits.every(s => s === suits[0]);

  const counts = new Map();
  for (const v of values) counts.set(v, (counts.get(v) || 0) + 1);
  const groups = [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0]);
  const uniq = [...new Set(values)];

  let straightHigh = 0;
  if (uniq.length === 5) {
    if (uniq[0] - uniq[4] === 4) straightHigh = uniq[0];
    else if (uniq[0] === 14 && uniq[1] === 5 && uniq[4] === 2) straightHigh = 5;
  }

  if (isFlush && straightHigh) {
    return { category: straightHigh === 14 ? 9 : 8, tiebreak: [straightHigh] };
  }
  if (groups[0][1] === 4) {
    return { category: 7, tiebreak: [groups[0][0], groups[1][0]] };
  }
  if (groups[0][1] === 3 && groups[1][1] === 2) {
    return { category: 6, tiebreak: [groups[0][0], groups[1][0]] };
  }
  if (isFlush) return { category: 5, tiebreak: values };
  if (straightHigh) return { category: 4, tiebreak: [straightHigh] };
  if (groups[0][1] === 3) {
    return { category: 3, tiebreak: [groups[0][0], groups[1][0], groups[2][0]] };
  }
  if (groups[0][1] === 2 && groups[1][1] === 2) {
    return { category: 2, tiebreak: [groups[0][0], groups[1][0], groups[2][0]] };
  }
  if (groups[0][1] === 2) {
    return { category: 1, tiebreak: [groups[0][0], groups[1][0], groups[2][0], groups[3][0]] };
  }
  return { category: 0, tiebreak: values };
}

/* Porównanie: > 0 jeśli a bije b. */
function compareHands(a, b) {
  if (a.category !== b.category) return a.category - b.category;
  const n = Math.max(a.tiebreak.length, b.tiebreak.length);
  for (let i = 0; i < n; i++) {
    const x = a.tiebreak[i] || 0;
    const y = b.tiebreak[i] || 0;
    if (x !== y) return x - y;
  }
  return 0;
}

/* Najlepszy układ z 7 kart (C(7,5) = 21 kombinacji). */
function bestOfSeven(cards7) {
  if (cards7.length !== 7) throw new Error('bestOfSeven wymaga dokładnie 7 kart');
  let best = null;
  for (let a = 0; a < 7; a++)
    for (let b = a + 1; b < 7; b++)
      for (let c = b + 1; c < 7; c++)
        for (let d = c + 1; d < 7; d++)
          for (let e = d + 1; e < 7; e++) {
            const h = evaluateHand([cards7[a], cards7[b], cards7[c], cards7[d], cards7[e]]);
            if (!best || compareHands(h, best) > 0) best = h;
          }
  return best;
}

const STREETS = ['preflop', 'flop', 'turn', 'river'];

class TexasHoldem {
  constructor(names, opts = {}) {
    this.smallBlind = opts.smallBlind ?? 10;
    this.bigBlind = opts.bigBlind ?? 20;
    this.startChips = opts.startChips ?? 1000;
    this.players = names.map((name, id) => ({
      id, name, chips: this.startChips, cards: [], folded: false,
      allIn: false, bet: this.startChips === 0 ? 0 : 0, committed: 0, isHuman: true
    }));
    this.button = opts.button ?? -1;
    this.log = [];
  }

  note(msg) { this.log.push(msg); return this; }

  startHand() {
    this.deck = shuffle(makeDeck());
    this.community = [];
    this.pot = 0;
    this.finished = false;
    this.winners = [];
    this.streetIndex = 0;
    this.bettingRound = 'preflop';
    this.currentBet = 0;
    this.lastRaiseSize = this.bigBlind;
    this.raiseLocked = false;
    this.toAct = new Set();
    this.players.forEach(p => {
      p.cards = []; p.folded = false; p.allIn = false;
      p.bet = 0; p.committed = 0; p.lastAction = null;
    });
    for (let i = 0; i < 2; i++) for (const p of this.players) p.cards.push(this.deck.pop());

    const n = this.players.length;
    this.button = (this.button + 1) % n;
    const sb = (this.button + 1) % n;
    const bb = (this.button + 2) % n;
    this.postBlind(this.players[sb], this.smallBlind, 'mały blind');
    this.postBlind(this.players[bb], this.bigBlind, 'duży blind');
    this.currentBet = this.players[bb].bet || this.bigBlind;

    this.toAct = new Set(this.actable().map(p => p.id));
    this.startTurnFrom((bb + 1) % n);
    this.note(`Runda ${this.bettingRound} — kolejność: ${this.players.map(p => p.name).join(', ')}`);
    return this;
  }

  postBlind(p, amount, label) {
    const amt = Math.min(amount, p.chips);
    p.chips -= amt; p.bet += amt; p.committed += amt; this.pot += amt;
    if (p.chips === 0) p.allIn = true;
    this.note(`${p.name}: ${label} ${amt}`);
  }

  actable() {
    return this.players.filter(p => !p.folded && !p.allIn);
  }
  contenders() { return this.players.filter(p => !p.folded); }
  get currentPlayerId() { return this.currentId; }

  startTurnFrom(idx) {
    const n = this.players.length;
    for (let step = 0; step < n; step++) {
      const id = (idx + step) % n;
      if (this.toAct.has(id)) { this.currentId = id; return; }
    }
    this.closeStreet();
  }

  actionsFor(p) {
    const toCall = this.currentBet - p.bet;
    return {
      toCall,
      minRaiseTo: this.currentBet + this.lastRaiseSize,
      canCheck: toCall === 0,
      canCall: toCall > 0 && p.chips > 0,
      canRaise: p.chips > 0 && !this.raiseLocked,
      maxTo: p.bet + p.chips
    };
  }

  act(playerId, action, amount = 0) {
    if (this.finished) throw new Error('runda już zakończona');
    if (playerId !== this.currentId) throw new Error('nie twoja tura');
    const p = this.players[playerId];
    if (p.folded || p.allIn) throw new Error('gracz nie może działać');
    const a = this.actionsFor(p);

    if (action === 'fold') {
      p.folded = true; p.lastAction = 'fold';
      this.toAct.delete(playerId);
      this.note(`${p.name}: fold`);
    } else if (action === 'check') {
      if (!a.canCheck) throw new Error('check niedozwolony — musisz dołożyć');
      p.lastAction = 'check';
      this.toAct.delete(playerId);
      this.note(`${p.name}: check`);
    } else if (action === 'call') {
      if (!a.canCall) throw new Error('call niedozwolony');
      const amt = Math.min(a.toCall, p.chips);
      p.chips -= amt; p.bet += amt; p.committed += amt; this.pot += amt;
      if (p.chips === 0) p.allIn = true;
      p.lastAction = p.allIn ? 'all-in' : 'call';
      this.toAct.delete(playerId);
      this.note(`${p.name}: call ${amt}`);
    } else if (action === 'raise' || action === 'allin') {
      if (action === 'raise' && !a.canRaise) throw new Error('podbicie zablokowane (krótki all-in)');
      const prevLevel = this.currentBet;
      const target = action === 'allin'
        ? p.bet + p.chips
        : Math.max(Math.trunc(amount), a.minRaiseTo);
      const need = target - p.bet;
      if (need > p.chips) throw new Error('za mało żetonów');
      const isShortAllIn = p.chips - need === 0 && need < a.minRaiseTo - p.bet;
      p.chips -= need; p.bet += need; p.committed += need; this.pot += need;
      if (p.chips === 0) p.allIn = true;
      p.lastAction = p.allIn ? 'all-in' : `raise do ${p.bet}`;
      if (!isShortAllIn) {
        this.currentBet = p.bet;
        this.lastRaiseSize = p.bet - prevLevel;
        this.raiseLocked = false;
        this.toAct = new Set(this.actable().map(x => x.id));
        this.toAct.delete(playerId);
      } else {
        this.raiseLocked = true;
        this.toAct.delete(playerId);
      }
      this.note(`${p.name}: ${p.lastAction}`);
    } else {
      throw new Error('nieznana akcja: ' + action);
    }

    if (this.contenders().length === 1) return this.finishByFold();
    if (this.toAct.size === 0) return this.closeStreet();
    const n = this.players.length;
    for (let step = 1; step <= n; step++) {
      const id = (playerId + step) % n;
      if (this.toAct.has(id)) { this.currentId = id; return this; }
    }
    return this.closeStreet();
  }

  closeStreet() {
    if (this.contenders().length === 1) return this.finishByFold();
    if (this.streetIndex >= STREETS.length - 1) return this.showdown();
    this.streetIndex++;
    this.bettingRound = STREETS[this.streetIndex];
    this.currentBet = 0;
    this.lastRaiseSize = this.bigBlind;
    this.raiseLocked = false;
    for (const p of this.players) p.bet = 0;
    const counts = { flop: 3, turn: 1, river: 1 }[this.bettingRound];
    for (let i = 0; i < counts; i++) this.community.push(this.deck.pop());
    this.note(`${this.bettingRound}: ${this.community.map(c => c.r + c.s).join(' ')}`);
    this.toAct = new Set(this.actable().map(p => p.id));
    if (this.toAct.size === 0) return this.closeStreet();
    const first = this.contenders()[0];
    this.startTurnFrom(first.id);
    return this;
  }

  finishByFold() {
    const w = this.contenders()[0];
    const amount = this.pot;
    w.chips += amount;
    this.winners = [{ id: w.id, name: w.name, amount, hand: null }];
    this.note(`${w.name} wygrywa ${amount} — wszyscy inni zrezygnowali`);
    this.pot = 0;
    this.finished = true;
    this.bettingRound = 'showdown';
    return this;
  }

  showdown() {
    const live = this.contenders();
    const ranked = live.map(p => ({
      id: p.id, name: p.name, committed: p.committed,
      hand: bestOfSeven(p.cards.concat(this.community))
    })).sort((x, y) => compareHands(y.hand, x.hand));

    let remaining = this.pot;
    const pool = ranked.slice();
    const payouts = [];
    while (pool.length && remaining > 0) {
      const level = Math.min(...pool.map(p => p.committed));
      const levelAll = ranked.filter(p => p.committed >= level);
      let contendersLevel = pool.filter(p => p.committed >= level);
      if (!contendersLevel.length) break;
      const best = contendersLevel[0];
      contendersLevel = contendersLevel.filter(p => compareHands(p.hand, best.hand) === 0);
      const share = Math.floor(remaining / contendersLevel.length);
      let paid = 0;
      for (const p of contendersLevel) {
        payouts.push({ id: p.id, name: p.name, amount: share, hand: p.hand, level });
        this.players[p.id].chips += share;
        remaining -= share; paid += share;
      }
      const winIds = new Set(contendersLevel.map(p => p.id));
      const stillIn = pool.filter(p => !winIds.has(p.id));
      const everyoneDone = stillIn.every(p => p.committed <= level);
      pool.length = 0;
      if (everyoneDone) {
        // reszta puli wraca do tych, którzy nie wygrali na tym poziomie
        if (remaining > 0) {
          for (const p of levelAll) { this.players[p.id].chips += remaining; remaining = 0; }
        }
        break;
      }
      pool.push(...stillIn);
    }
    if (remaining > 0) {
      // niepowodzone rozdanie — zwrot do wszystkich, którzy coś włożyły
      for (const p of live) { this.players[p.id].chips += remaining; remaining = 0; }
    }
    this.winners = payouts;
    for (const p of payouts) {
      this.note(`${p.name} +${p.amount} — ${HAND_NAMES[p.hand.category]} [${p.hand.tiebreak.join(',')}]`);
    }
    this.pot = 0;
    this.finished = true;
    this.bettingRound = 'showdown';
    return this;
  }
}

const API = {
  makeDeck, shuffle, evaluateHand, compareHands, bestOfSeven,
  TexasHoldem, RANK_VALUES, HAND_NAMES, SUITS
};
if (typeof module !== 'undefined' && module.exports) module.exports = API;
if (typeof window !== 'undefined') window.PokerEngine = API;
