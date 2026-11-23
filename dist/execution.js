'use strict';

const TRACKED_FUNDS = [
 {
  indexCode: '000922', code: '515080', name: '招商中证红利ETF', exchange: '上交所',
  source: 'https://www.sse.com.cn/disclosure/fund/announcement/c/new/2026-03-24/515080_20260324_TG47.pdf'
 },
 {
  indexCode: '399006', code: '159915', name: '易方达创业板ETF', exchange: '深交所',
  source: 'https://investor.szse.cn/institute/rules/t20230828_603016.html'
 }
];

function renderFundList() {
 $('fund-list').innerHTML = TRACKED_FUNDS.map((fund, i) => `
  <article class="fund-row" id="fund-${i}">
   <div><h3>${fund.name}</h3><p>跟踪 ${ASSETS[i]} <code>${fund.indexCode}</code></p></div>
   <div class="fund-code"><span>${fund.exchange}交易代码</span><strong>${fund.code}</strong></div>
   <a href="${fund.source}" target="_blank" rel="noopener noreferrer">交易所披露</a>
  </article>`).join('');
}

function renderExecution(container, held, stage, nextBuy) {
 const orders = [];
 if (stage) {
  const clearingTime = stage === 1 ? '再下一交易周收盘' : '下一交易周收盘';
  if (stage === 1) orders.push({ kind:'sell', asset:held, time:'下一交易周收盘', size:'卖出当前持有份额的 50%' });
  orders.push({ kind:'sell', asset:held, time:clearingTime, size:'卖清剩余的全部份额' });
  orders.push({ kind:'buy', asset:1-held, time:'同一交易日，旧仓卖清后', size:'用卖清后本策略资金的 20% 买入第一笔' });
 } else if (nextBuy) {
  orders.push({ kind:'buy', asset:nextBuy.asset, time:'下一交易周收盘', size:'参考预算 ¥'+fmt(nextBuy.budget) });
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
  const title = selling ? '卖出当前持有的'+ASSETS[order.asset]+' ETF' : '买入'+ASSETS[order.asset]+' ETF';
  return `<li class="order-row ${order.kind}">
   <span class="order-time">${order.time}</span>
   <div><strong>${title}</strong><p>${order.size}</p></div>
   <div class="order-fund">${selling
    ? '<span>基金代码以账户持仓为准</span>'
    : '<a href="#fund-'+order.asset+'">'+fund.name+' <code>'+fund.code+'</code></a>'}</div>
  </li>`;
 }).join('');
 const note = stage ? '<p class="meta">先确认旧仓卖清、资金可用，再买入新仓。</p><h4 class="old-positions">旧仓建仓记录</h4>' : '';
 container.querySelector('.steps').insertAdjacentHTML('beforebegin', '<section class="execution-orders"><h4>操作顺序</h4><ol>'+list+'</ol>'+note+'</section>');
}
