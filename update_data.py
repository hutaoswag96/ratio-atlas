"""Rebuild a snapshot of completed, common weekly closes for the two indices."""
import datetime as dt
import json
import math
import subprocess
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from urllib.parse import urlencode

TARGET = Path(__file__).parent / 'dist' / 'weekly.js'
# 创业板指（399006）基日为 2010-05-31，两条全收益指数也要对齐到同一周，
# 因此 2010-06 是这两条线共同可得的最早起点。
START = '2010-06-01'


def fetch(url):
    raw = subprocess.check_output(['curl', '--fail', '--silent', '--show-error',
                                   '--location', '--retry', '2', '--max-time', '35', url])
    return json.loads(raw)


def tencent(code, end):
    query = urlencode({'param': f'{code},week,{START},{end},1600,qfq'})
    bars = fetch('https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?' + query)
    return {b[0]: float(b[2]) for b in bars['data'][code]['week'] if b[0] <= end}


def red_total(end):
    """H00922 逐年取：整段一次请求的响应会被网关截断。"""
    def one(year):
        query = urlencode({'indexCode': 'H00922', 'startDate': f'{year}0101',
                           'endDate': f'{year}1231'})
        raw = fetch('https://www.csindex.com.cn/csindex-home/perf/index-perf?' + query)
        out = {}
        for row in raw.get('data') or []:
            if row.get('close'):
                day = row['tradeDate']
                out[f'{day[:4]}-{day[4:6]}-{day[6:8]}'] = row['close']
        return out
    merged = {}
    years = range(int(START[:4]), int(end[:4]) + 1)
    with ThreadPoolExecutor(max_workers=6) as pool:
        for chunk in pool.map(one, years):
            merged.update(chunk)
    return merged


def snapshot(end):
    price_a = tencent('sh000922', end)
    price_b = tencent('sz399006', end)
    total_b = tencent('sz399606', end)
    total_a = red_total(end)
    rows = []
    for date in sorted(price_a.keys() & price_b.keys() & total_b.keys()):
        red_total_close = total_a.get(date)
        values = [price_a[date], price_b[date], red_total_close, total_b[date]]
        if all(v and math.isfinite(v) and v > 0 for v in values):
            rows.append([date, *values])
    return rows


if __name__ == '__main__':
    # Latest Friday whose 15:00 close has passed (Shanghai time).
    now = dt.datetime.now(dt.timezone(dt.timedelta(hours=8)))
    today = now.date()
    friday = today - dt.timedelta(days=(today.weekday() - 4) % 7)
    if friday == today and now.hour < 15:
        friday -= dt.timedelta(days=7)
    end = friday
    rows = snapshot(end.isoformat())
    if len(rows) < 750 or (end - dt.date.fromisoformat(rows[-1][0])).days > 14:
        raise ValueError('Incomplete weekly series')
    if TARGET.exists():
        old = json.loads(TARGET.read_text().split(' = ', 1)[1].rstrip(';\n'))
        if not {r[0] for r in old}.issubset({r[0] for r in rows}):
            raise ValueError('Refresh would discard previously verified weeks')
    tmp = TARGET.with_suffix('.tmp')
    tmp.write_text('const weeklyData = ' + json.dumps(rows, separators=(',', ':')) + ';\n')
    tmp.replace(TARGET)
    print(f'{len(rows)} common observations, {rows[0][0]} to {rows[-1][0]}')
