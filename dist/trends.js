'use strict';

const plotInset = { right: 13, bottom: 26 };
const pointFormat = new Intl.NumberFormat('zh-CN', {
 minimumFractionDigits: 2, maximumFractionDigits: 2
});
const chartViews = [
 { plot: 'plot', tip: 'plot-tip', selection: 'ratio-selection', top: 43, index: false },
 { plot: 'index-plot', tip: 'index-tip', selection: 'index-selection', top: 15, index: true }
];

let trendRange, markedWeek, dragSelection;
let trendDaily, dailyWindow, markedDay = null, hoverDay = null;
let activePreset = 0, activeCalendarYear = '', hoverWeek = null;

function keepBetween(value, low, high) {
 return Math.max(low, Math.min(high, value));
}

function setTrendRange(first, last, options = {}) {
 trendRange = { first, last };
 markedWeek = keepBetween(options.mark ?? last, first, last);
 markedDay = null;
 hoverDay = null;
 activePreset = options.preset ?? null;
 activeCalendarYear = options.year ?? '';
 hoverWeek = null;
 for (const view of chartViews) $(view.tip).hidden = true;
 syncTrendControls();
 renderTrendCharts();
}

function chooseRecent(count) {
 const first = count ? Math.max(START, end - count + 1) : START;
 setTrendRange(first, end, { preset: count });
}

function chooseYear(year) {
 const first = rows.findIndex((row, i) => i >= START && row[0].startsWith(year));
 const last = rows.findLastIndex(row => row[0].startsWith(year));
 if (first >= START) setTrendRange(first, last, { year });
}

function syncTrendControls() {
 const { first, last } = trendRange;
 const count = last - first + 1;
 $('chart-from').value = rows[first][0];
 $('chart-to').value = rows[last][0];
 $('chart-year').value = activeCalendarYear;
 $('chart-range-status').textContent = '显示 ' + rows[first][0] + ' 至 ' + rows[last][0] + ' · ' + count + ' 个交易周';
 for (const button of $('ranges').querySelectorAll('button')) {
  button.setAttribute('aria-pressed', Number(button.dataset.n) === activePreset);
 }
 $('zoom-in').disabled = count <= 4;
 $('zoom-out').disabled = count === end - START + 1;
 $('pan-back').disabled = first === START;
 $('pan-forward').disabled = last === end;
 const cursor = $('cursor');
 cursor.min = first;
 cursor.max = last;
 cursor.disabled = first === last;
 cursor.value = markedWeek;
}

function refreshTrendCharts() {
 trendDaily = strategyDailySeries(rows,dailyTotalReturns,model,START);
 const years = [...new Set(rows.slice(START).map(row => row[0].slice(0, 4)))].reverse();
 $('chart-year').replaceChildren(new Option('选择年份', ''), ...years.map(year => new Option(year + ' 年', year)));
 for (const input of [$('chart-from'), $('chart-to')]) {
  input.min = rows[START][0];
  input.max = rows[end][0];
 }
 if (activePreset !== null) chooseRecent(activePreset);
 else if (activeCalendarYear) chooseYear(activeCalendarYear);
 else {
  const first = Math.min(trendRange.first, end), last = Math.min(trendRange.last, end);
  setTrendRange(first, last, { mark: markedWeek });
 }
}

function moveTrendWindow(direction) {
 const { first, last } = trendRange;
 const distance = last - first;
 const next = keepBetween(first + direction * Math.max(1, Math.round((distance + 1) / 2)), START, end - distance);
 setTrendRange(next, next + distance, { mark: markedWeek + next - first });
}

function zoomTrendWindow(inward) {
 const { first, last } = trendRange;
 const count = last - first + 1;
 const size = inward ? Math.max(4, Math.floor(count * .65)) : Math.min(end - START + 1, Math.ceil(count / .65));
 const anchor = hoverWeek ?? markedWeek;
 const position = count > 1 ? (anchor - first) / (count - 1) : .5;
 const next = keepBetween(Math.round(anchor - (size - 1) * position), START, end - size + 1);
 setTrendRange(next, next + size - 1, { mark: anchor });
}

function showTradeWeek(week) {
 const { first, last } = trendRange;
 if (week < first || week > last) {
  const distance = last - first;
  const start = keepBetween(week - Math.floor(distance / 2), START, end - distance);
  setTrendRange(start, start + distance, { mark: week });
 } else selectTrendWeek(week);
}

function makePlot(view) {
 const el = $(view.plot);
 const { first, last } = trendRange;
 const width = el.clientWidth, height = el.clientHeight;
 const left = parseFloat(getComputedStyle(el).getPropertyValue('--chart-axis-width'));
 const right = width - plotInset.right, base = height - plotInset.bottom;
 const times = rows.slice(first, last + 1).map(row => Date.parse(row[0]));
 const duration = times.at(-1) - times[0];
 const xTime = time => left + (right-left)*(duration?(time-times[0])/duration:.5);
 const x = i => xTime(times[i-first]);
 return { el, width, height, left, right, base, x, xTime, times, duration };
}

function normalizedPoint(week, column) {
 return 100 * rows[week][column] / rows[trendRange.first][column];
}

function yAxis(values) {
 const low = Math.min(...values), high = Math.max(...values);
 const rough = (high - low || Math.max(Math.abs(high) * .04, .01)) / 4;
 const scale = 10 ** Math.floor(Math.log10(rough));
 const step = ([1, 2, 2.5, 5, 10].find(n => n * scale >= rough) || 10) * scale;
 const min = Math.floor(low / step + 1e-9) * step - step * .22;
 const max = Math.ceil(high / step - 1e-9) * step + step * .22;
 const ticks = [];
 for (let n = Math.ceil(min / step); n <= Math.floor(max / step); n++) ticks.push(n * step);
 const digits = Math.min(6, Math.max(0, 1 - Math.floor(Math.log10(step))));
 return { min, max, ticks, digits };
}

function renderTrendCharts() {
 const { first, last } = trendRange;
 const indices = Array.from({ length: last - first + 1 }, (_, j) => first + j);
 for (const view of chartViews) {
  const p = makePlot(view);
  const series = view.index ? [
   { values: indices.map(i => normalizedPoint(i, 1)), color: 'var(--up)' },
   { values: indices.map(i => normalizedPoint(i, 2)), color: 'var(--blue)', dashed: true }
  ] : [
   { values: indices.map(i => bars[i].low), color: 'var(--low-line)', step: true, dashed: true },
   { values: indices.map(i => bars[i].high), color: 'var(--high-line)', step: true, dashed: true },
   { values: indices.map(i => bars[i].r), color: 'var(--ratio-ink)' }
  ];
  const axis = yAxis(series.flatMap(line => line.values));
  const y = value => p.base - (p.base - view.top) * (value - axis.min) / (axis.max - axis.min);
  view.geometry = p;
  view.y = y;
  let svg = axis.ticks.map(value =>
   '<path d="M'+p.left+' '+y(value)+'H'+p.right+'" stroke="var(--grid)"/>'+
   '<text x="'+(p.left-7)+'" y="'+(y(value)+4)+'" text-anchor="end">'+Number(value.toFixed(axis.digits))+'</text>'
  ).join('');
  for (const line of series) {
   const d = line.values.map((value,j) => j && line.step ?
    'H'+p.x(first+j)+'V'+y(value) : (j ? 'L' : 'M')+p.x(first+j)+' '+y(value)).join(' ');
   svg += '<path d="'+d+'" stroke="'+line.color+'" fill="none" stroke-width="'+(line.step?1:1.7)+'"'+
    (line.dashed?' stroke-dasharray="5 3"':'')+'/>';
  }
  if (!view.index) svg += tradeMarkers(p, y, first, last);
  svg += trendAxisLabels(p);
  p.el.setAttribute('viewBox', '0 0 '+p.width+' '+p.height);
  p.el.innerHTML = '<g font-family="Inter, Arial, sans-serif" font-size="12" fill="var(--muted)">'+svg+
   '</g><g class="week-marker" pointer-events="none"><line stroke="var(--subtle)" stroke-dasharray="3 3"/>'+
   (view.index?'<circle r="3.8"/><circle r="3.8"/>':'<rect class="ratio-diamond" x="-4" y="-4" width="8" height="8"/>')+'</g>';
 }
 renderLinkedReturns();
 updateTrendReadouts(hoverWeek ?? markedWeek, hoverWeek === null ? markedDay : hoverDay);
}

function trendAxisLabels(p) {
 const {first,last} = trendRange, count = last-first+1;
 const tickCount = Math.min(count,Math.max(2,Math.floor((p.right-p.left)/88)+1));
 let labels = '';
 for (let n=0; n<tickCount; n++) {
  const week = tickCount===1?first:Math.round(first+(last-first)*n/(tickCount-1));
  const anchor = tickCount===1?'middle':n===0?'start':n===tickCount-1?'end':'middle';
  const label = p.duration>200*DAY?rows[week][0].slice(0,7):rows[week][0].slice(5);
  labels += `<path d="M${p.x(week)} ${p.base}v4" stroke="var(--subtle)"/><text x="${p.x(week)}" y="${p.height-5}" text-anchor="${anchor}">${label}</text>`;
 }
 return labels;
}

function renderLinkedReturns() {
 const plot = makePlot({plot:'linked-return-plot'});
 const start = rows[trendRange.first][0], endDate = rows[trendRange.last][0];
 const allDates = trendDaily.dates;
 const first = allDates.findIndex(day=>day>=start), last = allDates.findLastIndex(day=>day<=endDate);
 const period = $('linked-return-period');
 const top = 12;
 dailyWindow = null;
 plot.el.setAttribute('viewBox', '0 0 '+plot.width+' '+plot.height);
 const labels = trendAxisLabels(plot);
 if (first===-1 || last<first) {
  plot.el.innerHTML = '<g font-size="12" fill="var(--muted)">'+labels+'</g>';
  period.textContent = '日度数据截至 '+allDates.at(-1);
  $('linked-return-readout').textContent = '所选时间段暂无日度收益数据。';
  return;
 }
 const dates = allDates.slice(first,last+1);
 const times = dates.map(date=>Date.parse(date));
 const nav = trendDaily.nav.slice(first,last+1);
 const gains = nav.map(value=>100*(value/nav[0]-1));
 const axis = yAxis([0,...gains]);
 const y = value => plot.base-(plot.base-top)*(value-axis.min)/(axis.max-axis.min);
 const x = i => plot.xTime(times[i]);
 const data = gains.map((value,i)=>(i?'L':'M')+x(i).toFixed(2)+' '+y(value).toFixed(2)).join(' ');
 const levels = [...new Set([...axis.ticks,0])].map(value =>
  `<path d="M${plot.left} ${y(value)}H${plot.right}" stroke="${value===0?'var(--subtle)':'var(--grid)'}"/>
  <text x="${plot.left-7}" y="${y(value)+4}" text-anchor="end">${Number(value.toFixed(2))}%</text>`
 ).join('');
 plot.el.innerHTML = `<g font-family="Inter, Arial, sans-serif" font-size="12" fill="var(--muted)">${levels}${labels}</g>
  <path d="${data}" fill="none" stroke="var(--account-ink)" stroke-width="1.9"/>
  <g class="linked-return-marker" pointer-events="none"><line y1="${top}" y2="${plot.base}" stroke="var(--subtle)" stroke-dasharray="3 3"/>
   <circle r="4" fill="var(--account-ink)" stroke="var(--surface)" stroke-width="1"/></g>`;
 dailyWindow = {plot,first,last,dates,times,nav,gains,y,x};
 period.textContent = '区间累计 '+signedRate(gains.at(-1)/100)+(dates.at(-1)===endDate?'':' · 估值至 '+dates.at(-1));
}

function signedRate(rate) {
 return (rate>0?'+':'')+pct(rate);
}

function updateLinkedReadout(day,weekDay) {
 if (!dailyWindow) return;
 const {dates,nav,gains,x,y,first,plot} = dailyWindow;
 const i = dates.indexOf(day), marker = plot.el.querySelector('.linked-return-marker');
 marker.toggleAttribute('hidden',i<0);
 const readout = $('linked-return-readout');
 if (i<0) { readout.textContent = day+' 暂无日度估值。'; return; }
 marker.setAttribute('transform','translate('+x(i)+' 0)');
 marker.querySelector('circle').setAttribute('cy',y(gains[i]));
 const prev = trendDaily.nav[first+i-1];
 const dayChange = prev===undefined?'':'<span>当日 <b>'+signedRate(nav[i]/prev-1)+'</b></span>';
 readout.innerHTML = '<time datetime="'+day+'">'+day+'</time>'+dayChange+
  '<span>区间累计 <b>'+signedRate(gains[i]/100)+'</b></span><span>账户 <b>¥'+planMoney.format(nav[i])+'</b></span>'+
  (weekDay===day?'':'<span>周线参考 '+weekDay+'</span>');
}

function bindLinkedReturns() {
 const plot = $('linked-return-plot');
 function chooseDay(e,commit) {
  if (!dailyWindow) return;
  const {plot:p,times,dates} = dailyWindow;
  const time = timeAtPointer(p,e), day = dates[closestTimeIndex(times,time)];
  const {first,last} = trendRange;
  let week = last;
  while(week>first && rows[week][0]>day) week--;
  if(commit) selectTrendWeek(week,day);
  else {
   hoverWeek = week;
   hoverDay = day;
   updateTrendReadouts(week,day);
  }
 }
 plot.onpointermove = e=>{if(e.pointerType!=='touch')chooseDay(e,false);};
 plot.onpointerup = e=>chooseDay(e,true);
 plot.onpointerleave = ()=>{
  hoverWeek = null;
  hoverDay = null;
  updateTrendReadouts(markedWeek,markedDay);
 };
}

function tradeMarkers(plot, y, first, last) {
 let svg = '';
 for (const trade of model.trades) {
  if (trade.i < first || trade.i > last || trade.kind !== 'buy') continue;
  svg += '<circle data-week="'+trade.i+'" cx="'+plot.x(trade.i)+'" cy="'+y(bars[trade.i].r)+
   '" r="3.7" fill="'+(trade.asset?'var(--blue)':'var(--up)')+'" stroke="var(--surface)" stroke-width="1"/>';
 }
 for (const trade of model.trades) {
  if (trade.i < first || trade.i > last || trade.kind !== 'sell') continue;
  const cx = plot.x(trade.i), cy = y(bars[trade.i].r), full = trade.part === 1;
  const tip = full ? 30 : 15;
  svg += '<g data-week="'+trade.i+'" data-sale="'+trade.i+'"><title>'+rows[trade.i][0]+' '+ASSETS[trade.asset]+' '+saleName(trade)+
   '</title><path d="M'+cx+' '+(cy-4)+'V'+tip+'" stroke="var(--amber)" stroke-opacity=".47" stroke-dasharray="2 3"/><path d="M'+(cx-4.8)+' '+(tip-8)+
   'h9.6l-4.8 8Z" stroke="var(--amber)" stroke-width="1.5" fill="'+(full?'var(--amber)':'var(--surface)')+'"/></g>';
 }
 return svg;
}

function tradesAt(week) {
 return model.trades.filter(trade => trade.i === week);
}

function formatIndexPoint(week, column) {
 const value = rows[week][column], change = normalizedPoint(week, column) / 100 - 1;
 return pointFormat.format(value)+' 点（'+(change>0?'+':'')+pct(change)+'）';
}

function updateTrendReadouts(week, dailyDay) {
 const bar = bars[week], trades = tradesAt(week);
 const day = rows[week][0];
 $('readout').innerHTML = '<time datetime="'+day+'">'+day+'</time>'+
  '<span>比值 <b>'+f(bar.r)+'</b></span><span>下线 <b>'+f(bar.low)+'</b></span><span>上线 <b>'+f(bar.high)+'</b></span>';
 const tradeReadout = $('trade-readout');
 tradeReadout.hidden = !trades.length;
 tradeReadout.innerHTML = trades.map(trade => '<li class="'+trade.kind+'"><strong>'+
  (trade.kind==='buy'?'买入':saleName(trade))+'</strong><span>'+ASSETS[trade.asset]+'</span></li>').join('');
 $('index-readout').innerHTML = '<time datetime="'+day+'">'+day+'</time>'+
  '<span><b class="red">红利</b> '+formatIndexPoint(week, 1)+'</span>'+
  '<span><b class="blue">创业板</b> '+formatIndexPoint(week, 2)+'</span>';
 for (const view of chartViews) {
  const p = view.geometry, marker = p.el.querySelector('.week-marker'), x = p.x(week);
  marker.setAttribute('transform', 'translate('+x+' 0)');
  const line = marker.querySelector('line');
  line.setAttribute('y1', view.top);
  line.setAttribute('y2', p.base);
  const diamond = marker.querySelector('.ratio-diamond');
  if (diamond) {
   diamond.setAttribute('transform', 'translate(0 '+view.y(bar.r)+') rotate(45)');
   continue;
  }
  const values = [normalizedPoint(week, 1), normalizedPoint(week, 2)];
  const colors = ['var(--up)','var(--blue)'];
  marker.querySelectorAll('circle').forEach((dot, i) => {
   dot.setAttribute('cy', view.y(values[i]));
   dot.setAttribute('fill', colors[i]);
  });
 }
 updateLinkedReadout(dailyDay??day,day);
}

function selectTrendWeek(week, day=null) {
 markedWeek = week;
 markedDay = day;
 hoverWeek = null;
 hoverDay = null;
 $('cursor').value = week;
 updateTrendReadouts(week,day);
}

function weekAtPointer(view, e) {
 const mark = e.target.closest?.('[data-week]');
 if (mark) return Number(mark.dataset.week);
 const p = view.geometry;
 return trendRange.first + closestTimeIndex(p.times,timeAtPointer(p,e));
}

function timeAtPointer(plot,e) {
 const x = e.clientX-plot.el.getBoundingClientRect().left;
 const fraction = keepBetween((x-plot.left)/(plot.right-plot.left),0,1);
 return plot.times[0]+fraction*plot.duration;
}

function closestTimeIndex(times,time) {
 let i=times.findIndex(value=>value>=time);
 if(i<0) i=times.length-1;
 if(i && time-times[i-1]<times[i]-time) i--;
 return i;
}

function showTrendTip(view, e, week) {
 const tip = $(view.tip), bar = bars[week];
 const lines = view.index ? [rows[week][0], '红利 '+formatIndexPoint(week, 1), '创业板 '+formatIndexPoint(week, 2)] :
  [rows[week][0]+' · 比值 '+f(bar.r), '观察线 '+f(bar.low)+' / '+f(bar.high), ...tradesAt(week).map(trade => (trade.kind==='buy'?'买入':saleName(trade))+' '+ASSETS[trade.asset])];
 tip.textContent = lines.join('\n');
 tip.hidden = false;
 const r = $(view.plot).getBoundingClientRect();
 tip.style.left = keepBetween(e.clientX-r.left+12, 0, Math.max(0,r.width-tip.offsetWidth))+'px';
 tip.style.top = keepBetween(e.clientY-r.top+12, 0, Math.max(0,r.height-tip.offsetHeight))+'px';
}

function shadeSelection(first, last) {
 for (const view of chartViews) {
  const box = $(view.selection), p = view.geometry;
  box.hidden = first === null;
  if (box.hidden) continue;
  const from = p.x(first), to = p.x(last);
  box.style.left = Math.min(from,to)+'px';
  box.style.width = Math.abs(to-from)+'px';
  box.style.top = view.top+'px';
  box.style.height = p.base-view.top+'px';
 }
}

function bindTrendPlot(view) {
 const plot = $(view.plot), tip = $(view.tip);
 plot.onpointerdown = e => {
  if (e.button !== 0) return;
  const week = weekAtPointer(view, e);
  if (e.pointerType === 'touch') return;
  dragSelection = { week, x: e.clientX, pointer: e.pointerId };
  plot.setPointerCapture(e.pointerId);
 };
 plot.onpointermove = e => {
  if (e.pointerType === 'touch') return;
  const week = weekAtPointer(view, e);
  hoverWeek = week;
  hoverDay = null;
  updateTrendReadouts(week);
  if (dragSelection?.pointer === e.pointerId) {
   tip.hidden = true;
   if (Math.abs(e.clientX-dragSelection.x)>7) shadeSelection(dragSelection.week, week);
  } else showTrendTip(view, e, week);
 };
 plot.onpointerup = e => {
  if (e.pointerType === 'touch') { selectTrendWeek(weekAtPointer(view,e)); return; }
  if (dragSelection?.pointer !== e.pointerId) return;
  const a = dragSelection.week, b = weekAtPointer(view, e);
  const zoom = Math.abs(e.clientX - dragSelection.x) > 7 && a !== b;
  dragSelection = null;
  shadeSelection(null);
  if (zoom) setTrendRange(Math.min(a,b), Math.max(a,b));
  else selectTrendWeek(a);
 };
 plot.onlostpointercapture = () => { dragSelection = null; shadeSelection(null); };
 plot.onpointerleave = () => {
  tip.hidden = true;
  hoverWeek = null;
  hoverDay = null;
  updateTrendReadouts(markedWeek,markedDay);
 };
}

function setupTrendCharts() {
 $('ranges').onclick = e => { if (e.target.matches('button[data-n]')) chooseRecent(Number(e.target.dataset.n)); };
 $('chart-year').onchange = () => { if ($('chart-year').value) chooseYear($('chart-year').value); };
 $('chart-dates').onsubmit = e => {
  e.preventDefault();
  const from = $('chart-from').value, to = $('chart-to').value;
  const first = rows.findIndex((row, i) => i >= START && row[0] >= from);
  const last = rows.findLastIndex(row => row[0] <= to);
  if (first === -1 || last < first) {
   $('chart-range-status').textContent = '这段日期内没有周收盘数据，请调整起止日期。';
   return;
  }
  setTrendRange(first, last);
  if (matchMedia('(max-width: 700px)').matches) $('chart-date-panel').open = false;
 };
 $('zoom-in').onclick = () => zoomTrendWindow(true);
 $('zoom-out').onclick = () => zoomTrendWindow(false);
 $('pan-back').onclick = () => moveTrendWindow(-1);
 $('pan-forward').onclick = () => moveTrendWindow(1);
 $('cursor').oninput = () => selectTrendWeek(Number($('cursor').value));
 const observer = new ResizeObserver(() => { if (trendRange) renderTrendCharts(); });
 bindLinkedReturns();
 observer.observe($('linked-return-plot'));
 for (const view of chartViews) {
  bindTrendPlot(view);
  observer.observe($(view.plot));
 }
}
