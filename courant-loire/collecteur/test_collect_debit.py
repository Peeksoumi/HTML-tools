# python3 test_collect_debit.py  (Hub'Eau simulé : pas de réseau)
import csv, os, tempfile, unittest
import collect_debit as c

PAYLOAD = {"data": [
    {"date_obs": "2026-11-16T08:20:00Z", "resultat_obs": 850000.0},
    {"date_obs": "2026-11-16T08:10:00Z", "resultat_obs": 851500.0},
    {"date_obs": "2026-11-16T08:00:00Z", "resultat_obs": None},
]}


class T(unittest.TestCase):
    def test_conversion_et_dedoublonnage(self):
        rows = c.rows_from(PAYLOAD)
        self.assertEqual(rows, [("2026-11-16T08:20:00Z", 850.0), ("2026-11-16T08:10:00Z", 851.5)])
        with tempfile.TemporaryDirectory() as d:
            p = os.path.join(d, "sub", "q.csv")
            self.assertEqual(c.append_new(p, rows), 2)
            self.assertEqual(c.append_new(p, rows), 0)  # relancé : rien de nouveau
            more = rows + [("2026-11-16T08:30:00Z", 849.0)]
            self.assertEqual(c.append_new(p, more), 1)
            lignes = list(csv.reader(open(p, encoding="utf8")))
            self.assertEqual(lignes[0], ["date_obs_utc", "station", "debit_m3s"])
            self.assertEqual(len(lignes), 4)


unittest.main()
