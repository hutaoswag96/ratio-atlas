'use strict';

let dailyClose = null, dailyError = false, dailyPending = false;

function showDailyClose() {
 const [date, red, growth] = dailyClose && dailyClose[0] >= rows[end][0] ? dailyClose : rows[end];
 $('daily-asof').textContent = date;
 $('daily-detail').textContent = '已显示 '+date+' 收盘 · 中证红利 '+pointFormat.format(red)+' · 创业板指 '+pointFormat.format(growth)+
  (dailyError?'。日线刷新失败，当前显示最近可用收盘。':'。');
}

async function dailySeries(symbol, first, last) {
 const params = new URLSearchParams({ param: [symbol,'day',first,last,20,''].join(',') });
 const response = await fetch('https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?'+params,
  { signal: AbortSignal.timeout(8000), credentials: 'omit', cache: 'no-store' });
 if (!response.ok) throw new Error('Daily close unavailable');
 const payload = await response.json();
 const series = payload?.data?.[symbol]?.day;
 if (payload.code !== 0 || !Array.isArray(series)) throw new Error('Daily series unavailable');
 return new Map(series.filter(bar => /^\d{4}-\d{2}-\d{2}$/.test(bar[0]) && bar[0] <= last)
  .map(bar => [bar[0], Number(bar[2])]).filter(([, close]) => Number.isFinite(close) && close > 0));
}

async function refreshDailyClose() {
 if (dailyPending) return;
 dailyPending = true;
 try {
  const china = Date.now() + 8*3600000;
  const cutoff = new Date(china - (new Date(china).getUTCHours() < 15 ? DAY : 0));
  const last = cutoff.toISOString().slice(0,10);
  const first = new Date(+cutoff - 14*DAY).toISOString().slice(0,10);
  const [red,growth] = await Promise.all([dailySeries('sh000922',first,last),dailySeries('sz399006',first,last)]);
  const common = [...red.keys()].filter(day => growth.has(day)).sort().at(-1);
  if (!common) throw new Error('No shared dates');
  if (!dailyClose || common >= dailyClose[0]) dailyClose = [common,red.get(common),growth.get(common)];
  dailyError = false;
 } catch {
  dailyError = true;
 } finally {
  dailyPending = false;
  showDailyClose();
 }
}
