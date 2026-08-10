import json, gzip, os

d = json.load(open('app/public/dataset.json'))

# String pool: every repeated label becomes an integer index.
pool, pidx = [], {}
def S(x):
    if x is None: x = ''
    if x not in pidx:
        pidx[x] = len(pool); pool.append(x)
    return pidx[x]

# Money is rounded to whole dollars everywhere except unit prices, where cents
# carry meaning. At these magnitudes the rounding is immaterial (<$0.50/cell).
def R(x, keep2=False):
    if x is None: return 0
    if isinstance(x, float): return round(x, 2) if keep2 else round(x)
    return x

def table(rows, cols, strcols, cents=()):
    return [[S(r.get(c)) if c in strcols else R(r.get(c, 0), c in cents) for c in cols] for r in rows]

out = {'meta': d['meta'], 'p': pool}
specs = {
 'bench':   (['v','rc','m','s','tx','rev','disc','ppl','vis','items','food','bev','oth','card','cash','vouch','comp','acct','othp'], {'v','rc','m','s'}),
 'daypart': (['v','m','k','tx','rev','vis','items','food','bev'], {'v','m','k'}),
 'dow':     (['v','m','k','tx','rev','vis','items'], {'v','m'}),
 'freq':    (['venue','month','cohort','persons','visits','tx','revenue'], {'venue','month','cohort'}),
 'flow':    (['venue','month','persons','visits','revenue','new','returning'], {'venue','month'}),
 'retention':(['venue','month','retained','base'], {'venue','month'}),
 'venuespread':(['venues','members'], set()),
 'pairs':   (['a','b','n'], {'a','b'}),
 'promoTag':(['v','m','c','t','txs','impRev','disc','lines','units'], {'v','m','c','t'}),
 'promoImpacted':(['v','m','txs','rev','disc','memTxs'], {'v','m'}),
 'crossover':(['v','m','p','visits','rev','tx','mem'], {'v','m','p'}),
 'products':(['v','n','t','qty','rev','cost','price'], {'v','n','t'}),
}
schema = {}
for k, (cols, strc) in specs.items():
    out[k] = table(d[k], cols, strc, cents={'price'} if k == 'products' else ())
    schema[k] = {'cols': cols, 'str': sorted(strc)}
out['schema'] = schema
out['venues'] = [S(v) for v in d['venues']]
out['months'] = [S(m) for m in d['months']]
out['rcs'] = {str(S(k)): [S(x) for x in v] for k, v in d['rcs'].items()}
out['heatmap'] = {str(S(k)): v for k, v in d['heatmap'].items()}

s = json.dumps(out, separators=(',', ':'))
gz = gzip.compress(s.encode(), 9)
open('app/public/dataset.bin', 'wb').write(gz)
print('pool', len(pool), '| json', len(s)//1024, 'KB | gz', len(gz)//1024, 'KB | b64', len(gz)*4//3//1024, 'KB')
