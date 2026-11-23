'use strict';

const planMoney = new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 2 });
const signedMoney = amount => (amount > 0 ? '+' : amount < 0 ? '−' : '') + '¥' + planMoney.format(Math.abs(amount));

function clearPlanPerformance() {
 $('plan-return').replaceChildren();
 $('plan-lots').replaceChildren();
}

function renderPlanPerformance(simulation, start, capital) {
 const value = simulation.nav.at(-1), gain = value-capital, rate = gain/capital;
 const noTrade = !simulation.rounds.length;
 const note = noTrade ? (simulation.orders.length ?
  '首笔已排队，模拟尚未成交，现金按零利息计算。' :
  '这段时间没有模拟成交，现金按零利息计算。') :
  '已卖出部分按成交价计入，持仓按截止周收盘估值。';
 $('plan-return').innerHTML = `
  <div class="plan-return-heading"><h3>模拟账户收益</h3><span>${rows[start][0]} 至 ${rows[end][0]}</span></div>
  <div class="stats plan-stats">
   <div class="primary-gain"><span>累计盈亏</span><strong class="${changeClass(gain)}">${signedMoney(gain)}</strong></div>
   <div><span>累计收益率</span><strong class="${changeClass(rate)}">${rate>0?'+':''}${pct(rate)}</strong></div>
   <div><span>账户总值</span><strong>¥${planMoney.format(value)}</strong></div>
   <div><span>最大回撤</span><strong class="${changeClass(simulation.draw)}">${pct(simulation.draw)}</strong></div>
  </div>
  <p class="meta">以 ${planMoney.format(capital)} 元起步。 ${note}</p>
  ${noTrade && start!==START?'<button type="button" id="full-plan">查看完整历史模拟</button>':''}`;
 const full = $('full-plan');
 if (full) full.onclick = () => {
  $('start').value = rows[START][0];
  plan();
  $('start').focus({preventScroll:true});
 };
 renderPlanLots(simulation.rounds);
}

function lotHistory(round, lot) {
 const column = 3 + round.asset;
 const last = round.end ?? end;
 let remain = lot.qty, cash = 0, peak = lot.cost, nextSale = 0;
 return Array.from({length: last - lot.i + 1}, (_, offset) => {
  const i = lot.i + offset, fill = lot.fills[nextSale];
  if (fill?.i === i) {
   remain -= fill.qty;
   cash += fill.proceeds;
   nextSale++;
  }
  const value = cash + remain * rows[i][column];
  peak = Math.max(peak, value);
  return { i, gain: (value-lot.cost)/lot.cost, draw: value/peak-1 };
 });
}

function renderPlanLots(rounds) {
 const container = $('plan-lots');
 if (!rounds.length) { container.replaceChildren(); return; }
 const open = new Set([...container.querySelectorAll('.plan-lot[open]')].map(detail => detail.dataset.lot));
 const roundsHTML = rounds.map((round, index) => {
  const lotsHTML = round.lots.map((lot, slot) => {
   const id = String(lot.i);
   const gain = lot.ret * lot.cost;
   return `<details class="plan-lot" data-lot="${id}" ${open.has(id)?'open':''}>
    <summary><span>第 ${slot+1} 笔 <time>${rows[lot.i][0]}</time></span>
    <strong class="${changeClass(gain)}">${signedMoney(gain)} <small>${gain>0?'+':''}${pct(lot.ret)}</small></strong></summary>
    <div class="lot-detail"></div>
   </details>`;
  }).join('');
  return `<section class="lot-round"><h4>第 ${index+1} 轮 · ${ASSETS[round.asset]}</h4>${lotsHTML}</section>`;
 });
 container.innerHTML = '<h3>逐笔收益与回撤</h3><p class="meta">展开任意一笔查看从买入到卖清或最新周线的走势。</p>'+roundsHTML.reverse().join('');
 for (const round of rounds) for (const lot of round.lots) {
  const detail = container.querySelector('[data-lot="'+lot.i+'"]');
  const show = () => {
   const panel = detail.querySelector('.lot-detail');
   if (!detail.open || panel.childElementCount) return;
   renderLotChart(panel, round, lot);
  };
  detail.addEventListener('toggle', show);
  show();
 }
}

function renderLotChart(panel, round, lot) {
 const data = lotHistory(round, lot);
 const plots = [
  {key:'gain', label:'收益率', color:'var(--brand)'},
  {key:'draw', label:'回撤', color:'var(--amber)'}
 ];
 const width = Math.max(218, panel.clientWidth - 16), height = 184, left = 43, right = width-9;
 const duration = elapsed(rows[data.at(-1).i][0], rows[lot.i][0]);
 const x = point => duration ? left + (right-left)*elapsed(rows[point.i][0], rows[lot.i][0])/duration : (left+right)/2;
 let svg = '';
 for (const [section, plot] of plots.entries()) {
  const top = 13 + 79 * section, bottom = top + 62;
  const values = data.map(point => point[plot.key]);
  const min = Math.min(-.005, ...values), max = Math.max(0, ...values);
  const span = max - min, y = value => bottom - (bottom-top)*(value-min)/span;
  const label = value => (100*value).toFixed(Math.abs(value)<.1?1:0)+'%';
  for (const value of [...new Set([min,0,max])]) {
   const yy = y(value);
   svg += `<path d="M${left} ${yy}H${right}" stroke="var(--grid)"/><text x="${left-6}" y="${yy+4}" text-anchor="end">${label(value)}</text>`;
  }
  const d = data.map((point, j) => (j?'L':'M')+x(point)+' '+y(point[plot.key])).join(' ');
  svg += `<path d="${d}" fill="none" stroke="${plot.color}" stroke-width="1.7"/>`;
  if (data.length === 1) svg += `<circle cx="${x(data[0])}" cy="${y(data[0][plot.key])}" r="3" fill="${plot.color}"/>`;
 }
 const tickCount = data.length === 1 ? 1 : width >= 340 && data.length > 2 ? 3 : 2;
 for (let j = 0; j < tickCount; j++) {
  const point = data[tickCount===1?0:Math.round(j*(data.length-1)/(tickCount-1))];
  const align = tickCount===1?'middle':j===0?'start':j===tickCount-1?'end':'middle';
  svg += `<text x="${x(point)}" y="${height-3}" text-anchor="${align}">${rows[point.i][0]}</text>`;
 }
 const trough = Math.min(...data.map(point => point.draw));
 panel.innerHTML = `
  <p class="meta">投入 ¥${planMoney.format(lot.cost)} · ${round.end===undefined?'估值至':'卖清于'} ${rows[data.at(-1).i][0]} · 最大回撤 ${pct(trough)}</p>
  <div class="lot-legends"><span>━ 收益率</span><span>━ 回撤</span></div>
  <div class="lot-chart-scroll"><svg viewBox="0 0 ${width} ${height}" role="img" aria-label="该笔买入后的收益率及回撤曲线">
   <g fill="var(--muted)" font-family="Inter, Arial, sans-serif" font-size="11">${svg}</g>
  </svg></div>
  <p class="meta">部分卖出后，已回收现金与剩余持仓一起计入该笔收益。</p>`;
}
