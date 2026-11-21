'use strict';
const RatioModel = (() => {
  const quantile = (a, p) => {
    const x = (a.length-1)*p, lo = Math.floor(x);
    return a[lo]+(a[Math.ceil(x)]-a[lo])*(x-lo);
  };
  const levels = (prices, ps) => {
    const sorted = [...prices].sort((a,b)=>a-b);
    return ps.map(q=>quantile(sorted,q));
  };
  function prepare(data, gold) {
    const base = gold ? data[0][1]/data[0][2] : 1;
    let quarter='', bands=null;
    return data.map(([date,a,b],i) => {
      const period=date.slice(0,4)+'Q'+Math.ceil(Number(date.slice(5,7))/3);
      if(period!==quarter){
        quarter=period;
        if(i>=52) bands=levels(data.slice(i-52,i).map(v=>v[1]/v[2]/base),[.15,.35,.50,.65,.85]);
      }
      return {date,price:[a,b],r:a/b/base,bands};
    });
  }
  // All decisions are made after observing the close; orders fill one observation later.
  function simulate(rows, startDate, fixed, confirm=true) {
    const start=rows.findIndex((v,i)=>i>=4&&v.date>=startDate&&v.bands);
    if(start<0) throw Error('历史长度不足');
    const cycles=[],nav=[],marks=[];
    let cash=1,units=0,peak=1,drawdown=0,cycle=null,order=null,latest='观察两侧入区线';
    const fee=.001;
    function schedule(i,type,weight){
      order={i,type,weight};
      marks.push({i,type,side:cycle.side});
    }
    for(let i=start;i<rows.length;i++){
      const row=rows[i], prev=rows[i-1];
      latest='等待比值从中间一侧穿入首笔区';
      if(order){
        const price=row.price[cycle.side];
        if(order.type==='退出'){
          cash+=units*price*(1-fee);units=0;
          cycle.exit=i;cycle.result=cash/cycle.budget-1; cycle=null;
        }else{
          const spend=Math.min(cash,cycle.budget*order.weight);
          units+=spend/(price*(1+fee));cash-=spend;
          cycle.fills.push({i,type:order.type,weight:order.weight,price});
        }
        order=null;
      }
      const value=cash+(cycle?units*row.price[cycle.side]:0);
      peak=Math.max(peak,value); drawdown=Math.min(drawdown,value/peak-1);nav.push(value);
      if(cycle){
        cycle.peak=Math.max(cycle.peak,value);
        cycle.dd=Math.min(cycle.dd,value/cycle.peak-1);
        const {side:s,band}=cycle;
        const sign=s===0?1:-1;
        if(sign*(row.r-band[2])>=0 || Date.parse(row.date)-Date.parse(rows[cycle.entry].date)>=26*7*86400000){
          cycle.reason=sign*(row.r-band[2])>=0?'回到中位线':'满 26 周';
          cycle.exitSignal=i;schedule(i,'退出',0);latest=cycle.reason+'，下一周退出本轮';continue;
        }
        const improving=sign*(row.r-prev.r)>0 && sign*(prev.r-rows[i-2].r)>0;
        const rising=row.price[s]>rows.slice(i-3,i+1).reduce((sum,p)=>sum+p.price[s],0)/4;
        if(!cycle.deep && sign*(row.r-band[s===0?0:4])<=0){
          cycle.deep=true;schedule(i,'深区',.30);latest='深区触发，下一周模拟加 30%';
        }else if(confirm&&!cycle.confirmed&&i>=cycle.entry+2&&improving&&rising){
          cycle.confirmed=true;schedule(i,'转强',.30);latest='转强触发，下一周模拟加 30%';
        }else latest='本轮持有'+(cycle.deep?'，深区额度已用':'，保留深区额度');
        continue;
      }
      const band=fixed||row.bands;
      const s=row.r<=band[1]&&prev.r>band[1]?0:row.r>=band[3]&&prev.r<band[3]?1:-1;
      if(s>=0){
        cycle={entry:i,side:s,band,budget:cash,peak:cash,dd:0,fills:[],deep:false,confirmed:false,exit:null};
        cycles.push(cycle);schedule(i,'首笔',.40);latest='首笔触发，下一周模拟投入 40%';
      }
    }
    const end=rows.at(-1),years=(Date.parse(end.date)-Date.parse(rows[start].date))/31557600000;
    return {cycles,nav,marks,start,drawdown,total:nav.at(-1)-1,annual:nav.at(-1)**(1/years)-1,cycle,latest,order};
  }
  function passive(rows,start){
    const initial=rows[start].price;let peak=1,dd=0;
    const values=rows.slice(start).map(row=>{
      const v=.5*(row.price[0]/initial[0]+row.price[1]/initial[1])/1.001;
      peak=Math.max(v,peak);dd=Math.min(dd,v/peak-1);return v;
    });
    const years=(Date.parse(rows.at(-1).date)-Date.parse(rows[start].date))/31557600000;
    return {annual:values.at(-1)**(1/years)-1,drawdown:dd,total:values.at(-1)-1};
  }
  function allocation(r,b) {
    if(r<=b[0]) return .7;
    if(r<=b[1]) return .6;
    if(r>=b[4]) return .3;
    if(r>=b[3]) return .4;
    return .5;
  }
  function monthly(rows,start,tilt=true) {
    let cash=1,units=[0,0],queued=null,peak=1,dd=0,latest=null;
    const orders=[];
    for(let i=start;i<rows.length;i++){
      const row=rows[i],p=row.price;
      let value=cash+units[0]*p[0]+units[1]*p[1];
      if(queued){
        // Solve post-fee NAV so purchases and sales exactly finance each other.
        let after=value;
        for(let n=0;n<5;n++) after=value-.001*p.reduce((cost,px,j)=>cost+Math.abs(after*queued.weights[j]-units[j]*px),0);
        units=p.map((px,j)=>after*queued.weights[j]/px);
        cash=0;orders.push({...queued,i,after});queued=null;value=after;
      }
      peak=Math.max(peak,value);dd=Math.min(dd,value/peak-1);
      const nextWeek=new Date(Date.parse(row.date)+7*86400000).toISOString().slice(0,7);
      if(nextWeek===row.date.slice(0,7))continue;
      const w=tilt?allocation(row.r,row.bands):.5;
      latest={signal:i,weights:[w,1-w]};
      const held=units[0]*p[0]/value;
      if(cash===1||Math.abs(held-w)>=.05)queued=latest;
    }
    const p=rows.at(-1).price,end=cash+units[0]*p[0]+units[1]*p[1];
    const years=(Date.parse(rows.at(-1).date)-Date.parse(rows[start].date))/31557600000;
    return {annual:end**(1/years)-1,total:end-1,drawdown:dd,orders,latest};
  }
  return {prepare,levels,simulate,passive,monthly,allocation};
})();
