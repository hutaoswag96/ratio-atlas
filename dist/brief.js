'use strict';
const $ = id => document.getElementById(id);
const rows = StyleLens.build(weeklyData);
const last = rows.length-1;
const names = ['红利观察区','中间区','创业板观察区'];
const fmt = n => n.toFixed(3);
const signed = (n,digits=1) => (n>0?'+':'')+(100*n).toFixed(digits);
const pct = n => signed(n)+'%';
let adjustment=0, userPortfolio=false;
let asOf = last, years = 3, selectedZone = rows[last].zone, listLimit = 5, historySets;

// Freeze every past opinion at the information available on the issue date.
const tiltCount=[];
let totalTilts=0;
for(let i=StyleLens.lookback;i<rows.length;i++){
  const z=rows[i].zone;
  if(z!==1){
    const evidence=StyleLens.cases(rows,i,26)[z];
    if(StyleLens.decision(rows,i,evidence).allocation!==50)totalTilts++;
  }
  tiltCount[i]=totalTilts;
}
const yuan = n => '¥'+Math.round(n).toLocaleString('zh-CN');
function loadExample(){
  const now=rows[asOf],start=rows[asOf-4];userPortfolio=false;
  $('holdA').value=Math.round(50000*now.a/start.a);
  $('holdB').value=Math.round(50000*now.b/start.b);
  $('newCash').value=10000;$('baseline').value=50;
  $('exampleNote').textContent='示例假设四周前各持有 5 万元，按价格指数涨跌估算当前市值，本周计划增加 1 万元。可直接修改。';
  allocate();
}
function allocate(){
  const inputs=['holdA','holdB','newCash','baseline'].map(id=>$(id));
  if(inputs.some(el=>!el.value||!el.validity.valid||!Number.isFinite(el.valueAsNumber))){
    $('split').textContent='请检查输入';$('splitNote').textContent='金额须为非负数，原定占比须在 0% 至 100% 之间。';return;
  }
  const [a,b,extra,original]=inputs.map(el=>el.valueAsNumber);
  const goal=Math.max(0,Math.min(100,original+adjustment))/100;
  const total=a+b+extra, red=Math.min(extra,Math.max(0,total*goal-a)),growth=extra-red;
  $('split').textContent='红利 '+yuan(red)+' · 创业板 '+yuan(growth);
  $('splitNote').textContent='红利目标占比 '+(goal*100).toFixed(1)+'%。'+(total>0?'投入后约为 '+((a+red)/total*100).toFixed(1)+'%。':'')+'仅分配新增资金，原有份额继续持有。金额按元显示。';
}
for(const id of ['holdA','holdB','newCash','baseline'])$(id).oninput=()=>{userPortfolio=true;$('exampleNote').textContent='正在使用你输入的持仓与计划，仅用于本页试算。';allocate();};
$('example').onclick=loadExample;
function drawDial(row){
  const cx=170,cy=136, radius=109;
  function point(f,r){
    const angle=Math.PI*(1-f);
    return [cx+r*Math.cos(angle),cy-r*Math.sin(angle)];
  }
  const coord = (f,r) => point(f,r).map(n=>n.toFixed(2)).join(' ');
  function arc(start,end,r,color,width){
    return '<path d="M '+coord(start,r)+' A '+r+' '+r+' 0 0 1 '+coord(end,r)+'" fill="none" stroke="'+color+'" stroke-width="'+width+'"/>';
  }
  let s=arc(0,.198,radius,'#9faac1',13)+arc(.202,.798,radius,'#80729c',13)+arc(.802,1,radius,'#d8b896',13);
  for(let i=0;i<=50;i++){
    const f=i/50;
    s+='<path d="M '+coord(f,119)+' L '+coord(f,i%5===0?127:122)+'" stroke="#978fa7" stroke-width="1"/>';
  }
  s+='<path d="M '+coord(row.rank,94)+' L '+coord(row.rank,121)+'" stroke="#fff" stroke-width="3.2" stroke-linecap="round"/>';
  const [dx,dy]=point(row.rank,109);
  s+='<circle cx="'+dx+'" cy="'+dy+'" r="4.5" fill="#fff"/>';
  s+='<text x="170" y="101" text-anchor="middle" fill="#fff" font-size="44" font-family="Georgia,serif">'+(row.rank*100).toFixed(1)+'</text><text x="170" y="126" text-anchor="middle" fill="#d6d0e3" font-size="13">历史百分位</text>';
  $('dial').innerHTML='<svg viewBox="0 0 340 145" role="img" aria-label="比值位于此前156周第'+(row.rank*100).toFixed(1)+'百分位">'+s+'</svg>';
}

function renderReport(){
  const row=rows[asOf],prev=rows[asOf-1],before=rows[asOf-4];
  const baseCases=StyleLens.cases(rows,asOf,26);
  const advice=StyleLens.decision(rows,asOf,baseCases[row.zone]);
  adjustment=advice.allocation-50;
  if(!userPortfolio)loadExample();else allocate();
  $('verdict').textContent=advice.title;
  $('reason').textContent=row.zone===1?'本周比值 '+fmt(row.r)+'，位于近三年的中间区。比值降至 '+fmt(row.low)+' 时关注红利，升至 '+fmt(row.high)+' 时关注创业板。':advice.reason;
  $('action').textContent=advice.action;
  $('ruleAudit').textContent='截至本报告周，逐周回看 '+(asOf-StyleLens.lookback+1)+' 期，其中 '+tiltCount[asOf]+' 期满足倾斜条件。此数按报告周计，相邻周可能属于同一阶段。';
  $('rank').textContent=names[row.zone]; drawDial(row);
  $('week').value=String(asOf);$('prev').disabled=asOf===StyleLens.lookback;
  $('next').disabled=asOf===last;$('latest').hidden=asOf===last;
  $('ratio').textContent=fmt(row.r);$('weeklyChange').textContent='本周 '+pct(row.r/prev.r-1);
  const a=row.a/before.a-1,b=row.b/before.b-1,span=Math.max(.01,Math.abs(a),Math.abs(b));
  $('driverDates').textContent=before.date+' 至 '+row.date;
  $('moves').innerHTML=[['中证红利','000922',a],['创业板指','399006',b]].map(([name,code,value],i)=>
    '<div class="mover"><b>'+name+'<small>'+code+'</small></b><strong>'+pct(value)+'</strong></div><div class="bar"><i class="'+(i?'growth':'')+'" style="width:'+Math.abs(value)/span*100+'%"></i></div>').join('');
  const explanation=a>=0&&b<0?'红利上涨、创业板下跌，两边共同抬高了比值。':
    b>=0&&a<0?'创业板上涨、红利下跌，两边共同压低了比值。':
    a>=0&&b>=0?(a>=b?'两项指数均上涨，红利涨得更多。':'两项指数均上涨，创业板涨得更多。'):
    a>=b?'两项指数均下跌，红利跌幅较小。':'两项指数均下跌，创业板跌幅较小。';
  $('driverText').textContent=explanation+'同期比值变动 '+pct(row.r/before.r-1)+'。';
  $('coverage').textContent='快照包含 '+rows[0].date+' 至 '+rows[last].date+' 的 '+rows.length+' 条共同周收盘。周报可从 '+rows[StyleLens.lookback].date+' 起回看。近四周比较采用相隔四条周线的收盘点位。';
  renderPlot();renderEvidence(baseCases);
}
function renderPlot(){
  const end=rows[asOf];
  const data=rows.slice(0,asOf+1).filter(p=>years===0||p.time>=end.time-years*31557600000);
  const calibrated=data.filter(p=>p.zone!==null);
  $('range').innerHTML=[1,3,5,0].map(v=>'<button data-years="'+v+'" aria-pressed="'+(years===v)+'">'+(v?v+' 年':'全部')+'</button>').join('');
  const w=Math.max(250,$('plot').clientWidth),h=w<450?202:222,pad={left:36,right:9,top:14,bottom:28};
  const vals=data.map(p=>p.r).concat(calibrated.flatMap(p=>[p.low,p.high]));
  const floor=Math.min(...vals),ceil=Math.max(...vals),span=ceil-floor||1;
  const lo=floor-span*.08,hi=ceil+span*.08;
  const first=data[0].time;
  const x=p=>pad.left+(p.time-first)/(end.time-first)*(w-pad.left-pad.right);
  const y=v=>pad.top+(hi-v)/(hi-lo)*(h-pad.bottom-pad.top);
  const points=(items,field)=>items.map(p=>x(p).toFixed(2)+' '+y(p[field]).toFixed(2));
  const line=(items,field)=>'M '+points(items,field).join(' L ');
  let s='';
  if(calibrated.length){
    s+='<path fill="#efebf7" d="'+line(calibrated,'high')+' L '+points([...calibrated].reverse(),'low').join(' L ')+' Z"/>';
    for(const field of ['high','low'])s+='<path fill="none" stroke="#c0b4d9" stroke-dasharray="3 4" d="'+line(calibrated,field)+'"/>';
  }
  const ticks=4;
  for(let i=0;i<=ticks;i++){
    const v=lo+(hi-lo)*i/ticks;
    s+='<path d="M '+pad.left+' '+y(v)+' H '+(w-pad.right)+'" stroke="#c8c9ce" opacity=".48"/><text x="'+(pad.left-5)+'" y="'+(y(v)+4)+'" text-anchor="end">'+v.toFixed(2)+'</text>';
  }
  const dates=w<440?3:5;
  for(let k=0;k<dates;k++){
    const i=Math.round((data.length-1)*k/(dates-1)),p=data[i];
    s+='<text x="'+x(p)+'" y="'+(h-5)+'" text-anchor="'+(k===0?'start':k===dates-1?'end':'middle')+'">'+p.date.slice(0,7)+'</text>';
  }
  s+='<path fill="none" stroke="#6950a5" stroke-width="2.4" stroke-linejoin="round" d="'+line(data,'r')+'"/><circle cx="'+x(end)+'" cy="'+y(end.r)+'" r="4" fill="#6950a5" stroke="white" stroke-width="1.5"/>';
  $('plot').innerHTML='<div class="plotbox" tabindex="0" aria-label="比值图，可用左右方向键查看读数"><svg viewBox="0 0 '+w+' '+h+'" role="img" aria-label="红利除以创业板的价格比值和滚动观察区间" font-family="monospace" font-size="12" fill="#606572">'+s+'<line y1="'+pad.top+'" y2="'+(h-pad.bottom)+'" stroke="#56456f" stroke-dasharray="2 3" visibility="hidden"/></svg><output hidden></output></div>';
  const box=$('plot').firstChild,tip=box.lastChild,cursor=box.querySelector('line');
  let index=data.length-1;
  function show(i){
    index=Math.max(0,Math.min(data.length-1,i));const p=data[index];
    tip.textContent=p.date+' · '+fmt(p.r)+(p.zone===null?'':' · '+names[p.zone]);tip.hidden=false;
    tip.style.left=Math.max(0,Math.min(w-tip.offsetWidth,x(p)-70))+'px';
    cursor.setAttribute('x1',x(p));cursor.setAttribute('x2',x(p));cursor.setAttribute('visibility','visible');
  }
  box.onpointermove=box.onpointerdown=e=>{
    const time=first+((e.clientX-box.getBoundingClientRect().left-pad.left)/(w-pad.left-pad.right))*(end.time-first);
    const nearest=data.reduce((best,p,i)=>Math.abs(p.time-time)<Math.abs(data[best].time-time)?i:best,0);
    show(nearest);
  };
  box.onfocus=()=>show(index);box.onblur=box.onpointerleave=()=>{tip.hidden=true;cursor.setAttribute('visibility','hidden');};
  box.onkeydown=e=>{if(['ArrowRight','ArrowLeft'].includes(e.key)){e.preventDefault();show(index+(e.key==='ArrowRight'?1:-1));}};
}
function renderEvidence(baseCases){
  const horizon=Number($('horizon').value);
  historySets=horizon===26&&baseCases?baseCases:StyleLens.cases(rows,asOf,horizon);
  const row=rows[asOf];
  $('casecards').innerHTML=historySets.map((samples,z)=>{
    const stat=StyleLens.summary(samples,z===2?'b':'a'),asset=z===2?'创业板':'红利';
    const threshold=z===0?'≤ '+fmt(row.low):z===2?'≥ '+fmt(row.high):fmt(row.low)+' – '+fmt(row.high);
    return '<button class="casecard" aria-pressed="'+(z===selectedZone)+'" data-zone="'+z+'"><div class="cardhead">'+names[z]+'<small>本周 '+threshold+'</small></div><div><strong>'+(stat?stat.wins:'0')+' / '+samples.length+'</strong><span>'+asset+'跑赢</span></div><p class="detail">'+(stat?'收益差中位数 '+signed(stat.median)+' 个百分点':'截至该周暂无完整样本')+'</p></button>';
  }).join('');
  const lower=StyleLens.summary(historySets[0],'a'), upper=StyleLens.summary(historySets[2],'b');
  let finding='观察区需要更多到期案例。';
  if(lower && upper){
    finding='在 '+horizon+' 周观察期里，'+
      (lower.median<=0&&upper.median<=0?'两侧进入相对低位后，收益差中位数都未转正。仅凭“过去跌得多”就换仓，缺少历史支持。':'两侧的结果应分别判断。样本数量和典型收益差会随观察期改变，跑赢另一项指数也可能亏钱。');
  }
  $('takeaway').textContent=finding;
  drawTable();
}
function drawTable(){
  const samples=historySets[selectedZone];
  $('sampleTitle').textContent=names[selectedZone]+'的历史案例';
  $('sampleDate').textContent='截至 '+rows[asOf].date+' · '+samples.length+' 组';
  $('records').innerHTML=[...samples].reverse().slice(0,listLimit).map(e=>'<tr><td>'+rows[e.i].date+'</td><td>'+fmt(rows[e.i].r)+'</td><td>'+pct(e.a)+'</td><td>'+pct(e.b)+'</td><td>'+signed(e.spread)+'</td><td><button class="textlink" data-week="'+e.i+'">当周判断</button></td></tr>').join('')||'<tr><td colspan="6" style="text-align:center">截至此周，尚无已到期且符合条件的案例。</td></tr>';
  $('more').hidden=samples.length<=listLimit;
}
function setWeek(i){
  asOf=Math.min(last,Math.max(StyleLens.lookback,i));
  selectedZone=rows[asOf].zone;listLimit=5;renderReport();
}
$('week').innerHTML=rows.slice(StyleLens.lookback).map((p,i)=>'<option value="'+(i+StyleLens.lookback)+'">'+p.date+'</option>').reverse().join('');
$('week').onchange=e=>setWeek(Number(e.target.value));$('prev').onclick=()=>setWeek(asOf-1);
$('next').onclick=()=>setWeek(asOf+1);$('latest').onclick=()=>setWeek(last);
$('range').onclick=e=>{if(e.target.dataset.years!==undefined){years=Number(e.target.dataset.years);renderPlot();}};
$('casecards').onclick=e=>{const btn=e.target.closest('[data-zone]');if(btn){selectedZone=Number(btn.dataset.zone);listLimit=5;renderEvidence();$('casecards').querySelector('[data-zone="'+selectedZone+'"]').focus({preventScroll:true});}};
$('horizon').onchange=()=>{listLimit=5;renderEvidence();};
$('more').onclick=()=>{listLimit+=10;drawTable();};
$('records').onclick=e=>{if(e.target.dataset.week!==undefined){setWeek(Number(e.target.dataset.week));$('week').focus({preventScroll:true});$('judgment').scrollIntoView();}};
function markNav(){
  const sections=['judgment','trend','evidence'];
  const active=sections.filter(id=>$(id).getBoundingClientRect().top<innerHeight*.30).pop()||sections[0];
  document.querySelectorAll('nav a').forEach(a=>{a.classList.toggle('active',a.hash==='#'+active);});
}
document.querySelector('.methodlink').onclick=()=>$('methodDetails').open=true;
let timer;window.addEventListener('resize',()=>{clearTimeout(timer);timer=setTimeout(renderPlot,100);});
window.addEventListener('scroll',markNav,{passive:true});
renderReport();markNav();
