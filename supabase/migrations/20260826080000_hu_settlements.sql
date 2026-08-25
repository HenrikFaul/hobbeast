-- Hungarian settlement coordinates for the map search.
--
-- Only 2 of 1441 active programs carry coordinates, but 1038 carry a city name,
-- so the map aggregates on the city. Geocoding every event through an external
-- API would be slow, quota-bound and needless: this static table covers every
-- city present in the data plus all county seats, so new sources appear on the
-- map immediately.

CREATE TABLE IF NOT EXISTS public.hu_settlements (
  name_normalized text PRIMARY KEY,
  display_name text NOT NULL,
  county text NOT NULL,
  lat double precision NOT NULL,
  lon double precision NOT NULL
);

ALTER TABLE public.hu_settlements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Settlement coordinates are public reference data" ON public.hu_settlements;
CREATE POLICY "Settlement coordinates are public reference data"
  ON public.hu_settlements FOR SELECT TO anon, authenticated USING (true);

GRANT SELECT ON public.hu_settlements TO anon, authenticated;

INSERT INTO public.hu_settlements (name_normalized, display_name, county, lat, lon) VALUES
  ('budapest', 'Budapest', 'Budapest', 47.4979, 19.0402),
  ('szombathely', 'Szombathely', 'Vas', 47.2307, 16.6218),
  ('nyiregyhaza', 'Nyíregyháza', 'Szabolcs-Szatmár-Bereg', 47.9554, 21.7167),
  ('gyor', 'Győr', 'Győr-Moson-Sopron', 47.6875, 17.6504),
  ('mor', 'Mór', 'Fejér', 47.3767, 18.2044),
  ('szazhalombatta', 'Százhalombatta', 'Pest', 47.3167, 18.9333),
  ('szentendre', 'Szentendre', 'Pest', 47.6667, 19.0833),
  ('mohacs', 'Mohács', 'Baranya', 45.993, 18.6828),
  ('kisber', 'Kisbér', 'Komárom-Esztergom', 47.5, 18.0333),
  ('zamardi', 'Zamárdi', 'Somogy', 46.8833, 17.95),
  ('bekesszentandras', 'Békésszentandrás', 'Békés', 46.8667, 20.4833),
  ('debrecen', 'Debrecen', 'Hajdú-Bihar', 47.5316, 21.6273),
  ('koszeg', 'Kőszeg', 'Vas', 47.3892, 16.5411),
  ('hegyko', 'Hegykő', 'Győr-Moson-Sopron', 47.6167, 16.7833),
  ('hortobagy', 'Hortobágy', 'Hajdú-Bihar', 47.5833, 21.15),
  ('matrafured', 'Mátrafüred', 'Heves', 47.8333, 19.9833),
  ('bekescsaba', 'Békéscsaba', 'Békés', 46.6833, 21.1),
  ('pecs', 'Pécs', 'Baranya', 46.0727, 18.2323),
  ('szeged', 'Szeged', 'Csongrád-Csanád', 46.253, 20.1414),
  ('veszprem', 'Veszprém', 'Veszprém', 47.0933, 17.9114),
  ('kistelek', 'Kistelek', 'Csongrád-Csanád', 46.4667, 19.9833),
  ('visonta', 'Visonta', 'Heves', 47.7833, 20.0333),
  ('szekesfehervar', 'Székesfehérvár', 'Fejér', 47.186, 18.4221),
  ('kecskemet', 'Kecskemét', 'Bács-Kiskun', 46.9062, 19.6913),
  ('dunaharaszti', 'Dunaharaszti', 'Pest', 47.35, 19.1),
  ('kaposvar', 'Kaposvár', 'Somogy', 46.3594, 17.7968),
  ('hodmezovasarhely', 'Hódmezővásárhely', 'Csongrád-Csanád', 46.4181, 20.33),
  ('balatonboglar', 'Balatonboglár', 'Somogy', 46.7772, 17.6503),
  ('szarvas', 'Szarvas', 'Békés', 46.8628, 20.5544),
  ('tallya', 'Tállya', 'Borsod-Abaúj-Zemplén', 48.2333, 21.2333),
  ('zirc', 'Zirc', 'Veszprém', 47.2622, 17.8722),
  ('miskolc', 'Miskolc', 'Borsod-Abaúj-Zemplén', 48.1035, 20.7784),
  ('eger', 'Eger', 'Heves', 47.9028, 20.3772),
  ('szolnok', 'Szolnok', 'Jász-Nagykun-Szolnok', 47.1747, 20.1986),
  ('tatabanya', 'Tatabánya', 'Komárom-Esztergom', 47.5692, 18.4048),
  ('salgotarjan', 'Salgótarján', 'Nógrád', 48.1, 19.8),
  ('szekszard', 'Szekszárd', 'Tolna', 46.3475, 18.7061),
  ('zalaegerszeg', 'Zalaegerszeg', 'Zala', 46.8417, 16.8416),
  ('sopron', 'Sopron', 'Győr-Moson-Sopron', 47.685, 16.5833),
  ('esztergom', 'Esztergom', 'Komárom-Esztergom', 47.7853, 18.7403),
  ('godollo', 'Gödöllő', 'Pest', 47.6, 19.35),
  ('vac', 'Vác', 'Pest', 47.7761, 19.13),
  ('siofok', 'Siófok', 'Somogy', 46.9061, 18.0575),
  ('keszthely', 'Keszthely', 'Zala', 46.7683, 17.2431),
  ('gyula', 'Gyula', 'Békés', 46.65, 21.2833),
  ('baja', 'Baja', 'Bács-Kiskun', 46.1811, 18.955),
  ('dunaujvaros', 'Dunaújváros', 'Fejér', 46.9619, 18.9355),
  ('nagykanizsa', 'Nagykanizsa', 'Zala', 46.459, 16.9897),
  ('pannonhalma', 'Pannonhalma', 'Győr-Moson-Sopron', 47.55, 17.75),
  ('etyek', 'Etyek', 'Fejér', 47.45, 18.75),
  ('revfulop', 'Révfülöp', 'Veszprém', 46.8283, 17.6425),
  ('balatonfuzfo', 'Balatonfűzfő', 'Veszprém', 47.0561, 18.0364),
  ('balatonudvari', 'Balatonudvari', 'Veszprém', 46.8833, 17.7667),
  ('orfu', 'Orfű', 'Baranya', 46.15, 18.15),
  ('holloko', 'Hollókő', 'Nógrád', 47.9958, 19.5872),
  ('koroshegy', 'Köröshegy', 'Somogy', 46.8167, 17.8667)
ON CONFLICT (name_normalized) DO UPDATE
  SET display_name = EXCLUDED.display_name,
      county = EXCLUDED.county,
      lat = EXCLUDED.lat,
      lon = EXCLUDED.lon;
