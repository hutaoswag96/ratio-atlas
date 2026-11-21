"""Rebuild the weekly history, using matching trading dates for each pair."""
import datetime as dt
import json
import subprocess
from pathlib import Path
from urllib.parse import urlencode

ROOT = Path(__file__).resolve().parent
START = '2011-01-01'
TODAY = dt.date.today().isoformat()


def get(url):
    result = subprocess.check_output(['curl', '--retry', '2', '-fsSL', '--max-time', '35', url])
    return json.loads(result)


def index_prices(code):
    params = urlencode({'param': f'{code},week,{START},{TODAY},1600,qfq'})
    reply = get('https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?' + params)
    return {v[0]: float(v[2]) for v in reply['data'][code]['week']}


def etf_prices(symbol):
    bars = get(f'https://stockanalysis.com/api/symbol/e/{symbol}/history?range=10Y&period=Weekly')['data']
    # Weekly bars use Monday labels. Store the Friday of each completed week.
    result = {}
    for bar in bars:
        monday = dt.date.fromisoformat(bar['t'])
        friday = monday + dt.timedelta(days=4-monday.weekday())
        if friday.isoformat() < TODAY and bar.get('a', 0) > 0:
            result[friday.isoformat()] = float(bar['a'])
    return result


def weekly(left, right):
    weeks = {}
    for date in sorted(left.keys() & right.keys()):
        weeks[dt.date.fromisoformat(date).isocalendar()[:2]] = [date, round(left[date], 5), round(right[date], 5)]
    rows = list(weeks.values())
    if len(rows) < 200:
        raise ValueError('Insufficient shared history')
    return rows


if __name__ == '__main__':
    equity = weekly(index_prices('sh000922'), index_prices('sz399006'))
    gold = weekly(etf_prices('GLD'), etf_prices('IEF'))
    history = {'equity': equity, 'gold': gold}
    target = ROOT / 'dist' / 'history.js'
    if target.exists():
        previous = json.loads(target.read_text().split(' = ', 1)[1].rstrip(';\n'))
        for key, new in history.items():
            old = previous[key]
            old_map = {r[0]: r for r in old}
            first = new[0]
            if first[0] not in old_map and first[0] > old[0][0]:
                raise ValueError('Cannot align history to the original base')
            prefix = [r for r in old if r[0] < first[0]]
            if prefix and key == 'gold':
                # Extend adjusted prices consistently across dividend adjustments.
                scale = [first[i] / old_map[first[0]][i] for i in (1, 2)]
                prefix = [[d, a * scale[0], b * scale[1]] for d, a, b in prefix]
            history[key] = prefix + new
    tmp = target.with_suffix('.tmp')
    tmp.write_text('const historyData = ' + json.dumps(history, separators=(',', ':')) + ';\n')
    tmp.replace(target)
    for key, rows in history.items():
        print(key, len(rows), rows[0], rows[-1])
