'use strict';
// Weekly bars for the newest completed week, derived in the browser.
// Why: the signal only needs Friday closes, and waiting for a manual entry is
// pointless when the daily closes already contain that Friday.
//  - 000922 / 399006 取日线收盘（真实价格）。
//  - 399606（创业板全收益）取腾讯周线原始收盘。
//  - H00922（红利全收益）官方接口禁止跨域，只能按 000922 的价格变动折算；
//    周五夜间 GitHub Actions 会把官方数据写回 weekly.js，届时以正式值覆盖。
let autoWeeks = [];
const autoDates = new Set();

function shanghaiClock(){return new Date(Date.now()+8*3600000);}
function dayISO(date){return date.toISOString().slice(0,10);}
function mondayOf(day){
 const time=Date.parse(day+'T00:00:00Z');
 return dayISO(new Date(time-((new Date(time).getUTCDay()+6)%7)*DAY));
}
function fridayOf(monday){return dayISO(new Date(Date.parse(monday+'T00:00:00Z')+4*DAY));}

// 最后一个已收盘的交易周：周五 15:00 之后算本周，否则退到上周。
function lastClosedWeek(){
 const now=shanghaiClock(),today=dayISO(now),monday=mondayOf(today),friday=fridayOf(monday);
 const closed=today>friday||(today===friday&&now.getUTCHours()>=15);
 const start=closed?monday:shanghaiDay(monday,-7);
 return {monday:start,friday:fridayOf(start)};
}
function shanghaiDay(day,shift){return dayISO(new Date(Date.parse(day+'T00:00:00Z')+shift*DAY));}

async function growthWeeklyTotal(from,to){
 try{
  const params=new URLSearchParams({param:['sz399606','week',from,to,'40',''].join(',')});
  const response=await fetch('https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?'+params,
   {signal:AbortSignal.timeout(8000),credentials:'omit',cache:'no-store'});
  if(!response.ok) throw new Error('Weekly total unavailable');
  const payload=await response.json();
  const series=payload?.data?.sz399606?.week;
  if(payload.code!==0||!Array.isArray(series)) throw new Error('Weekly total unavailable');
  return new Map(series.map(bar=>[bar[0],Number(bar[2])]).filter(([,value])=>Number.isFinite(value)&&value>0));
 }catch{return new Map();}
}

// 用日线补齐静态周线之后的所有完整周；每列都从上一个已确认的周收盘推算。
async function rebuildAutoWeeks(){
 const base=weeklyData.at(-1);
 autoWeeks=[];autoDates.clear();
 if(!base) return false;
 const target=lastClosedWeek();
 const quotes=dailyChartQuotes().filter(row=>row[0]>base[0]&&row[0]<=target.friday);
 const weeks=new Map();
 for(const row of quotes){
  const monday=mondayOf(row[0]);
  if(!weeks.has(monday)) weeks.set(monday,[]);
  weeks.get(monday).push(row);
 }
 if(!weeks.size) return false;
 const totals=await growthWeeklyTotal(shanghaiDay(base[0],-7),target.friday);
 let priceA=base[1],priceB=base[2],totalA=base[3],totalB=base[4];
 const built=[];
 for(const monday of [...weeks.keys()].sort()){
  const bar=weeks.get(monday).at(-1);
  totalA=totalA*bar[1]/priceA;
  totalB=totals.get(bar[0])??totalB*bar[2]/priceB;
  priceA=bar[1];priceB=bar[2];
  built.push([bar[0],bar[1],bar[2],Number(totalA.toFixed(2)),Number(totalB.toFixed(2))]);
 }
 autoWeeks=built;
 for(const row of built) autoDates.add(row[0]);
 return true;
}

// 只在新增周线时重建整页，避免每次刷新行情都重算回测。
async function refreshAutoWeeks(){
 const before=autoWeeks.at(-1)?.[0]??'';
 await rebuildAutoWeeks();
 if((autoWeeks.at(-1)?.[0]??'')!==before&&typeof refresh==='function') refresh();
}
