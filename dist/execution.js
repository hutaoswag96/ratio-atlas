'use strict';

const TRACKED_FUNDS = [
 {
  indexCode: '000922', a: '012643', c: '012644', target: '515080', name: '招商中证红利ETF联接',
  source: 'https://www.cmfchina.com/fundarticle/20250221/20013834729655.pdf'
 },
 {
  indexCode: '399006', a: '110026', c: '004744', target: '159915', name: '易方达创业板ETF联接',
  source: 'https://www.efunds.com.cn/Mobile/fund/004744.shtml'
 }
];

function renderFundList() {
 $('fund-list').innerHTML = TRACKED_FUNDS.map((fund, i) => `
  <article class="fund-row" id="fund-${i}">
   <div><h3>${fund.name}</h3><p>标的指数 ${ASSETS[i]} <code>${fund.indexCode}</code> · 目标 ETF <code>${fund.target}</code></p></div>
   <div class="fund-code"><span>A 类</span><strong>${fund.a}</strong><span>C 类</span><strong>${fund.c}</strong></div>
   <a href="${fund.source}" target="_blank" rel="noopener noreferrer">基金公司资料</a>
  </article>`).join('');
}

function renderExecution(container, held, stage, nextBuy, actual=false) {
 const orders = [];
 const buy = actual ? '申购' : '买入';
 const sell = actual ? '赎回' : '卖出';
 const clear = actual ? '赎回全部剩余份额' : '卖清剩余的全部份额';
 const nextWeek = actual ? '下一交易周，按平台受理时间提交' : '下一交易周收盘';
 if (stage) {
  const clearingTime = stage === 1 ? (actual?'再下一交易周':'再下一交易周收盘') : nextWeek;
  if (stage === 1) orders.push({ kind:'sell', asset:held, time:nextWeek, size:sell+'当前持有份额的 50%' });
  orders.push({ kind:'sell', asset:held, time:clearingTime, size:clear });
  orders.push({
   kind:'buy', asset:1-held,
   time:actual?'确认全部赎回且款项可用后':'同一交易日，模拟旧仓卖清后',
   size:'用本策略资金的 20% '+buy+'第一笔'
  });
 } else if (nextBuy) {
  orders.push({ kind:'buy', asset:nextBuy.asset, time:nextWeek, size:'参考预算 ¥'+fmt(nextBuy.budget) });
 }
 if (!orders.length) {
  if (held !== null) {
   const other = 1-held;
   const threshold = other === 1 ? '进入高位观察区，观察期内比值低于 13 周均值' : '进入低位观察区，观察期内比值高于 13 周均值';
   container.insertAdjacentHTML('beforeend', '<p class="hold-trigger">换仓条件 · '+ASSETS[other]+threshold+'。</p>');
  }
  return;
 }
 const list = orders.map(order => {
  const selling = order.kind === 'sell', fund = TRACKED_FUNDS[order.asset];
  const title = selling ? sell+'当前持有的'+ASSETS[order.asset]+'基金' : buy+fund.name;
  const fundLabel = selling ? '<span>基金代码以账户持仓为准</span>' :
   '<a href="#fund-'+order.asset+'">A 类 <code>'+fund.a+'</code> · C 类 <code>'+fund.c+'</code></a>';
  return `<li class="order-row ${order.kind}">
   <span class="order-time">${order.time}</span>
   <div><strong>${title}</strong><p>${order.size}</p></div>
   <div class="order-fund">${fundLabel}</div>
  </li>`;
 }).join('');
 const settlement = actual?'以销售平台显示的申请受理、净值确认和到账时间为准。':'场外实际换仓时，等旧基金赎回款可用后再申购新基金。';
 const note = stage ? '<p class="meta">'+settlement+'</p><h4 class="old-positions">旧仓建仓记录</h4>' : '';
 container.querySelector('.steps').insertAdjacentHTML('beforebegin', '<section class="execution-orders"><h4>操作顺序</h4><ol>'+list+'</ol>'+note+'</section>');
}
