'use strict';

const planMoney = new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 2 });
const signedMoney = amount => (amount > 0 ? '+' : amount < 0 ? '−' : '') + '¥' + planMoney.format(Math.abs(amount));

let accountChartObserver;

function clearPlanPerformance() {
 accountChartObserver?.disconnect();
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
  ${noTrade && start!==START?'<button type="button" id="full-plan">查看完整历史模拟</button>':''}
  <section class="account-trend" aria-labelledby="account-trend-heading">
   <div class="account-trend-title"><h4 id="account-trend-heading">策略累计收益走势</h4><span>指数模拟 · 周收盘估值</span></div>
   <svg id="account-plot" role="img" aria-label="从所选起点开始的每周模拟累计收益率"></svg>
   <div class="account-cursor"><label for="account-week">查看某一周</label><input id="account-week" type="range">
    <output id="account-readout" for="account-week"></output></div>
  </section>`;
 const full = $('full-plan');
 if (full) full.onclick = () => {
  selectStartWeek(rows[START][0]);
  plan();
  $('start').focus({preventScroll:true});
 };
 renderAccountTrend(simulation.nav,start,capital);
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
 const expanded = container.querySelector('.plan-lot-list')?.open ?? !matchMedia('(max-width: 700px)').matches;
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
 const totalLots = rounds.reduce((sum,round)=>sum+round.lots.length,0);
 container.innerHTML = '<details class="plan-lot-list" '+(expanded?'open':'')+'><summary>逐笔收益与回撤 <span>'+
  totalLots+' 笔</span></summary><p class="meta">展开任意一笔查看从买入到卖清或最新周线的走势。</p>'+
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

function renderAccountTrend(nav, start, capital) {
 accountChartObserver?.disconnect();
 const plot = $('account-plot'), scrub = $('account-week'), readout = $('account-readout');
 const values = nav.map(value => value/capital-1);
 const dates = rows.slice(start, start+nav.length).map(row => row[0]);
 const times = dates.map(date => Date.parse(date));
 const duration = times.at(-1)-times[0];
 const axis = yAxis([0,...values]);
 const drawdowns = [];
 let peak = capital;
 for (const value of nav) {
  peak = Math.max(peak,value);
  drawdowns.push(value/peak-1);
 }
 let selected = nav.length-1, geometry;
 scrub.min = 0;
 scrub.max = selected;
 scrub.value = selected;
 scrub.disabled = selected===0;

 function showWeek(i) {
  selected = i;
  scrub.value = i;
  const rate = values[i];
  readout.textContent = dates[i]+' · 累计 '+(rate>0?'+':'')+pct(rate)+' · 账户 ¥'+
   planMoney.format(nav[i])+' · 回撤 '+pct(drawdowns[i]);
  const marker = plot.querySelector('.account-marker');
  marker.setAttribute('transform','translate('+geometry.x(i)+' 0)');
  marker.querySelector('circle').setAttribute('cy',geometry.y(rate));
 }

 function draw() {
  const width = plot.clientWidth, height = plot.clientHeight;
  if (!width || !height) return;
  const left = 60, right = width-14, top = 12, bottom = height-26;
  const x = i => left+(right-left)*(duration?(times[i]-times[0])/duration:.5);
  const y = v => bottom-(bottom-top)*(v-axis.min)/(axis.max-axis.min);
  geometry={x,y,left,right};
  const levels = [...new Set([...axis.ticks,0])];
  const lines = levels.map(level => `<path d="M${left} ${y(level)}H${right}" stroke="${level===0?'var(--subtle)':'var(--grid)'}"/>
   <text x="${left-8}" y="${y(level)+4}" text-anchor="end">${Number((100*level).toFixed(1))}%</text>`).join('');
  const tickCount = Math.min(nav.length,Math.max(2,Math.floor((right-left)/103)+1));
  const ticks = Array.from({length:tickCount},(_,n)=>{
   const i = tickCount===1?0:Math.round(n*(nav.length-1)/(tickCount-1));
   const align = tickCount===1?'middle':n===0?'start':n===tickCount-1?'end':'middle';
   const label = duration > 200*DAY?dates[i].slice(0,7):dates[i];
   return `<text x="${x(i)}" y="${height-5}" text-anchor="${align}">${label}</text>`;
  }).join('');
  const d = values.map((v,i)=>(i?'L':'M')+x(i)+' '+y(v)).join(' ');
  plot.setAttribute('viewBox','0 0 '+width+' '+height);
  plot.innerHTML = `<g font-family="Inter, Arial, sans-serif" font-size="12" fill="var(--muted)">${lines}${ticks}</g>
   <path d="${d}" stroke="var(--account-ink)" stroke-width="2" fill="none"/>
   <g class="account-marker" pointer-events="none">
    <line y1="${top}" y2="${bottom}" stroke="var(--subtle)" stroke-dasharray="3 3"/>
    <circle r="4" fill="var(--account-ink)" stroke="var(--surface)" stroke-width="1"/>
   </g>`;
  showWeek(selected);
 }

 function inspect(e) {
  if (!geometry) return;
  const box = plot.getBoundingClientRect();
  const fraction = keepBetween((e.clientX-box.left-geometry.left)/(geometry.right-geometry.left),0,1);
  const time = times[0]+duration*fraction;
  let i = times.findIndex(t=>t>=time);
  if (i<0) i=times.length-1;
  if (i && time-times[i-1]<times[i]-time) i--;
  showWeek(i);
 }

 scrub.oninput = () => showWeek(Number(scrub.value));
 plot.onpointermove = e => { if (e.pointerType!=='touch') inspect(e); };
 plot.onpointerdown = inspect;
 draw();
 accountChartObserver = new ResizeObserver(draw);
 accountChartObserver.observe(plot);
}
