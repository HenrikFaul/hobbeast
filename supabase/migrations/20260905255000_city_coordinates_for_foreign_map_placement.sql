-- Külföldi programok térképi elhelyezése.
--
-- Mérés a fejlesztés előtt: a geo_places gazetteer CSAK magyar településeket
-- tartalmaz, és a külföldi external_events sorok közül NULLA darabnak volt
-- koordinátája. A térképes nézet emiatt üres maradt minden külföldi szűrésre —
-- nem hibaüzenettel, hanem csendben.
--
-- A megoldás szándékosan NEM geokódoló szolgáltatás: az futásidőben hálózatot,
-- kulcsot, rate limitet és egy új külső függést hozna be egy olyan feladatért,
-- aminek a válasza néhány száz, évekig változatlan koordináta. Ez itt adat.
--
-- A kulcs a fold_city_label()-lel normalizált városnév, nem a nyers
-- location_city: így a 'Kraków' és a 'Krakow' ugyanarra a sorra talál, és a
-- city_aliases-szal együtt minden írásmód egyetlen kanonikus városra fut.
CREATE TABLE IF NOT EXISTS public.city_coordinates (
  country_code  text        NOT NULL,
  city_norm     text        NOT NULL,
  display_city  text        NOT NULL,
  lat           double precision NOT NULL,
  lon           double precision NOT NULL,
  -- 'city'   = a település központja
  -- 'region' = tartomány/megye szintű gyűjtőhely (pl. Steiermark)
  -- 'venue'  = konkrét helyszín, aminek nincs önálló települése (pl. Kluže)
  precision     text        NOT NULL DEFAULT 'city',
  note          text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT city_coordinates_pkey PRIMARY KEY (country_code, city_norm),
  CONSTRAINT city_coordinates_precision CHECK (precision = ANY (ARRAY['city','region','venue'])),
  CONSTRAINT city_coordinates_lat_range CHECK (lat >= -90 AND lat <= 90),
  CONSTRAINT city_coordinates_lon_range CHECK (lon >= -180 AND lon <= 180)
);

ALTER TABLE public.city_coordinates ENABLE ROW LEVEL SECURITY;

-- Nyilvános gazetteer: olvasható mindenkinek, írni csak service_role tud —
-- nincs INSERT/UPDATE/DELETE policy, ezért az RLS minden írást elutasít.
DROP POLICY IF EXISTS city_coordinates_readable ON public.city_coordinates;
CREATE POLICY city_coordinates_readable ON public.city_coordinates
  FOR SELECT USING (true);

INSERT INTO public.city_coordinates (country_code, city_norm, display_city, lat, lon, precision) VALUES
  ('AT', 'altaussee', 'Altaussee', 47.6333, 13.7667, 'city'),
  ('AT', 'angerberg', 'Angerberg', 47.5167, 11.9833, 'city'),
  ('AT', 'bad waltersdorf', 'Bad Waltersdorf', 47.1667, 15.95, 'city'),
  ('AT', 'gleinstatten', 'Gleinstätten', 46.75, 15.3667, 'city'),
  ('AT', 'graz', 'Graz', 47.0707, 15.4395, 'city'),
  ('AT', 'hopfgarten im brixental', 'Hopfgarten im Brixental', 47.45, 12.15, 'city'),
  ('AT', 'innsbruck', 'Innsbruck', 47.2692, 11.4041, 'city'),
  ('AT', 'jochberg', 'Jochberg', 47.3833, 12.4167, 'city'),
  ('AT', 'kaindorf', 'Kaindorf', 47.1667, 15.9167, 'city'),
  ('AT', 'kelchsau', 'Kelchsau', 47.4167, 12.1, 'city'),
  ('AT', 'kirchberg in tirol', 'Kirchberg in Tirol', 47.45, 12.3167, 'city'),
  ('AT', 'kirchbichl', 'Kirchbichl', 47.5167, 12.0833, 'city'),
  ('AT', 'kirchdorf in tirol', 'Kirchdorf in Tirol', 47.5333, 12.4, 'city'),
  ('AT', 'kitzbuhel', 'Kitzbühel', 47.4467, 12.3919, 'city'),
  ('AT', 'linz', 'Linz', 48.3069, 14.2858, 'city'),
  ('AT', 'neuberg/murz', 'Neuberg/Mürz', 47.6667, 15.5833, 'city'),
  ('AT', 'salzburg', 'Salzburg', 47.8095, 13.055, 'city'),
  ('AT', 'salzkammergut', 'Salzkammergut', 47.7, 13.6167, 'region'),
  ('AT', 'st. johann in tirol', 'St. Johann in Tirol', 47.5231, 12.4239, 'city'),
  ('AT', 'st. ulrich am pillersee', 'St. Ulrich am Pillersee', 47.5667, 12.6167, 'city'),
  ('AT', 'steiermark', 'Steiermark', 47.2, 15, 'region'),
  ('AT', 'tragoss - st. katharein', 'Tragöß - St. Katharein', 47.5333, 15.0833, 'city'),
  ('AT', 'vordernberg', 'Vordernberg', 47.55, 14.9833, 'city'),
  ('AT', 'waidring', 'Waidring', 47.5833, 12.5667, 'city'),
  ('AT', 'wien', 'Wien', 48.2082, 16.3738, 'city'),
  ('AT', 'worgl', 'Wörgl', 47.4903, 12.0664, 'city'),
  ('CZ', 'brezina', 'Březina', 49.25, 16.75, 'city'),
  ('CZ', 'brno', 'Brno', 49.1951, 16.6068, 'city'),
  ('CZ', 'ceske budejovice', 'České Budějovice', 48.9745, 14.4747, 'city'),
  ('CZ', 'chomutov', 'Chomutov', 50.4603, 13.4178, 'city'),
  ('CZ', 'chudenice', 'Chudenice', 49.4667, 13.1833, 'city'),
  ('CZ', 'horka nad moravou', 'Horka nad Moravou', 49.6333, 17.2, 'city'),
  ('CZ', 'hradec kralove', 'Hradec Králové', 50.2092, 15.8328, 'city'),
  ('CZ', 'karlovy vary', 'Karlovy Vary', 50.2306, 12.872, 'city'),
  ('CZ', 'liberec', 'Liberec', 50.7663, 15.0543, 'city'),
  ('CZ', 'marianske lazne', 'Mariánské Lázně', 49.9647, 12.7011, 'city'),
  ('CZ', 'nymburk', 'Nymburk', 50.1861, 15.0419, 'city'),
  ('CZ', 'olomouc', 'Olomouc', 49.5938, 17.2509, 'city'),
  ('CZ', 'ostrava', 'Ostrava', 49.8209, 18.2625, 'city'),
  ('CZ', 'pardubice', 'Pardubice', 50.0343, 15.7812, 'city'),
  ('CZ', 'plzen', 'Plzeň', 49.7384, 13.3736, 'city'),
  ('CZ', 'praha', 'Praha', 50.0755, 14.4378, 'city'),
  ('CZ', 'prostejov', 'Prostějov', 49.472, 17.1118, 'city'),
  ('CZ', 'rosice', 'Rosice', 49.1833, 16.3833, 'city'),
  ('CZ', 'slavkov u brna', 'Slavkov u Brna', 49.1533, 16.8767, 'city'),
  ('CZ', 'tanvald', 'Tanvald', 50.7375, 15.3067, 'city'),
  ('CZ', 'telc', 'Telč', 49.1841, 15.4527, 'city'),
  ('CZ', 'vrane nad vltavou', 'Vrané nad Vltavou', 49.9333, 14.3667, 'city'),
  ('CZ', 'zlin', 'Zlín', 49.2264, 17.6707, 'city'),
  ('CZ', 'zubrnice', 'Zubrnice', 50.6333, 14.25, 'city'),
  ('DE', 'aachen', 'Aachen', 50.7753, 6.0839, 'city'),
  ('DE', 'altengronau', 'Altengronau', 50.2833, 9.55, 'city'),
  ('DE', 'bad honnef', 'Bad Honnef', 50.645, 7.2272, 'city'),
  ('DE', 'bensheimerhof, riedstadt', 'Riedstadt', 49.8333, 8.5, 'city'),
  ('DE', 'bonn', 'Bonn', 50.7374, 7.0982, 'city'),
  ('DE', 'dusseldorf', 'Düsseldorf', 51.2277, 6.7735, 'city'),
  ('DE', 'engenbachgelande, kirchzarten', 'Kirchzarten', 47.9667, 7.95, 'city'),
  ('DE', 'goldenstedt', 'Goldenstedt', 52.7833, 8.4333, 'city'),
  ('DE', 'kassel', 'Kassel', 51.3127, 9.4797, 'city'),
  ('DE', 'kirn', 'Kirn', 49.7889, 7.4583, 'city'),
  ('DE', 'lehrte', 'Lehrte', 52.3667, 9.9833, 'city'),
  ('DE', 'mecklenburg-vorpommern', 'Mecklenburg-Vorpommern', 53.6127, 12.4296, 'region'),
  ('DE', 'mulheim an der ruhr', 'Mülheim an der Ruhr', 51.4275, 6.8825, 'city'),
  ('DE', 'munchen', 'München', 48.1351, 11.582, 'city'),
  ('DE', 'neuenrade', 'Neuenrade', 51.2833, 7.7833, 'city'),
  ('DE', 'oberndorf', 'Oberndorf', 48.2833, 8.5667, 'city'),
  ('DE', 'oberstdorf / tiefenbach', 'Oberstdorf', 47.4094, 10.2794, 'city'),
  ('DE', 'oberstdorf', 'Oberstdorf', 47.4094, 10.2794, 'city'),
  ('DE', 'odenthal-eikamp', 'Odenthal', 51.0333, 7.1167, 'city'),
  ('DE', 'rheine', 'Rheine', 52.2799, 7.4408, 'city'),
  ('DE', 'sarstedt', 'Sarstedt', 52.2333, 9.85, 'city'),
  ('DE', 'schleswig-holstein', 'Schleswig-Holstein', 54.2194, 9.6961, 'region'),
  ('DE', 'schwerin', 'Schwerin', 53.6355, 11.4012, 'city'),
  ('DE', 'tiefenbach', 'Tiefenbach', 47.4333, 10.25, 'city'),
  ('PL', 'bielsko-biala', 'Bielsko-Biała', 49.8224, 19.0584, 'city'),
  ('PL', 'gdansk', 'Gdańsk', 54.352, 18.6466, 'city'),
  ('PL', 'gdynia', 'Gdynia', 54.5189, 18.5305, 'city'),
  ('PL', 'gliwice', 'Gliwice', 50.2945, 18.6714, 'city'),
  ('PL', 'gomunice', 'Gomunice', 51.2167, 19.5, 'city'),
  ('PL', 'katowice', 'Katowice', 50.2649, 19.0238, 'city'),
  ('PL', 'krakow', 'Kraków', 50.0647, 19.945, 'city'),
  ('PL', 'lodz', 'Łódź', 51.7592, 19.456, 'city'),
  ('PL', 'lublin', 'Lublin', 51.2465, 22.5684, 'city'),
  ('PL', 'ostrowiec swietokrzyski', 'Ostrowiec Świętokrzyski', 50.9294, 21.3856, 'city'),
  ('PL', 'poznan', 'Poznań', 52.4064, 16.9252, 'city'),
  ('PL', 'skarzysko-kamienna', 'Skarżysko-Kamienna', 51.1153, 20.8783, 'city'),
  ('PL', 'sulecin', 'Sulęcin', 52.4444, 15.1181, 'city'),
  ('PL', 'szczecin', 'Szczecin', 53.4285, 14.5528, 'city'),
  ('PL', 'torun', 'Toruń', 53.0138, 18.5984, 'city'),
  ('PL', 'tychy', 'Tychy', 50.1372, 18.9662, 'city'),
  ('PL', 'warszawa', 'Warszawa', 52.2297, 21.0122, 'city'),
  ('PL', 'wroclaw', 'Wrocław', 51.1079, 17.0385, 'city'),
  ('PL', 'zabrze', 'Zabrze', 50.3249, 18.7857, 'city'),
  ('PL', 'zakopane', 'Zakopane', 49.2992, 19.9496, 'city'),
  ('SI', 'alpinum juliana alpine botanical garden', 'Alpinum Juliana', 46.3333, 13.6167, 'venue'),
  ('SI', 'bled', 'Bled', 46.3683, 14.1146, 'city'),
  ('SI', 'bovec', 'Bovec', 46.3378, 13.5525, 'city'),
  ('SI', 'hut at the source of the soca river', 'Izvir Soče', 46.3833, 13.6667, 'venue'),
  ('SI', 'kluze fortress', 'Kluže', 46.35, 13.5833, 'venue'),
  ('SI', 'koper', 'Koper', 45.5481, 13.7302, 'city'),
  ('SI', 'ljubljana', 'Ljubljana', 46.0569, 14.5058, 'city'),
  ('SI', 'maribor', 'Maribor', 46.5547, 15.6459, 'city'),
  ('SI', 'muzej na prostem vodice', 'Muzej na prostem Vodice', 46.25, 13.65, 'venue'),
  ('SI', 'portoroz', 'Portorož', 45.5144, 13.5906, 'city'),
  ('SI', 'the small soca gorge', 'Mala korita Soče', 46.3167, 13.6667, 'venue'),
  ('SK', 'bratislava', 'Bratislava', 48.1486, 17.1077, 'city')
ON CONFLICT (country_code, city_norm) DO NOTHING;
