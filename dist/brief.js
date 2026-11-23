'use strict';
const $=id=>document.getElementById(id), f=n=>n.toFixed(3), fmt=n=>Math.round(n).toLocaleString('zh-CN'), pct=n=>(100*n).toFixed(2)+'%';
function get(key,alt){try{return JSON.parse(localStorage.getItem('rotation1:'+key))??alt}catch{return alt}}
function save(key,v){try{localStorage.setItem('rotation1:'+key,JSON.stringify(v));return true}catch{return false}}
const shanghai=()=>new Date(Date.now()+8*3600000).toISOString().slice(0,10);
let extra=get('rows',[]),rows,bars,model,end;
function validRow(r){return Array.isArray(r)&&r.length===5&&/^\d{4}-\d\d-\d\d$/.test(r[0])&&r.slice(1).every(n=>Number.isFinite(n)&&n>0);}
if(!Array.isArray(extra))extra=[];
extra=extra.filter(validRow).filter(r=>r[0]>weeklyData.at(-1)[0]);
function refresh(){
 rows=[...weeklyData,...extra];bars=market(rows);end=rows.length-1;model=simulate(rows,bars,START);
 const m=bars[end];$('asof').textContent=rows[end][0];$('ratio').textContent=f(m.r);$('lo').textContent='红利线 '+f(m.low);$('hi').textContent='创业板线 '+f(m.high);
 drawQuoteSparkline(bars.slice(-26).map(bar=>bar.r));
 const span=m.high-m.low;$('pointer').style.left=Math.max(0,Math.min(99,20+60*(m.r-m.low)/span))+'%';
 $('average').textContent='13 周均值 '+f(m.avg)+'　·　'+(m.zone===null?'两线之间':ASSETS[m.zone]+'观察区');
 const selected=$('start').value||get('start',rows[end][0]);
 refreshStartPicker(selected);
 save('start',$('start').value);
 $('undo').disabled=!extra.length;refreshTrendCharts();plan();history();showDailyClose();
}
function drawQuoteSparkline(values) {
 const min=Math.min(...values), max=Math.max(...values), span=max-min;
 const points=values.map((value,i)=>[5+158*i/(values.length-1), span?5+36*(max-value)/span:24]);
 const line=points.map(([x,y],i)=>(i?'L':'M')+x+' '+y).join(' ');
 const [x,y]=points.at(-1);
 $('quote-sparkline').innerHTML='<path class="spark-fill" d="'+line+'L163 47H5Z"/>'+
  '<path class="spark-line" d="'+line+'"/><circle class="spark-tip" cx="'+x+'" cy="'+y+'" r="3.5"/>';
}
function refreshStartPicker(preferred) {
 const dates=rows.slice(START).map(row=>row[0]);
 const selected=dates.includes(preferred)?preferred:dates.at(-1);
 const years=[...new Set(dates.map(date=>date.slice(0,4)))].reverse();
 $('start-year').replaceChildren(...years.map(year=>new Option(year+' 年',year)));
 selectStartWeek(selected);
}
function selectStartWeek(date) {
 const year=date.slice(0,4), month=date.slice(0,7);
 const dates=rows.slice(START).map(row=>row[0]).filter(day=>day.startsWith(year));
 const months=[...new Set(dates.map(day=>day.slice(0,7)))].reverse();
 $('start-year').value=year;
 $('start-month').replaceChildren(...months.map(key=>new Option(Number(key.slice(5))+' 月',key)));
 $('start-month').value=month;
 $('start').replaceChildren(...dates.filter(day=>day.startsWith(month)).reverse().map(day=>new Option(day,day)));
 $('start').value=date;
}
function saleName(t){return t.part===1?'卖清':'卖一半';}
function plan(){
 const start=rows.findIndex(r=>r[0]===$('start').value),capital=Number($('capital').value),body=$('planBody');
 const actual=$('basis').value==='actual', held=$('holding').value;
 const setup=[actual?'实际持仓核对':'按起点模拟', actual?(held===''?'现金':ASSETS[Number(held)]):rows[start][0]];
 if(capital>=1&&capital<=1e11)setup.push('¥'+planMoney.format(capital));
 $('plan-setup-summary').textContent=setup.join(' · ');
 if(!(capital>=1&&capital<=1e11)){clearPlanPerformance();body.textContent='请输入 1 至 1000 亿元之间的初始资金。';$('headline').dataset.tone='warning';$('headline').textContent='请核对初始资金';$('reason').textContent='有效金额用于计算每一笔。';return;}
 if(actual){clearPlanPerformance();actualPlan(start,capital);return;}
 const p=simulate(rows,bars,start,capital),q=p.orders,action=q[0],stale=elapsed(shanghai(),rows[end][0])>=8;
 const known=p.watch!==null&&end-p.touch<13,asset=p.side===null?'现金':ASSETS[p.side],round=p.rounds.at(-1);
 const title=action?.kind==='sell'?(q.length===2?'下一步：卖清旧仓':'下一步：卖出一半'):action?'买入'+ASSETS[action.asset]+'第 '+(p.count+1)+' 笔':p.side!==null?'继续持有'+asset:known?'等待转强确认':'空仓等待';
 let why=action?.kind==='sell'?(q.length===2?'第一笔卖出已完成。下方按成交顺序列出剩余步骤。':'另一边已经确认转强。下周收盘卖出旧仓的一半。'):action?'下一共同交易周收盘，计划投入 '+fmt(p.budget/5)+' 元。':p.side===null?(known?'已经进入观察窗口，等待比值满足 13 周均线条件。':'从所选起点观察，尚无有效建仓信号，保留现金。'):p.count===5?'本轮五笔已到位，等待另一侧入区并确认转强。':'等上一笔成交满 28 天，在首个周收盘检查加仓条件。';
 $('signalLabel').textContent=(stale?'历史参考':'最新周线判断')+'　/　'+(start===end?'本周空仓起步':'按 '+rows[start][0]+' 起步');
 $('headline').dataset.tone=stale||title.includes('卖')||title.includes('赎回')?'warning':title.includes('买入')||title.includes('申购')||title.includes('准备第')?'buy':'neutral';
 $('headline').textContent=stale?'请先更新周线':title;$('reason').textContent=stale?'数据已超过一个交易周。请在页末补录后再参考执行单。':why;
 const stage=action?.kind==='sell'?(action.part===1?2:1):0;
 const steps=Array.from({length:5},(_,j)=>{
  const lot=round?.lots[j], day=lot?rows[lot.i][0]:'';
  const date=day?'<time datetime="'+day+'" aria-label="'+day+'"><span class="step-date-full">'+day+'</span><span class="step-date-short">'+day.slice(5)+'</span></time>':stage?'':'20%';
  return '<div class="step '+(lot?'done':'')+'"><small>第 '+(j+1)+' 笔</small><b>'+
   (lot?'已买入':stage?'已停止':'待买')+'</b><small>'+date+'</small></div>';
 }).join('');
 body.innerHTML='<h3>'+(stale?'截至 '+rows[end][0]+' · ':'')+title+'</h3><p>'+why+'</p>'+
  '<div class="steps" '+(round?'':'hidden')+'>'+steps+'</div>'+
  (round?'<p class="meta">模拟持仓 '+asset+' · 本轮每笔预算约 '+fmt(p.budget/5)+' 元</p>':'');
 const nextBuy=action?.kind==='buy'?{asset:action.asset,budget:p.budget/5}:null;
 renderExecution(body,p.side,stage,nextBuy);
 renderPlanPerformance(p,start,capital);
 save('capital',capital);save('start',$('start').value);
}
function actualPlan(start,capital){
 const raw=$('holding').value,asset=raw===''?null:Number(raw),filled=asset===null?0:Number($('filled').value);
 const last=$('lastFill').value,half=asset!==null&&$('sold').value==='1',m=bars[end],day=rows[end][0];
 $('position-fields').hidden = asset===null;
 for(const id of ['filled','lastFill','sold'])$(id).disabled=asset===null;
 let touch=end;
 while(touch>=Math.max(start,end-12)&&bars[touch].zone===null)touch--;
 const watch=touch>=Math.max(start,end-12)?bars[touch].zone:null;
 const confirmed=watch!==null&&(watch===0?m.r>m.avg:m.r<m.avg);
 let title,note,nextBuy=null;
 if(half){title='下一步：赎回剩余旧仓';note='已确认赎回一半。下一步按平台受理时间提交剩余份额的赎回申请。';}
 else if(asset!==null&&confirmed&&watch!==asset){title='赎回'+ASSETS[asset]+'的一半';note='对侧已入区并确认转强。先处理旧仓，按下方顺序执行。';}
 else if(asset===null){title=confirmed?'准备申购'+ASSETS[watch]:'空仓等待';note=confirmed?'下一交易周按平台受理时间申购第一份，预算约 '+fmt(capital/5)+' 元。':'从所选起点观察，本周未同时满足入区和转强条件。';if(confirmed)nextBuy={asset:watch,budget:capital/5};}
 else if(filled===5){title='继续持有'+ASSETS[asset];note='本轮五笔已买完，等待对侧确认。';}
 else if(!last||last>day){title='补全最近买入日';note='请填写不晚于数据截止日的实际成交日期，用来判断是否已满 28 天。';}
 else if(elapsed(day,last)>=28){title='准备第 '+(filled+1)+' 笔';note='距离上次买入已满 28 天。若此前没有待成交指令，可在下一交易周按平台受理时间申购'+ASSETS[asset]+'约 '+fmt(capital/5)+' 元。';nextBuy={asset,budget:capital/5};}
 else{title='等待加仓间隔';note='距离上次成交 '+elapsed(day,last)+' 天，满 28 天后的首个周收盘再次检查。';}
 const stage=half?2:asset!==null&&confirmed&&watch!==asset?1:0;
 const stale=elapsed(shanghai(),day)>=8;
 $('signalLabel').textContent='实际持仓核对 · '+(asset===null?'现金':ASSETS[asset]);
 $('headline').dataset.tone=stale||title.includes('卖')||title.includes('赎回')?'warning':title.includes('买入')||title.includes('申购')||title.includes('准备第')?'buy':'neutral';
 $('headline').textContent=stale?'请先更新周线':title;$('reason').textContent=stale?'当前记录已超过一个交易周，请先补录最新收盘数据。':note;
 $('planBody').innerHTML='<h3>'+(stale?'历史参考 · ':'')+title+'</h3><p>'+note+'</p><div class="steps" '+(asset===null?'hidden':'')+'>'+Array.from({length:5},(_,j)=>'<div class="step '+(j<filled?'done':'')+'"><small>第 '+(j+1)+' 笔</small><b>'+(j<filled?'已买入':stage?'已停止':'待买')+'</b><small>'+(j<filled||!stage?'20%':'')+'</small></div>').join('')+'</div>';
 renderExecution($('planBody'),asset,stage,nextBuy,true);
 save('actual',{raw,filled,last,half,capital,day});save('start',$('start').value);
}
function mode(){
 const actual=$('basis').value==='actual';
 $('actualFields').hidden=!actual;$('fundLabel').textContent=actual?'本轮起始资金（元）':'初始资金（元）';
 $('planHelp').textContent=actual?'按最新周收盘核对操作。设置仅存于本浏览器。':'从所选周空仓起步模拟。设置仅存于本浏览器。';
 $('capital').value=actual?(get('actual',{}).capital||10000):get('capital',10000);
 save('basis',$('basis').value);plan();
}
function changeClass(value){return value>0?'up':value<0?'down':'';}
function history(){
 const years=elapsed(rows[end][0],rows[START][0])/365.25,ann=(model.nav.at(-1)/10000)**(1/years)-1;
 const dailyRisk=calculateDrawdowns(trendDaily.nav,trendDaily.dates);
 $('stats').innerHTML='<div class="stats"><div><span>历史年化</span><strong class="'+changeClass(ann)+'">'+pct(ann)+'</strong></div><div><span>最大日度回撤</span><strong class="lot-risk">'+pct(dailyRisk.depth)+'</strong></div><div><span>期末市值 / 元</span><strong>'+fmt(model.nav.at(-1))+'</strong></div></div><p class="meta">日度回撤截至 '+trendDaily.dates.at(-1)+' · '+drawdownDates(dailyRisk)+'。</p>';

 const roundSales=model.rounds.filter(r=>r.sales.length).slice().reverse();
 const dateButton=i=>i===undefined?'待成交':'<button type="button" class="sale-date" data-week="'+i+'">'+rows[i][0]+'</button>';
 $('sales').innerHTML=roundSales.length?'<table><thead><tr><th>卖出旧仓</th><th>卖一半</th><th>卖清剩余</th></tr></thead><tbody>'+roundSales.map(r=>'<tr data-asset="'+r.asset+'"><td>'+ASSETS[r.asset]+'</td><td>'+dateButton(r.sales[0])+'</td><td>'+dateButton(r.sales[1])+'</td></tr>').join('')+'</tbody></table>':'尚无模拟卖出成交。';
 $('cycles').innerHTML=model.rounds.map((r,j)=>{
  const lots=r.lots.map((l,slot)=>{
   const {risk,useDaily}=lotHistory(r,l);
   return '<tr><td>'+rows[l.i][0]+'</td><td>'+fmt(l.cost)+'</td><td class="'+changeClass(l.ret)+'">'+pct(l.ret)+'</td>'+
    '<td><button type="button" class="risk-button" data-risk-round="'+j+'" data-risk-lot="'+slot+
    '" aria-expanded="false" aria-controls="history-lot-'+j+'">'+pct(risk.depth)+(useDaily?'':'（周线）')+'</button></td></tr>';
  }).join('');
  const status=r.end===undefined?'持有中，截至 '+rows[end][0]+' 按周收盘估值':'分批卖出 '+r.sales.map(i=>rows[i][0]).join('、');
  return '<details class="round"><summary>第 '+(j+1)+' 轮 · '+ASSETS[r.asset]+' · '+rows[r.start][0].slice(0,7)+
   '<span class="'+changeClass(r.ret)+'">'+pct(r.ret)+'</span></summary><p>'+status+'</p>'+
   '<div class="rows"><table><tr><th>买入周</th><th>投入（元）</th><th>该笔周线收益</th><th>该笔最大回撤</th></tr>'+lots+'</table></div><div id="history-lot-'+j+'" class="history-lot-detail" hidden></div></details>';
 }).join('');

 installTableControls();
}
$('cycles').onclick=e=>{
 const button=e.target.closest('button[data-risk-lot]');
 if(!button)return;
 const roundIndex=Number(button.dataset.riskRound), slot=Number(button.dataset.riskLot);
 const panel=$('history-lot-'+roundIndex), round=model.rounds[roundIndex], lot=round.lots[slot];
 const open=button.getAttribute('aria-expanded')!=='true';
 for(const other of button.closest('details').querySelectorAll('.risk-button'))other.setAttribute('aria-expanded','false');
 panel.hidden=!open;
 if(!open)return;
 button.setAttribute('aria-expanded','true');
 renderLotChart(panel,round,lot);
 panel.insertAdjacentHTML('afterbegin','<h4>第 '+(slot+1)+' 笔 · '+rows[lot.i][0]+'</h4>');
 panel.scrollIntoView({block:'nearest'});
};
function filterSales(){
 const filter=$('asset-filter').value;
 for(const row of $('sales').querySelectorAll('tr[data-asset]'))row.hidden=filter!==''&&row.dataset.asset!==filter;
}
function installTableControls(){
 for(const table of $('history').querySelectorAll('table')){
  for(const th of table.querySelectorAll('th')){
   const col=th.cellIndex,label=th.textContent,button=document.createElement('button');
   button.className='sort';button.textContent=label;button.setAttribute('aria-label','按'+label+'排序');
   th.replaceChildren(button);
   button.onclick=()=>{
    const ascending=th.getAttribute('aria-sort')!=='ascending';
    for(const h of table.querySelectorAll('th'))h.removeAttribute('aria-sort');
    th.setAttribute('aria-sort',ascending?'ascending':'descending');
    const body=table.tBodies[0],records=[...body.rows].filter(row=>row.cells[0].tagName==='TD');
    const key=row=>row.cells[col].textContent.trim();
    const compare=(a,b)=>{
     const x=key(a),y=key(b);
     if(x==='待成交'||y==='待成交')return Number(x==='待成交')-Number(y==='待成交');
     const n=Number(x.replace(/[,%]/g,'')),m=Number(y.replace(/[,%]/g,''));
     return (ascending?1:-1)*(Number.isFinite(n)&&Number.isFinite(m)?n-m:x.localeCompare(y,'zh-CN'));
    };
    records.sort(compare).forEach(row=>body.append(row));
   };
  }
 }
 filterSales();
}
$('asset-filter').onchange=filterSales;
$('sales').onclick=e=>{
 const button=e.target.closest('button[data-week]');if(!button)return;
 for(const cell of $('sales').querySelectorAll('.sale-date'))cell.classList.toggle('selected',cell===button);
 const i=+button.dataset.week;
 showTradeWeek(i);$('chart').scrollIntoView({block:'start'});
 $('cursor').focus({preventScroll:true});
};
$('start-year').onchange=()=>{
 const year=$('start-year').value, preferred=year+$('start').value.slice(4,7);
 const available=rows.slice(START).filter(row=>row[0].startsWith(year));
 const match=available.filter(row=>row[0].startsWith(preferred)).at(-1);
 selectStartWeek((match??available.at(-1))[0]);
 plan();
};
$('start-month').onchange=()=>{
 const month=$('start-month').value;
 selectStartWeek(rows.findLast(row=>row[0].startsWith(month))[0]);
 plan();
};
$('start').onchange=plan;$('capital').value=get('capital',10000);$('capital').oninput=plan;
function monday(s){const n=new Date(s+'T00:00:00Z');return +n-(n.getUTCDay()+6)%7*DAY;}
$('append').onsubmit=e=>{
 e.preventDefault();const day=$('newDay').value,prior=rows[end][0],r=[day,...[0,1,2,3].map(j=>Number($('p'+j).value))];
 const delta=(monday(day)-monday(prior))/DAY,weekday=new Date(day).getUTCDay(),china=new Date(Date.now()+8*3600000);
 const friday=monday(day)+4*DAY+15*3600000;
 if(!validRow(r)||!weekday||weekday===6||delta<7||delta>14||day>shanghai()||+china<friday){$('notice').textContent='请填写紧接上一条记录的已结束交易周及四个正数点位。整周休市可跳过一周。';return;}
 extra.push(r);$('sold').value='0';const stored=save('rows',extra);refresh();e.target.reset();$('notice').textContent=stored?'已补录，判断与历史记录已重新计算。':'本次页面已更新，浏览器未允许保存。';
};
$('undo').onclick=()=>{extra.pop();save('rows',extra);refresh();$('notice').textContent='已撤回最后一次补录。';};
const actual=get('actual',{});$('holding').value=actual.raw??'';$('filled').value=actual.filled||1;$('lastFill').value=actual.last||'';
$('sold').value=actual.half&&actual.day===(extra.at(-1)||weeklyData.at(-1))[0]?'1':'0';
$('basis').value=get('basis','model');$('basis').onchange=mode;
for(const id of ['holding','filled','lastFill','sold'])$(id).onchange=()=>{if(id==='holding')$('sold').value='0';plan();};
if($('basis').value==='actual')$('capital').value=actual.capital||10000;
setupTrendCharts();renderFundList();refresh();mode();
refreshDailyClose();
addEventListener('focus', refreshDailyClose);
setInterval(refreshDailyClose, 10 * 60 * 1000);

const navLinks=[...document.querySelectorAll('nav a')];
function selectNav(hash){
 const active=navLinks.find(link=>link.hash===hash);
 $('active-section').textContent=active?.textContent.trim()||(hash==='#rules'?'交易规则':hash==='#data'?'行情与补录':'策略研究');
 for(const link of navLinks){
  if(link===active)link.setAttribute('aria-current','location');
  else link.removeAttribute('aria-current');
 }
}
function visibleSection(){
 if(window.scrollY<12){selectNav('#top');return;}
 const ids=['plan','chart','history','funds','rules','data'];
 const anchorY=innerHeight*.34;
 const current=ids.findLast(id=>$(id).getBoundingClientRect().top<=anchorY);
 selectNav(current?'#'+current:'#top');
}
addEventListener('scroll',visibleSection,{passive:true});
addEventListener('hashchange',()=>selectNav(location.hash));
visibleSection();

for (const link of document.querySelectorAll('a[href="#data"]')) {
 link.addEventListener('click', () => { $('data').open = true; });
}

const mobileLayout = matchMedia('(max-width: 700px)');
function syncChartDatePanel() {
 $('chart-date-panel').open = !mobileLayout.matches;
}
syncChartDatePanel();
mobileLayout.addEventListener('change', syncChartDatePanel);
