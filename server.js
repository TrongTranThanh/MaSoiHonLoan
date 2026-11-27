// Ma Sói Chọn Lõi — máy chủ trọng tài (server-authoritative)
const express = require('express'), http = require('http'), { Server } = require('socket.io');
const app = express(); app.use(express.static(__dirname + '/public'));
const srv = http.createServer(app), io = new Server(srv);
const ACT = { steal: ['steal'], bomb: ['bomb'], silence: ['silence'], convert: ['convert'], swap: ['swapA', 'swapB'], link: ['linkA', 'linkB'] };
const POOL = ['swap', 'steal', 'bomb', 'silence', 'convert', 'link', 'doublevote', 'lucky', 'mirror', 'blast', 'oracle', 'dice', 'armor', 'hunter'];
const NM = { swap: 'Hoán Đổi Linh Hồn', steal: 'Đạo Tặc Vận Mệnh', bomb: 'Bom Hẹn Giờ', silence: 'Lời Nguyền Câm', convert: 'Lời Thì Thầm Phản Bội', link: 'Sợi Chỉ Đỏ', doublevote: 'Phiếu Kép', lucky: 'May Rủi', mirror: 'Gương Phản Chiếu', blast: 'Cái Chết Nổ', oracle: 'Sấm Truyền Điên', dice: 'Xúc Xắc Số Phận', armor: 'Giáp Thép', hunter: 'Báo Thù' };
const rooms = {};
const R = a => a[Math.random() * a.length | 0];
const sh = a => a.map(x => [Math.random(), x]).sort((a, b) => a[0] - b[0]).map(x => x[1]);
const wolfTeam = p => p.role === 'wolf' || p.role === 'traitor';
const wt = p => p.cards.includes('doublevote') ? 2 : 1;
const alive = r => r.pl.filter(p => p.al);
const T = { draft: 25000, night: 45000, day: 90000, vote: 30000, hunter: 20000 };

function setT(r, ms, fn) { clearTimeout(r.timer); r.dl = Date.now() + ms; r.timer = setTimeout(fn, ms); }
function pub(r, m, c) { r.log.push({ i: ++r.seq, m, c: c || '' }); }
function priv(r, p, m, c) { p.priv.push({ i: ++r.seq, m, c: c || 'pr' }); }

function view(r, p) {
  const end = r.ph === 'end', night = r.ph === 'night';
  const acts = [];
  if (p.al && night) {
    if (p.role === 'wolf') acts.push('bite');
    p.cards.forEach(c => (ACT[c] || []).forEach(k => {
      if (acts.includes(k) || (k === 'steal' && p.used.steal) || (k === 'convert' && p.used.convert) || ((k === 'linkA' || k === 'linkB') && p.used.link)) return;
      acts.push(k);
    }));
  }
  const log = [...r.log, ...p.priv].sort((a, b) => a.i - b.i).slice(-50);
  return {
    code: r.code, ph: r.ph, ms: Math.max(0, (r.dl || 0) - Date.now()), day: r.day,
    host: r.pl[0] === p, report: r.report, win: r.win, hid: r.hid, log, chat: r.chat.slice(-60),
    players: r.pl.map(q => ({ id: q.id, nm: q.nm, al: q.al, conn: q.conn, bot: !!q.bot, votes: r.ph === 'vote' ? r.pl.filter(x => x.al && x.vote === q.id).reduce((t, x) => t + wt(x), 0) : undefined, role: end ? q.role : undefined, cards: end ? q.cards : undefined })),
    me: { id: p.id, role: r.ph === 'lobby' ? null : p.role, cards: p.cards, al: p.al, used: p.used, acts, act: p.act, hand: r.ph === 'draft' ? p.hand : null, pick: p.pick, rolled: p.rolled, vote: p.vote, voted: p.voted, ready: p.ready },
    allies: p.role === 'wolf' ? r.pl.filter(q => q.role === 'wolf' && q !== p).map(q => q.nm) : [],
    silenced: !!(r.silenced && r.silenced.has(p.id))
  };
}
function bc(r) { r.pl.forEach(p => { if (p.sid && p.conn) io.to(p.sid).emit('state', view(r, p)); }); }

const BN = ['Bot Sói Xám', 'Bot Đêm Đen', 'Bot Trăng Khuyết', 'Bot Cú Mèo', 'Bot Sương Mù', 'Bot Lửa Trại', 'Bot Gió Bắc', 'Bot Cánh Đồng', 'Bot Đá Cuội', 'Bot Mùa Đông', 'Bot Tiếng Chuông'];
const humans = r => r.pl.filter(p => !p.bot);
function botNight(r) {
  const A = alive(r), foes = A.filter(q => !wolfTeam(q));
  A.filter(p => p.bot).forEach(p => {
    const others = A.filter(q => q !== p), two = () => sh(A).slice(0, 2);
    if (p.role === 'wolf' && r.bite == null && foes.length) { p.act.bite = R(foes).id; r.bite = p.act.bite; }
    p.cards.forEach(c => {
      if (c === 'swap' && Math.random() < .6) { const [x, y] = two(); p.act.swapA = x.id; p.act.swapB = y.id; }
      if (c === 'steal' && !p.used.steal && Math.random() < .4) p.act.steal = R(others).id;
      if (c === 'bomb' && Math.random() < .5) p.act.bomb = R(others).id;
      if (c === 'silence' && Math.random() < .5) p.act.silence = R(others).id;
      if (c === 'convert' && !p.used.convert && Math.random() < .5) p.act.convert = R(others).id;
      if (c === 'link' && !p.used.link && Math.random() < .6) { const [x, y] = two(); p.act.linkA = x.id; p.act.linkB = y.id; }
    });
    p.ready = true;
  });
}
function botChat(r) {
  const d = r.day, bots = alive(r).filter(p => p.bot); if (!bots.length) return;
  for (let k = 1; k <= 4; k++) setTimeout(() => {
    if (r.ph !== 'day' || r.day !== d) return; const b = R(bots.filter(x => x.al)); if (!b) return;
    const q = R(alive(r).filter(x => x !== b)); if (!q) return;
    r.chat.push({ nm: b.nm, tx: R(['Mình thấy ' + q.nm + ' đáng ngờ.', 'Ai có thông tin gì không?', 'Đêm qua ' + q.nm + ' im lặng bất thường.', 'Mình là dân, tin mình đi.', 'Hãy nghe ' + q.nm + ' giải thích trước.']) }); bc(r);
  }, 6000 * k);
}
function botVote(r) {
  const d = r.day;
  alive(r).filter(p => p.bot).forEach(p => setTimeout(() => {
    if (r.ph !== 'vote' || r.day !== d || !p.al || p.voted) return;
    const A = alive(r).filter(q => q !== p), pool = p.role === 'villager' ? A : A.filter(q => !wolfTeam(q));
    p.vote = Math.random() < .15 || !pool.length ? null : R(pool).id; p.voted = true; advance(r); bc(r);
  }, 2000 + Math.random() * 12000));
}
function start(r) {
  const n = r.pl.length, wc = n >= 10 ? 2 : 1, tr = n >= 7 && n <= 9 ? 1 : 0;
  const roles = sh([...Array(wc).fill('wolf'), ...Array(tr).fill('traitor'), ...Array(n - wc - tr).fill('villager')]);
  r.pl.forEach((p, i) => Object.assign(p, { id: i, role: roles[i], cards: [], al: true, used: {}, act: {}, priv: [], vote: null, voted: false, ready: false }));
  r.pl.forEach((p, i) => p.id = i);
  r.log = []; r.chat = []; r.day = 0; r.win = null; r.seq = 0; r.links = []; r.bombs = []; r.silenced = new Set();
  pub(r, 'Ván đấu bắt đầu với ' + n + ' người chơi.');
  r.ph = 'draft';
  r.pl.forEach(p => { deal(r, p); if (p.bot) p.pick = p.hand.map(h => R(h)); });
  setT(r, T.draft, () => endDraft(r)); bc(r);
}
function deal(r, p) {
  p.hand = [sh(POOL).slice(0, 3)];
  if (r.pl.length <= 6 && p.role === 'wolf') p.hand.push(sh(POOL).slice(0, 3));
  p.pick = [];
}
function endDraft(r) {
  r.pl.forEach(p => { p.cards = p.hand.map((h, i) => p.pick[i] || h[0]); p.hand = null; });
  nightStart(r);
}
function nightStart(r) {
  r.day++; r.ph = 'night'; r.bite = null; r.silenced = new Set();
  r.pl.forEach(p => { p.act = {}; p.ready = !p.conn; });
  pub(r, 'Đêm ' + r.day + ' bắt đầu.');
  botNight(r);
  setT(r, T.night, () => resolve(r)); bc(r);
}
function resolve(r) {
  clearTimeout(r.timer);
  const A = alive(r), dead = new Set(), has = (p, c) => p.al && p.cards.includes(c), prv = (p, m) => priv(r, p, m);
  // 0. Đạo tặc: hoán đổi toàn bộ lõi
  A.forEach(p => { if (has(p, 'steal') && !p.used.steal && p.act.steal != null) { const t = r.pl[p.act.steal]; if (t && t.al && t !== p) {
    p.used.steal = 1; [p.cards, t.cards] = [t.cards, p.cards];
    prv(p, 'Đạo Tặc: bạn đã hoán đổi toàn bộ lõi với ' + t.nm + '.'); prv(t, 'Lõi của bạn đã bị đánh cắp và đổi lấy lõi khác!'); } } });
  // 1. Hoán đổi linh hồn: đổi mục tiêu của mọi hành động
  const fns = [];
  A.forEach(p => { const a = p.act.swapA, b = p.act.swapB; if (has(p, 'swap') && a != null && b != null && a !== b) fns.push(x => x === a ? b : x === b ? a : x); });
  if (fns.length) pub(r, '🌀 Có linh hồn vừa bị hoán đổi trong đêm...');
  const M = x => x == null ? x : fns.reduce((v, f) => f(v), x);
  // 2. Sợi chỉ đỏ
  A.forEach(p => { const a = p.act.linkA, b = p.act.linkB; if (has(p, 'link') && !p.used.link && a != null && b != null && a !== b) { p.used.link = 1; r.links.push([a, b]); pub(r, '💞 Hai số phận vừa bị buộc vào nhau...'); } });
  // 3. Đòn cắn
  const v = r.bite == null ? null : M(r.bite);
  if (v != null && r.pl[v].al) {
    const t = r.pl[v];
    if (has(t, 'armor') && !t.used.armor) { t.used.armor = 1; prv(t, '🛡 Giáp Thép đã chặn đòn cắn!'); pub(r, 'Có người đã sống sót sau đòn cắn nhờ lớp giáp...'); }
    else if (has(t, 'lucky') && !t.used.lucky && (t.used.lucky = 1) && Math.random() < .5) { prv(t, '🍀 May Rủi: bạn thoát chết trong gang tấc!'); pub(r, 'Có người đã may mắn thoát chết...'); }
    else { dead.add(v); if (has(t, 'mirror')) { const w = A.filter(x => x.role === 'wolf' && x.id !== v); if (w.length) { const k = R(w); dead.add(k.id); pub(r, '🪞 Gương Phản Chiếu bật lại đòn cắn!', 'dd'); } } }
  }
  // 4. Bom hẹn giờ
  A.forEach(p => { if (has(p, 'bomb') && p.act.bomb != null) { const t = M(p.act.bomb); r.bombs.push({ t, at: r.day + 2 }); prv(p, '💣 Đã gắn bom lên ' + r.pl[t].nm + ', sẽ nổ sau 2 đêm.'); } });
  r.bombs = r.bombs.filter(b => { if (b.at > r.day) return true; if (r.pl[b.t].al) { dead.add(b.t); pub(r, '💣 Một quả bom đã phát nổ!', 'dd'); } return false; });
  // 5. Lời thì thầm phản bội
  A.forEach(p => { if (has(p, 'convert') && !p.used.convert && p.act.convert != null) { const t = r.pl[M(p.act.convert)]; p.used.convert = 1;
    if (t && t.al && t.role === 'villager' && t !== p) { t.role = 'traitor'; prv(t, '🐍 Có tiếng thì thầm trong đêm... bạn đã trở thành KẺ PHẢN BỘI (phe Sói)!'); prv(p, 'Thì thầm thành công: ' + t.nm + ' đã phản bội ngôi làng.'); }
    else prv(p, 'Lời thì thầm không có tác dụng với ' + (t ? t.nm : '?') + '.'); } });
  // 6. Lời nguyền câm
  r.silenced = new Set();
  A.forEach(p => { if (has(p, 'silence') && p.act.silence != null) { const t = M(p.act.silence); r.silenced.add(t); prv(p, '🤐 ' + r.pl[t].nm + ' sẽ bị câm vào ban ngày.'); } });
  // 7. Thông tin
  A.forEach(p => { if (!dead.has(p.id) && has(p, 'oracle')) {
    const ws = alive(r).filter(x => x.role === 'wolf' && x !== p), o = alive(r).filter(x => x !== p && x.role !== 'wolf');
    if (ws.length && o.length) { const pr = sh([R(ws), R(o)]); prv(p, '🔮 Lời sấm: trong ' + pr[0].nm + ' và ' + pr[1].nm + ' có ít nhất 1 Ma sói.'); }
    else prv(p, '🔮 Lời sấm mờ mịt, bạn chẳng thấy gì.'); } });
  // 8. Xúc xắc số phận
  A.forEach(p => { if (dead.has(p.id) || !has(p, 'dice')) return;
    const d = 1 + Math.random() * 6 | 0, o = A.filter(x => x !== p && !dead.has(x.id)); if (!o.length) return; const x = R(o);
    if (d <= 2) { const c = R(POOL.filter(k => k !== 'hunter' && !x.cards.includes(k))); x.cards.push(c); prv(p, '🎲 [' + d + '] Xúc xắc ban cho ' + x.nm + ' thêm lõi ' + NM[c] + '!'); prv(x, '🎲 Số phận ban cho bạn thêm lõi: ' + NM[c] + '!'); }
    else if (d <= 4) prv(p, '🎲 [' + d + '] ' + x.nm + (wolfTeam(x) ? ' thuộc phe Sói.' : ' thuộc phe Dân làng.'));
    else if (d === 5) { r.silenced.add(x.id); prv(p, '🎲 [5] ' + x.nm + ' bị câm vào ban ngày.'); }
    else { dead.add(x.id); prv(p, '🎲 [6] Xúc xắc nghiệt ngã... ' + x.nm + ' sẽ không thấy bình minh.'); } });
  A.forEach(p => { if (!p.conn && r.day > p.dcDay) dead.add(p.id); });
  r.nightDead = [...dead];
  kill(r, [...dead], () => dayStart(r));
}
function kill(r, ids, cb) {
  const hs = [], w = [...ids], n = r.pl.length;
  const die = i => {
    const p = r.pl[i]; if (!p.al) return; p.al = false; pub(r, p.nm + ' đã rời khỏi ván.', 'dd');
    if (p.cards.includes('hunter')) hs.push(p);
    if (p.cards.includes('blast')) { const nb = [r.pl[(i + 1) % n], r.pl[(i + n - 1) % n]].filter(x => x.al && x !== p); if (nb.length) { const k = R(nb); pub(r, '💥 ' + p.nm + ' phát nổ và kéo ' + k.nm + ' theo!', 'dd'); w.push(k.id); } }
    r.links.forEach(([a, b]) => { const o = a === i ? b : b === i ? a : null; if (o != null && r.pl[o].al) { pub(r, '💞 ' + r.pl[o].nm + ' chết theo vì sợi chỉ đỏ.', 'dd'); w.push(o); } });
  };
  const flush = () => { while (w.length) die(w.shift()); };
  flush();
  const shoot = (h, t) => {
    if (t == null) return; const q = r.pl[t]; if (!q.al) return;
    pub(r, h.nm + ' bắn hạ ' + q.nm + '.', 'dd'); w.push(t); flush();
  };
  const rnd = h => { const c = alive(r).filter(x => x !== h); return c.length ? R(c).id : null; };
  const next = () => {
    const h = hs.shift();
    if (!h) { const wn = win(r); return wn ? endGame(r, wn) : cb(); }
    if (!h.conn || h.bot) { shoot(h, rnd(h)); return next(); }
    r.ph = 'hunter'; r.hid = h.id;
    r.hcb = t => { clearTimeout(r.timer); r.hcb = null; shoot(h, t); next(); };
    setT(r, T.hunter, () => r.hcb(rnd(h))); bc(r);
  };
  next();
}
function win(r) {
  const a = alive(r), w = a.filter(p => p.role === 'wolf').length, t = a.filter(wolfTeam).length;
  if (!w) return 'v'; if (t >= a.length - t) return 'w'; return null;
}
function dayStart(r) {
  r.ph = 'day'; r.chat = r.chat || [];
  r.report = r.nightDead.length ? r.nightDead.map(i => r.pl[i].nm).join(', ') + ' đã không qua khỏi đêm qua.' : 'Một đêm bình yên, không ai chết.';
  pub(r, 'Ngày ' + r.day + ': ' + r.report, r.nightDead.length ? 'dd' : '');
  r.pl.forEach(p => p.ready = !p.conn);
  r.pl.forEach(p => { if (p.bot) p.ready = true; });
  botChat(r);
  setT(r, T.day, () => voteStart(r)); bc(r);
}
function voteStart(r) {
  r.ph = 'vote'; r.pl.forEach(p => { p.vote = null; p.voted = !p.conn; });
  botVote(r);
  setT(r, T.vote, () => voteEnd(r)); bc(r);
}
function voteEnd(r) {
  clearTimeout(r.timer);
  const a = alive(r), cnt = {};
  a.forEach(p => { if (p.vote != null) cnt[p.vote] = (cnt[p.vote] || 0) + wt(p); });
  const rank = Object.entries(cnt).sort((x, y) => y[1] - x[1]);
  pub(r, 'Kết quả bỏ phiếu: ' + (rank.map(([id, c]) => r.pl[id].nm + ' ' + c).join(' · ') || 'không ai bỏ phiếu'));
  if (rank.length && rank[0][1] > a.length / 2 && (!rank[1] || rank[1][1] < rank[0][1])) {
    const t = r.pl[rank[0][0]];
    if (t.cards.includes('lucky') && !t.used.lucky && (t.used.lucky = 1) && Math.random() < .5) { pub(r, '🍀 Sợi dây thòng lọng đứt! ' + t.nm + ' may mắn thoát chết.'); return nightStart(r); }
    pub(r, t.nm + ' bị treo cổ. Vai trò: ' + RN[t.role] + '.', 'dd');
    r.nightDead = []; kill(r, [t.id], () => nightStart(r));
  } else { pub(r, 'Không ai đạt quá bán — không ai bị treo cổ.'); nightStart(r); }
}
const RN = { wolf: 'Ma sói', traitor: 'Kẻ phản bội', villager: 'Dân làng' };
function endGame(r, w) { clearTimeout(r.timer); r.ph = 'end'; r.win = w; r.dl = 0; bc(r); }
function advance(r) {
  const A = alive(r);
  if (r.ph === 'night' && A.every(p => p.ready || !p.conn)) resolve(r);
  else if (r.ph === 'day' && A.every(p => p.ready || !p.conn)) { clearTimeout(r.timer); voteStart(r); }
  else if (r.ph === 'vote' && A.every(p => p.voted || !p.conn)) voteEnd(r);
}

io.on('connection', sock => {
  let r = null, me = null;
  const err = m => sock.emit('err', m);
  const find = () => { if (!r || !me) return false; return true; };
  sock.on('join', ({ code, name, token, create }) => {
    name = String(name || '').trim().slice(0, 20) || 'Người chơi'; token = String(token || '').slice(0, 64);
    if (!token) return err('Thiếu mã định danh.');
    if (create) {
      do { code = 'MS' + (1000 + Math.random() * 9000 | 0); } while (rooms[code]);
      rooms[code] = { code, pl: [], ph: 'lobby', log: [], chat: [], seq: 0, day: 0 };
    }
    code = String(code || '').toUpperCase().trim(); const room = rooms[code];
    if (!room) return err('Không tìm thấy phòng ' + code + '.');
    let p = room.pl.find(x => x.tk === token);
    if (!p) {
      if (room.ph !== 'lobby') return err('Ván đã bắt đầu, không thể vào thêm.');
      if (room.pl.length >= 12) return err('Phòng đã đủ 12 người.');
      if (room.pl.some(x => x.nm === name)) name += ' ' + (room.pl.length + 1);
      p = { tk: token, nm: name, id: room.pl.length, cards: [], al: true, used: {}, act: {}, priv: [], pick: [] };
      room.pl.push(p);
    }
    p.sid = sock.id; p.conn = true; p.dcDay = undefined; r = room; me = p;
    if (r.ph !== 'lobby') advance(r);
    bc(r);
  });
  sock.on('start', () => {
    if (!find() || r.ph !== 'lobby' || r.pl[0] !== me) return;
    if (r.pl.length < 5) return err('Cần ít nhất 5 người chơi.');
    start(r);
  });
  sock.on('addbot', ({ n } = {}) => {
    if (!find() || r.ph !== 'lobby' || r.pl[0] !== me) return;
    for (let i = 0; i < Math.min(Math.max(+n || 1, 1), 11) && r.pl.length < 12; i++) {
      const nm = BN.find(x => !r.pl.some(p => p.nm === x)) || 'Bot ' + (r.pl.length + 1);
      r.pl.push({ tk: 'bot' + Math.random(), nm, bot: true, conn: true, id: r.pl.length, cards: [], al: true, used: {}, act: {}, priv: [], pick: [] });
    }
    bc(r);
  });
  sock.on('rmbot', () => {
    if (!find() || r.ph !== 'lobby' || r.pl[0] !== me) return;
    for (let i = r.pl.length - 1; i > 0; i--) if (r.pl[i].bot) { r.pl.splice(i, 1); break; }
    r.pl.forEach((p, i) => p.id = i); bc(r);
  });
  sock.on('roll', () => { if (!find() || r.ph !== 'draft' || me.rolled) return; deal(r, me); me.rolled = true; bc(r); });
  sock.on('pick', ({ i, card }) => { if (!find() || r.ph !== 'draft') return; if (me.hand[i] && me.hand[i].includes(card)) { me.pick[i] = card; bc(r); } });
  sock.on('act', ({ k, t }) => {
    if (!find() || r.ph !== 'night' || !me.al) return;
    if (!view(r, me).me.acts.includes(k)) return;
    {
      if (t == null) delete me.act[k];
      else {
        const q = r.pl[t]; if (!q || !q.al) return;
        if (k === 'bite' && wolfTeam(q)) return;
        if ((k === 'steal' || k === 'convert') && q === me) return;
        me.act[k] = t; if (k === 'bite') r.bite = t;
      }
    }
    bc(r);
  });
  sock.on('ready', () => { if (!find() || !me.al || (r.ph !== 'night' && r.ph !== 'day')) return; me.ready = true; advance(r); bc(r); });
  sock.on('vote', ({ t }) => {
    if (!find() || r.ph !== 'vote' || !me.al) return;
    if (t != null) { const q = r.pl[t]; if (!q || !q.al || q === me) return; }
    me.vote = t == null ? null : t; me.voted = true; advance(r); bc(r);
  });
  sock.on('shoot', ({ t }) => { if (!find() || r.ph !== 'hunter' || r.hid !== me.id || !r.hcb) return; const q = r.pl[t]; if (!q || !q.al || q === me) return; r.hcb(t); });
  sock.on('chat', ({ tx }) => {
    if (!find() || !me.al || (r.ph !== 'day' && r.ph !== 'vote')) return;
    if (r.silenced && r.silenced.has(me.id)) return err('🤐 Bạn đang bị câm, không thể nói hôm nay.');
    tx = String(tx || '').trim().slice(0, 200); if (!tx) return;
    r.chat.push({ nm: me.nm, tx }); bc(r);
  });
  sock.on('again', () => {
    if (!find() || r.ph !== 'end' || r.pl[0] !== me) return;
    r.pl = r.pl.filter(p => p.conn); r.pl.forEach((p, i) => { p.id = i; });
    r.ph = 'lobby'; r.win = null; r.log = []; r.chat = []; bc(r);
  });
  sock.on('disconnect', () => {
    if (!r || !me) return; me.conn = false;
    if (r.ph === 'lobby') { r.pl = r.pl.filter(p => p !== me).sort((a, b) => !!a.bot - !!b.bot); r.pl.forEach((p, i) => p.id = i); }
    else { me.dcDay = r.day; advance(r); }
    if (!r.pl.some(p => p.conn && !p.bot)) { const c = r.code, rr = r; setTimeout(() => { if (rooms[c] === rr && !rr.pl.some(p => p.conn && !p.bot)) { clearTimeout(rr.timer); delete rooms[c]; } }, 600000); }
    bc(r);
  });
});
const PORT = process.env.PORT || 3000;
srv.listen(PORT, () => console.log('Ma Sói chạy tại http://localhost:' + PORT));
