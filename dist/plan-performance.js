'use strict';

const planMoney = new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 2 });
const signedMoney = amount => (amount > 0 ? '+' : amount < 0 ? '−' : '') + '¥' + planMoney.format(Math.abs(amount));

let accountChartObserver, historyChartObserver;

function clearPlanPerformance() {
 accountChartObserver?.disconnect();
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
   <div><span>最大回撤</span><strong class="${changeClass(simulation.draw)}">${pct(simulation.draw)}</strong></div>
  </div>
  <p class="meta">以 ${planMoney.format(capital)} 元起步。 ${note}</p>
  ${noTrade && start!==START?'<button type="button" id="full-plan">查看完整历史模拟</button>':''}
  ${performanceChartMarkup('account','策略累计收益走势',daily?.dates.at(-1))}`;
 const full = $('full-plan');
 if (full) full.onclick = () => {
  selectStartWeek(rows[START][0]);
  plan();
  $('plan-return').scrollIntoView({block:'start'});
 };
 accountChartObserver?.disconnect();
 accountChartObserver = renderAccountTrend('account',daily??{
  nav:simulation.nav,dates:rows.slice(start,start+simulation.nav.length).map(row=>row[0])
 },capital,Boolean(daily));
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

function strategyDailySeries(weeks, daily, simulation, start) {
 const last = start + simulation.positions.length - 1;
 const lastDate = weeks[last][0];
 const lastMoment = Date.parse(lastDate);
 const lastMonday = lastMoment - (new Date(lastMoment).getUTCDay()+6)%7*DAY;
 // Value the current incomplete week, but wait for the next weekly close before
 // replaying any queued trades or showing dates beyond that checkpoint.
 const unverifiedFriday = lastMonday + 11*DAY;
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

function performanceChartMarkup(id,title,dailyThrough) {
 const label = dailyThrough ? '日度估值至 '+dailyThrough : '指数模拟 · 周收盘估值';
 const controls = dailyThrough
  ? '<div class="segments performance-ranges" aria-label="收益图显示范围"><button type="button" data-points="20">近20日</button><button type="button" data-points="244">近一年</button><button type="button" data-points="0" aria-pressed="true">全部</button></div>'
  : '';
 return `<section class="account-trend" aria-labelledby="${id}-trend-heading">
  <div class="account-trend-title"><h4 id="${id}-trend-heading">${title}</h4><span>${label}</span></div>
  ${controls}<svg class="account-plot" id="${id}-plot" role="img" aria-label="模拟账户累计收益率"></svg>
  <div class="account-cursor"><label for="${id}-week">${dailyThrough?'查看某个交易日':'查看某一周'}</label><input id="${id}-week" type="range">
   <output id="${id}-readout" for="${id}-week"></output></div>
 </section>`;
}

function renderHistoryDaily(simulation) {
 const data = strategyDailySeries(rows,dailyTotalReturns,simulation,START);
 historyChartObserver?.disconnect();
 $('history-daily').innerHTML = performanceChartMarkup('history-curve','策略日度收益走势',data.dates.at(-1))+
  '<p class="meta daily-curve-note">每个交易日按两只全收益指数的收盘点位估值。买卖按周线记录，日度曲线可比上方周线统计多显示本周的行情。</p>';
 historyChartObserver = renderAccountTrend('history-curve',data,10000,true);
}

function renderAccountTrend(id, {dates,nav}, capital, daily) {
 const plot = $(id+'-plot'), scrub = $(id+'-week'), readout = $(id+'-readout');
 const values = nav.map(value => value/capital-1);
 const times = dates.map(date => Date.parse(date));
 const drawdowns = [];
 let peak = capital;
 for (const value of nav) {
  peak = Math.max(peak,value);
  drawdowns.push(value/peak-1);
 }
 const last = nav.length-1;
 let selected = last, first = 0, geometry;
 const shortRate = rate => (rate>0?'+':'')+pct(rate);
 scrub.min = first;
 scrub.max = last;
 scrub.value = selected;
 scrub.disabled = last===0;

 function showPoint(i) {
  selected = i;
  scrub.value = i;
  const dayChange = daily && i ? '<span>当日 <b>'+shortRate(nav[i]/nav[i-1]-1)+'</b></span>' : '';
  readout.innerHTML = '<time datetime="'+dates[i]+'">'+dates[i]+'</time>'+dayChange+
   '<span>累计 <b>'+shortRate(values[i])+'</b></span><span>账户 <b>¥'+planMoney.format(nav[i])+
   '</b></span><span>回撤 <b>'+pct(drawdowns[i])+'</b></span>';
  const marker = plot.querySelector('.account-marker');
  marker.setAttribute('transform','translate('+geometry.x(i)+' 0)');
  marker.querySelector('circle').setAttribute('cy',geometry.y(values[i]));
 }

 function draw() {
  const width = plot.clientWidth, height = plot.clientHeight;
  if (!width || !height) return;
  const visible = values.slice(first), duration = times[last]-times[first];
  const range = yAxis(visible);
  const left = 54, right = width-14, top = 12, bottom = height-26;
  const x = i => left+(right-left)*(duration?(times[i]-times[first])/duration:.5);
  const y = v => bottom-(bottom-top)*(v-range.min)/(range.max-range.min);
  geometry = {x,y,left,right};
  const levels = range.min<=0 && range.max>=0 ? [...new Set([...range.ticks,0])] : range.ticks;
  const lines = levels.map(level => `<path d="M${left} ${y(level)}H${right}" stroke="${level===0?'var(--subtle)':'var(--grid)'}"/>
   <text x="${left-8}" y="${y(level)+4}" text-anchor="end">${Number((100*level).toFixed(1))}%</text>`).join('');
  const tickCount = Math.min(visible.length,Math.max(2,Math.floor((right-left)/103)+1));
  const ticks = Array.from({length:tickCount},(_,n)=>{
   const i = tickCount===1?first:first+Math.round(n*(last-first)/(tickCount-1));
   const align = tickCount===1?'middle':n===0?'start':n===tickCount-1?'end':'middle';
   const label = duration>200*DAY?dates[i].slice(0,7):dates[i];
   return {i,align,label};
  }).filter(({i,align},n,ticks)=>{
   if(align!=='middle')return true;
   const gap=duration>200*DAY?70:100;
   return x(i)-x(ticks[n-1].i)>=gap && x(last)-x(i)>=gap;
  }).map(({i,align,label})=>`<text x="${x(i)}" y="${height-5}" text-anchor="${align}">${label}</text>`).join('');
  const d = visible.map((v,j)=>(j?'L':'M')+x(first+j).toFixed(2)+' '+y(v).toFixed(2)).join(' ');
  plot.setAttribute('viewBox','0 0 '+width+' '+height);
  plot.innerHTML = `<g font-family="Inter, Arial, sans-serif" font-size="12" fill="var(--muted)">${lines}${ticks}</g>
   <path d="${d}" stroke="var(--account-ink)" stroke-width="2" fill="none"/>
   <g class="account-marker" pointer-events="none">
    <line y1="${top}" y2="${bottom}" stroke="var(--subtle)" stroke-dasharray="3 3"/>
    <circle r="4" fill="var(--account-ink)" stroke="var(--surface)" stroke-width="1"/>
   </g>`;
  showPoint(selected);
 }

 function inspect(e) {
  if (!geometry) return;
  const box = plot.getBoundingClientRect(), duration = times[last]-times[first];
  const fraction = keepBetween((e.clientX-box.left-geometry.left)/(geometry.right-geometry.left),0,1);
  const time = times[first]+duration*fraction;
  let i = times.findIndex(t=>t>=time);
  if (i<0) i=last;
  if (i>first && time-times[i-1]<times[i]-time) i--;
  showPoint(i);
 }

 for (const button of plot.parentElement.querySelectorAll('[data-points]')) button.onclick=()=>{
  const count = Number(button.dataset.points);
  first = count?Math.max(0,nav.length-count):0;
  scrub.min = first;
  scrub.disabled = first===last;
  selected = last;
  for (const option of button.parentElement.children) option.setAttribute('aria-pressed', option===button);
  draw();
 };
 scrub.oninput = () => showPoint(Number(scrub.value));
 plot.onpointermove = e => { if (e.pointerType!=='touch') inspect(e); };
 plot.onpointerup = inspect;
 draw();
 const observer = new ResizeObserver(draw);
 observer.observe(plot);
 return observer;
}
