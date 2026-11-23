'use strict';

const planMoney = new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 2 });
const signedMoney = amount => (amount > 0 ? '+' : amount < 0 ? '−' : '') + '¥' + planMoney.format(Math.abs(amount));

const lotSeriesCache = new WeakMap();

function clearPlanPerformance() {
 setPlanPerformanceScope(null);
 $('plan-return').replaceChildren();
 $('plan-lots').replaceChildren();
}

function renderPlanPerformance(simulation, start, capital) {
 const daily = strategyDailySeries(rows,dailyTotalReturns,simulation,start);
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
   <div><span>最大周线回撤</span><strong class="${changeClass(simulation.draw)}">${pct(simulation.draw)}</strong></div>
  </div>
  <p class="meta">以 ${planMoney.format(capital)} 元起步。 ${note}</p>
  ${daily?'<a class="plan-history-link" href="#linked-performance" data-performance="plan">查看该起点的收益与回撤</a>':'<p class="meta">这个起点暂时没有日度估值。</p>'}
  ${noTrade && start!==START?'<button type="button" id="full-plan">查看完整历史模拟</button>':''}`;
 const full = $('full-plan');
 if (full) full.onclick = () => {
  selectStartWeek(rows[START][0]);
  plan();
  $('plan-return').scrollIntoView({block:'start'});
 };
 setPlanPerformanceScope(daily?{...daily,start,capital}:null);
 renderPlanLots(simulation.rounds);
}

function weeklyValuationCutoff(day) {
 const time = Date.parse(day);
 const monday = time-(new Date(time).getUTCDay()+6)%7*DAY;
 return monday+11*DAY;
}

function calculateDrawdowns(nav, dates, initial=nav[0]) {
 let peak=initial, peakAt=0;
 let depth=0, highAt=0, lowAt=0, highValue=initial;
 const draws=nav.map((value,i)=>{
  if(value>=peak){peak=value;peakAt=i;}
  const drop=value/peak-1;
  if(drop<depth){depth=drop;highAt=peakAt;lowAt=i;highValue=peak;}
  return drop;
 });
 const recovered=depth<0?nav.findIndex((value,i)=>i>lowAt&&value>=highValue):-1;
 return {draws,depth,peak:dates[highAt],trough:dates[lowAt],recovery:dates[recovered]};
}

function lotHistory(round,lot) {
 const cached=lotSeriesCache.get(lot);
 if(cached)return cached;
 const first=rows[lot.i][0], last=rows[round.end??end][0], column=3+round.asset;
 const useDaily=dailyTotalReturns.at(-1)[0]>=last;
 const weeklyCloses=new Map(rows.slice(lot.i,(round.end??end)+1).map(row=>[row[0],row[column]]));
 const cutoff=weeklyValuationCutoff(last);
 const observations=useDaily?dailyTotalReturns
  .filter(([date])=>date>=first&&(round.end===undefined?Date.parse(date)<cutoff:date<=last))
  .map(row=>[row[0],weeklyCloses.get(row[0])??row[1+round.asset]]):[...weeklyCloses];
 const fills=new Map(lot.fills.map(fill=>[rows[fill.i][0],fill]));
 let remain=lot.qty,cash=0;
 const dates=observations.map(([date])=>date);
 const nav=observations.map(([date,close])=>{
  const fill=fills.get(date);
  if(fill){remain-=fill.qty;cash+=fill.proceeds;}
  return cash+remain*close;
 });
 const risk=calculateDrawdowns(nav,dates,lot.cost);
 const points=nav.map((value,i)=>({date:dates[i],gain:value/lot.cost-1,draw:risk.draws[i]}));
 const result={points,risk,useDaily,through:dates.at(-1)};
 lotSeriesCache.set(lot,result);
 return result;
}

function drawdownDates(risk) {
 if(!risk.depth)return '区间内无回撤';
 return '从 '+risk.peak+' 高点到 '+risk.trough+' 谷底'+
  (risk.recovery?' · '+risk.recovery+' 收复前高':' · 区间结束时尚未收复前高');
}

function renderPlanLots(rounds) {
 const container = $('plan-lots');
 if (!rounds.length) { container.replaceChildren(); return; }
 const expanded = container.querySelector('.plan-lot-list')?.open ?? !matchMedia('(max-width: 700px)').matches;
 const open = new Set([...container.querySelectorAll('.plan-lot[open]')].map(detail => detail.dataset.lot));
 const roundsHTML = rounds.map((round, index) => {
  const lotsHTML = round.lots.map((lot, slot) => {
   const id = String(lot.i);
   const gain = lot.ret * lot.cost;
   const {risk,useDaily}=lotHistory(round,lot);
   return `<details class="plan-lot" data-lot="${id}" ${open.has(id)?'open':''}>
    <summary><span>第 ${slot+1} 笔 <time>${rows[lot.i][0]}</time></span>
    <span class="lot-summary-metrics"><strong class="${changeClass(gain)}">${signedMoney(gain)} <small>${gain>0?'+':''}${pct(lot.ret)}</small></strong>
    <small class="lot-risk">${useDaily?'最大回撤':'最大周线回撤'} <b>${pct(risk.depth)}</b></small></span></summary>
    <div class="lot-detail"></div>
   </details>`;
  }).join('');
  return `<section class="lot-round"><h4>第 ${index+1} 轮 · ${ASSETS[round.asset]}</h4>${lotsHTML}</section>`;
 });
 const totalLots = rounds.reduce((sum,round)=>sum+round.lots.length,0);
 container.innerHTML = '<details class="plan-lot-list" '+(expanded?'open':'')+'><summary>逐笔收益与回撤 <span>'+
  totalLots+' 笔</span></summary><p class="meta">每笔由买入后价值高点计算回撤，点开可查看曲线与峰谷日期。</p>'+
  roundsHTML.reverse().join('')+'</details>';
 const list = container.querySelector('.plan-lot-list');
 for (const round of rounds) for (const lot of round.lots) {
  const detail = container.querySelector('[data-lot="'+lot.i+'"]');
  const show = () => {
   const panel = detail.querySelector('.lot-detail');
   if (!list.open || !detail.open || panel.childElementCount) return;
   renderLotChart(panel, round, lot);
  };
  detail.addEventListener('toggle', show);
  list.addEventListener('toggle', show);
  show();
 }
}

function renderLotChart(panel, round, lot) {
 const {points:data,risk,useDaily,through}=lotHistory(round,lot);
 const plots = [
  {key:'gain', label:'收益率', color:'var(--brand)'},
  {key:'draw', label:'回撤', color:'var(--amber)'}
 ];
 const width = Math.max(218, panel.clientWidth - 16), height = 184, left = 43, right = width-9;
 const duration = elapsed(through, data[0].date);
 const x = point => duration ? left + (right-left)*elapsed(point.date, data[0].date)/duration : (left+right)/2;
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
  svg += `<text x="${x(point)}" y="${height-3}" text-anchor="${align}">${point.date}</text>`;
 }

 panel.innerHTML = `
  <p class="meta">投入 ¥${planMoney.format(lot.cost)} · ${round.end===undefined?'估值至':'卖清于'} ${through} · ${useDaily?'日度估值':'周线估值'}</p>
  <p class="meta lot-depth">最大回撤 <strong>${pct(risk.depth)}</strong> · ${drawdownDates(risk)}</p>
  <div class="lot-legends"><span>━ 收益率</span><span>━ 回撤</span></div>
  <div class="lot-chart-scroll"><svg viewBox="0 0 ${width} ${height}" role="img" aria-label="该笔买入后的收益率及回撤曲线">
   <g fill="var(--muted)" font-family="Inter, Arial, sans-serif" font-size="11">${svg}</g>
  </svg></div>
  <p class="meta">部分卖出后，已回收现金与剩余持仓一起计入该笔收益。</p>`;
}

function strategyDailySeries(weeks, daily, simulation, start) {
 const last = start + simulation.positions.length - 1;
 const lastDate = weeks[last][0];
 // Value the current incomplete week, but wait for the next weekly close before
 // replaying any queued trades or showing dates beyond that checkpoint.
 const unverifiedFriday = weeklyValuationCutoff(lastDate);
 const dates = [], nav = [];
 let week = start;
 for (const [date, red, growth] of daily) {
  if (date < weeks[start][0]) continue;
  if (Date.parse(date) >= unverifiedFriday) break;
  while (week < last && weeks[week+1][0] <= date) week++;
  const {cash,side,units} = simulation.positions[week-start];
  const dayValue = cash + (side===null?0:units*(side===0?red:growth));
  dates.push(date);
  nav.push(date===weeks[week][0]?simulation.nav[week-start]:dayValue);
 }
 return dates.length ? {dates,nav} : null;
}
