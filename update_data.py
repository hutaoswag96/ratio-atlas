"""Rebuild a snapshot of completed, common weekly closes for the two indices."""
import datetime as dt
import json
import math
import subprocess
from pathlib import Path
from urllib.parse import urlencode

TARGET = Path(__file__).parent / 'dist' / 'weekly.js'
START = '2011-01-01'


def fetch(url):
    raw = subprocess.check_output(['curl', '--fail', '--silent', '--show-error',
                                   '--location', '--retry', '2', '--max-time', '35', url])
    return json.loads(raw)


def tencent(code, end):
    query = urlencode({'param': f'{code},week,{START},{end},1600,qfq'})
    bars = fetch('https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?' + query)
    return {b[0]: float(b[2]) for b in bars['data'][code]['week'] if b[0] <= end}


def snapshot(end):
    price_a = tencent('sh000922', end)
    price_b = tencent('sz399006', end)
    total_b = tencent('sz399606', end)
    query = urlencode({'indexCode': 'H00922', 'startDate': START.replace('-', ''),
                       'endDate': end.replace('-', '')})
    raw = fetch('https://www.csindex.com.cn/csindex-home/perf/index-perf?' + query)
    total_a = {r['tradeDate']: r['close'] for r in raw['data'] if r.get('close')}
    rows = []
    for date in sorted(price_a.keys() & price_b.keys() & total_b.keys()):
        red_total = total_a.get(date.replace('-', ''))
        values = [price_a[date], price_b[date], red_total, total_b[date]]
        if all(v and math.isfinite(v) and v > 0 for v in values):
            rows.append([date, *values])
    return rows


if __name__ == '__main__':
    # Use Friday's final data starting on Saturday (Shanghai time).
    today = dt.datetime.now(dt.timezone(dt.timedelta(hours=8))).date()
    end = today - dt.timedelta(days=(today.weekday()-5) % 7 + 1)
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
