import json, os
D='data'
def L(n): return json.load(open(f'{D}/{n}.json'))
cohort,items,pays = L('cohort'),L('items'),L('pays')
key=lambda r:(r['v'],r['rc'],r['m'],r['s'])
mi={key(r):r for r in items}; mp={key(r):r for r in pays}
bench=[]
for r in cohort:
    k=key(r); i=mi.get(k,{}); p=mp.get(k,{})
    bench.append({
      'v':r['v'],'rc':r['rc'],'m':r['m'],'s':r['s'],
      'tx':r['tx'],'rev':round(r['rev'],2),'disc':round(r['disc'],2),
      'ppl':r['ppl'],'vis':r['vis'],
      'items':i.get('items',0),'food':round(i.get('food',0),2),'bev':round(i.get('bev',0),2),'oth':round(i.get('oth',0),2),
      'card':round(p.get('card',0),2),'cash':round(p.get('cash',0),2),'vouch':round(p.get('vouch',0),2),
      'comp':round(p.get('comp',0),2),'acct':round(p.get('acct',0),2),'othp':round(p.get('othp',0),2),
    })
tr=L('trading'); mem=L('member'); pr=L('promo')
venues=sorted({r['v'] for r in bench if r['v']!='*'})
rcs={}
for r in bench:
    if r['v']!='*' and r['rc']!='*': rcs.setdefault(r['v'],set()).add(r['rc'])
rcs={k:sorted(v) for k,v in rcs.items()}
months=sorted({r['m'] for r in bench if r['m']!='*'})
out={
 'meta':{'org':'Feros Group','source':'OOLIO_PLATFORM_DATALAKE_TEST.PUBLIC (Oolio One)',
         'orgId':'01KYKN7DW3KYYV1B6K539CB5F2','window':[months[0],months[-1]],
         'venues':len(venues),'revenueCentres':sum(len(v) for v in rcs.values()),
         'built':'2026-08-10'},
 'venues':venues,'rcs':rcs,'months':months,
 'bench':bench,
 'daypart':tr['dp'],'dow':tr['dow'],'hourly':tr['hr'],
 'heatmap':L('heatmap'),
 'freq':L('freq'),
 'flow':mem['flow'],'retention':mem['retention'],'venuespread':mem['venuespread'],'pairs':mem['pairs'],
 'promoTag':pr['bytag'],'promoImpacted':pr['impacted'],
 'crossover':L('crossover')['cross'],
 'products':L('products'),
}
os.makedirs('app/public',exist_ok=True)
json.dump(out,open('app/public/dataset.json','w'),separators=(',',':'))
print('venues',len(venues),'rcs',sum(len(v) for v in rcs.values()),'months',months)
print('size', round(os.path.getsize('app/public/dataset.json')/1024),'KB')
