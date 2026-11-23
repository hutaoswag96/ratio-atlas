'use strict';
const $=id=>document.getElementById(id), f=n=>n.toFixed(3), fmt=n=>Math.round(n).toLocaleString('zh-CN'), pct=n=>(100*n).toFixed(2)+'%';
function get(key,alt){try{return JSON.parse(localStorage.getItem('rotation1:'+key))??alt}catch{return alt}}
function save(key,v){try{localStorage.setItem('rotation1:'+key,JSON.stringify(v));return true}catch{return false}}
const shanghai=()=>new Date(Date.now()+8*3600000).toISOString().slice(0,10);
let extra=get('rows',[]),rows,bars,model,end,range=0;
function validRow(r){return Array.isArray(r)&&r.length===5&&/^\d{4}-\d\d-\d\d$/.test(r[0])&&r.slice(1).every(n=>Number.isFinite(n)&&n>0);}
if(!Array.isArray(extra))extra=[];
extra=extra.filter(validRow).filter(r=>r[0]>weeklyData.at(-1)[0]);
function refresh(){
 rows=[...weeklyData,...extra];bars=market(rows);end=rows.length-1;model=simulate(rows,bars,START);
 const m=bars[end];$('asof').textContent=rows[end][0];$('ratio').textContent=f(m.r);$('lo').textContent='红利线 '+f(m.low);$('hi').textContent='创业板线 '+f(m.high);
 const span=m.high-m.low;$('pointer').style.left=Math.max(0,Math.min(99,20+60*(m.r-m.low)/span))+'%';
 $('average').textContent='13 周均值 '+f(m.avg)+'　·　'+(m.zone===null?'两线之间':ASSETS[m.zone]+'观察区');
 const selected=$('start').value||get('start',rows[end][0]);$('start').replaceChildren(...rows.slice(START).map((r,j)=>new Option(r[0],r[0])).reverse());
 $('start').value=rows.some((r,i)=>i>=START&&r[0]===selected)?selected:rows[end][0];save('start',$('start').value);
 $('undo').disabled=!extra.length;draw();plan();history();
}
function exitPlan(side,stage){
 const held=side===null?'空仓':ASSETS[side],other=side===null?'另一边':ASSETS[1-side];
 const status=side===null?'空仓，无持仓可卖':stage===1?'已确认换边，准备减半':'持有'+held+'，等待换仓信号';
 if(stage===2)return '<section class="exit-plan"><h4>卖出安排</h4><p><b>第一笔已卖出 · 剩余份额待清仓</b></p><p>下一共同交易周收盘卖清'+held+'剩余的全部份额，同时用当时账户总额的 20% 买入'+other+'。这一步沿用已确认的换仓信号。</p></section>';
 const trigger=side===null?'持仓后，等另一边进入观察区并确认转强。':(side===0?'创业板进入高位观察区，观察期内比值低于 13 周均值。':'红利进入低位观察区，观察期内比值高于 13 周均值。');
 return '<section class="exit-plan"><h4>卖出安排</h4><p><b>'+status+'</b></p><p class="meta">触发条件：'+trigger+'</p><ol><li>确认后的下一周收盘，卖掉旧仓份额的 <b>50%</b>。</li><li>再下一周收盘，卖掉<b>全部剩余份额</b>，同时用当时账户总额的 20% 买入'+other+'。</li></ol></section>';
}
function saleName(t){return t.part===1?'卖清':'卖一半';}
function plan(){
 const start=rows.findIndex(r=>r[0]===$('start').value),capital=Number($('capital').value),body=$('planBody');
 if(!(capital>=1&&capital<=1e11)){body.textContent='请输入 1 至 1000 亿元之间的初始资金。';$('headline').dataset.tone='warning';$('headline').textContent='请核对初始资金';$('reason').textContent='有效金额用于计算每一笔。';return;}
 if($('basis').value==='actual'){actualPlan(start,capital);return;}
 const p=simulate(rows,bars,start,capital),q=p.orders,action=q[0],stale=elapsed(shanghai(),rows[end][0])>=8;
 const known=p.watch!==null&&end-p.touch<13,asset=p.side===null?'现金':ASSETS[p.side],round=p.rounds.at(-1);
 const title=action?.kind==='sell'?(q.length===2?'卖清并换边':'旧仓卖出一半'):action?'买入'+ASSETS[action.asset]+'第 '+(p.count+1)+' 笔':p.side!==null?'继续持有'+asset:known?'等待转强确认':'空仓等待';
 let why=action?.kind==='sell'?(q.length===2?'上一周已卖出一半。下周收盘卖清，同时用新一轮资金的 20% 买入'+ASSETS[q[1].asset]+'。':'另一边已经确认转强。下周收盘卖出旧仓的一半。'):action?'下一共同交易周收盘，计划投入 '+fmt(p.budget/5)+' 元。':p.side===null?(known?'已经进入观察窗口，等待比值满足 13 周均线条件。':'从所选起点观察，尚无有效建仓信号，保留现金。'):p.count===5?'本轮五笔已到位，等待另一侧入区并确认转强。':'等上一笔成交满 28 天，在首个周收盘检查加仓条件。';
 $('signalLabel').textContent=(stale?'历史参考':'最新周线判断')+'　/　'+(start===end?'本周空仓起步':'按 '+rows[start][0]+' 起步');
 $('headline').dataset.tone=stale||title.includes('卖')?'warning':title.includes('买入')||title.includes('准备第')?'buy':'neutral';
 $('headline').textContent=stale?'请先更新周线':title;$('reason').textContent=stale?'数据已超过一个交易周。请在页末补录后再参考执行单。':why;
 let steps='';for(let j=0;j<5;j++){const lot=round?.lots[j];steps+='<div class="step '+(lot?'done':'')+'"><small>第 '+(j+1)+' 笔</small><b>'+(lot?'已模拟买入':'待买')+'</b><small>'+(lot?rows[lot.i][0]:'20%')+'</small></div>';}
 body.innerHTML='<h3>'+(stale?'截至 '+rows[end][0]+' · ':'')+title+'</h3><p>'+why+'</p><div class="steps">'+steps+'</div><p class="meta">模拟持仓：'+asset+'　·　本轮每笔预算约 '+fmt(p.budget/5)+' 元　·　按轮初资金等分。</p>';
 body.insertAdjacentHTML('beforeend',exitPlan(p.side,action?.kind==='sell'?(action.part===1?2:1):0));
 save('capital',capital);save('start',$('start').value);
}
function actualPlan(start,capital){
 const raw=$('holding').value,asset=raw===''?null:Number(raw),filled=asset===null?0:Number($('filled').value);
 const last=$('lastFill').value,half=asset!==null&&$('sold').value==='1',m=bars[end],day=rows[end][0];
 for(const id of ['filled','lastFill','sold'])$(id).disabled=asset===null;
 let touch=end;
 while(touch>=Math.max(start,end-12)&&bars[touch].zone===null)touch--;
 const watch=touch>=Math.max(start,end-12)?bars[touch].zone:null;
 const confirmed=watch!==null&&(watch===0?m.r>m.avg:m.r<m.avg);
 let title,note;
 if(half){title='卖清旧仓并换边';note='你已记录本周按换仓信号卖出一半。下一共同交易周收盘卖清，同时按届时账户总额的 20% 买入'+ASSETS[1-asset]+'。';}
 else if(asset!==null&&confirmed&&watch!==asset){title='卖出'+ASSETS[asset]+'的一半';note='对侧已入区并确认转强。下一共同周收盘先卖一半，再下一周卖清并开始新一轮。';}
 else if(asset===null){title=confirmed?'开始买入'+ASSETS[watch]:'空仓等待';note=confirmed?'下一共同周收盘买入第一份，预算约 '+fmt(capital/5)+' 元。':'从所选起点观察，本周未同时满足入区和转强条件。';}
 else if(filled===5){title='继续持有'+ASSETS[asset];note='本轮五笔已买完，等待对侧确认。';}
 else if(!last||last>day){title='补全最近买入日';note='请填写不晚于数据截止日的实际成交日期，用来判断是否已满 28 天。';}
 else if(elapsed(day,last)>=28){title='准备第 '+(filled+1)+' 笔';note='距离上次买入已满 28 天。若此前没有待成交指令，按本周检查结果，下一共同周收盘买入'+ASSETS[asset]+'约 '+fmt(capital/5)+' 元。';}
 else{title='等待加仓间隔';note='距离上次成交 '+elapsed(day,last)+' 天，满 28 天后的首个周收盘再次检查。';}
 const stale=elapsed(shanghai(),day)>=8;
 $('signalLabel').textContent='实际持仓核对 · '+(asset===null?'现金':ASSETS[asset]);
 $('headline').dataset.tone=stale||title.includes('卖')?'warning':title.includes('买入')||title.includes('准备第')?'buy':'neutral';
 $('headline').textContent=stale?'请先更新周线':title;$('reason').textContent=stale?'当前记录已超过一个交易周，请先补录最新收盘数据。':note;
 $('planBody').innerHTML='<h3>'+(stale?'历史参考 · ':'')+title+'</h3><p>'+note+'</p><div class="steps">'+Array.from({length:5},(_,j)=>'<div class="step '+(j<filled?'done':'')+'"><small>第 '+(j+1)+' 笔</small><b>'+(j<filled?'已买入':'待买')+'</b><small>20%</small></div>').join('')+'</div>';
 $('planBody').insertAdjacentHTML('beforeend',exitPlan(asset,half?2:asset!==null&&confirmed&&watch!==asset?1:0));
 save('actual',{raw,filled,last,half,capital,day});save('start',$('start').value);
}
function mode(){
 const actual=$('basis').value==='actual';
 $('actualFields').hidden=!actual;$('fundLabel').textContent=actual?'本轮起始资金（元）':'初始资金（元）';
 $('planHelp').textContent=actual?'填写实际成交情况，按最新周收盘核对下一步。手动核对模式不会替你记录成交；每周请核实已买笔数、成交日及换仓进度。':'从所选周空仓起步，逐周按规则模拟。未完全跟随历史交易时，请选择按实际持仓核对。';
 $('capital').value=actual?(get('actual',{}).capital||10000):get('capital',10000);
 save('basis',$('basis').value);plan();
}
function changeClass(value){return value>0?'up':value<0?'down':'';}
function history(){
 const years=elapsed(rows[end][0],rows[START][0])/365.25,ann=(model.nav.at(-1)/10000)**(1/years)-1;
 $('stats').innerHTML='<div class="stats"><div><span>历史年化</span><strong class="'+changeClass(ann)+'">'+pct(ann)+'</strong></div><div><span>最大回撤</span><strong class="'+changeClass(model.draw)+'">'+pct(model.draw)+'</strong></div><div><span>期末市值 / 元</span><strong>'+fmt(model.nav.at(-1))+'</strong></div></div>';
 const roundSales=model.rounds.filter(r=>r.sales.length).slice().reverse();
 const dateButton=i=>i===undefined?'待成交':'<button type="button" class="sale-date" data-week="'+i+'">'+rows[i][0]+'</button>';
 $('sales').innerHTML=roundSales.length?'<table><thead><tr><th>卖出旧仓</th><th>卖一半</th><th>卖清剩余</th></tr></thead><tbody>'+roundSales.map(r=>'<tr data-asset="'+r.asset+'"><td>'+ASSETS[r.asset]+'</td><td>'+dateButton(r.sales[0])+'</td><td>'+dateButton(r.sales[1])+'</td></tr>').join('')+'</tbody></table>':'尚无模拟卖出成交。';
 $('cycles').innerHTML=model.rounds.map((r,j)=>'<details class="round"><summary>第 '+(j+1)+' 轮 · '+ASSETS[r.asset]+' · '+rows[r.start][0].slice(0,7)+'<span class="'+changeClass(r.ret)+'">'+pct(r.ret)+'</span></summary><p>'+ (r.end===undefined?'持有中，截至 '+rows[end][0]+' 按收盘估值':'分批卖出 '+r.sales.map(i=>rows[i][0]).join('、'))+'</p><div class="rows"><table><tr><th>买入周</th><th>投入（元）</th><th>该笔收益</th></tr>'+r.lots.map(l=>'<tr><td>'+rows[l.i][0]+'</td><td>'+fmt(l.cost)+'</td><td class="'+changeClass(l.ret)+'">'+pct(l.ret)+'</td></tr>').join('')+'</table></div></details>').join('');

 installTableControls();
}
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
function draw(reset=true){
 const el=$('plot'),width=Math.max(275,el.clientWidth),height=el.clientHeight,left=35,right=11,top=34,bottom=26;
 const first=range?Math.max(START,end-range+1):START,visible=bars.slice(first),vals=visible.flatMap(m=>[m.r,m.low,m.high]);
 const min=Math.floor((Math.min(...vals)-.08)*4)/4,max=Math.ceil((Math.max(...vals)+.08)*4)/4;
 const x=i=>left+(width-left-right)*(i-first)/(end-first),y=v=>top+(height-top-bottom)*(max-v)/(max-min);
 const path=(k,step)=>visible.map((m,j)=>j&&step?'H'+x(first+j)+'V'+y(m[k]):(j?'L':'M')+x(first+j)+' '+y(m[k])).join(' ');
 const cursor=$('cursor');cursor.min=first;cursor.max=end;if(reset)cursor.value=end;const i=+cursor.value;
 let out='';for(let v=min;v<=max+.0001;v+=max-min<=1?.25:.5){out+='<path d="M'+left+' '+y(v)+'H'+(width-right)+'" stroke="var(--grid)"/><text x="0" y="'+(y(v)+4)+'">'+v.toFixed(2)+'</text>';}
 for(const [k,col] of [['low','var(--low-line)'],['high','var(--high-line)'],['r','var(--trace)']])out+='<path d="'+path(k,k!=='r')+'" fill="none" stroke="'+col+'" stroke-width="'+(k==='r'?1.8:1.1)+'" '+(k==='r'?'':'stroke-dasharray="4 3"')+'/>';
 for(const r of model.rounds)for(const lot of r.lots){if(lot.i>=first)out+='<circle cx="'+x(lot.i)+'" cy="'+y(bars[lot.i].r)+'" r="3.7" fill="'+(r.asset?'var(--brand)':'var(--up)')+'" stroke="var(--surface)" stroke-width="1"/>';}
 for(const t of model.trades){
  if(t.kind!=='sell'||t.i<first)continue;
  const cx=x(t.i),cy=y(bars[t.i].r),full=t.part===1;
  // Separate adjacent sales vertically; leave the same-week purchase dot visible.
  const tip=cy-(full?23:7);
  out+='<g data-sale="'+t.i+'"><title>'+rows[t.i][0]+' '+ASSETS[t.asset]+' '+saleName(t)+'</title><path d="M'+cx+' '+(cy-4)+'V'+tip+'" stroke="var(--amber)"/><path d="M'+(cx-4.8)+' '+(tip-8)+'h9.6l-4.8 8Z" stroke="var(--amber)" stroke-width="1.5" fill="'+(full?'var(--amber)':'var(--surface)')+'"/></g>';
 }
 for(let n=0;n<4;n++){const j=Math.round(first+(end-first)*n/3);out+='<text x="'+x(j)+'" y="'+(height-4)+'" text-anchor="'+(n===0?'start':n===3?'end':'middle')+'">'+rows[j][0].slice(0,7)+'</text>';}
 out+='<path stroke="var(--subtle)" stroke-dasharray="2 3" d="M'+x(i)+' '+top+'V'+(height-bottom)+'"/><circle cx="'+x(i)+'" cy="'+y(bars[i].r)+'" r="4" fill="var(--trace)"/>';
 el.setAttribute('viewBox','0 0 '+width+' '+height);el.innerHTML='<g font-family="Inter, Arial, sans-serif" font-size="12" fill="var(--muted)">'+out+'</g>';
 $('readout').textContent=rows[i][0]+'　比值 '+f(bars[i].r)+'　下线 '+f(bars[i].low)+' / 上线 '+f(bars[i].high);
 const acts=model.trades.filter(t=>t.i===i).map(t=>(t.kind==='buy'?'买入':saleName(t))+ASSETS[t.asset]);
 if(acts.length)$('readout').textContent+='　模拟成交：'+acts.join('，');
}
$('ranges').onclick=e=>{if(!e.target.matches('button'))return;range=+e.target.dataset.n;for(const b of $('ranges').children)b.setAttribute('aria-pressed',b===e.target);draw();};
$('cursor').oninput=()=>draw(false);$('plot').onpointerdown=e=>{const rect=$('plot').getBoundingClientRect(),a=+$('cursor').min;$('cursor').value=e.target.closest('[data-sale]')?.dataset.sale??Math.round(a+(end-a)*Math.min(1,Math.max(0,(e.clientX-rect.left-35)/(rect.width-46))));draw(false);};
$('plot').onpointermove=e=>{
 if(e.pointerType==='touch')return;
 const box=$('plot').getBoundingClientRect(),first=+$('cursor').min;
 const fraction=Math.min(1,Math.max(0,(e.clientX-box.left-35)/(box.width-46)));
 const i=Number(e.target.closest('[data-sale]')?.dataset.sale??Math.round(first+(end-first)*fraction));
 const trades=model.trades.filter(t=>t.i===i).map(t=>(t.kind==='sell'?saleName(t):'买入')+ASSETS[t.asset]);
 const tip=$('plot-tip');
 tip.textContent=[rows[i][0]+' · 比值 '+f(bars[i].r),'观察线 '+f(bars[i].low)+' / '+f(bars[i].high),...trades].join('\n');
 tip.hidden=false;
 tip.style.left=Math.max(0,Math.min(box.width-tip.offsetWidth,e.clientX-box.left+12))+'px';
 tip.style.top=Math.max(0,Math.min(box.height-tip.offsetHeight,e.clientY-box.top+12))+'px';
};
$('plot').onpointerleave=()=>{$('plot-tip').hidden=true;};
$('sales').onclick=e=>{
 const button=e.target.closest('button[data-week]');if(!button)return;
 for(const cell of $('sales').querySelectorAll('.sale-date'))cell.classList.toggle('selected',cell===button);
 const i=+button.dataset.week;
 if(i<+$('cursor').min)$('ranges').querySelector('[data-n="0"]').click();
 $('cursor').value=i;draw(false);$('chart').scrollIntoView({block:'start'});
 $('cursor').focus({preventScroll:true});
};
$('start').onchange=plan;$('capital').value=get('capital',10000);$('capital').oninput=plan;
new ResizeObserver(()=>{if(bars)draw(false)}).observe($('plot'));
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
refresh();mode();

const navLinks=[...document.querySelectorAll('nav a')];
function selectNav(hash){
 for(const link of navLinks){
  if(link.hash===hash)link.setAttribute('aria-current','location');
  else link.removeAttribute('aria-current');
 }
}
function visibleSection(){
 if(window.scrollY<12){selectNav('#top');return;}
 const hash=location.hash;
 const ids=['chart','plan','history'];
 const visible=ids.filter(id=>{const r=$(id).getBoundingClientRect();return r.top<innerHeight*.40 && r.bottom>92;});
 selectNav(visible.includes(hash.slice(1))?hash:visible.length?'#'+visible.at(-1):$('chart').getBoundingClientRect().top>0?'#top':'');
}
addEventListener('scroll',visibleSection,{passive:true});
addEventListener('hashchange',()=>selectNav(location.hash));
visibleSection();
