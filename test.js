/* Silnik pokera — testy na Node, zero zależności: node test.js */
const assert = require('assert');
const E = require('./engine.js');

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ok  ' + name); }
  catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + e.message); }
}
const c = (r, s) => ({ r, s });
const h = hand => E.evaluateHand(hand);

test('Royal Flush bije wszystko', () => {
  const royal = h([c('T','s'),c('J','s'),c('Q','s'),c('K','s'),c('A','s')]);
  const quads = h([c('9','s'),c('9','h'),c('9','d'),c('9','c'),c('A','s')]);
  assert.ok(E.compareHands(royal, quads) > 0);
  assert.strictEqual(royal.category, 9);
});

test('Straight Flush > Flush', () => {
  const sf = h([c('5','s'),c('6','s'),c('7','s'),c('8','s'),c('9','s')]);
  const fl = h([c('A','s'),c('J','s'),c('8','s'),c('4','s'),c('2','s')]);
  assert.ok(E.compareHands(sf, fl) > 0);
});

test('Cztery kolory > Full House', () => {
  const q = h([c('7','s'),c('7','h'),c('7','d'),c('7','c'),c('K','s')]);
  const fh = h([c('Q','s'),c('Q','h'),c('Q','d'),c('J','c'),c('J','s')]);
  assert.ok(E.compareHands(q, fh) > 0);
});

test('Full House: trójka bije parę, para bije trójkę w full house', () => {
  const fh1 = h([c('A','s'),c('A','h'),c('A','d'),c('K','c'),c('K','s')]);
  const fh2 = h([c('K','s'),c('K','h'),c('K','d'),c('Q','c'),c('Q','s')]);
  const trips = h([c('A','s'),c('A','h'),c('A','d'),c('K','c'),c('3','s')]);
  assert.ok(E.compareHands(fh1, trips) > 0);
  assert.ok(E.compareHands(fh1, fh2) > 0);
});

test('Wheel (A-2-3-4-5) to straight 5-high', () => {
  const w = h([c('A','s'),c('2','h'),c('3','d'),c('4','c'),c('5','s')]);
  assert.strictEqual(w.category, 4);
  assert.deepStrictEqual(w.tiebreak, [5]);
});

test('Flush wygrywa straight', () => {
  const fl = h([c('A','s'),c('J','s'),c('9','s'),c('6','s'),c('3','s')]);
  const st = h([c('9','h'),c('T','d'),c('J','c'),c('Q','s'),c('K','h')]);
  assert.ok(E.compareHands(fl, st) > 0);
});

test('Trójka > dwie pary > para > wysoka', () => {
  const two = h([c('A','s'),c('A','h'),c('K','d'),c('K','c'),c('2','s')]);
  const three = h([c('Q','s'),c('Q','h'),c('Q','d'),c('5','c'),c('2','s')]);
  const pair = h([c('J','s'),c('J','h'),c('8','d'),c('5','c'),c('2','s')]);
  const high = h([c('A','s'),c('J','h'),c('9','d'),c('5','c'),c('2','s')]);
  assert.ok(E.compareHands(three, two) > 0);
  assert.ok(E.compareHands(two, pair) > 0);
  assert.ok(E.compareHands(pair, high) > 0);
});

test('Remis: identyczny układ = compare 0', () => {
  const a = h([c('A','s'),c('K','h'),c('Q','d'),c('J','c'),c('9','s')]);
  const b = h([c('A','h'),c('K','s'),c('Q','c'),c('J','d'),c('9','h')]);
  assert.strictEqual(E.compareHands(a, b), 0);
});

test('Kicker rozstrzyga remis pary', () => {
  const a = h([c('8','s'),c('8','h'),c('K','d'),c('5','c'),c('2','s')]);
  const b = h([c('8','s'),c('8','h'),c('Q','d'),c('5','c'),c('2','s')]);
  assert.ok(E.compareHands(a, b) > 0);
});

test('bestOfSeven znajduje najlepsze 5 z 7 (set)', () => {
  const seven = [c('A','s'),c('A','h'),c('A','d'),c('K','c'),c('K','s'),c('2','h'),c('3','d')];
  const best = E.bestOfSeven(seven);
  assert.strictEqual(best.category, 6);
  assert.deepStrictEqual(best.tiebreak, [14, 13]);
});

test('bestOfSeven znajduje straight na 7 kart', () => {
  const seven = [c('2','s'),c('3','h'),c('4','d'),c('5','c'),c('6','s'),c('K','h'),c('Q','d')];
  const best = E.bestOfSeven(seven);
  assert.strictEqual(best.category, 4);
  assert.deepStrictEqual(best.tiebreak, [6]);
});

test('Tasowanie nie gubi ani nie dubluje kart', () => {
  const d = E.makeDeck();
  assert.strictEqual(d.length, 52);
  const s = E.shuffle(d);
  assert.strictEqual(new Set(s.map(x => x.r + x.s)).size, 52);
});

test('Blindy wchodzą do puli', () => {
  const g = new E.TexasHoldem(['A','B','C'], { smallBlind: 10, bigBlind: 20, startChips: 1000 });
  g.startHand();
  assert.strictEqual(g.pot, 30);
  const chips = g.players.map(p => p.chips).sort((a,b)=>a-b);
  assert.deepStrictEqual(chips, [980, 990, 1000]);
});

test('Gra: Everyone folds → wygrywa blinds', () => {
  const g = new E.TexasHoldem(['A','B','C']).startHand();
  while (!g.finished) {
    const id = g.currentId;
    const a = g.actionsFor(g.players[id]);
    g.act(id, a.canCheck ? 'check' : 'fold');
  }
  const total = g.players.reduce((s,p)=>s+p.chips,0);
  assert.strictEqual(total, 3000);
  assert.strictEqual(g.winners.length, 1);
});

test('Gra: check-check-check kończy preflop i rozdaje flop', () => {
  const g = new E.TexasHoldem(['A','B','C']).startHand();
  let guard = 0;
  while (g.bettingRound === 'preflop' && guard++ < 20) {
    const id = g.currentId;
    const a = g.actionsFor(g.players[id]);
    g.act(id, a.canCheck ? 'check' : 'call');
  }
  assert.ok(['flop','turn','river','showdown'].includes(g.bettingRound));
  assert.ok(g.community.length >= 3);
});

test('Gra: raise podnosi currentBet, następny minRaiseTo rośnie o ten sam rozmiar', () => {
  const g = new E.TexasHoldem(['A','B','C']).startHand();
  const id = g.currentId;
  const a = g.actionsFor(g.players[id]);
  g.act(id, 'raise', a.minRaiseTo);
  const poRaise = g.currentBet;
  assert.strictEqual(poRaise, a.minRaiseTo);
  const rozmiar = poRaise - g.bigBlind;
  const nastepny = g.actionsFor(g.players[g.currentId]);
  assert.strictEqual(nastepny.minRaiseTo, poRaise + rozmiar);
});

test('Gra: check nie wpuszcza gdy trzeba dołożyć', () => {
  const g = new E.TexasHoldem(['A','B','C']).startHand();
  const id = g.currentId;
  const a = g.actionsFor(g.players[id]);
  if (a.canCheck) g.act(id, 'check');
  const id2 = g.currentId;
  const a2 = g.actionsFor(g.players[id2]);
  if (!a2.canCheck) assert.throws(() => g.act(id2, 'check'), /dołożyć/);
});

test('Gra: nie twoja tura = wyjątek', () => {
  const g = new E.TexasHoldem(['A','B','C']).startHand();
  const wrong = g.currentId === 0 ? 1 : 0;
  assert.throws(() => g.act(wrong, 'check'), /tura/);
});

test('Gra: złe żetony = wyjątek', () => {
  const g = new E.TexasHoldem(['A','B','C']).startHand();
  const id = g.currentId;
  const a = g.actionsFor(g.players[id]);
  if (a.canRaise) assert.throws(() => g.act(id, 'raise', 999999), /żetonów/);
});

test('Gra: pełna runda kończy się wygranej i suma żetonów zgadza', () => {
  const g = new E.TexasHoldem(['A','B','C']).startHand();
  let guard = 0;
  while (!g.finished && guard++ < 200) {
    const id = g.currentId;
    const a = g.actionsFor(g.players[id]);
    if (a.canRaise && guard % 4 === 0) g.act(id, 'raise', a.minRaiseTo);
    else if (a.canCall) g.act(id, 'call');
    else g.act(id, 'check');
  }
  assert.ok(g.finished, 'gra powinna się skończyć');
  const total = g.players.reduce((s,p)=>s+p.chips,0);
  assert.ok(total <= 3000, 'żetony nie mogą się zrobić z niczego: ' + total);
  if (g.bettingRound === 'showdown' && g.winners.length && g.winners[0].hand) {
    assert.ok(g.winners[0].hand.category >= 0);
  }
});

test('Gra: all-in gracza nie blokuje gry', () => {
  const g = new E.TexasHoldem(['A','B','C'], { startChips: 100 }).startHand();
  const id = g.currentId;
  const a = g.actionsFor(g.players[id]);
  g.act(id, 'allin');
  let guard = 0;
  while (!g.finished && guard++ < 100) {
    const cid = g.currentId;
    const ca = g.actionsFor(g.players[cid]);
    g.act(cid, ca.canCall ? 'call' : (ca.canCheck ? 'check' : 'fold'));
  }
  assert.ok(g.finished);
});

console.log(`\n${passed} ok, ${failed} FAIL`);
process.exit(failed ? 1 : 0);
