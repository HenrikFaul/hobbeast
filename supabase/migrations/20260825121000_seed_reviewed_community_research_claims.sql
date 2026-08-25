-- Reviewed public starter set generated from:
--   .tmp/research-quotes-20260825/processed-literature.json
-- Only the exact 30 acceptedRows are seeded. Statement, publication, author
-- and year values are copied without editorial rewriting.

BEGIN;

CREATE TABLE IF NOT EXISTS public.community_research_topics (
  topic_key text PRIMARY KEY
    CHECK (topic_key ~ '^[a-z0-9][a-z0-9_]{1,79}$'),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.community_research_topic_translations (
  topic_key text NOT NULL REFERENCES public.community_research_topics(topic_key) ON DELETE CASCADE,
  locale text NOT NULL
    CHECK (
      length(locale) BETWEEN 2 AND 35
      AND locale ~ '^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8}){0,2}$'
    ),
  label text NOT NULL CHECK (length(label) BETWEEN 1 AND 160),
  description text CHECK (description IS NULL OR length(description) BETWEEN 1 AND 1000),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (topic_key, locale)
);

CREATE TABLE IF NOT EXISTS public.community_research_claim_topics (
  claim_id uuid NOT NULL REFERENCES public.community_research_claims(id) ON DELETE CASCADE,
  topic_key text NOT NULL REFERENCES public.community_research_topics(topic_key) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (claim_id, topic_key)
);

CREATE INDEX IF NOT EXISTS community_research_claim_topics_topic_idx
  ON public.community_research_claim_topics (topic_key, claim_id);

DROP TRIGGER IF EXISTS community_research_topic_translations_updated_at
  ON public.community_research_topic_translations;
CREATE TRIGGER community_research_topic_translations_updated_at
  BEFORE UPDATE ON public.community_research_topic_translations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.community_research_topics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_research_topic_translations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_research_claim_topics ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.community_research_topics FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.community_research_topic_translations FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.community_research_claim_topics FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.community_research_topics TO service_role;
GRANT ALL ON TABLE public.community_research_topic_translations TO service_role;
GRANT ALL ON TABLE public.community_research_claim_topics TO service_role;

INSERT INTO public.community_research_topics (topic_key)
VALUES
  ('befogadas'),
  ('biztonsag'),
  ('biztonsagos_kozosseg'),
  ('gyenge_kotesek'),
  ('hozzaferhetoseg'),
  ('ismetelt_talalkozas'),
  ('kapcsolatminoseg'),
  ('kolcsonos_segites'),
  ('kolcsonos_tamogatas'),
  ('kozeliseg'),
  ('kozossegi_hidak'),
  ('kozossegi_ter'),
  ('pozitiv_elmeny'),
  ('pszichologiai_biztonsag'),
  ('rendszerszintu_kapcsolodas'),
  ('stressz'),
  ('tanulas'),
  ('tarsas_infrastruktura'),
  ('tarsas_tamogatas'),
  ('tartos_kapcsolatok'),
  ('uj_lehetosegek'),
  ('valahova_tartozas')
ON CONFLICT (topic_key) DO NOTHING;

INSERT INTO public.community_research_claims (
  canonical_key,
  source_sequence_id,
  original_locale,
  publication_year,
  source_url,
  doi,
  original_statement_sha256,
  review_status,
  publication_status,
  is_active,
  eligible_placements,
  editorial_metadata,
  reviewed_at
)
VALUES
  ('literature-source-6', 6, 'hu-HU', 1973, 'https://www.journals.uchicago.edu/doi/10.1086/225469', '10.1086/225469',
   'c67adb74b98d81d60f7899f2d7d44d00fc197337fb78c05b5721775626af5da3',
   'approved', 'published', true, ARRAY['research_feature', 'home_connection', 'explore_context']::text[],
   '{"seed_batch":"reviewed-community-literature-20260825","source_workbook":"FORRÁSOK A SZAKIRODALOMHOZ.xlsx","source_context":"kozossegi_terek_izolacio_magany_80_kutatasi_allitas.md","source_row":7,"source_sequence":6,"verification":"Elsődleges kiadói cikkoldal és absztrakt ellenőrizve 2026-08-25","evidence_type":"peer_reviewed_article","editorial_note":"Az állítás szövege változtatás nélkül került át a forrásmunkafüzetből.","processed_generated_at":"2026-08-25","source_publication_status":"published","topic_keys":["gyenge_kotesek","kozossegi_hidak","uj_lehetosegek"],"placement_basis":"topic_rules_v1","import_policy":"conservative_public_starter_set"}'::jsonb, timestamptz '2026-08-25 00:00:00+00'),
  ('literature-source-8', 8, 'hu-HU', 1995, 'https://pubmed.ncbi.nlm.nih.gov/7777651/', '10.1037/0033-2909.117.3.497',
   'a6ec77cd2a49d81633c6cee457c25b465c8a6007d6473726df4787272e282899',
   'approved', 'published', true, ARRAY['research_feature', 'home_connection', 'about_mission']::text[],
   '{"seed_batch":"reviewed-community-literature-20260825","source_workbook":"FORRÁSOK A SZAKIRODALOMHOZ.xlsx","source_context":"kozossegi_terek_izolacio_magany_80_kutatasi_allitas.md","source_row":9,"source_sequence":8,"verification":"PubMed bibliográfia és absztrakt ellenőrizve 2026-08-25","evidence_type":"peer_reviewed_review","editorial_note":"Az állítás szövege változtatás nélkül került át a forrásmunkafüzetből.","processed_generated_at":"2026-08-25","source_publication_status":"published","topic_keys":["valahova_tartozas","tartos_kapcsolatok"],"placement_basis":"topic_rules_v1","import_policy":"conservative_public_starter_set"}'::jsonb, timestamptz '2026-08-25 00:00:00+00'),
  ('literature-source-27', 27, 'hu-HU', 1985, 'https://doi.org/10.1037/0033-2909.98.2.310', '10.1037/0033-2909.98.2.310',
   '129b7bf570f4b215bc0827504872ecff3dacfcc86dab212e2e850070f922c7ed',
   'approved', 'published', true, ARRAY['research_feature', 'home_connection']::text[],
   '{"seed_batch":"reviewed-community-literature-20260825","source_workbook":"FORRÁSOK A SZAKIRODALOMHOZ.xlsx","source_context":"kozossegi_terek_izolacio_magany_80_kutatasi_allitas.md","source_row":28,"source_sequence":27,"verification":"DOI bibliográfia és a forrás absztraktja ellenőrizve 2026-08-25","evidence_type":"peer_reviewed_review","editorial_note":"Az állítás szövege változtatás nélkül került át a forrásmunkafüzetből.","processed_generated_at":"2026-08-25","source_publication_status":"published","topic_keys":["tarsas_tamogatas","stressz","kolcsonos_segites"],"placement_basis":"topic_rules_v1","import_policy":"conservative_public_starter_set"}'::jsonb, timestamptz '2026-08-25 00:00:00+00'),
  ('literature-source-28', 28, 'hu-HU', 1985, 'https://doi.org/10.1037/0033-2909.98.2.310', '10.1037/0033-2909.98.2.310',
   '2dff5ba902a5bfe4cfaaf5cd96619a35a8b39d2885a68ff6669c568b9529b6bd',
   'approved', 'published', true, ARRAY['research_feature', 'home_connection']::text[],
   '{"seed_batch":"reviewed-community-literature-20260825","source_workbook":"FORRÁSOK A SZAKIRODALOMHOZ.xlsx","source_context":"kozossegi_terek_izolacio_magany_80_kutatasi_allitas.md","source_row":29,"source_sequence":28,"verification":"DOI bibliográfia és a forrás absztraktja ellenőrizve 2026-08-25","evidence_type":"peer_reviewed_review","editorial_note":"Az állítás szövege változtatás nélkül került át a forrásmunkafüzetből.","processed_generated_at":"2026-08-25","source_publication_status":"published","topic_keys":["tarsas_tamogatas","stressz","kolcsonos_segites"],"placement_basis":"topic_rules_v1","import_policy":"conservative_public_starter_set"}'::jsonb, timestamptz '2026-08-25 00:00:00+00'),
  ('literature-source-113', 113, 'hu-HU', 2025, 'https://www.who.int/publications/i/item/978240112360', NULL,
   'f94be5eb7ed9d8390c54b1f3188ccca7d537085b5a6eee2d9d5938ec5e8180e7',
   'approved', 'published', true, ARRAY['research_feature', 'about_mission']::text[],
   '{"seed_batch":"reviewed-community-literature-20260825","source_workbook":"FORRÁSOK A SZAKIRODALOMHOZ.xlsx","source_context":"kozossegi_terek_izolacio_magany_80_kutatasi_allitas.md","source_row":114,"source_sequence":113,"verification":"WHO elsődleges jelentésoldal és teljes jelentés ellenőrizve 2026-08-25","evidence_type":"institutional_report","editorial_note":"Az állítás szövege változtatás nélkül került át a forrásmunkafüzetből.","processed_generated_at":"2026-08-25","source_publication_status":"published","topic_keys":["tarsas_infrastruktura","hozzaferhetoseg","befogadas","rendszerszintu_kapcsolodas"],"placement_basis":"topic_rules_v1","import_policy":"conservative_public_starter_set"}'::jsonb, timestamptz '2026-08-25 00:00:00+00'),
  ('literature-source-114', 114, 'hu-HU', 2025, 'https://www.who.int/publications/i/item/978240112360', NULL,
   '3594568af1c5e2e27dc1666b0506ccda37c1102d24b739e743569c1315046bb0',
   'approved', 'published', true, ARRAY['research_feature', 'about_mission']::text[],
   '{"seed_batch":"reviewed-community-literature-20260825","source_workbook":"FORRÁSOK A SZAKIRODALOMHOZ.xlsx","source_context":"kozossegi_terek_izolacio_magany_80_kutatasi_allitas.md","source_row":115,"source_sequence":114,"verification":"WHO elsődleges jelentésoldal és teljes jelentés ellenőrizve 2026-08-25","evidence_type":"institutional_report","editorial_note":"Az állítás szövege változtatás nélkül került át a forrásmunkafüzetből.","processed_generated_at":"2026-08-25","source_publication_status":"published","topic_keys":["tarsas_infrastruktura","hozzaferhetoseg","befogadas","rendszerszintu_kapcsolodas"],"placement_basis":"topic_rules_v1","import_policy":"conservative_public_starter_set"}'::jsonb, timestamptz '2026-08-25 00:00:00+00'),
  ('literature-source-115', 115, 'hu-HU', 2025, 'https://www.who.int/publications/i/item/978240112360', NULL,
   '18c19e19e657a0a3d996999cdcb67ba0a0758641c0795a4b3c2f31fbf362e28c',
   'approved', 'published', true, ARRAY['research_feature', 'about_mission']::text[],
   '{"seed_batch":"reviewed-community-literature-20260825","source_workbook":"FORRÁSOK A SZAKIRODALOMHOZ.xlsx","source_context":"kozossegi_terek_izolacio_magany_80_kutatasi_allitas.md","source_row":116,"source_sequence":115,"verification":"WHO elsődleges jelentésoldal és teljes jelentés ellenőrizve 2026-08-25","evidence_type":"institutional_report","editorial_note":"Az állítás szövege változtatás nélkül került át a forrásmunkafüzetből.","processed_generated_at":"2026-08-25","source_publication_status":"published","topic_keys":["tarsas_infrastruktura","hozzaferhetoseg","befogadas","rendszerszintu_kapcsolodas"],"placement_basis":"topic_rules_v1","import_policy":"conservative_public_starter_set"}'::jsonb, timestamptz '2026-08-25 00:00:00+00'),
  ('literature-source-118', 118, 'hu-HU', 2010, 'https://pmc.ncbi.nlm.nih.gov/articles/PMC3150158/', '10.1177/0022146510383501',
   '391f24bc1c35e35bc564b3abf82599ecfe67bc4f7f13c75bf1af53f158deb9f2',
   'approved', 'published', true, ARRAY['research_feature', 'home_connection', 'about_mission']::text[],
   '{"seed_batch":"reviewed-community-literature-20260825","source_workbook":"FORRÁSOK A SZAKIRODALOMHOZ.xlsx","source_context":"kozossegi_terek_izolacio_magany_80_kutatasi_allitas.md","source_row":119,"source_sequence":118,"verification":"Teljes lektorált cikk ellenőrizve a kiadói kézirattárban 2026-08-25","evidence_type":"peer_reviewed_review","editorial_note":"Az állítás szövege változtatás nélkül került át a forrásmunkafüzetből.","processed_generated_at":"2026-08-25","source_publication_status":"published","topic_keys":["kapcsolatminoseg","biztonsagos_kozosseg"],"placement_basis":"topic_rules_v1","import_policy":"conservative_public_starter_set"}'::jsonb, timestamptz '2026-08-25 00:00:00+00'),
  ('literature-source-121', 121, 'hu-HU', 1985, 'https://doi.org/10.1037/0033-2909.98.2.310', '10.1037/0033-2909.98.2.310',
   '4cfaf367c5b4adff2217f30943e0b362052b1ec6bfb2575b2b197a11f6d150c0',
   'approved', 'published', true, ARRAY['research_feature', 'home_connection']::text[],
   '{"seed_batch":"reviewed-community-literature-20260825","source_workbook":"FORRÁSOK A SZAKIRODALOMHOZ.xlsx","source_context":"kozossegi_terek_izolacio_magany_80_kutatasi_allitas.md","source_row":122,"source_sequence":121,"verification":"DOI bibliográfia és a forrás absztraktja ellenőrizve 2026-08-25","evidence_type":"peer_reviewed_review","editorial_note":"Az állítás szövege változtatás nélkül került át a forrásmunkafüzetből.","processed_generated_at":"2026-08-25","source_publication_status":"published","topic_keys":["tarsas_tamogatas","stressz","kolcsonos_segites"],"placement_basis":"topic_rules_v1","import_policy":"conservative_public_starter_set"}'::jsonb, timestamptz '2026-08-25 00:00:00+00'),
  ('literature-source-185', 185, 'hu-HU', 1985, 'https://doi.org/10.1037/0033-2909.98.2.310', '10.1037/0033-2909.98.2.310',
   'caf2d779d2df6de7352161ab0769f4d4b4870c90aaeb1ef9f21e594fb26e7b06',
   'approved', 'published', true, ARRAY['research_feature', 'home_connection']::text[],
   '{"seed_batch":"reviewed-community-literature-20260825","source_workbook":"FORRÁSOK A SZAKIRODALOMHOZ.xlsx","source_context":"kozossegi_terek_izolacio_magany_80_kutatasi_allitas.md","source_row":186,"source_sequence":185,"verification":"DOI bibliográfia és a forrás absztraktja ellenőrizve 2026-08-25","evidence_type":"peer_reviewed_review","editorial_note":"Az állítás szövege változtatás nélkül került át a forrásmunkafüzetből.","processed_generated_at":"2026-08-25","source_publication_status":"published","topic_keys":["tarsas_tamogatas","stressz","kolcsonos_segites"],"placement_basis":"topic_rules_v1","import_policy":"conservative_public_starter_set"}'::jsonb, timestamptz '2026-08-25 00:00:00+00'),
  ('literature-source-200', 200, 'hu-HU', 1950, 'https://books.google.com/books/about/Social_Pressures_in_Informal_Groups.html?id=J24AAAAAMAAJ', NULL,
   'da94a3cd41521d4cc312fa805feb993a59a6d649521d83fd671a7b76c3289acf',
   'approved', 'published', true, ARRAY['research_feature', 'home_connection', 'about_mission', 'explore_context']::text[],
   '{"seed_batch":"reviewed-community-literature-20260825","source_workbook":"FORRÁSOK A SZAKIRODALOMHOZ.xlsx","source_context":"kozossegi_terek_izolacio_magany_80_kutatasi_allitas.md","source_row":201,"source_sequence":200,"verification":"Kiadás, szerzők és év bibliográfiai rekordja ellenőrizve 2026-08-25","evidence_type":"research_monograph","editorial_note":"Az állítás szövege változtatás nélkül került át a forrásmunkafüzetből.","processed_generated_at":"2026-08-25","source_publication_status":"published","topic_keys":["ismetelt_talalkozas","kozossegi_ter","kozeliseg"],"placement_basis":"topic_rules_v1","import_policy":"conservative_public_starter_set"}'::jsonb, timestamptz '2026-08-25 00:00:00+00'),
  ('literature-source-201', 201, 'hu-HU', 1950, 'https://books.google.com/books/about/Social_Pressures_in_Informal_Groups.html?id=J24AAAAAMAAJ', NULL,
   '1d17ce28fc040e56a98c40840359174e0d6b19812f06ac0d9173577a115f7df5',
   'approved', 'published', true, ARRAY['research_feature', 'home_connection', 'about_mission', 'explore_context']::text[],
   '{"seed_batch":"reviewed-community-literature-20260825","source_workbook":"FORRÁSOK A SZAKIRODALOMHOZ.xlsx","source_context":"kozossegi_terek_izolacio_magany_80_kutatasi_allitas.md","source_row":202,"source_sequence":201,"verification":"Kiadás, szerzők és év bibliográfiai rekordja ellenőrizve 2026-08-25","evidence_type":"research_monograph","editorial_note":"Az állítás szövege változtatás nélkül került át a forrásmunkafüzetből.","processed_generated_at":"2026-08-25","source_publication_status":"published","topic_keys":["ismetelt_talalkozas","kozossegi_ter","kozeliseg"],"placement_basis":"topic_rules_v1","import_policy":"conservative_public_starter_set"}'::jsonb, timestamptz '2026-08-25 00:00:00+00'),
  ('literature-source-202', 202, 'hu-HU', 1968, 'https://doi.org/10.1037/h0025848', '10.1037/h0025848',
   'f74e51dbeaa2d72b47d3a81ea64ad62fb6eed9de94a26e604bff8fb9b2c5530f',
   'approved', 'published', true, ARRAY['research_feature', 'home_connection', 'about_mission', 'explore_context']::text[],
   '{"seed_batch":"reviewed-community-literature-20260825","source_workbook":"FORRÁSOK A SZAKIRODALOMHOZ.xlsx","source_context":"kozossegi_terek_izolacio_magany_80_kutatasi_allitas.md","source_row":203,"source_sequence":202,"verification":"Kiadói DOI-metaadat és absztrakt ellenőrizve 2026-08-25","evidence_type":"peer_reviewed_article","editorial_note":"Az állítás szövege változtatás nélkül került át a forrásmunkafüzetből.","processed_generated_at":"2026-08-25","source_publication_status":"published","topic_keys":["ismetelt_talalkozas","biztonsag","pozitiv_elmeny"],"placement_basis":"topic_rules_v1","import_policy":"conservative_public_starter_set"}'::jsonb, timestamptz '2026-08-25 00:00:00+00'),
  ('literature-source-205', 205, 'hu-HU', 1973, 'https://www.journals.uchicago.edu/doi/10.1086/225469', '10.1086/225469',
   'c5937aec96772928732dcac91066be2cd8dfe18756139e843e01f25b5a2a77e1',
   'approved', 'published', true, ARRAY['research_feature', 'home_connection', 'explore_context']::text[],
   '{"seed_batch":"reviewed-community-literature-20260825","source_workbook":"FORRÁSOK A SZAKIRODALOMHOZ.xlsx","source_context":"kozossegi_terek_izolacio_magany_80_kutatasi_allitas.md","source_row":206,"source_sequence":205,"verification":"Elsődleges kiadói cikkoldal és absztrakt ellenőrizve 2026-08-25","evidence_type":"peer_reviewed_article","editorial_note":"Az állítás szövege változtatás nélkül került át a forrásmunkafüzetből.","processed_generated_at":"2026-08-25","source_publication_status":"published","topic_keys":["gyenge_kotesek","kozossegi_hidak","uj_lehetosegek"],"placement_basis":"topic_rules_v1","import_policy":"conservative_public_starter_set"}'::jsonb, timestamptz '2026-08-25 00:00:00+00'),
  ('literature-source-206', 206, 'hu-HU', 1973, 'https://www.journals.uchicago.edu/doi/10.1086/225469', '10.1086/225469',
   '5c1d1ee72e0d1dbcd2a2ba94a65f66bdce2dfe93a94f26ddaadab7e9da1c3aee',
   'approved', 'published', true, ARRAY['research_feature', 'home_connection', 'explore_context']::text[],
   '{"seed_batch":"reviewed-community-literature-20260825","source_workbook":"FORRÁSOK A SZAKIRODALOMHOZ.xlsx","source_context":"kozossegi_terek_izolacio_magany_80_kutatasi_allitas.md","source_row":207,"source_sequence":206,"verification":"Elsődleges kiadói cikkoldal és absztrakt ellenőrizve 2026-08-25","evidence_type":"peer_reviewed_article","editorial_note":"Az állítás szövege változtatás nélkül került át a forrásmunkafüzetből.","processed_generated_at":"2026-08-25","source_publication_status":"published","topic_keys":["gyenge_kotesek","kozossegi_hidak","uj_lehetosegek"],"placement_basis":"topic_rules_v1","import_policy":"conservative_public_starter_set"}'::jsonb, timestamptz '2026-08-25 00:00:00+00'),
  ('literature-source-301', 301, 'hu-HU', 1950, 'https://books.google.com/books/about/Social_Pressures_in_Informal_Groups.html?id=J24AAAAAMAAJ', NULL,
   'cb9c2698e6de4bff68f0450d5708d1696eb126c3f6227618edb179ab8e603fac',
   'approved', 'published', true, ARRAY['research_feature', 'home_connection', 'about_mission', 'explore_context']::text[],
   '{"seed_batch":"reviewed-community-literature-20260825","source_workbook":"FORRÁSOK A SZAKIRODALOMHOZ.xlsx","source_context":"kozossegi_terek_izolacio_magany_80_kutatasi_allitas.md","source_row":302,"source_sequence":301,"verification":"Kiadás, szerzők és év bibliográfiai rekordja ellenőrizve 2026-08-25","evidence_type":"research_monograph","editorial_note":"Az állítás szövege változtatás nélkül került át a forrásmunkafüzetből.","processed_generated_at":"2026-08-25","source_publication_status":"published","topic_keys":["ismetelt_talalkozas","kozossegi_ter","kozeliseg"],"placement_basis":"topic_rules_v1","import_policy":"conservative_public_starter_set"}'::jsonb, timestamptz '2026-08-25 00:00:00+00'),
  ('literature-source-302', 302, 'hu-HU', 1950, 'https://books.google.com/books/about/Social_Pressures_in_Informal_Groups.html?id=J24AAAAAMAAJ', NULL,
   'e137aa926ee1fb141c044c5177ddaf5383a1263a7f14fee37dff264e2ed3eabf',
   'approved', 'published', true, ARRAY['research_feature', 'home_connection', 'about_mission', 'explore_context']::text[],
   '{"seed_batch":"reviewed-community-literature-20260825","source_workbook":"FORRÁSOK A SZAKIRODALOMHOZ.xlsx","source_context":"kozossegi_terek_izolacio_magany_80_kutatasi_allitas.md","source_row":303,"source_sequence":302,"verification":"Kiadás, szerzők és év bibliográfiai rekordja ellenőrizve 2026-08-25","evidence_type":"research_monograph","editorial_note":"Az állítás szövege változtatás nélkül került át a forrásmunkafüzetből.","processed_generated_at":"2026-08-25","source_publication_status":"published","topic_keys":["ismetelt_talalkozas","kozossegi_ter","kozeliseg"],"placement_basis":"topic_rules_v1","import_policy":"conservative_public_starter_set"}'::jsonb, timestamptz '2026-08-25 00:00:00+00'),
  ('literature-source-308', 308, 'hu-HU', 2025, 'https://www.who.int/publications/i/item/978240112360', NULL,
   '7976733769be282439a531e8c924beae8d8a818deda91a92573c4c23c0baa789',
   'approved', 'published', true, ARRAY['research_feature', 'about_mission']::text[],
   '{"seed_batch":"reviewed-community-literature-20260825","source_workbook":"FORRÁSOK A SZAKIRODALOMHOZ.xlsx","source_context":"kozossegi_terek_izolacio_magany_80_kutatasi_allitas.md","source_row":309,"source_sequence":308,"verification":"WHO elsődleges jelentésoldal és teljes jelentés ellenőrizve 2026-08-25","evidence_type":"institutional_report","editorial_note":"Az állítás szövege változtatás nélkül került át a forrásmunkafüzetből.","processed_generated_at":"2026-08-25","source_publication_status":"published","topic_keys":["tarsas_infrastruktura","hozzaferhetoseg","befogadas","rendszerszintu_kapcsolodas"],"placement_basis":"topic_rules_v1","import_policy":"conservative_public_starter_set"}'::jsonb, timestamptz '2026-08-25 00:00:00+00'),
  ('literature-source-316', 316, 'hu-HU', 1973, 'https://www.journals.uchicago.edu/doi/10.1086/225469', '10.1086/225469',
   '234f4c96961d56739ea35b9ce420d51f4c3f75db878b81bb76ca7a303efc8ef1',
   'approved', 'published', true, ARRAY['research_feature', 'home_connection', 'explore_context']::text[],
   '{"seed_batch":"reviewed-community-literature-20260825","source_workbook":"FORRÁSOK A SZAKIRODALOMHOZ.xlsx","source_context":"kozossegi_terek_izolacio_magany_80_kutatasi_allitas.md","source_row":317,"source_sequence":316,"verification":"Elsődleges kiadói cikkoldal és absztrakt ellenőrizve 2026-08-25","evidence_type":"peer_reviewed_article","editorial_note":"Az állítás szövege változtatás nélkül került át a forrásmunkafüzetből.","processed_generated_at":"2026-08-25","source_publication_status":"published","topic_keys":["gyenge_kotesek","kozossegi_hidak","uj_lehetosegek"],"placement_basis":"topic_rules_v1","import_policy":"conservative_public_starter_set"}'::jsonb, timestamptz '2026-08-25 00:00:00+00'),
  ('literature-source-317', 317, 'hu-HU', 1973, 'https://www.journals.uchicago.edu/doi/10.1086/225469', '10.1086/225469',
   '83deff1e64015b99812dd1df2dd7479be448c676a7d751ea1b3ca07f330ac952',
   'approved', 'published', true, ARRAY['research_feature', 'home_connection', 'explore_context']::text[],
   '{"seed_batch":"reviewed-community-literature-20260825","source_workbook":"FORRÁSOK A SZAKIRODALOMHOZ.xlsx","source_context":"kozossegi_terek_izolacio_magany_80_kutatasi_allitas.md","source_row":318,"source_sequence":317,"verification":"Elsődleges kiadói cikkoldal és absztrakt ellenőrizve 2026-08-25","evidence_type":"peer_reviewed_article","editorial_note":"Az állítás szövege változtatás nélkül került át a forrásmunkafüzetből.","processed_generated_at":"2026-08-25","source_publication_status":"published","topic_keys":["gyenge_kotesek","kozossegi_hidak","uj_lehetosegek"],"placement_basis":"topic_rules_v1","import_policy":"conservative_public_starter_set"}'::jsonb, timestamptz '2026-08-25 00:00:00+00'),
  ('literature-source-322', 322, 'hu-HU', 1968, 'https://doi.org/10.1037/h0025848', '10.1037/h0025848',
   '06e6a400f85d162111f1a4425c8db3d97bb7497ca54d943e70a8cd22ac149237',
   'approved', 'published', true, ARRAY['research_feature', 'home_connection', 'about_mission', 'explore_context']::text[],
   '{"seed_batch":"reviewed-community-literature-20260825","source_workbook":"FORRÁSOK A SZAKIRODALOMHOZ.xlsx","source_context":"kozossegi_terek_izolacio_magany_80_kutatasi_allitas.md","source_row":323,"source_sequence":322,"verification":"Kiadói DOI-metaadat és absztrakt ellenőrizve 2026-08-25","evidence_type":"peer_reviewed_article","editorial_note":"Az állítás szövege változtatás nélkül került át a forrásmunkafüzetből.","processed_generated_at":"2026-08-25","source_publication_status":"published","topic_keys":["ismetelt_talalkozas","biztonsag","pozitiv_elmeny"],"placement_basis":"topic_rules_v1","import_policy":"conservative_public_starter_set"}'::jsonb, timestamptz '2026-08-25 00:00:00+00'),
  ('literature-source-398', 398, 'hu-HU', 2025, 'https://www.who.int/publications/i/item/978240112360', NULL,
   '5b0d43201dbe5861a350b91b9ff6ae7c68e8a83c5ff20790cd73fdb3d799445a',
   'approved', 'published', true, ARRAY['research_feature', 'about_mission']::text[],
   '{"seed_batch":"reviewed-community-literature-20260825","source_workbook":"FORRÁSOK A SZAKIRODALOMHOZ.xlsx","source_context":"kozossegi_terek_izolacio_magany_80_kutatasi_allitas.md","source_row":399,"source_sequence":398,"verification":"WHO elsődleges jelentésoldal és teljes jelentés ellenőrizve 2026-08-25","evidence_type":"institutional_report","editorial_note":"Az állítás szövege változtatás nélkül került át a forrásmunkafüzetből.","processed_generated_at":"2026-08-25","source_publication_status":"published","topic_keys":["tarsas_infrastruktura","hozzaferhetoseg","befogadas","rendszerszintu_kapcsolodas"],"placement_basis":"topic_rules_v1","import_policy":"conservative_public_starter_set"}'::jsonb, timestamptz '2026-08-25 00:00:00+00'),
  ('literature-source-399', 399, 'hu-HU', 2025, 'https://www.who.int/publications/i/item/978240112360', NULL,
   '6e13325d0b1c1bc059d6afaaefc5f4c8fb5c9ccaf8b4296eff8354edd62bc74e',
   'approved', 'published', true, ARRAY['research_feature', 'about_mission']::text[],
   '{"seed_batch":"reviewed-community-literature-20260825","source_workbook":"FORRÁSOK A SZAKIRODALOMHOZ.xlsx","source_context":"kozossegi_terek_izolacio_magany_80_kutatasi_allitas.md","source_row":400,"source_sequence":399,"verification":"WHO elsődleges jelentésoldal és teljes jelentés ellenőrizve 2026-08-25","evidence_type":"institutional_report","editorial_note":"Az állítás szövege változtatás nélkül került át a forrásmunkafüzetből.","processed_generated_at":"2026-08-25","source_publication_status":"published","topic_keys":["tarsas_infrastruktura","hozzaferhetoseg","befogadas","rendszerszintu_kapcsolodas"],"placement_basis":"topic_rules_v1","import_policy":"conservative_public_starter_set"}'::jsonb, timestamptz '2026-08-25 00:00:00+00'),
  ('literature-source-435', 435, 'hu-HU', 1973, 'https://www.journals.uchicago.edu/doi/10.1086/225469', '10.1086/225469',
   'e3a5c38ce54f7d165aed3d33d203198e2f77b088cc81d6b88acafebccbf18655',
   'approved', 'published', true, ARRAY['research_feature', 'home_connection', 'explore_context']::text[],
   '{"seed_batch":"reviewed-community-literature-20260825","source_workbook":"FORRÁSOK A SZAKIRODALOMHOZ.xlsx","source_context":"kozossegi_terek_izolacio_magany_80_kutatasi_allitas.md","source_row":436,"source_sequence":435,"verification":"Elsődleges kiadói cikkoldal és absztrakt ellenőrizve 2026-08-25","evidence_type":"peer_reviewed_article","editorial_note":"Az állítás szövege változtatás nélkül került át a forrásmunkafüzetből.","processed_generated_at":"2026-08-25","source_publication_status":"published","topic_keys":["gyenge_kotesek","kozossegi_hidak","uj_lehetosegek"],"placement_basis":"topic_rules_v1","import_policy":"conservative_public_starter_set"}'::jsonb, timestamptz '2026-08-25 00:00:00+00'),
  ('literature-source-436', 436, 'hu-HU', 1973, 'https://www.journals.uchicago.edu/doi/10.1086/225469', '10.1086/225469',
   'abc488ad1a12c04c46bbdd1c2fa5585ce218b92f4d1d1e70f4d01c83a92680af',
   'approved', 'published', true, ARRAY['research_feature', 'home_connection', 'explore_context']::text[],
   '{"seed_batch":"reviewed-community-literature-20260825","source_workbook":"FORRÁSOK A SZAKIRODALOMHOZ.xlsx","source_context":"kozossegi_terek_izolacio_magany_80_kutatasi_allitas.md","source_row":437,"source_sequence":436,"verification":"Elsődleges kiadói cikkoldal és absztrakt ellenőrizve 2026-08-25","evidence_type":"peer_reviewed_article","editorial_note":"Az állítás szövege változtatás nélkül került át a forrásmunkafüzetből.","processed_generated_at":"2026-08-25","source_publication_status":"published","topic_keys":["gyenge_kotesek","kozossegi_hidak","uj_lehetosegek"],"placement_basis":"topic_rules_v1","import_policy":"conservative_public_starter_set"}'::jsonb, timestamptz '2026-08-25 00:00:00+00'),
  ('literature-source-443', 443, 'hu-HU', 1950, 'https://books.google.com/books/about/Social_Pressures_in_Informal_Groups.html?id=J24AAAAAMAAJ', NULL,
   '35328be5250844fb12cc34dd06069bf63f3e865b13d70b13be54e94922c1ae01',
   'approved', 'published', true, ARRAY['research_feature', 'home_connection', 'about_mission', 'explore_context']::text[],
   '{"seed_batch":"reviewed-community-literature-20260825","source_workbook":"FORRÁSOK A SZAKIRODALOMHOZ.xlsx","source_context":"kozossegi_terek_izolacio_magany_80_kutatasi_allitas.md","source_row":444,"source_sequence":443,"verification":"Kiadás, szerzők és év bibliográfiai rekordja ellenőrizve 2026-08-25","evidence_type":"research_monograph","editorial_note":"Az állítás szövege változtatás nélkül került át a forrásmunkafüzetből.","processed_generated_at":"2026-08-25","source_publication_status":"published","topic_keys":["ismetelt_talalkozas","kozossegi_ter","kozeliseg"],"placement_basis":"topic_rules_v1","import_policy":"conservative_public_starter_set"}'::jsonb, timestamptz '2026-08-25 00:00:00+00'),
  ('literature-source-444', 444, 'hu-HU', 1950, 'https://books.google.com/books/about/Social_Pressures_in_Informal_Groups.html?id=J24AAAAAMAAJ', NULL,
   '5575ff0bdd039645619ab6f931aa8262da5e416ba3446edc45d44f7ab627a282',
   'approved', 'published', true, ARRAY['research_feature', 'home_connection', 'about_mission', 'explore_context']::text[],
   '{"seed_batch":"reviewed-community-literature-20260825","source_workbook":"FORRÁSOK A SZAKIRODALOMHOZ.xlsx","source_context":"kozossegi_terek_izolacio_magany_80_kutatasi_allitas.md","source_row":445,"source_sequence":444,"verification":"Kiadás, szerzők és év bibliográfiai rekordja ellenőrizve 2026-08-25","evidence_type":"research_monograph","editorial_note":"Az állítás szövege változtatás nélkül került át a forrásmunkafüzetből.","processed_generated_at":"2026-08-25","source_publication_status":"published","topic_keys":["ismetelt_talalkozas","kozossegi_ter","kozeliseg"],"placement_basis":"topic_rules_v1","import_policy":"conservative_public_starter_set"}'::jsonb, timestamptz '2026-08-25 00:00:00+00'),
  ('literature-source-450', 450, 'hu-HU', 1999, 'https://doi.org/10.2307/2666999', '10.2307/2666999',
   '03a161e30f3854ecd4af7354e74d51876e493421ba812500898863a8fef01e02',
   'approved', 'published', true, ARRAY['research_feature', 'home_connection', 'about_mission', 'explore_context']::text[],
   '{"seed_batch":"reviewed-community-literature-20260825","source_workbook":"FORRÁSOK A SZAKIRODALOMHOZ.xlsx","source_context":"kozossegi_terek_izolacio_magany_80_kutatasi_allitas.md","source_row":451,"source_sequence":450,"verification":"Elsődleges kiadói cikkoldal és absztrakt ellenőrizve 2026-08-25","evidence_type":"peer_reviewed_article","editorial_note":"Az állítás szövege változtatás nélkül került át a forrásmunkafüzetből.","processed_generated_at":"2026-08-25","source_publication_status":"published","topic_keys":["pszichologiai_biztonsag","tanulas","kolcsonos_tamogatas"],"placement_basis":"topic_rules_v1","import_policy":"conservative_public_starter_set"}'::jsonb, timestamptz '2026-08-25 00:00:00+00'),
  ('literature-source-459', 459, 'hu-HU', 2025, 'https://www.who.int/publications/i/item/978240112360', NULL,
   'c1bd987b58ada5515ee7e27827edb3ced407e472c916b43ca6ba7f2db8414b61',
   'approved', 'published', true, ARRAY['research_feature', 'about_mission']::text[],
   '{"seed_batch":"reviewed-community-literature-20260825","source_workbook":"FORRÁSOK A SZAKIRODALOMHOZ.xlsx","source_context":"kozossegi_terek_izolacio_magany_80_kutatasi_allitas.md","source_row":460,"source_sequence":459,"verification":"WHO elsődleges jelentésoldal és teljes jelentés ellenőrizve 2026-08-25","evidence_type":"institutional_report","editorial_note":"Az állítás szövege változtatás nélkül került át a forrásmunkafüzetből.","processed_generated_at":"2026-08-25","source_publication_status":"published","topic_keys":["tarsas_infrastruktura","hozzaferhetoseg","befogadas","rendszerszintu_kapcsolodas"],"placement_basis":"topic_rules_v1","import_policy":"conservative_public_starter_set"}'::jsonb, timestamptz '2026-08-25 00:00:00+00'),
  ('literature-source-480', 480, 'hu-HU', 2025, 'https://www.who.int/publications/i/item/978240112360', NULL,
   'f835db49ead03a4edb2fecfe6d37e4ad881b75f014fd5276963da1d868513cbc',
   'approved', 'published', true, ARRAY['research_feature', 'about_mission']::text[],
   '{"seed_batch":"reviewed-community-literature-20260825","source_workbook":"FORRÁSOK A SZAKIRODALOMHOZ.xlsx","source_context":"kozossegi_terek_izolacio_magany_80_kutatasi_allitas.md","source_row":481,"source_sequence":480,"verification":"WHO elsődleges jelentésoldal és teljes jelentés ellenőrizve 2026-08-25","evidence_type":"institutional_report","editorial_note":"Az állítás szövege változtatás nélkül került át a forrásmunkafüzetből.","processed_generated_at":"2026-08-25","source_publication_status":"published","topic_keys":["tarsas_infrastruktura","hozzaferhetoseg","befogadas","rendszerszintu_kapcsolodas"],"placement_basis":"topic_rules_v1","import_policy":"conservative_public_starter_set"}'::jsonb, timestamptz '2026-08-25 00:00:00+00')
-- A rerun must never resurrect an editor-withdrawn/inactive record or replace
-- later placement and audit decisions. The canonical key makes first import
-- idempotent; every existing core row remains editorially authoritative.
ON CONFLICT (canonical_key) DO NOTHING;

-- DO NOTHING is deliberate: rerunning the seed must never overwrite a
-- translator/editor's existing hu-HU text. A fresh install receives the exact
-- acceptedRows text and marks it as the original locale.
INSERT INTO public.community_research_claim_translations (
  claim_id,
  locale,
  statement_text,
  source_title,
  source_container,
  authors_display,
  is_original
)
SELECT
  claim.id,
  seed.locale,
  seed.statement_text,
  seed.source_title,
  seed.source_container,
  seed.authors_display,
  true
FROM (VALUES
  ('literature-source-6', 'hu-HU', 'A „gyenge kötések” – ismerősök, laza szakmai/társas kapcsolatok – gyakran fontos hidak új információkhoz és lehetőségekhez; nem csak az intim kapcsolatok értékesek.', 'The Strength of Weak Ties', NULL::text, 'Mark S. Granovetter'),
  ('literature-source-8', 'hu-HU', 'A valahová tartozás iránti szükséglet erős és széles körben megjelenő emberi motiváció; az emberek tartós, pozitív kapcsolatok kialakítására és fenntartására törekednek.', 'The Need to Belong: Desire for Interpersonal Attachments as a Fundamental Human Motivation', NULL::text, 'Roy F. Baumeister, Mark R. Leary'),
  ('literature-source-27', 'hu-HU', 'A társas támogatás stressz alatti védő szerepének klasszikus elmélete szerint a támogatás csökkentheti a stresszorok észlelt fenyegetését vagy a rájuk adott reakció terhét.', 'Stress, Social Support, and the Buffering Hypothesis', NULL::text, 'Sheldon Cohen, Thomas A. Wills'),
  ('literature-source-28', 'hu-HU', 'A stressz-buffering hatás nem univerzális: függhet a stresszor típusától, a támogatás minőségétől, az egyéntől és a helyzettől.', 'Stress, Social Support, and the Buffering Hypothesis', NULL::text, 'Sheldon Cohen, Thomas A. Wills'),
  ('literature-source-113', 'hu-HU', 'A helyi társas infrastruktúra – megközelíthető közösségi terek, könyvtárak, parkok, klubok, jó közlekedés – valószínűsíthetően befolyásolja a közösségi részvétel gyakorlati költségét és elérhetőségét.', 'From Loneliness to Social Connection: Charting a Path to Healthier Societies', NULL::text, 'WHO Commission on Social Connection'),
  ('literature-source-114', 'hu-HU', 'A WHO szerint a társas kapcsolat a jóllét és egészség fontos társadalmi meghatározója; a politikai és közösségi válaszoknak nem kizárólag egyéni viselkedésváltoztatásra kell épülniük.', 'From Loneliness to Social Connection: Charting a Path to Healthier Societies', NULL::text, 'WHO Commission on Social Connection'),
  ('literature-source-115', 'hu-HU', 'A WHO globális jelentése szerint a magány széles körben jelen van, és a társas kapcsolódást az egészség, oktatás, munka, digitális környezet és helyi közösség rendszerszintjén is érdemes kezelni.', 'From Loneliness to Social Connection: Charting a Path to Healthier Societies', NULL::text, 'WHO Commission on Social Connection'),
  ('literature-source-118', 'hu-HU', 'A kapcsolatminőség sok esetben fontosabb lehet, mint a kapcsolat megléte; ezért a „mindenkinek több embert kell megismernie” nem elegendő, sőt rossz minőségű közegben kontraproduktív lehet.', 'Social Relationships and Health: A Flashpoint for Health Policy', NULL::text, 'Debra Umberson, Jennifer Karas Montez'),
  ('literature-source-121', 'hu-HU', 'A társas támogatás több formából áll: érzelmi, instrumentális/gyakorlati, információs és értékelő támogatás. Egy stresszhelyzetben nem biztos, hogy ugyanaz a forma segít, mint egy másikban.', 'Stress, Social Support, and the Buffering Hypothesis', NULL::text, 'Sheldon Cohen, Thomas A. Wills'),
  ('literature-source-185', 'hu-HU', 'A társas támogatás akkor működik jobban, ha a támogatás formája illeszkedik a problémához: információra nem mindig vigasz, gyakorlati teherre nem mindig tanács a legjobb válasz.', 'Stress, Social Support, and the Buffering Hypothesis', NULL::text, 'Sheldon Cohen, Thomas A. Wills'),
  ('literature-source-200', 'hu-HU', 'A klasszikus lakóközösségi kutatásban a fizikai elrendezés – például lépcsők, közlekedési útvonalak, bejáratok – befolyásolta, ki kivel találkozik és barátkozik.', 'Social Pressures in Informal Groups', NULL::text, 'Leon Festinger, Stanley Schachter, Kurt Back'),
  ('literature-source-201', 'hu-HU', 'A „propinquity” vagy közelségi hatás mai tanulsága: egy közösségi app nem elég; a jó helyszín, időpont, megközelíthetőség és ismétlődő találkozási minta is a kapcsolat infrastruktúrája.', 'Social Pressures in Informal Groups', NULL::text, 'Festinger, Schachter, Back'),
  ('literature-source-202', 'hu-HU', 'A „mere exposure” jelenség szerint az ismétlődő találkozás sok esetben növelheti a kedvelést, ha az élmény semleges vagy pozitív; ez nem működik káros, fenyegető vagy kényszerített helyzetben.', 'Attitudinal Effects of Mere Exposure', NULL::text, 'Robert B. Zajonc'),
  ('literature-source-205', 'hu-HU', 'A „gyenge kötések” – nem intim ismerősök – meglepően fontos szerepet tölthetnek be új információk, munkalehetőségek és más közösségek felé vezető hidak szempontjából.', 'The Strength of Weak Ties', NULL::text, 'Mark S. Granovetter'),
  ('literature-source-206', 'hu-HU', 'Egy ember közösségi jóllétéhez nem csak néhány nagyon közeli kapcsolat számít: a laza ismerősi háló és a rendszeres, alacsony intenzitású találkozások is társadalmi erőforrások lehetnek.', 'The Strength of Weak Ties', NULL::text, 'Mark S. Granovetter'),
  ('literature-source-301', 'hu-HU', 'A fizikai tér formája befolyásolhatja, ki kivel találkozik: a klasszikus lakóközösségi kutatásban a közlekedési útvonalak, lépcsők és bejáratok a barátkozási mintázatokkal is összefüggtek.', 'Social Pressures in Informal Groups', NULL::text, 'Leon Festinger, Stanley Schachter, Kurt Back'),
  ('literature-source-302', 'hu-HU', 'A tér tehát nem semleges háttér: az elkerülhetetlen, de nem kényszerítő mikro-találkozások – folyosó, pad, kávépont, közös bejárat – kapcsolatépítő lehetőségeket teremthetnek.', 'Social Pressures in Informal Groups', NULL::text, 'Festinger, Schachter, Back'),
  ('literature-source-308', 'hu-HU', 'A magány csökkentésére alkalmas tér nem lehet csak a mobilis, jól kereső, „magabiztos” emberek tere; akadálymentesség, közlekedés, nyitvatartás, WC, ülőhely és kulturális biztonság is a kapcsolódás feltétele.', 'WHO Commission on Social Connection Report', NULL::text, 'World Health Organization'),
  ('literature-source-316', 'hu-HU', 'A közösségi terekben kialakuló laza ismeretségek – boltos, könyvtáros, szomszéd, edző, rendszeres látogató – nem jelentéktelenek: társas felismerést és új információs hidakat adhatnak.', 'The Strength of Weak Ties', NULL::text, 'Mark S. Granovetter'),
  ('literature-source-317', 'hu-HU', 'A laza ismeretségek értéke különösen akkor nő, amikor valakinek új közösségbe, munkába, szolgáltatásba vagy érdeklődési körbe kell belépnie.', 'The Strength of Weak Ties', NULL::text, 'Mark S. Granovetter'),
  ('literature-source-322', 'hu-HU', 'A gyakori találkozás nem garantál jó kapcsolatot; a mere exposure hatás főleg semleges vagy pozitív élményben működik, ezért a térnek konfliktuskezelési, moderációs és biztonsági normákra is szüksége lehet.', 'Attitudinal Effects of Mere Exposure', NULL::text, 'Robert B. Zajonc'),
  ('literature-source-398', 'hu-HU', 'A WHO 2025-ös jelentése a társas kapcsolatot egészség- és jólléti meghatározóként kezeli, nem pusztán személyes életstílusválasztásként.', 'From Loneliness to Social Connection: Charting a Path to Healthier Societies', NULL::text, 'WHO Commission on Social Connection'),
  ('literature-source-399', 'hu-HU', 'A WHO megközelítése szerint az izoláció csökkentéséhez egészségügy, oktatás, munka, helyi közösség, közlekedés, lakhatás és digitális környezet szintjén is szükség lehet beavatkozásra.', 'From Loneliness to Social Connection', NULL::text, 'World Health Organization'),
  ('literature-source-435', 'hu-HU', 'A felnőttkori kapcsolatok nem csak család és párkapcsolat: barátok, szomszédok, munkatársak, mentorok, közösségi társak és laza ismerősök is jelentős társas erőforrások lehetnek.', 'The Strength of Weak Ties', NULL::text, 'Mark S. Granovetter'),
  ('literature-source-436', 'hu-HU', 'A gyenge kötések új lehetőségekhez és információkhoz vezető társas hidak lehetnek; ezért a laza kapcsolatok elvesztése társadalmi mobilitási és közösségi veszteség is lehet.', 'The Strength of Weak Ties', NULL::text, 'Mark S. Granovetter'),
  ('literature-source-443', 'hu-HU', 'A kapcsolatok fejlődése nem csak személyes készség, hanem hely- és időfüggő folyamat: a gyakori, könnyű találkozás lehetősége elősegítheti a barátságkialakulást.', 'Social Pressures in Informal Groups', NULL::text, 'Leon Festinger, Stanley Schachter, Kurt Back'),
  ('literature-source-444', 'hu-HU', 'A lakókörnyezet fizikai elrendezése a klasszikus kutatásban befolyásolta, kik találkoztak többet és kik barátkoztak össze.', 'Social Pressures in Informal Groups', NULL::text, 'Festinger, Schachter, Back'),
  ('literature-source-450', 'hu-HU', 'A pszichológiai biztonság azt jelenti, hogy valaki interperszonális kockázatot vállalhat – kérdezhet, hibát jelezhet, segítséget kérhet – megszégyenítés vagy büntetés erős félelme nélkül.', 'Psychological Safety and Learning Behavior in Work Teams', NULL::text, 'Amy C. Edmondson'),
  ('literature-source-459', 'hu-HU', 'A befogadó közösség nem csak „mindenkit szívesen lát”: ténylegesen csökkenti a belépési költséget, világos normákat, biztonságot és részvételi szerepeket kínál.', 'WHO Commission on Social Connection Report', NULL::text, 'World Health Organization'),
  ('literature-source-480', 'hu-HU', 'A társas infrastruktúra igazságossági kérdés: nem elég, hogy valahol van közösségi tér; el kell érni azt időben, pénzben, mobilitással és kulturális biztonsággal is.', 'WHO Commission on Social Connection Report', NULL::text, 'WHO')
) AS seed(canonical_key, locale, statement_text, source_title, source_container, authors_display)
JOIN public.community_research_claims claim
  ON claim.canonical_key = seed.canonical_key
ON CONFLICT (claim_id, locale) DO NOTHING;

INSERT INTO public.community_research_claim_topics (claim_id, topic_key)
SELECT claim.id, seed.topic_key
FROM (VALUES
  ('literature-source-6', 'gyenge_kotesek'),
  ('literature-source-6', 'kozossegi_hidak'),
  ('literature-source-6', 'uj_lehetosegek'),
  ('literature-source-8', 'valahova_tartozas'),
  ('literature-source-8', 'tartos_kapcsolatok'),
  ('literature-source-27', 'tarsas_tamogatas'),
  ('literature-source-27', 'stressz'),
  ('literature-source-27', 'kolcsonos_segites'),
  ('literature-source-28', 'tarsas_tamogatas'),
  ('literature-source-28', 'stressz'),
  ('literature-source-28', 'kolcsonos_segites'),
  ('literature-source-113', 'tarsas_infrastruktura'),
  ('literature-source-113', 'hozzaferhetoseg'),
  ('literature-source-113', 'befogadas'),
  ('literature-source-113', 'rendszerszintu_kapcsolodas'),
  ('literature-source-114', 'tarsas_infrastruktura'),
  ('literature-source-114', 'hozzaferhetoseg'),
  ('literature-source-114', 'befogadas'),
  ('literature-source-114', 'rendszerszintu_kapcsolodas'),
  ('literature-source-115', 'tarsas_infrastruktura'),
  ('literature-source-115', 'hozzaferhetoseg'),
  ('literature-source-115', 'befogadas'),
  ('literature-source-115', 'rendszerszintu_kapcsolodas'),
  ('literature-source-118', 'kapcsolatminoseg'),
  ('literature-source-118', 'biztonsagos_kozosseg'),
  ('literature-source-121', 'tarsas_tamogatas'),
  ('literature-source-121', 'stressz'),
  ('literature-source-121', 'kolcsonos_segites'),
  ('literature-source-185', 'tarsas_tamogatas'),
  ('literature-source-185', 'stressz'),
  ('literature-source-185', 'kolcsonos_segites'),
  ('literature-source-200', 'ismetelt_talalkozas'),
  ('literature-source-200', 'kozossegi_ter'),
  ('literature-source-200', 'kozeliseg'),
  ('literature-source-201', 'ismetelt_talalkozas'),
  ('literature-source-201', 'kozossegi_ter'),
  ('literature-source-201', 'kozeliseg'),
  ('literature-source-202', 'ismetelt_talalkozas'),
  ('literature-source-202', 'biztonsag'),
  ('literature-source-202', 'pozitiv_elmeny'),
  ('literature-source-205', 'gyenge_kotesek'),
  ('literature-source-205', 'kozossegi_hidak'),
  ('literature-source-205', 'uj_lehetosegek'),
  ('literature-source-206', 'gyenge_kotesek'),
  ('literature-source-206', 'kozossegi_hidak'),
  ('literature-source-206', 'uj_lehetosegek'),
  ('literature-source-301', 'ismetelt_talalkozas'),
  ('literature-source-301', 'kozossegi_ter'),
  ('literature-source-301', 'kozeliseg'),
  ('literature-source-302', 'ismetelt_talalkozas'),
  ('literature-source-302', 'kozossegi_ter'),
  ('literature-source-302', 'kozeliseg'),
  ('literature-source-308', 'tarsas_infrastruktura'),
  ('literature-source-308', 'hozzaferhetoseg'),
  ('literature-source-308', 'befogadas'),
  ('literature-source-308', 'rendszerszintu_kapcsolodas'),
  ('literature-source-316', 'gyenge_kotesek'),
  ('literature-source-316', 'kozossegi_hidak'),
  ('literature-source-316', 'uj_lehetosegek'),
  ('literature-source-317', 'gyenge_kotesek'),
  ('literature-source-317', 'kozossegi_hidak'),
  ('literature-source-317', 'uj_lehetosegek'),
  ('literature-source-322', 'ismetelt_talalkozas'),
  ('literature-source-322', 'biztonsag'),
  ('literature-source-322', 'pozitiv_elmeny'),
  ('literature-source-398', 'tarsas_infrastruktura'),
  ('literature-source-398', 'hozzaferhetoseg'),
  ('literature-source-398', 'befogadas'),
  ('literature-source-398', 'rendszerszintu_kapcsolodas'),
  ('literature-source-399', 'tarsas_infrastruktura'),
  ('literature-source-399', 'hozzaferhetoseg'),
  ('literature-source-399', 'befogadas'),
  ('literature-source-399', 'rendszerszintu_kapcsolodas'),
  ('literature-source-435', 'gyenge_kotesek'),
  ('literature-source-435', 'kozossegi_hidak'),
  ('literature-source-435', 'uj_lehetosegek'),
  ('literature-source-436', 'gyenge_kotesek'),
  ('literature-source-436', 'kozossegi_hidak'),
  ('literature-source-436', 'uj_lehetosegek'),
  ('literature-source-443', 'ismetelt_talalkozas'),
  ('literature-source-443', 'kozossegi_ter'),
  ('literature-source-443', 'kozeliseg'),
  ('literature-source-444', 'ismetelt_talalkozas'),
  ('literature-source-444', 'kozossegi_ter'),
  ('literature-source-444', 'kozeliseg'),
  ('literature-source-450', 'pszichologiai_biztonsag'),
  ('literature-source-450', 'tanulas'),
  ('literature-source-450', 'kolcsonos_tamogatas'),
  ('literature-source-459', 'tarsas_infrastruktura'),
  ('literature-source-459', 'hozzaferhetoseg'),
  ('literature-source-459', 'befogadas'),
  ('literature-source-459', 'rendszerszintu_kapcsolodas'),
  ('literature-source-480', 'tarsas_infrastruktura'),
  ('literature-source-480', 'hozzaferhetoseg'),
  ('literature-source-480', 'befogadas'),
  ('literature-source-480', 'rendszerszintu_kapcsolodas')
) AS seed(canonical_key, topic_key)
JOIN public.community_research_claims claim
  ON claim.canonical_key = seed.canonical_key
ON CONFLICT (claim_id, topic_key) DO NOTHING;

COMMENT ON TABLE public.community_research_topics IS
  'Stable non-display topic keys for reviewed community research claims.';
COMMENT ON TABLE public.community_research_topic_translations IS
  'Optional localized labels for research topics; seed keys are never machine-translated.';
COMMENT ON TABLE public.community_research_claim_topics IS
  'Many-to-many topic assignment for community research claims.';

COMMIT;
