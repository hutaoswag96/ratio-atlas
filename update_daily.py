"""Build common total-return index closes and reconcile every existing weekly mark."""
import datetime as dt
import json
import math
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from urllib.parse import urlencode

from update_data import fetch

ROOT = Path(__file__).resolve().parent

weekly = json.loads((ROOT/'dist/weekly.js').read_text().split(' = ',1)[1].rstrip(';\n'))
official = weekly[156:]
first = official[0][0]
now = dt.datetime.now(dt.timezone(dt.timedelta(hours=8)))
last = (now.date() if now.hour >= 16 else now.date()-dt.timedelta(days=1)).isoformat()


def dividend_closes():
    params = urlencode(dict(indexCode='H00922',startDate=first.replace('-',''),endDate=last.replace('-','')))
    raw = fetch('https://www.csindex.com.cn/csindex-home/perf/index-perf?'+params)
    return {dt.datetime.strptime(row['tradeDate'],'%Y%m%d').date().isoformat():float(row['close'])
            for row in raw['data'] if row.get('close')}


def growth_year(year):
    beginning = max(first, f'{year}-01-01')
    ending = min(last, f'{year}-12-31')
    params = urlencode({'param': f'sz399606,day,{beginning},{ending},325,'})
    raw = fetch('https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?'+params)
    data = raw['data']['sz399606']['day']
    return {row[0]:float(row[2]) for row in data if beginning <= row[0] <= ending}


with ThreadPoolExecutor(max_workers=5) as pool:
    dividend_task = pool.submit(dividend_closes)
    growth = {}
    for chunk in pool.map(growth_year,range(int(first[:4]),int(last[:4])+1)):
        growth.update(chunk)
    dividend = dividend_task.result()
dates = sorted(dividend.keys() & growth.keys())
assert len(dates) >= 3000
assert all(math.isfinite(value) and value>0 for date in dates for value in (dividend[date],growth[date]))
# The exchanges were closed on 2018-06-18 for the Dragon Boat Festival.
# https://www.szse.cn/disclosure/notice/general/t20171222_502255.html
missing = sorted((dividend.keys() ^ growth.keys()) - {'2018-06-18'})
missing = [date for date in missing if date <= dates[-1]]
assert not missing, f'Missing daily quotes within common period: {missing}'
for date, _, _, weekly_dividend, weekly_growth in official:
    assert abs(dividend[date]-weekly_dividend) <= .011, (date,dividend[date],weekly_dividend)
    assert abs(growth[date]-weekly_growth) <= .011, (date,growth[date],weekly_growth)
data = [[date,dividend[date],growth[date]] for date in dates]
target = ROOT / 'dist/daily-returns.js'
if target.exists():
    old = json.loads(target.read_text().split(' = ',1)[1].rstrip(';\n'))
    assert {row[0] for row in old}.issubset(dates), 'Refresh would discard verified days'
temp = target.with_suffix('.tmp')
temp.write_text('const dailyTotalReturns = '+json.dumps(data,separators=(',',':'))+';\n')
temp.replace(target)
print(len(data),data[0],data[-1], 'weekly marks checked',len(official))
