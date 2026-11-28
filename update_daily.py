"""Build daily close and total-return snapshots, checked against weekly marks."""
import datetime as dt
import json
import math
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from urllib.parse import urlencode

from update_data import fetch

ROOT = Path(__file__).resolve().parent

weekly = json.loads((ROOT/'dist/weekly.js').read_text().split(' = ',1)[1].rstrip(';\n'))
# 全历史：日频从周线第一个共同交易周开始，和回测区间保持一致。
official = weekly
first = official[0][0]
now = dt.datetime.now(dt.timezone(dt.timedelta(hours=8)))
last = (now.date() if now.hour >= 16 else now.date()-dt.timedelta(days=1)).isoformat()


def dividend_closes():
    params = urlencode(dict(indexCode='H00922',startDate=first.replace('-',''),endDate=last.replace('-','')))
    raw = fetch('https://www.csindex.com.cn/csindex-home/perf/index-perf?'+params)
    return {dt.datetime.strptime(row['tradeDate'],'%Y%m%d').date().isoformat():float(row['close'])
            for row in raw['data'] if row.get('close')}


def price_year(task):
    symbol, year = task
    beginning = f'{year}-01-01'
    ending = min(last, f'{year}-12-31')
    params = urlencode({'param': f'{symbol},day,{beginning},{ending},325,'})
    raw = fetch('https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?'+params)
    data = raw['data'][symbol]['day']
    return symbol, {row[0]:float(row[2]) for row in data if max(first, beginning) <= row[0] <= ending}


years = range(int(first[:4]),int(last[:4])+1)
quotes = {symbol: {} for symbol in ('sh000922', 'sz399006', 'sz399606')}
with ThreadPoolExecutor(max_workers=6) as pool:
    dividend_task = pool.submit(dividend_closes)
    for symbol, chunk in pool.map(price_year, ((symbol, year) for symbol in quotes for year in years)):
        quotes[symbol].update(chunk)
    dividend = dividend_task.result()
growth = quotes['sz399606']
red_prices, growth_prices = quotes['sh000922'], quotes['sz399006']
dates = sorted(dividend.keys() & growth.keys())
assert len(dates) >= 3000
assert all(math.isfinite(value) and value>0 for date in dates for value in (dividend[date],growth[date]))
# The exchanges were closed on 2018-06-18 for the Dragon Boat Festival.
# https://www.szse.cn/disclosure/notice/general/t20171222_502255.html
missing = sorted((dividend.keys() ^ growth.keys()) - {'2018-06-18'})
missing = [date for date in missing if date <= dates[-1]]
assert not missing, f'Missing daily quotes within common period: {missing}'
price_dates = sorted((red_prices.keys() & growth_prices.keys()) - {'2018-06-18'})
assert set(dates).issubset(price_dates), 'Missing price index data for a verified trading day'
assert all(math.isfinite(value) and value>0 for day in price_dates for value in (red_prices[day],growth_prices[day]))
for date, weekly_red_price, weekly_growth_price, weekly_dividend, weekly_growth in official:
    assert abs(red_prices[date]-weekly_red_price) <= .011, (date,red_prices[date],weekly_red_price)
    assert abs(growth_prices[date]-weekly_growth_price) <= .011, (date,growth_prices[date],weekly_growth_price)
    assert abs(dividend[date]-weekly_dividend) <= .011, (date,dividend[date],weekly_dividend)
    assert abs(growth[date]-weekly_growth) <= .011, (date,growth[date],weekly_growth)
snapshots = [
    ('daily-returns.js', 'dailyTotalReturns', [[day,dividend[day],growth[day]] for day in dates]),
    ('daily-prices.js', 'dailyPriceSnapshot', [[day,red_prices[day],growth_prices[day]] for day in price_dates]),
]
staged = []
for file, name, data in snapshots:
    target = ROOT / 'dist' / file
    if target.exists():
        old = json.loads(target.read_text().split(' = ',1)[1].rstrip(';\n'))
        assert {row[0] for row in old}.issubset({row[0] for row in data}), f'{file} would discard verified days'
    staged.append((target, 'const '+name+' = '+json.dumps(data,separators=(',',':'))+';\n'))
for target, payload in staged:
    temp = target.with_suffix('.tmp')
    temp.write_text(payload)
    temp.replace(target)
print(len(dates), 'return marks;', len(price_dates), 'price marks through', price_dates[-1], '; weekly marks checked', len(official))
