'use strict';

let dailyPrices = recentPriceSnapshot, dailyError = false, dailyPending = false;

function mergeDailyCloses(existing, incoming) {
 const byDay = new Map();
 for (const row of [...existing,...incoming]) {
  if (!Array.isArray(row) || !/^\d{4}-\d{2}-\d{2}$/.test(row[0])) continue;
  if (row.slice(1).length !== 2 || !row.slice(1).every(value=>Number.isFinite(value)&&value>0)) continue;
  byDay.set(row[0],row);
 }
 return [...byDay.values()].sort((a,b)=>a[0].localeCompare(b[0])).slice(-20);
}

function drawQuoteSparkline(prices) {
 const values = prices.map(([,red,growth])=>red/growth);
 const min=Math.min(...values), max=Math.max(...values), span=max-min;
 const points=values.map((value,i)=>[5+158*i/Math.max(values.length-1,1),span?5+36*(max-value)/span:24]);
 const line=points.map(([x,y],i)=>(i?'L':'M')+x+' '+y).join(' ');
 const [x,y]=points.at(-1);
 $('quote-sparkline').innerHTML='<path class="spark-fill" d="'+line+'L'+x+' 47H5Z"/>'+
  '<path class="spark-line" d="'+line+'"/><circle class="spark-tip" cx="'+x+'" cy="'+y+'" r="3.5"/>';
 $('quote-sparkline-period').textContent='近 '+prices.length+' 个交易日';
}

function showDailyClose() {
 const weekly = rows[end], latest = dailyPrices.at(-1), useDaily = latest[0]>=weekly[0];
 const [date,red,growth] = useDaily?latest:weekly;
 const ratio = red/growth, change = $('daily-ratio-change');
 $('daily-asof').textContent = date;
 $('ratio').textContent = f(ratio);
 change.className = '';
 if (useDaily && dailyPrices.length>1) {
  const [,previousRed,previousGrowth] = dailyPrices.at(-2);
  const delta = ratio/(previousRed/previousGrowth)-1;
  change.textContent = '较前一交易日 '+signedRate(delta);
  change.className = changeClass(delta);
 } else change.textContent = '收盘于 '+date;
 drawQuoteSparkline(dailyPrices);
 if (!useDaily) $('quote-sparkline-period').textContent = '日线走势截至 '+latest[0];
 $('daily-detail').textContent = date+' 收盘 · 中证红利 '+pointFormat.format(red)+' · 创业板指 '+pointFormat.format(growth)+
  ' · 比值 '+f(ratio)+(dailyError?'。行情源暂不可用，显示最近已获取的收盘。':'。');
}

async function dailySeries(symbol, first, last) {
 const params = new URLSearchParams({ param: [symbol,'day',first,last,55,''].join(',') });
 const response = await fetch('https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?'+params,
  { signal: AbortSignal.timeout(8000), credentials: 'omit', cache: 'no-store' });
 if (!response.ok) throw new Error('Daily close unavailable');
 const payload = await response.json();
 const series = payload?.data?.[symbol]?.day;
 if (payload.code !== 0 || !Array.isArray(series)) throw new Error('Daily series unavailable');
 return new Map(series.filter(bar => /^\d{4}-\d{2}-\d{2}$/.test(bar[0]) && bar[0]>=first && bar[0]<=last)
  .map(bar => [bar[0], Number(bar[2])]).filter(([, close]) => Number.isFinite(close) && close > 0));
}

async function refreshDailyClose() {
 if (dailyPending) return;
 const cached = get('daily-price-series', []);
 if (Array.isArray(cached)) dailyPrices = mergeDailyCloses(dailyPrices,cached);
 showDailyClose();
 dailyPending = true;
 try {
  const china = Date.now() + 8*3600000;
  const cutoff = new Date(china - (new Date(china).getUTCHours() < 15 ? DAY : 0));
  const last = cutoff.toISOString().slice(0,10);
  const first = new Date(+cutoff - 45*DAY).toISOString().slice(0,10);
  const [red,growth] = await Promise.all([dailySeries('sh000922',first,last),dailySeries('sz399006',first,last)]);
  const common = [...red.keys()].filter(day => growth.has(day)).map(day=>[day,red.get(day),growth.get(day)]);
  if (!common.length) throw new Error('No shared dates');
  dailyPrices = mergeDailyCloses(dailyPrices,common);
  save('daily-price-series',dailyPrices);
  dailyError = false;
 } catch {
  dailyError = true;
 } finally {
  dailyPending = false;
  showDailyClose();
 }
}
