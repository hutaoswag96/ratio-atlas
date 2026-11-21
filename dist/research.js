'use strict';
const $=id=>document.getElementById(id);
const percent=n=>(n>0?'+':'')+(n*100).toFixed(2)+'%';
const number=n=>n.toFixed(3);
const money=n=>'¥'+Math.round(n).toLocaleString('zh-CN');
const profiles={
  equity:{title:'中证红利 / 创业板指',names:['中证红利','创业板指'],codes:['000922','399006'],market:'A 股风格',start:'2018-01-01'},
  gold:{title:'黄金 / 美国国债',names:['黄金','美债'],codes:['GLD','IEF'],market:'美元资产',start:'2024-01-01'}
};
let key,profile,rows,comparison,tactical,without,tilt,neutral,mode='entry',years=3,limit=6;
function openPair(){
  key=location.hash==='#gold'?'gold':'equity';profile=profiles[key];
  rows=RatioModel.prepare(historyData[key],key==='gold');
  const fixed=RatioModel.levels(rows.filter(r=>r.date<profile.start).map(r=>r.r),[.10,.20,.50,.80,.90]);
  tactical=RatioModel.simulate(rows,profile.start,null,true);
  without=RatioModel.simulate(rows,profile.start,null,false);
  tilt=RatioModel.monthly(rows,tactical.start);
  neutral=RatioModel.monthly(rows,tactical.start,false);
  comparison=[
    ['原固定区间＋同一分批规则',RatioModel.simulate(rows,profile.start,fixed)],
    ['季度区间 · 首笔＋深区',without],['季度区间 · 加入转强补仓',tactical],
    ['月度检查 · 比值倾斜',tilt],['月度检查 · 固定五五',neutral],
    ['起始各半 · 买入持有',RatioModel.passive(rows,tactical.start)]
  ];
  $('market').textContent=profile.market+'   /   '+profile.codes.join(' : ');
  $('title').textContent=profile.title;document.title=profile.title+' · 比值手记';
  $('date').textContent=rows.at(-1).date;
  $('legacy').href='fixed.html#'+key;
  document.querySelectorAll('nav a').forEach(a=>{if(a.hash==='#'+key)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current')});
  setMode(mode);drawMarket();drawTests();notes();
}
function drawMarket(){
  const end=rows.at(-1),v=end.r,b=end.bands,n=profile.names;
  $('quote').textContent=number(v);$('change').textContent='较上周 '+percent(v/rows.at(-2).r-1);
  const labels=[n[1]+'深区',n[1]+'首笔区','中间区',n[0]+'首笔区',n[0]+'深区'];
  const rank=v>=b[4]?0:v>=b[3]?1:v<=b[0]?4:v<=b[1]?3:2;
  const thresholds=['≥ '+number(b[4]),number(b[3])+' – '+number(b[4]),number(b[1])+' – '+number(b[3]),number(b[0])+' – '+number(b[1]),'≤ '+number(b[0])];
  $('zone').textContent=labels[rank];$('fresh').textContent=without.order?'本周新信号 · '+without.order.type:'本周无新增分批指令';$('cal').textContent=end.date.slice(0,4)+' 年第 '+Math.ceil(Number(end.date.slice(5,7))/3)+' 季度 · 前 52 条周线定线';
  $('ladder').innerHTML=labels.map((name,i)=>'<div class="level '+(i===rank?'on':'')+'"><span>'+name+'</span><code>'+thresholds[i]+'</code></div>').join('');
  const data=rows.filter(p=>years===0||Date.parse(p.date)>=Date.parse(end.date)-31557600000*years);
  $('ranges').innerHTML=[1,3,5,0].map(n=>'<button data-years="'+n+'" aria-pressed="'+(n===years)+'">'+(n?n+'年':'全部')+'</button>').join('');
  $('chartPeriod').textContent=data[0].date.slice(0,7)+' — '+end.date.slice(0,7);
  plot($('plot'),data,'r');
  $('assets').innerHTML=n.map((name,i)=>'<article class="asset"><div><b>'+name+'</b><small>'+profile.codes[i]+'</small></div><div class="mini" id="mini'+i+'"></div><div class="price">'+end.price[i].toFixed(2)+'<small>区间 '+percent(end.price[i]/data[0].price[i]-1)+'</small></div></article>').join('');
  n.forEach((_,i)=>plot($('mini'+i),data,i));
}
function plot(host,data,field){
  const large=field==='r',width=Math.max(50,host.clientWidth),height=large?238:52;
  const l=large?42:1,r=large?14:2,t=large?17:4,b=large?25:4;
  const values=data.map(p=>large?p.r:p.price[field]);
  const available=data.map((p,i)=>({p,i})).filter(o=>o.p.bands);
  const scale=large?values.concat(available.flatMap(({p})=>[p.bands[0],p.bands[4]])):values;
  const lo=Math.min(...scale),span=Math.max(...scale)-lo||1;
  const x=i=>l+(width-l-r)*i/(data.length-1),y=v=>t+(height-t-b)*(1.04-(v-lo)/span)/1.08;
  const coord=(i,v)=>x(i).toFixed(1)+' '+y(v).toFixed(1);
  const d=values.map((v,i)=>(i?'L':'M')+coord(i,v)).join(' ');
  let s='';
  if(large){
    function stepped(k){
      return available.flatMap(({p,i},j)=>j&&p.bands[k]!==available[j-1].p.bands[k]?[[i,available[j-1].p.bands[k]],[i,p.bands[k]]]:[[i,p.bands[k]]]);
    }
    for(const [a,z,fill] of [[0,1,'#214b48'],[3,4,'#4a493a']]){
      const area=stepped(a).concat(stepped(z).reverse());
      if(area.length)s+='<path d="'+area.map(([i,v],j)=>(j?'L':'M')+coord(i,v)).join(' ')+'Z" fill="'+fill+'"/>';
    }
    for(let i=0;i<4;i++){
      const v=lo+span*i/3;s+='<path d="M '+l+' '+y(v)+' H '+(width-r)+'" stroke="#769196" opacity=".29"/><text x="'+(l-5)+'" y="'+(y(v)+4)+'" text-anchor="end">'+v.toFixed(2)+'</text>';
    }
    s+='<path d="'+stepped(2).map(([i,v],j)=>(j?'L':'M')+coord(i,v)).join(' ')+'" stroke="#cfb987" fill="none" stroke-dasharray="4 5"/>';
    const ticks=width<450?3:6;
    for(let j=0;j<ticks;j++){
      const i=Math.round(j*(data.length-1)/(ticks-1));s+='<text x="'+x(i)+'" y="'+(height-4)+'" text-anchor="'+(j===0?'start':j===ticks-1?'end':'middle')+'">'+data[i].date.slice(0,7)+'</text>';
    }
  }
  const color=large?'#cde9dc':field===0?'#277b65':'#a67636';
  s+='<path d="'+d+'" stroke="'+color+'" stroke-linejoin="round" stroke-width="'+(large?2.4:1.7)+'" fill="none"/><circle cx="'+x(data.length-1)+'" cy="'+y(values.at(-1))+'" r="3" fill="'+color+'"/>';
  if(large){
    for(const c of tactical.cycles){
      const j=data.indexOf(rows[c.entry]);
      if(j>=0) s+='<circle cx="'+x(j)+'" cy="'+y(values[j])+'" r="4" stroke="#122d36" stroke-width="1.5" fill="#f2c77b"><title>'+rows[c.entry].date+' '+profile.names[c.side]+'首笔信号</title></circle>';
    }
  }
  host.innerHTML='<div class="plotbox" tabindex="0" aria-label="'+(large?'比值':profile.names[field])+'，方向键查周线"><svg role="img" aria-label="历史走势" viewBox="0 0 '+width+' '+height+'" fill="#c1d0d0" font-family="monospace" font-size="12">'+s+'<line y1="'+t+'" y2="'+(height-b)+'" stroke="'+color+'" opacity=".8" stroke-dasharray="2 3" visibility="hidden"/></svg><output class="tip" hidden></output></div>';
  const box=host.firstChild,tip=box.lastChild,cursor=box.querySelector('line');let index=data.length-1;
  function show(i){index=Math.max(0,Math.min(data.length-1,i));tip.hidden=false;tip.textContent=data[index].date+' · '+values[index].toFixed(large?3:2);tip.style.left=Math.max(0,Math.min(width-tip.offsetWidth,x(index)-60))+'px';cursor.setAttribute('x1',x(index));cursor.setAttribute('x2',x(index));cursor.setAttribute('visibility','visible');}
  box.onpointermove=box.onpointerdown=e=>show(Math.round((e.clientX-box.getBoundingClientRect().left-l)/(width-l-r)*(data.length-1)));
  box.onfocus=()=>show(index);box.onblur=box.onpointerleave=()=>{tip.hidden=true;cursor.setAttribute('visibility','hidden');};
  box.onkeydown=e=>{if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();show(index+(e.key==='ArrowLeft'?-1:1))}};
}
function setMode(selected){
  mode=selected;limit=6;
  document.querySelectorAll('#modes button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.mode===mode)));
  $('filter').innerHTML='<option value="all">全部方向</option>'+profile.names.map((n,i)=>'<option value="'+i+'">'+(mode==='entry'?n:n+'权重较高')+'</option>').join('')+(mode==='monthly'?'<option value="balanced">五五配置</option>':'');
  plan();log();
}
function plan(){
  const budget=$('budget').valueAsNumber;
  const amount=w=>budget>=1&&budget<=1e8?money(budget*w):'—';
  const row=(w,name,explain)=>'<div class="step"><b>'+Math.round(w*100)+'%</b><div><strong>'+name+'</strong><small>'+explain+'</small></div><span class="amount">'+amount(w)+'</span></div>';
  $('experiment').hidden=mode!=='entry';
  if(mode==='entry'){
    const model=$('confirmation').checked?tactical:without;
    $('planTitle').textContent='从现金开始，分三笔观察';
    $('planCopy').textContent='每周收盘检查一次。一轮只选一项资产，剩余资金保留现金。百分比均按本轮开始时的专项预算计算。';
    $('steps').innerHTML=row(.4,'首笔建仓','比值首次向下穿过 35 分位选'+profile.names[0]+'，向上穿过 65 分位选'+profile.names[1]+'。')+row(.3,'深区加仓','首笔之后，周末比值仍达到本轮 15 或 85 分位才触发。')+row(.3,$('confirmation').checked?'转强补仓（试算）':'留存现金',$('confirmation').checked?'至少两周后，比值连续两周向所选资产有利方向走，其价格高于最近四周均价。无需先到深区。':'转强补仓默认关闭。首笔后直接反弹时，已投入的 40% 随标的波动，其余资金继续等待。');
    const active=model.cycle;
    $('now').textContent='最新模拟状态：'+model.latest+'。'+(active?'本轮锁定中位线 '+number(active.band[2])+'。':'当前区域只描述位置；已错过首次穿线时继续等待。')+'回到本轮中位线或满 26 周，下一周收盘退出。';
  }else{
    const w=tilt.latest.weights[0],n=profile.names;
    $('planTitle').textContent='两项都愿意持有，再调整比例';
    $('planCopy').textContent='每月最后一个预计周末检查一次。中间区各半，首笔区偏向相对弱的一侧至 60%，深区至 70%。';
    $('steps').innerHTML=row(w,n[0]+'目标持仓','上次月检的目标总额，扣除已有持仓才是所需交易额。')+row(1-w,n[1]+'目标持仓','投入金额按同一专项预算折算。');
    $('now').textContent='最近月检 '+rows[tilt.latest.signal].date+'。首次建仓或实际权重偏离目标至少 5 个百分点时，下一周收盘调回目标。未到深区已有 60% 的偏向，无需追涨补齐。';
  }
}
function drawTests(){
  const start=rows[tactical.start].date,end=rows.at(-1).date;
  $('testPeriod').textContent=start+' — '+end;
  const cell=n=>'<td class="'+(n<0?'negative':'')+'">'+percent(n)+'</td>';
  $('bench').innerHTML=comparison.map(([name,m])=>{
    const count=m.cycles?m.cycles.length+' 轮':m.orders?m.orders.length+' 次':'1 次';
    return '<tr><td>'+name+'</td><td>'+count+'</td>'+cell(m.total)+cell(m.annual)+cell(m.drawdown)+'</tr>';
  }).join('');
  const diff=(tactical.annual-without.annual)*100, lag=(neutral.annual-tilt.annual)*100;
  $('finding').textContent='计入转强补仓后，分批策略年化收益'+(Math.abs(diff)<.005?'几乎持平':(diff>0?'增加 ':'减少 ')+Math.abs(diff).toFixed(2)+' 个百分点')+'。月度比值倾斜同期'+(lag>=0?'落后':'领先')+'固定五五 '+Math.abs(lag).toFixed(2)+' 个百分点。';
  $('limits').textContent='一个资金池连续试算。现金收益为零，买卖每侧费用假设 0.10%。首笔轮数与月度调仓次数含义不同。'+(key==='equity'?'指数价格收益未计分红，尤其会低估持有红利的回报。':'以美元计，未计人民币汇率、税款；黄金侧样本很少。')+'这些方案是在看过本段历史后研究的，尚无上线后的独立验证。';
}
function log(){
  const names=profile.names,f=$('filter').value;
  let records,heads;
  if(mode==='entry'){
    $('logTitle').textContent='分批建仓记录';const all=($('confirmation').checked?tactical:without).cycles;
    const closed=all.filter(c=>c.exit!==null);
    const rebounds=closed.filter(c=>!c.deep&&c.confirmed);
    $('logInfo').textContent=names.map((n,i)=>n+' '+all.filter(c=>c.side===i).length+' 轮').join(' · ')+'。已结束 '+closed.length+' 轮，其中 '+closed.filter(c=>!c.deep).length+' 轮未到深区。'+($('confirmation').checked?'其中 '+rebounds.length+' 轮触发过转强补仓。':'当前显示关闭转强补仓的结果。');
    heads=['首笔信号周','资产','实际投入 / 本轮预算','退出周 / 原因','本轮收益','本轮最大回撤'];
    records=all.filter(c=>f==='all'||c.side===Number(f)).map(c=>[rows[c.entry].date,names[c.side],c.fills.map(k=>k.type+' '+Math.round(k.weight*100)+'%').join(' + ')||'待执行',c.exit!==null?rows[c.exit].date+' · '+c.reason:'进行中',c.exit!==null?percent(c.result):'—',percent(c.dd)]);
  }else{
    $('logTitle').textContent='月度实际调仓记录';$('logInfo').textContent='只列发生模拟成交的周。'+names.join(' / ')+' 依次对应表中的目标权重。';
    heads=['判断周','执行周',names[0]+'目标',names[1]+'目标','成交后账户净值'];
    records=tilt.orders.filter(o=>f==='all'||(f==='balanced'?o.weights[0]===.5:f==='0'?o.weights[0]>.5:o.weights[1]>.5)).map(o=>[rows[o.signal].date,rows[o.i].date,Math.round(o.weights[0]*100)+'%',Math.round(o.weights[1]*100)+'%',o.after.toFixed(4)]);
  }
  $('log').innerHTML='<table><thead><tr>'+heads.map(h=>'<th>'+h+'</th>').join('')+'</tr></thead><tbody>'+records.reverse().slice(0,limit).map(r=>'<tr>'+r.map(c=>'<td>'+c+'</td>').join('')+'</tr>').join('')+(records.length?'':'<tr><td colspan="'+heads.length+'">当前方向暂无记录</td></tr>')+'</tbody></table>';
  $('more').hidden=records.length<=limit;
}
function notes(){
  $('method').innerHTML='<p>比值分位表示相对价格在历史样本中的位置。每季度第一条记录前，以此前 52 条共同周线排序，取第 15、35、50、65、85 百分位，本季度冻结。分批策略整轮沿用入场时的边界；图上的色带随季度更新。早期不足 52 条周线的时段只画价格。</p><p>所有交易在信号出现后的下一条共同周收盘执行，每周至多一笔。退出优先，其次深区，最后转强；每档每轮只用一次。错过首次穿线就等待下一次穿线。直接越过退出线时结束本轮，即使仍有现金。空仓后才能开始下一轮。</p><p>月检取日期加七天即跨月的共同周线。月度固定五五使用相同检查和 5 个百分点偏离门槛。买入持有基准在试算首周各买一半，不再调整。表中年化为账户复合增长率，最大回撤为周末净值从历史高点到随后低点的最大跌幅；期末按市值标记。</p><p>原固定区间用试算开始前的历史定线，取 10、20、50、80、90 分位。对比表为公平比较沿用新版资金和退出规则，旧版触线清单另保留。收益均为基于周线的模拟结果，日内跌幅可能更深。先使用模拟预算；应急金、近期要花的钱请单独保留。</p><p>'+ (key==='gold'?'用 GLD 与 IEF 的美元复权收盘价，以首个共同周为基日计算相对净值。<a href="https://stockanalysis.com/etf/gld/history/">黄金行情</a> · <a href="https://www.ishares.com/us/products/239456/ishares-7-10-year-treasury-bond-etf-ief">美债基金口径</a>':'行情来自腾讯证券的中证红利与创业板指共同周收盘。指数无法直接成交，实际基金回报还受分红、费率、跟踪误差影响。<a href="https://oss-ch.csindex.com.cn/static/html/csindex/public/uploads/indices/detail/files/zh_CN/000922factsheet.pdf">中证红利</a> · <a href="https://www.cnindex.com.cn/docs/gz_399006.pdf">创业板指</a>')+'</p>';
}
$('ranges').onclick=e=>{if(e.target.dataset.years!==undefined){years=Number(e.target.dataset.years);drawMarket();}};
$('modes').onclick=e=>{if(e.target.dataset.mode)setMode(e.target.dataset.mode);};
$('filter').onchange=()=>{limit=6;log();};$('more').onclick=()=>{limit+=10;log();};$('budget').oninput=plan;$('confirmation').onchange=()=>{plan();log();};
window.addEventListener('hashchange',()=>{openPair();window.scrollTo(0,0);});
let timer;window.addEventListener('resize',()=>{clearTimeout(timer);timer=setTimeout(drawMarket,100);});
openPair();
