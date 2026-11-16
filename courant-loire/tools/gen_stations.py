import json, sys
# Usage : python3 tools/gen_stations.py <clone de https://github.com/neaps/tide-database>
SRC = sys.argv[1].rstrip('/') + '/data/ticon/'
ST = {
 'brest':        'brest-3-fra-refmar',
 'saintNazaire': 'saint_nazaire-37-fra-refmar',
 'lePellerin':   'le_pellerin-398-fra-refmar',
 'nantesUB':     'nantes_usine_brulee-399-fra-refmar',
 'nantesSalorges':'nantes_salorges-6143-fra-refmar',
}
KEEP = ['M2','N2','S2','K2','2N2','MU2','NU2','LAMBDA2','L2','T2','R2','K1','O1','P1','Q1','S1',
        'M3','M4','MS4','MN4','N4','S4','M6','M8','2MS6','2SM2','MKS2','MSF','MM','MF','SA','SSA','MA2','MB2']
out = {}
for k, f in ST.items():
    d = json.load(open(SRC + f + '.json'))
    hc = {h['name']: h for h in d['harmonic_constituents']}
    out[k] = {
      'id': d['source']['id'], 'lat': d['latitude'], 'lon': d['longitude'],
      'msl': d['datums']['MSL'],
      'c': {n: [round(hc[n]['amplitude'], 5), round(hc[n]['phase'], 3)] for n in KEEP if n in hc},
    }
js = ('// Généré par tools/gen_stations.py à partir de TICON-4 (CC BY 4.0).\n'
      '// Hart-Davis, M., Dettmering, D., Seitz, F. (2025), TICON-4: TIdal CONstants based on GESLA-4 sea-level records,\n'
      '// SEANOE, https://doi.org/10.17882/109129 (jeux REFMAR/SHOM). Amplitudes en m, phases en degrés (UTC).\n'
      'const STATIONS = ' + json.dumps(out, separators=(',', ':')) + ';\n')
open(__import__('os').path.join(__import__('os').path.dirname(__file__), '..', 'src', 'stations-data.js'), 'w').write(js)
print(len(js), 'octets;', {k: len(v['c']) for k, v in out.items()})
