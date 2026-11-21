'use strict';
const pairs = {
  equity: {title:'中证红利 / 创业板指', category:'A 股风格  ·  000922 / 399006', names:['中证红利','创业板指'], codes:['000922','399006'], intro:'比较红利与创业板的相对价格，观察两侧的分批建仓机会。', cutoff:'2017-12-31'},
  gold: {title:'黄金 / 美国国债', category:'美元资产  ·  GLD / IEF', names:['黄金','美债'], codes:['GLD','IEF'], intro:'比较黄金与 7–10 年期美国国债的相对表现，观察黄金的候选建仓位置。', cutoff:'2023-12-31'}
};
const $ = id => document.getElementById(id);
const fmt = x => x.toFixed(3);
const pct = x => (x>0?'+':'')+(x*100).toFixed(1)+'%';
const colors = ['#007b71','#3857a6'];
const weekMs=7*86400000;
let key, cfg, rows, cuts, defaults, entries, visibleCount, windowYears=3, custom;
function quantile(sorted,q){
  const x=(sorted.length-1)*q, i=Math.floor(x);
  return sorted[i]+(sorted[Math.ceil(x)]-sorted[i])*(x-i);
}
function valid(values){return Array.isArray(values)&&values.length===4&&values.every((v,i)=>Number.isFinite(v)&&v>0&&(!i||v>values[i-1]));}
function readCuts(){
  try {const v=JSON.parse(localStorage.getItem('ratio-atlas.rules.'+key)); return valid(v)?v:null;} catch {return null;}
}
function zone(v){if(v<=cuts[0])return 0;if(v<=cuts[1])return 1;if(v>=cuts[3])return 4;if(v>=cuts[2])return 3;return 2;}
function names(){return [cfg.names[0]+'深区',cfg.names[0]+'建仓区','中间区',cfg.names[1]+'观察区',cfg.names[1]+'深区'];}
function start(){
  key=location.hash==='#gold'?'gold':'equity';cfg=pairs[key];const data=historyData[key];
  const base=key==='gold'?data[0][1]/data[0][2]:1;
  rows=data.map(([d,a,b])=>({d,a,b,r:(a/b)/base}));
  const calibration=rows.filter(p=>p.d<=cfg.cutoff).map(p=>p.r).sort((a,b)=>a-b);
  defaults=[.1,.2,.8,.9].map(q=>+quantile(calibration,q).toFixed(4));
  const saved=readCuts(); cuts=saved||defaults.slice();custom=!!saved;
  $('sample').value='after';entries=signals();if(!entries.length){$('sample').value='all';entries=signals();}visibleCount=8;
  $('direction').innerHTML='<option value="all">全部方向</option>'+cfg.names.map((n,i)=>'<option value="'+i+'">'+n+'</option>').join('');
  document.title=cfg.title+' · 比值手记';
  document.querySelectorAll('nav a').forEach(a=>{if(a.hash==='#'+key)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current');});
  render();
}
function signals(){
  const list=[]; let side=-1, deeper=false;
  function add(i,s,stage){list.push({i,s,stage});}
  for(let i=1;i<rows.length;i++){
    if($('sample').value==='after' && rows[i].d<=cfg.cutoff)continue;
    const v=rows[i].r, prev=rows[i-1].r;
    const s=v<=cuts[1]?0:v>=cuts[2]?1:-1;
    if(side!==-1 && s!==side){
      add(i,side,'回归确认');side=-1;deeper=false;
    }
    if(s<0)continue;
    if(side!==s){
      if((s===0&&prev<=cuts[1])||(s===1&&prev>=cuts[2]))continue;
      side=s;add(i,s,'首次入区');
    }
    if(!deeper&&(s===0?v<=cuts[0]:v>=cuts[3])){deeper=true;add(i,s,'深入一档');}
  }
  return list.reverse();
}
function outcomes(e){
  const enter=e.i+1, anchor=rows[enter];if(!anchor)return null;
  const endTime=Date.parse(anchor.d)+52*weekMs;
  const end=rows.findIndex((p,i)=>i>=enter&&Date.parse(p.d)>=endTime);if(end<0)return null;
  const a=e.s===0?'a':'b', b=e.s===0?'b':'a';const from=anchor[a];
  const gain=rows[end][a]/from-1,other=rows[end][b]/anchor[b]-1;
  let peak=from,dd=0,under=false,recovery=null;
  for(let i=enter+1;i<=end;i++){
    const price=rows[i][a];peak=Math.max(price,peak);dd=Math.min(dd,price/peak-1);
    if(price<from)under=true;
    if(under && recovery===null && price>=from)recovery=Math.round((Date.parse(rows[i].d)-Date.parse(anchor.d))/weekMs);
  }
  return [pct(gain),((gain-other)*100).toFixed(1)+' pp',pct(dd),!under?'未跌破':recovery===null?'期内未回本':recovery+' 周'];
}
function drawRecords(){
  const dir=$('direction').value;
  const subset=entries.filter(e=>dir==='all'||String(e.s)===dir);
  $('events').innerHTML=subset.slice(0,visibleCount).map(e=>{
    const o=outcomes(e)||['观察中','—','—','—'];
    return '<tr><td>'+rows[e.i].d+'</td><td>'+cfg.names[e.s]+' · '+e.stage+'</td><td>'+fmt(rows[e.i].r)+'</td>'+o.map(v=>'<td>'+v+'</td>').join('')+'</tr>';
  }).join('')||'<tr><td colspan="7">当前样本内尚无符合条件的触线记录。</td></tr>';
  $('recordCount').textContent='显示 '+Math.min(subset.length,visibleCount)+' / '+subset.length+' 条阶段记录';
  $('more').hidden=subset.length<=visibleCount;
}
function path(points,w,h){
  const min=Math.min(...points),span=Math.max(...points)-min||1;
  return points.map((v,i)=>(i?'L':'M')+(i*w/Math.max(1,points.length-1)).toFixed(1)+' '+(h-2-(v-min)/span*(h-4)).toFixed(1)).join(' ');
}
function chart(host,data,field,color,bands){
  const width=Math.max(280,Math.round(host.clientWidth)),height=bands?244:110;
  const l=bands?46:43,r=14,t=15,b=26,innerW=width-l-r,innerH=height-t-b;
  const vals=data.map(p=>p[field]); const limits=bands?vals.concat(cuts):vals;
  const rawMin=Math.min(...limits),rawMax=Math.max(...limits),pad=(rawMax-rawMin)*.06||1;
  const min=rawMin-pad,max=rawMax+pad;
  const y=v=>t+(max-v)/(max-min)*innerH;
  const x=i=>l+i/Math.max(1,data.length-1)*innerW;
  let content='';
  if(bands){
    const rect=(top,bottom,fill)=>'<rect x="'+l+'" y="'+y(top)+'" width="'+innerW+'" height="'+(y(bottom)-y(top))+'" fill="'+fill+'"/>';
    content+=rect(max,cuts[3],'#f3dfbc')+rect(cuts[3],cuts[2],'#fbefda')+rect(cuts[1],cuts[0],'#e2f3ed')+rect(cuts[0],min,'#cae8dc');
    for(const v of cuts)content+='<path d="M '+l+' '+y(v)+' h '+innerW+'" stroke="#96a6a1" opacity=".6" stroke-dasharray="4 5"/>';
  }
  const ticks=bands?5:3;
  for(let i=0;i<ticks;i++){
    const v=max-i*(max-min)/(ticks-1),py=y(v);
    content+='<path d="M '+l+' '+py+' h '+innerW+'" stroke="#8f9d9b" opacity=".20"/><text x="'+(l-6)+'" y="'+(py+4)+'" text-anchor="end">'+v.toFixed(bands?2:max>999?0:1)+'</text>';
  }
  const tickCount=width<470?3:5;
  for(let i=0;i<tickCount;i++){
    const j=Math.round(i*(data.length-1)/(tickCount-1));
    content+='<text x="'+x(j)+'" y="'+(height-4)+'" text-anchor="'+(i===0?'start':i===tickCount-1?'end':'middle')+'">'+data[j].d.slice(0,7)+'</text>';
  }
  const line=vals.map((v,i)=>(i?'L':'M')+x(i).toFixed(1)+' '+y(v).toFixed(1)).join(' ');
  content+='<path fill="none" stroke="'+color+'" stroke-width="'+(bands?2.5:2)+'" stroke-linejoin="round" d="'+line+'"/><circle cx="'+x(vals.length-1)+'" cy="'+y(vals.at(-1))+'" r="3.4" fill="'+color+'"/><line class="cursor" y1="'+t+'" y2="'+(height-b)+'" stroke="#485a69" stroke-dasharray="3 3" visibility="hidden"/>';
  host.innerHTML='<div class="chartbox" tabindex="0" aria-label="走势图，使用左右方向键查看各周读数"><svg viewBox="0 0 '+width+' '+height+'" role="img" aria-label="'+(bands?cfg.title:cfg.names[field==='a'?0:1])+'走势" font-size="12" font-family="monospace" fill="#536676">'+content+'</svg><output class="tooltip" hidden></output></div>';
  const box=host.firstChild,tip=box.querySelector('output'),cursor=box.querySelector('line');let active=data.length-1;
  function show(i){active=Math.max(0,Math.min(data.length-1,i));tip.textContent=data[active].d+' · '+vals[active].toFixed(bands?3:2);tip.hidden=false;tip.style.left=Math.max(0,Math.min(width-tip.offsetWidth,x(active)-60))+'px';cursor.setAttribute('x1',x(active));cursor.setAttribute('x2',x(active));cursor.setAttribute('visibility','visible');}
  function hide(){tip.hidden=true;cursor.setAttribute('visibility','hidden');}
  box.onpointermove=box.onpointerdown=e=>show(Math.round(((e.clientX-box.getBoundingClientRect().left)-l)/innerW*(data.length-1)));
  box.onpointerleave=box.onblur=hide;box.onfocus=()=>show(active);
  box.onkeydown=e=>{if(['ArrowLeft','ArrowRight'].includes(e.key)){e.preventDefault();show(active+(e.key==='ArrowRight'?1:-1));}};
}
function drawCharts(){
  const end=rows.at(-1),cutoff=Date.parse(end.d)-windowYears*365.25*86400000;
  const data=rows.filter(p=>!windowYears||Date.parse(p.d)>=cutoff);
  $('period').textContent=data[0].d+' — '+end.d+' · 周线';
  $('range').innerHTML=[1,3,5,0].map(n=>'<button aria-pressed="'+(windowYears===n)+'" data-years="'+n+'">'+(n?n+'年':'全部')+'</button>').join('');
  chart($('plot'),data,'r','#354da1',true);
  $('assets').innerHTML=cfg.names.map((name,i)=>{const f=i?'b':'a';return '<article class="asset"><div class="assethead"><h3>'+name+' <small>'+cfg.codes[i]+'</small></h3><span class="assetval">'+end[f].toFixed(2)+'</span></div><small>区间涨跌 '+pct(end[f]/data[0][f]-1)+(key==='gold'?' · 复权价（美元）':' · 指数点位')+'</small><div id="chart'+i+'"></div></article>';}).join('');
  for(let i=0;i<2;i++)chart($('chart'+i),data,i?'b':'a',colors[i],false);
}
function render(){
  const end=rows.at(-1),prev=rows.at(-2),rank=100*rows.filter(p=>p.r<=end.r).length/rows.length;
  $('title').textContent=cfg.title;$('category').textContent=cfg.category;$('intro').textContent=cfg.intro;$('asof').textContent='数据截至 '+end.d;
  const spark='<svg viewBox="0 0 90 34" aria-hidden="true"><path d="'+path(rows.slice(-35).map(p=>p.r),90,34)+'" fill="none" stroke="#3857a6" stroke-width="2"/></svg>';
  $('stats').innerHTML='<div class="stat"><div class="label">最新比值</div><div class="statrow"><span class="num">'+fmt(end.r)+'</span>'+spark+'</div><small>较上周 '+pct(end.r/prev.r-1)+'</small></div><div class="stat"><div class="label">历史分位</div><div class="num">'+rank.toFixed(1)+'<small> %</small></div><div class="track"><i style="left:'+rank+'%"></i></div><small>全部 '+rows.length+' 周</small></div><div class="stat"><div class="label">所在区域</div><div class="zoneText">'+names()[zone(end.r)]+'</div><small>'+(custom?'自定义':'历史校准')+' · 周收盘判断</small></div>';
  $('zones').innerHTML=[4,3,2,1,0].map(i=>{const label=['≤ '+fmt(cuts[0]),fmt(cuts[0])+' – '+fmt(cuts[1]),fmt(cuts[1])+' – '+fmt(cuts[2]),fmt(cuts[2])+' – '+fmt(cuts[3]),'≥ '+fmt(cuts[3])][i];return '<div class="zone"><i style="background:'+['#43977c','#89beaa','#a3b0b7','#dfbb81','#bb904c'][i]+'"></i><span>'+names()[i]+'</span><strong>'+label+'</strong></div>';}).join('');
  $('ruleNote').textContent=(custom?'自定义固定边界。':'默认边界取自 '+rows[0].d.slice(0,4)+'–'+cfg.cutoff.slice(0,4)+' 年的 10 / 20 / 80 / 90 分位。')+'首次入区、深入一档、回归中间区，分别参考一笔预留资金。';
  $('legend').innerHTML=['比值周线',cfg.names[0]+'低位区',cfg.names[1]+'相对低位区'].map((s,i)=>'<span style="--swatch:'+['#354da1','#92cbb4','#e5c799'][i]+'">'+s+'</span>').join('');
  $('recordInfo').textContent=($('sample').value==='all'?'全历史回看 · 含定线样本，属于事后试算':'自 '+(Number(cfg.cutoff.slice(0,4))+1)+' 年起 · '+(custom?'自定义规则事后试算':'固定阈值验证'))+' · '+(key==='gold'?'复权收益':'指数价格收益，未计分红');
  $('method').innerHTML='<p>'+ (key==='gold'?'美元计价。用黄金 ETF（GLD）和 7–10 年期美国国债 ETF（IEF）的周复权收盘价计算，各自在 '+rows[0].d+' 归一为 1 后相除。周次以周五标记。行情来源 <a href="https://stockanalysis.com/etf/gld/history/">GLD 历史行情</a>、<a href="https://stockanalysis.com/etf/ief/history/">IEF 历史行情</a>。':'比值为中证红利（000922）收盘点位除以创业板指（399006）收盘点位。行情取自腾讯证券周线，共同日期对齐。指数说明见 <a href="https://oss-ch.csindex.com.cn/static/html/csindex/public/uploads/indices/detail/files/zh_CN/000922factsheet.pdf">中证红利</a>、<a href="https://www.cnindex.com.cn/docs/gz_399006.pdf">创业板指</a>。')+'</p><p>按周收盘确认信号。每轮行情在同一档只记录一次，回到中间区或穿越另一侧时结束本轮。三档分别作为本次预算三等份的候选时点。各笔独立试算，未计费用，未合并成组合收益。固定边界不随图表区间改变。</p><p>以信号后下一条周收盘价为起点，取满 52 个日历周后的首条共同记录作为终点。¹ 两项资产涨跌幅之差，以百分点（pp）表示。最大回撤按期间周收盘峰谷计算。² 首次跌破买入成本后，重新达到成本时离买入周的周数。未满一年的记录显示观察中。</p><p>数据为截至 '+end.d+' 的历史快照。历史分位按当前全部样本计算，仅供定位。候选区间用于个人策略试算。</p>';
  drawCharts();drawRecords();
}
$('range').onclick=e=>{if(e.target.dataset.years!==undefined){windowYears=Number(e.target.dataset.years);drawCharts();}};
$('sample').onchange=()=>{entries=signals();visibleCount=8;render();};
$('direction').onchange=()=>{visibleCount=8;drawRecords();};
$('more').onclick=()=>{visibleCount+=12;drawRecords();};
function fields(values){$('fields').innerHTML=[cfg.names[0]+'深区上界',cfg.names[0]+'建仓上界',cfg.names[1]+'观察下界',cfg.names[1]+'深区下界'].map((v,i)=>'<label>'+v+'<input type="number" required min="0.0001" step="any" value="'+values[i]+'"></label>').join('');}
$('edit').onclick=()=>{fields(cuts);$('editNote').textContent=cfg.title+' · 固定比值，仅保存于本浏览器';$('err').textContent='';$('settings').showModal();};
$('reset').onclick=()=>fields(defaults);
$('cancel').onclick=()=>$('settings').close();
$('form').onsubmit=e=>{e.preventDefault();const v=Array.from($('fields').querySelectorAll('input'),el=>el.valueAsNumber);if(!valid(v)){$('err').textContent='四个边界须为正数，并从上到下严格递增。';return;}
  custom=v.some((n,i)=>n!==defaults[i]);try{if(custom)localStorage.setItem('ratio-atlas.rules.'+key,JSON.stringify(v));else localStorage.removeItem('ratio-atlas.rules.'+key);}catch{$('err').textContent='浏览器禁止本地保存，请允许存储后重试。';return;}
  cuts=v;entries=signals();visibleCount=8;$('settings').close();render();
};
window.addEventListener('hashchange',()=>{start();window.scrollTo(0,0);});
let timer;window.addEventListener('resize',()=>{clearTimeout(timer);timer=setTimeout(drawCharts,120);});
start();
