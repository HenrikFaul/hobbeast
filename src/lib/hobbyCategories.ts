/**
 * Hobbeast Activity Catalog – Comprehensive hobby/activity taxonomy
 * 
 * Architecture:
 * - ActivityProfile: defines what event parameters are relevant for an activity type
 * - HobbyCategory: top-level grouping (e.g., Sport, Creative)
 * - HobbySubcategory: mid-level grouping (e.g., Labdajátékok, Vízi sportok)
 * - HobbyActivity: leaf-level specific activity (e.g., Foci, Tenisz)
 * 
 * The profile on each activity (or inherited from subcategory/category) determines
 * which fields appear in the event creation form and how events behave.
 */

// ─── Activity Profile (parameter matrix) ─────────────────────────────────────

export type LocationSuitability = 'indoor' | 'outdoor' | 'both' | 'online' | 'any';
export type PhysicalIntensity = 'none' | 'low' | 'medium' | 'high' | 'extreme';
export type GroupSizeRange = { min: number; max: number; typical: number };

export interface ActivityProfile {
  /** Where this activity typically takes place */
  locationTypes: LocationSuitability[];
  /** Physical intensity level */
  physicalIntensity: PhysicalIntensity;
  /** Typical group size range */
  groupSize: GroupSizeRange;
  /** Does this activity have a measurable distance/length? (hiking, running, cycling) */
  hasDistance: boolean;
  /** Does this activity need duration specification? */
  hasDuration: boolean;
  /** Can participants specify skill/experience level? */
  hasSkillLevel: boolean;
  /** Is equipment needed? If so, what kind (for info display) */
  hasEquipment: boolean;
  /** Can be competitive / have teams */
  isCompetitive: boolean;
  /** Is it a team-based activity */
  isTeamBased: boolean;
  /** Can this activity happen online (e.g., gaming, language learning) */
  canBeOnline: boolean;
  /** Suggested event duration in minutes (for default) */
  suggestedDurationMin?: number;
  /** Age recommendation / suitability */
  ageRestriction?: 'all' | '14+' | '16+' | '18+';
}

// ─── Default profiles for common activity archetypes ──────────────────────────

const PROFILES = {
  teamSport: {
    locationTypes: ['outdoor', 'indoor'] as LocationSuitability[],
    physicalIntensity: 'high' as PhysicalIntensity,
    groupSize: { min: 4, max: 30, typical: 12 },
    hasDistance: false, hasDuration: true, hasSkillLevel: true,
    hasEquipment: true, isCompetitive: true, isTeamBased: true,
    canBeOnline: false, suggestedDurationMin: 90,
  },
  racketSport: {
    locationTypes: ['indoor', 'outdoor'] as LocationSuitability[],
    physicalIntensity: 'high' as PhysicalIntensity,
    groupSize: { min: 2, max: 8, typical: 4 },
    hasDistance: false, hasDuration: true, hasSkillLevel: true,
    hasEquipment: true, isCompetitive: true, isTeamBased: false,
    canBeOnline: false, suggestedDurationMin: 60,
  },
  endurance: {
    locationTypes: ['outdoor'] as LocationSuitability[],
    physicalIntensity: 'high' as PhysicalIntensity,
    groupSize: { min: 2, max: 100, typical: 15 },
    hasDistance: true, hasDuration: true, hasSkillLevel: true,
    hasEquipment: true, isCompetitive: true, isTeamBased: false,
    canBeOnline: false, suggestedDurationMin: 60,
  },
  fitness: {
    locationTypes: ['indoor', 'outdoor'] as LocationSuitability[],
    physicalIntensity: 'medium' as PhysicalIntensity,
    groupSize: { min: 2, max: 30, typical: 10 },
    hasDistance: false, hasDuration: true, hasSkillLevel: true,
    hasEquipment: false, isCompetitive: false, isTeamBased: false,
    canBeOnline: true, suggestedDurationMin: 60,
  },
  extremeSport: {
    locationTypes: ['outdoor'] as LocationSuitability[],
    physicalIntensity: 'extreme' as PhysicalIntensity,
    groupSize: { min: 2, max: 15, typical: 6 },
    hasDistance: false, hasDuration: true, hasSkillLevel: true,
    hasEquipment: true, isCompetitive: false, isTeamBased: false,
    canBeOnline: false, suggestedDurationMin: 120, ageRestriction: '16+' as const,
  },
  outdoorAdventure: {
    locationTypes: ['outdoor'] as LocationSuitability[],
    physicalIntensity: 'medium' as PhysicalIntensity,
    groupSize: { min: 2, max: 40, typical: 10 },
    hasDistance: true, hasDuration: true, hasSkillLevel: true,
    hasEquipment: true, isCompetitive: false, isTeamBased: false,
    canBeOnline: false, suggestedDurationMin: 180,
  },
  creativeWorkshop: {
    locationTypes: ['indoor'] as LocationSuitability[],
    physicalIntensity: 'none' as PhysicalIntensity,
    groupSize: { min: 3, max: 20, typical: 8 },
    hasDistance: false, hasDuration: true, hasSkillLevel: true,
    hasEquipment: true, isCompetitive: false, isTeamBased: false,
    canBeOnline: true, suggestedDurationMin: 120,
  },
  music: {
    locationTypes: ['indoor', 'outdoor'] as LocationSuitability[],
    physicalIntensity: 'none' as PhysicalIntensity,
    groupSize: { min: 2, max: 30, typical: 8 },
    hasDistance: false, hasDuration: true, hasSkillLevel: true,
    hasEquipment: true, isCompetitive: false, isTeamBased: false,
    canBeOnline: true, suggestedDurationMin: 90,
  },
  dance: {
    locationTypes: ['indoor'] as LocationSuitability[],
    physicalIntensity: 'medium' as PhysicalIntensity,
    groupSize: { min: 2, max: 30, typical: 12 },
    hasDistance: false, hasDuration: true, hasSkillLevel: true,
    hasEquipment: false, isCompetitive: false, isTeamBased: false,
    canBeOnline: true, suggestedDurationMin: 90,
  },
  boardGame: {
    locationTypes: ['indoor'] as LocationSuitability[],
    physicalIntensity: 'none' as PhysicalIntensity,
    groupSize: { min: 2, max: 20, typical: 6 },
    hasDistance: false, hasDuration: true, hasSkillLevel: true,
    hasEquipment: true, isCompetitive: true, isTeamBased: false,
    canBeOnline: true, suggestedDurationMin: 120,
  },
  gaming: {
    locationTypes: ['indoor', 'online'] as LocationSuitability[],
    physicalIntensity: 'none' as PhysicalIntensity,
    groupSize: { min: 2, max: 50, typical: 8 },
    hasDistance: false, hasDuration: true, hasSkillLevel: true,
    hasEquipment: true, isCompetitive: true, isTeamBased: true,
    canBeOnline: true, suggestedDurationMin: 120,
  },
  gastronomy: {
    locationTypes: ['indoor'] as LocationSuitability[],
    physicalIntensity: 'none' as PhysicalIntensity,
    groupSize: { min: 2, max: 20, typical: 8 },
    hasDistance: false, hasDuration: true, hasSkillLevel: true,
    hasEquipment: true, isCompetitive: false, isTeamBased: false,
    canBeOnline: true, suggestedDurationMin: 120, ageRestriction: 'all' as const,
  },
  photoVideo: {
    locationTypes: ['indoor', 'outdoor'] as LocationSuitability[],
    physicalIntensity: 'low' as PhysicalIntensity,
    groupSize: { min: 2, max: 15, typical: 6 },
    hasDistance: false, hasDuration: true, hasSkillLevel: true,
    hasEquipment: true, isCompetitive: false, isTeamBased: false,
    canBeOnline: true, suggestedDurationMin: 120,
  },
  tech: {
    locationTypes: ['indoor', 'online'] as LocationSuitability[],
    physicalIntensity: 'none' as PhysicalIntensity,
    groupSize: { min: 2, max: 30, typical: 10 },
    hasDistance: false, hasDuration: true, hasSkillLevel: true,
    hasEquipment: true, isCompetitive: false, isTeamBased: false,
    canBeOnline: true, suggestedDurationMin: 120,
  },
  learning: {
    locationTypes: ['indoor', 'online'] as LocationSuitability[],
    physicalIntensity: 'none' as PhysicalIntensity,
    groupSize: { min: 2, max: 25, typical: 8 },
    hasDistance: false, hasDuration: true, hasSkillLevel: true,
    hasEquipment: false, isCompetitive: false, isTeamBased: false,
    canBeOnline: true, suggestedDurationMin: 90,
  },
  animals: {
    locationTypes: ['outdoor', 'indoor'] as LocationSuitability[],
    physicalIntensity: 'low' as PhysicalIntensity,
    groupSize: { min: 2, max: 20, typical: 6 },
    hasDistance: true, hasDuration: true, hasSkillLevel: false,
    hasEquipment: false, isCompetitive: false, isTeamBased: false,
    canBeOnline: false, suggestedDurationMin: 60,
  },
  social: {
    locationTypes: ['indoor', 'outdoor', 'online'] as LocationSuitability[],
    physicalIntensity: 'none' as PhysicalIntensity,
    groupSize: { min: 2, max: 50, typical: 10 },
    hasDistance: false, hasDuration: true, hasSkillLevel: false,
    hasEquipment: false, isCompetitive: false, isTeamBased: false,
    canBeOnline: true, suggestedDurationMin: 120,
  },
  waterSport: {
    locationTypes: ['outdoor'] as LocationSuitability[],
    physicalIntensity: 'high' as PhysicalIntensity,
    groupSize: { min: 2, max: 20, typical: 6 },
    hasDistance: true, hasDuration: true, hasSkillLevel: true,
    hasEquipment: true, isCompetitive: true, isTeamBased: false,
    canBeOnline: false, suggestedDurationMin: 120,
  },
  winterSport: {
    locationTypes: ['outdoor'] as LocationSuitability[],
    physicalIntensity: 'high' as PhysicalIntensity,
    groupSize: { min: 2, max: 20, typical: 6 },
    hasDistance: true, hasDuration: true, hasSkillLevel: true,
    hasEquipment: true, isCompetitive: true, isTeamBased: false,
    canBeOnline: false, suggestedDurationMin: 180,
  },
  martialArt: {
    locationTypes: ['indoor'] as LocationSuitability[],
    physicalIntensity: 'high' as PhysicalIntensity,
    groupSize: { min: 2, max: 20, typical: 10 },
    hasDistance: false, hasDuration: true, hasSkillLevel: true,
    hasEquipment: true, isCompetitive: true, isTeamBased: false,
    canBeOnline: false, suggestedDurationMin: 90,
  },
  volunteer: {
    locationTypes: ['outdoor', 'indoor'] as LocationSuitability[],
    physicalIntensity: 'low' as PhysicalIntensity,
    groupSize: { min: 3, max: 50, typical: 15 },
    hasDistance: false, hasDuration: true, hasSkillLevel: false,
    hasEquipment: false, isCompetitive: false, isTeamBased: true,
    canBeOnline: true, suggestedDurationMin: 180,
  },
} satisfies Record<string, ActivityProfile>;

// ─── Taxonomy types ───────────────────────────────────────────────────────────

export interface HobbyActivity {
  id: string;
  name: string;
  emoji?: string;
  /** Override profile from parent subcategory/category */
  profile?: Partial<ActivityProfile>;
  /** Keywords for search */
  keywords?: string[];
}

export interface HobbySubcategory {
  id: string;
  name: string;
  emoji?: string;
  /** Default profile for activities in this subcategory */
  profile: ActivityProfile;
  activities: HobbyActivity[];
}

export interface HobbyCategory {
  id: string;
  name: string;
  emoji: string;
  description: string;
  subcategories: HobbySubcategory[];
}

// ─── The Catalog ──────────────────────────────────────────────────────────────

export const HOBBY_CATALOG: HobbyCategory[] = [
  // ══════════════ 1. SPORT & MOZGÁS ══════════════
  {
    id: 'sport',
    name: 'Sport & Mozgás',
    emoji: '⚽',
    description: 'Aktív sportok és mozgásformák',
    subcategories: [
      {
        id: 'ball-sports',
        name: 'Labdajátékok',
        emoji: '⚽',
        profile: PROFILES.teamSport,
        activities: [
          { id: 'football', name: 'Foci', emoji: '⚽', keywords: ['labdarúgás', 'soccer'] },
          { id: 'basketball', name: 'Kosárlabda', emoji: '🏀' },
          { id: 'volleyball', name: 'Röplabda', emoji: '🏐' },
          { id: 'handball', name: 'Kézilabda', emoji: '🤾' },
          { id: 'futsal', name: 'Futsal', emoji: '⚽' },
          { id: 'baseball', name: 'Baseball/Softball', emoji: '⚾' },
          { id: 'rugby', name: 'Rugby', emoji: '🏉' },
          { id: 'floorball', name: 'Floorball', emoji: '🏑' },
        ],
      },
      {
        id: 'racket-sports',
        name: 'Ütős sportok',
        emoji: '🎾',
        profile: PROFILES.racketSport,
        activities: [
          { id: 'tennis', name: 'Tenisz', emoji: '🎾' },
          { id: 'table-tennis', name: 'Asztalitenisz', emoji: '🏓' },
          { id: 'badminton', name: 'Tollaslabda', emoji: '🏸' },
          { id: 'squash', name: 'Squash', emoji: '🎾' },
          { id: 'padel', name: 'Pádel', emoji: '🎾' },
        ],
      },
      {
        id: 'running-athletics',
        name: 'Futás & Atlétika',
        emoji: '🏃',
        profile: PROFILES.endurance,
        activities: [
          { id: 'running', name: 'Futás', emoji: '🏃', keywords: ['jogging'] },
          { id: 'trail-running', name: 'Terepfutás', emoji: '🏃' },
          { id: 'marathon', name: 'Maraton / Félmaraton', emoji: '🏅' },
          { id: 'sprinting', name: 'Sprint / Atlétika', emoji: '🏃' },
          { id: 'orienteering', name: 'Tájfutás', emoji: '🧭' },
        ],
      },
      {
        id: 'cycling',
        name: 'Kerékpározás',
        emoji: '🚴',
        profile: { ...PROFILES.endurance, groupSize: { min: 2, max: 50, typical: 10 } },
        activities: [
          { id: 'road-cycling', name: 'Országúti', emoji: '🚴' },
          { id: 'mtb', name: 'Mountain bike (MTB)', emoji: '🚵' },
          { id: 'gravel', name: 'Gravel', emoji: '🚴' },
          { id: 'bmx', name: 'BMX', emoji: '🚲' },
          { id: 'city-cycling', name: 'Városi bringázás', emoji: '🚲' },
        ],
      },
      {
        id: 'water-sports',
        name: 'Vízi sportok',
        emoji: '🏊',
        profile: PROFILES.waterSport,
        activities: [
          { id: 'swimming', name: 'Úszás', emoji: '🏊' },
          { id: 'kayak-canoe', name: 'Kajak-kenu', emoji: '🛶' },
          { id: 'sailing', name: 'Vitorlázás', emoji: '⛵' },
          { id: 'sup', name: 'SUP', emoji: '🏄' },
          { id: 'surfing', name: 'Szörf', emoji: '🏄' },
          { id: 'rowing', name: 'Evezés', emoji: '🚣' },
          { id: 'water-polo', name: 'Vízilabda', emoji: '🤽', profile: { isTeamBased: true } },
        ],
      },
      {
        id: 'martial-arts',
        name: 'Küzdősportok',
        emoji: '🥋',
        profile: PROFILES.martialArt,
        activities: [
          { id: 'boxing', name: 'Box', emoji: '🥊' },
          { id: 'judo', name: 'Judo', emoji: '🥋' },
          { id: 'karate', name: 'Karate', emoji: '🥋' },
          { id: 'taekwondo', name: 'Taekwondo', emoji: '🥋' },
          { id: 'mma', name: 'MMA', emoji: '🥊', profile: { ageRestriction: '18+' } },
          { id: 'fencing', name: 'Vívás', emoji: '🤺' },
          { id: 'wrestling', name: 'Birkózás', emoji: '🤼' },
          { id: 'kickbox', name: 'Kickbox', emoji: '🥊' },
          { id: 'krav-maga', name: 'Krav Maga', emoji: '🥊' },
        ],
      },
      {
        id: 'winter-sports',
        name: 'Téli sportok',
        emoji: '⛷️',
        profile: PROFILES.winterSport,
        activities: [
          { id: 'skiing', name: 'Síelés', emoji: '⛷️' },
          { id: 'snowboarding', name: 'Snowboard', emoji: '🏂' },
          { id: 'ice-skating', name: 'Korcsolyázás', emoji: '⛸️' },
          { id: 'cross-country-ski', name: 'Sífutás', emoji: '⛷️' },
          { id: 'ice-hockey', name: 'Jégkorong', emoji: '🏒', profile: { isTeamBased: true } },
        ],
      },
      {
        id: 'fitness-wellness',
        name: 'Fitnesz & Wellness',
        emoji: '🧘',
        profile: PROFILES.fitness,
        activities: [
          { id: 'yoga', name: 'Jóga', emoji: '🧘', keywords: ['yoga'] },
          { id: 'pilates', name: 'Pilates', emoji: '🧘' },
          { id: 'crossfit', name: 'CrossFit', emoji: '🏋️', profile: { physicalIntensity: 'high' } },
          { id: 'gym', name: 'Edzőtermi edzés', emoji: '🏋️' },
          { id: 'calisthenics', name: 'Kalistenia', emoji: '💪' },
          { id: 'stretching', name: 'Nyújtás / Mobilitás', emoji: '🤸' },
          { id: 'hiit', name: 'HIIT', emoji: '🔥', profile: { physicalIntensity: 'high' } },
          { id: 'meditation', name: 'Meditáció', emoji: '🧘', profile: { physicalIntensity: 'none', canBeOnline: true } },
        ],
      },
      {
        id: 'other-sports',
        name: 'Egyéb sportok',
        emoji: '🎯',
        profile: { ...PROFILES.fitness, groupSize: { min: 2, max: 15, typical: 4 } },
        activities: [
          { id: 'horse-riding', name: 'Lovaglás', emoji: '🐴' },
          { id: 'archery', name: 'Íjászat', emoji: '🏹' },
          { id: 'bowling', name: 'Bowling', emoji: '🎳', profile: { physicalIntensity: 'low' } },
          { id: 'darts', name: 'Darts', emoji: '🎯', profile: { physicalIntensity: 'none' } },
          { id: 'golf', name: 'Golf', emoji: '⛳' },
          { id: 'roller-skating', name: 'Görkorcsolya / Gördeszkázás', emoji: '🛹' },
          { id: 'shooting', name: 'Sportlövészet', emoji: '🎯', profile: { ageRestriction: '18+' } },
          { id: 'disc-golf', name: 'Disc golf / Frisbi', emoji: '🥏' },
          { id: 'petanque', name: 'Petanque', emoji: '🏐' },
        ],
      },
    ],
  },

  // ══════════════ 2. EXTRÉM & KALANDSPORT ══════════════
  {
    id: 'extreme',
    name: 'Extrém & Kalandsport',
    emoji: '🧗',
    description: 'Adrenalindús kalandok és extrém sportok',
    subcategories: [
      {
        id: 'climbing',
        name: 'Mászás',
        emoji: '🧗',
        profile: PROFILES.extremeSport,
        activities: [
          { id: 'rock-climbing', name: 'Sziklamászás', emoji: '🧗' },
          { id: 'bouldering', name: 'Bouldering', emoji: '🧗' },
          { id: 'indoor-climbing', name: 'Falmászás (indoor)', emoji: '🧗', profile: { locationTypes: ['indoor'] } },
          { id: 'via-ferrata', name: 'Via Ferrata', emoji: '🧗' },
        ],
      },
      {
        id: 'air-sports',
        name: 'Légi sportok',
        emoji: '🪂',
        profile: { ...PROFILES.extremeSport, ageRestriction: '18+' as const },
        activities: [
          { id: 'paragliding', name: 'Siklóernyőzés', emoji: '🪂' },
          { id: 'skydiving', name: 'Ejtőernyőzés', emoji: '🪂' },
          { id: 'bungee', name: 'Bungee jumping', emoji: '🎢' },
          { id: 'zip-line', name: 'Canopy / Zip-line', emoji: '🏔️' },
        ],
      },
      {
        id: 'tactical',
        name: 'Taktikai sportok',
        emoji: '🔫',
        profile: { ...PROFILES.extremeSport, isTeamBased: true, groupSize: { min: 6, max: 40, typical: 16 } },
        activities: [
          { id: 'airsoft', name: 'Airsoft', emoji: '🔫' },
          { id: 'paintball', name: 'Paintball', emoji: '🎯' },
          { id: 'laser-tag', name: 'Lézerharc', emoji: '🔫', profile: { ageRestriction: 'all' } },
        ],
      },
      {
        id: 'water-extreme',
        name: 'Vízi extrém',
        emoji: '🤿',
        profile: PROFILES.extremeSport,
        activities: [
          { id: 'scuba-diving', name: 'Búvárkodás', emoji: '🤿' },
          { id: 'snorkeling', name: 'Snorkeling', emoji: '🤿', profile: { physicalIntensity: 'low' } },
          { id: 'rafting', name: 'Rafting', emoji: '🚣' },
          { id: 'canyoning', name: 'Kanyoning', emoji: '🏞️' },
          { id: 'wakeboarding', name: 'Wakeboard', emoji: '🏄' },
        ],
      },
    ],
  },

  // ══════════════ 3. TERMÉSZET & TÚRA ══════════════
  {
    id: 'nature',
    name: 'Természet & Túra',
    emoji: '🏔️',
    description: 'Kirándulás, kertészkedés és természetjárás',
    subcategories: [
      {
        id: 'hiking',
        name: 'Túrázás',
        emoji: '🥾',
        profile: PROFILES.outdoorAdventure,
        activities: [
          { id: 'day-hike', name: 'Napi túra', emoji: '🥾' },
          { id: 'mountain-hike', name: 'Hegyi túra', emoji: '🏔️', profile: { physicalIntensity: 'high' } },
          { id: 'forest-walk', name: 'Erdei séta', emoji: '🌲', profile: { physicalIntensity: 'low' } },
          { id: 'long-distance', name: 'Több napos túra', emoji: '🎒', profile: { suggestedDurationMin: 480 } },
          { id: 'nordic-walking', name: 'Nordic walking', emoji: '🚶' },
        ],
      },
      {
        id: 'nature-observation',
        name: 'Természetfigyelés',
        emoji: '🔭',
        profile: { ...PROFILES.outdoorAdventure, physicalIntensity: 'low' as PhysicalIntensity, hasDistance: false },
        activities: [
          { id: 'birdwatching', name: 'Madárles', emoji: '🐦' },
          { id: 'stargazing', name: 'Csillaglesés', emoji: '🔭' },
          { id: 'mushroom-hunting', name: 'Gombászás', emoji: '🍄' },
          { id: 'geocaching', name: 'Geocaching', emoji: '📍' },
          { id: 'nature-photography', name: 'Természetfotózás', emoji: '📸' },
        ],
      },
      {
        id: 'gardening',
        name: 'Kertészkedés',
        emoji: '🌱',
        profile: {
          ...PROFILES.outdoorAdventure,
          physicalIntensity: 'low' as PhysicalIntensity,
          hasDistance: false,
          groupSize: { min: 2, max: 15, typical: 5 },
        },
        activities: [
          { id: 'gardening', name: 'Kertészkedés', emoji: '🌱' },
          { id: 'urban-gardening', name: 'Városi kertészkedés', emoji: '🌿' },
          { id: 'permaculture', name: 'Permakultúra', emoji: '🌍' },
          { id: 'bonsai', name: 'Bonsai', emoji: '🌳' },
        ],
      },
      {
        id: 'fishing',
        name: 'Horgászat',
        emoji: '🎣',
        profile: {
          ...PROFILES.outdoorAdventure,
          physicalIntensity: 'low' as PhysicalIntensity,
          groupSize: { min: 2, max: 15, typical: 4 },
          isCompetitive: true,
        },
        activities: [
          { id: 'fishing', name: 'Horgászat', emoji: '🎣' },
          { id: 'fly-fishing', name: 'Légy horgászat', emoji: '🎣' },
          { id: 'ice-fishing', name: 'Jéghorgászat', emoji: '🧊' },
        ],
      },
    ],
  },

  // ══════════════ 4. KREATÍV & KÉZMŰVES ══════════════
  {
    id: 'creative',
    name: 'Kreatív & Kézműves',
    emoji: '🎨',
    description: 'Művészet, kézműves alkotás és kreatív workshopok',
    subcategories: [
      {
        id: 'visual-arts',
        name: 'Vizuális művészet',
        emoji: '🎨',
        profile: PROFILES.creativeWorkshop,
        activities: [
          { id: 'painting', name: 'Festés', emoji: '🎨', keywords: ['akril', 'olaj', 'akvarell'] },
          { id: 'drawing', name: 'Rajzolás', emoji: '✏️' },
          { id: 'digital-art', name: 'Digitális rajz', emoji: '🖥️', profile: { canBeOnline: true } },
          { id: 'calligraphy', name: 'Kalligráfia / Betűrajz', emoji: '✒️' },
          { id: 'illustration', name: 'Illusztráció', emoji: '🖌️' },
        ],
      },
      {
        id: 'craft',
        name: 'Kézművesség',
        emoji: '🧶',
        profile: PROFILES.creativeWorkshop,
        activities: [
          { id: 'ceramics', name: 'Kerámiázás', emoji: '🏺', keywords: ['fazekasság'] },
          { id: 'knitting-crochet', name: 'Kötés & Horgolás', emoji: '🧶' },
          { id: 'sewing', name: 'Varrás', emoji: '🧵' },
          { id: 'jewelry', name: 'Ékszerkészítés', emoji: '💎' },
          { id: 'woodworking', name: 'Famunkák & Faragás', emoji: '🪵' },
          { id: 'leatherwork', name: 'Bőrművesség', emoji: '👜' },
          { id: 'candle-making', name: 'Gyertyakészítés', emoji: '🕯️' },
          { id: 'soap-making', name: 'Szappankészítés', emoji: '🧼' },
          { id: 'origami', name: 'Origami & Papírművészet', emoji: '📄' },
          { id: 'mosaic', name: 'Mozaik', emoji: '🟦' },
          { id: 'macrame', name: 'Makramé', emoji: '🪢' },
        ],
      },
      {
        id: 'diy',
        name: 'Barkácsolás & DIY',
        emoji: '🔨',
        profile: { ...PROFILES.creativeWorkshop, hasEquipment: true },
        activities: [
          { id: 'diy-home', name: 'Lakásfelújítás / DIY', emoji: '🔨' },
          { id: 'upcycling', name: 'Upcycling', emoji: '♻️' },
          { id: 'model-building', name: 'Modellezés', emoji: '🚂' },
        ],
      },
    ],
  },

  // ══════════════ 5. ZENE ══════════════
  {
    id: 'music',
    name: 'Zene',
    emoji: '🎸',
    description: 'Hangszerek, éneklés és zenei közösségek',
    subcategories: [
      {
        id: 'instruments',
        name: 'Hangszerjáték',
        emoji: '🎸',
        profile: PROFILES.music,
        activities: [
          { id: 'guitar', name: 'Gitár', emoji: '🎸' },
          { id: 'piano', name: 'Zongora', emoji: '🎹' },
          { id: 'drums', name: 'Dob', emoji: '🥁' },
          { id: 'violin', name: 'Hegedű', emoji: '🎻' },
          { id: 'ukulele', name: 'Ukulele', emoji: '🎸' },
          { id: 'bass', name: 'Basszusgitár', emoji: '🎸' },
          { id: 'wind', name: 'Fúvós hangszerek', emoji: '🎺' },
        ],
      },
      {
        id: 'vocal',
        name: 'Éneklés',
        emoji: '🎤',
        profile: { ...PROFILES.music, hasEquipment: false },
        activities: [
          { id: 'singing', name: 'Éneklés', emoji: '🎤' },
          { id: 'choir', name: 'Kórus', emoji: '🎶', profile: { groupSize: { min: 8, max: 60, typical: 25 } } },
          { id: 'karaoke', name: 'Karaoke', emoji: '🎤' },
          { id: 'beatbox', name: 'Beatbox', emoji: '🎤' },
        ],
      },
      {
        id: 'music-production',
        name: 'Zeneprodukció',
        emoji: '🎛️',
        profile: { ...PROFILES.music, canBeOnline: true },
        activities: [
          { id: 'dj', name: 'DJ-zés', emoji: '🎛️' },
          { id: 'music-production', name: 'Zeneszerzés / Produceálás', emoji: '🎧' },
          { id: 'jam-session', name: 'Jam session', emoji: '🎵' },
        ],
      },
    ],
  },

  // ══════════════ 6. TÁNC ══════════════
  {
    id: 'dance',
    name: 'Tánc',
    emoji: '💃',
    description: 'Társastánc, modern tánc és mozgásművészet',
    subcategories: [
      {
        id: 'partner-dance',
        name: 'Páros tánc',
        emoji: '💃',
        profile: { ...PROFILES.dance, groupSize: { min: 2, max: 30, typical: 14 } },
        activities: [
          { id: 'salsa', name: 'Salsa', emoji: '💃' },
          { id: 'bachata', name: 'Bachata', emoji: '💃' },
          { id: 'tango', name: 'Tangó', emoji: '💃' },
          { id: 'ballroom', name: 'Társastánc (standard & latin)', emoji: '💃' },
          { id: 'swing', name: 'Swing / Lindy Hop', emoji: '💃' },
          { id: 'kizomba', name: 'Kizomba', emoji: '💃' },
        ],
      },
      {
        id: 'solo-dance',
        name: 'Szólótánc',
        emoji: '🕺',
        profile: PROFILES.dance,
        activities: [
          { id: 'hip-hop', name: 'Hip-hop', emoji: '🕺' },
          { id: 'breakdance', name: 'Breakdance', emoji: '🕺' },
          { id: 'contemporary', name: 'Modern tánc', emoji: '🩰' },
          { id: 'ballet', name: 'Balett', emoji: '🩰' },
          { id: 'jazz-dance', name: 'Jazz tánc', emoji: '🕺' },
          { id: 'folk-dance', name: 'Néptánc', emoji: '🎭' },
          { id: 'belly-dance', name: 'Hastánc', emoji: '💃' },
          { id: 'zumba', name: 'Zumba', emoji: '💃', profile: { physicalIntensity: 'high' } },
        ],
      },
    ],
  },

  // ══════════════ 7. TÁRSASJÁTÉK & GONDOLKODÁS ══════════════
  {
    id: 'board-games',
    name: 'Társasjáték & Gondolkodás',
    emoji: '🎲',
    description: 'Társasjátékok, stratégiai játékok és agytornák',
    subcategories: [
      {
        id: 'tabletop',
        name: 'Társasjátékok',
        emoji: '🎲',
        profile: PROFILES.boardGame,
        activities: [
          { id: 'board-games', name: 'Társasozás (általános)', emoji: '🎲' },
          { id: 'chess', name: 'Sakk', emoji: '♟️', profile: { groupSize: { min: 2, max: 30, typical: 8 } } },
          { id: 'card-games', name: 'Kártyajátékok', emoji: '🃏' },
          { id: 'strategy-games', name: 'Stratégiai játékok', emoji: '🎲' },
          { id: 'rpg', name: 'Szerepjáték (D&D, stb.)', emoji: '🐉', profile: { suggestedDurationMin: 240 } },
          { id: 'wargaming', name: 'Wargaming / Miniature', emoji: '⚔️' },
        ],
      },
      {
        id: 'puzzle-quiz',
        name: 'Puzzle & Kvíz',
        emoji: '🧩',
        profile: { ...PROFILES.boardGame, isCompetitive: true },
        activities: [
          { id: 'puzzle', name: 'Puzzle', emoji: '🧩' },
          { id: 'quiz', name: 'Kvíz / Trivia', emoji: '❓' },
          { id: 'escape-room', name: 'Szabadulószoba', emoji: '🔐' },
          { id: 'crossword', name: 'Rejtvényfejtés', emoji: '📝' },
          { id: 'rubiks', name: 'Rubik-kocka / Speedcubing', emoji: '🟥' },
        ],
      },
      {
        id: 'poker-casino',
        name: 'Póker & Kaszinó',
        emoji: '🃏',
        profile: { ...PROFILES.boardGame, ageRestriction: '18+' as const },
        activities: [
          { id: 'poker', name: 'Póker', emoji: '🃏' },
          { id: 'bridge', name: 'Bridge', emoji: '🃏' },
          { id: 'backgammon', name: 'Backgammon', emoji: '🎲' },
        ],
      },
    ],
  },

  // ══════════════ 8. GAMING & E-SPORT ══════════════
  {
    id: 'gaming',
    name: 'Gaming & E-sport',
    emoji: '🎮',
    description: 'Videojátékok, e-sport és virtuális kalandok',
    subcategories: [
      {
        id: 'pc-console',
        name: 'PC & Konzol',
        emoji: '🎮',
        profile: PROFILES.gaming,
        activities: [
          { id: 'pc-gaming', name: 'PC gaming', emoji: '🖥️' },
          { id: 'console-gaming', name: 'Konzol (PlayStation, Xbox, Switch)', emoji: '🎮' },
          { id: 'lan-party', name: 'LAN party', emoji: '💻' },
          { id: 'retro-gaming', name: 'Retro gaming', emoji: '👾' },
          { id: 'vr-gaming', name: 'VR gaming', emoji: '🥽' },
        ],
      },
      {
        id: 'esport',
        name: 'E-sport',
        emoji: '🏆',
        profile: { ...PROFILES.gaming, isCompetitive: true },
        activities: [
          { id: 'esport-fps', name: 'FPS (CS2, Valorant)', emoji: '🔫' },
          { id: 'esport-moba', name: 'MOBA (LoL, Dota 2)', emoji: '⚔️' },
          { id: 'esport-br', name: 'Battle Royale (Fortnite, PUBG)', emoji: '🏝️' },
          { id: 'esport-sports', name: 'Sport szimulátorok (FIFA, NBA)', emoji: '⚽' },
          { id: 'esport-racing', name: 'Versenyjátékok (sim racing)', emoji: '🏎️' },
        ],
      },
      {
        id: 'mobile-casual',
        name: 'Mobil & Casual',
        emoji: '📱',
        profile: { ...PROFILES.gaming, canBeOnline: true },
        activities: [
          { id: 'mobile-gaming', name: 'Mobilos játékok', emoji: '📱' },
          { id: 'casual-gaming', name: 'Casual gaming', emoji: '🎮' },
        ],
      },
    ],
  },

  // ══════════════ 9. GASZTRONÓMIA ══════════════
  {
    id: 'gastronomy',
    name: 'Gasztronómia',
    emoji: '👨‍🍳',
    description: 'Főzés, sütés, kóstolók és kulináris élmények',
    subcategories: [
      {
        id: 'cooking',
        name: 'Főzés & Sütés',
        emoji: '👨‍🍳',
        profile: PROFILES.gastronomy,
        activities: [
          { id: 'cooking', name: 'Főzés', emoji: '👨‍🍳' },
          { id: 'baking', name: 'Sütés & Pékség', emoji: '🍰' },
          { id: 'bbq-grill', name: 'BBQ / Grillezés', emoji: '🥩', profile: { locationTypes: ['outdoor'] } },
          { id: 'fermentation', name: 'Fermentálás / Savanyítás', emoji: '🥒' },
          { id: 'sushi', name: 'Szusi készítés', emoji: '🍣' },
          { id: 'pasta', name: 'Friss tészta készítés', emoji: '🍝' },
        ],
      },
      {
        id: 'tasting',
        name: 'Kóstolók',
        emoji: '🍷',
        profile: { ...PROFILES.gastronomy, ageRestriction: '18+' as const },
        activities: [
          { id: 'wine-tasting', name: 'Borkóstolás', emoji: '🍷' },
          { id: 'craft-beer', name: 'Craft sör kóstoló', emoji: '🍺' },
          { id: 'whiskey', name: 'Whiskey kóstolás', emoji: '🥃' },
          { id: 'coffee', name: 'Kávékultúra & Cupping', emoji: '☕', profile: { ageRestriction: 'all' } },
          { id: 'tea', name: 'Teaceremónia', emoji: '🍵', profile: { ageRestriction: 'all' } },
          { id: 'chocolate', name: 'Csokikóstolás', emoji: '🍫', profile: { ageRestriction: 'all' } },
        ],
      },
    ],
  },

  // ══════════════ 10. FOTÓ & FILM ══════════════
  {
    id: 'photo-film',
    name: 'Fotó & Film',
    emoji: '📸',
    description: 'Fotózás, videózás és vizuális történetmesélés',
    subcategories: [
      {
        id: 'photography',
        name: 'Fotózás',
        emoji: '📸',
        profile: PROFILES.photoVideo,
        activities: [
          { id: 'photography', name: 'Fotózás (általános)', emoji: '📸' },
          { id: 'street-photo', name: 'Street fotózás', emoji: '📷' },
          { id: 'portrait', name: 'Portréfotózás', emoji: '📸' },
          { id: 'landscape-photo', name: 'Tájképfotózás', emoji: '🌅' },
          { id: 'macro-photo', name: 'Makró fotózás', emoji: '🔬' },
          { id: 'astrophotography', name: 'Asztrofotózás', emoji: '🌌' },
          { id: 'analog-photo', name: 'Analóg fotózás', emoji: '📷' },
        ],
      },
      {
        id: 'video',
        name: 'Videó & Film',
        emoji: '🎬',
        profile: PROFILES.photoVideo,
        activities: [
          { id: 'videography', name: 'Videózás', emoji: '🎬' },
          { id: 'drone', name: 'Drónozás', emoji: '🚁' },
          { id: 'short-film', name: 'Kisfilm készítés', emoji: '🎥' },
          { id: 'vlogging', name: 'Vlogging', emoji: '📹' },
          { id: 'video-editing', name: 'Videóvágás', emoji: '🎞️', profile: { canBeOnline: true } },
        ],
      },
    ],
  },

  // ══════════════ 11. TECHNOLÓGIA & TUDOMÁNY ══════════════
  {
    id: 'tech',
    name: 'Technológia & Tudomány',
    emoji: '💻',
    description: 'Programozás, maker kultúra és tudományos felfedezés',
    subcategories: [
      {
        id: 'programming',
        name: 'Programozás & IT',
        emoji: '💻',
        profile: PROFILES.tech,
        activities: [
          { id: 'coding', name: 'Programozás', emoji: '💻', keywords: ['kódolás', 'fejlesztés'] },
          { id: 'web-dev', name: 'Webfejlesztés', emoji: '🌐' },
          { id: 'mobile-dev', name: 'Mobilfejlesztés', emoji: '📱' },
          { id: 'ai-ml', name: 'AI / Gépi tanulás', emoji: '🤖' },
          { id: 'cybersecurity', name: 'Kiberbiztonság', emoji: '🔒' },
          { id: 'hackathon', name: 'Hackathon', emoji: '💡', profile: { suggestedDurationMin: 480 } },
          { id: 'open-source', name: 'Nyílt forráskód', emoji: '🐧' },
        ],
      },
      {
        id: 'maker',
        name: 'Maker & Mérnöki',
        emoji: '🔧',
        profile: PROFILES.tech,
        activities: [
          { id: '3d-printing', name: '3D nyomtatás', emoji: '🖨️' },
          { id: 'robotics', name: 'Robotika', emoji: '🤖' },
          { id: 'electronics', name: 'Elektronika (Arduino, Raspberry Pi)', emoji: '🔌' },
          { id: 'cnc-laser', name: 'CNC / Lézervágás', emoji: '🔧' },
          { id: 'ham-radio', name: 'Amatőr rádió', emoji: '📻' },
        ],
      },
      {
        id: 'science',
        name: 'Tudomány',
        emoji: '🔬',
        profile: { ...PROFILES.tech, hasEquipment: false },
        activities: [
          { id: 'astronomy', name: 'Csillagászat', emoji: '🔭', profile: { locationTypes: ['outdoor'] } },
          { id: 'citizen-science', name: 'Citizen Science', emoji: '🔬' },
          { id: 'science-cafe', name: 'Tudománykávézó', emoji: '🧪' },
        ],
      },
    ],
  },

  // ══════════════ 12. IRODALOM & TANULÁS ══════════════
  {
    id: 'learning',
    name: 'Irodalom & Tanulás',
    emoji: '📚',
    description: 'Olvasás, nyelvtanulás és önfejlesztés',
    subcategories: [
      {
        id: 'reading',
        name: 'Olvasás & Írás',
        emoji: '📖',
        profile: PROFILES.learning,
        activities: [
          { id: 'book-club', name: 'Könyvklub', emoji: '📖' },
          { id: 'creative-writing', name: 'Kreatív írás', emoji: '✍️' },
          { id: 'poetry', name: 'Verselés / Slam poetry', emoji: '📜' },
          { id: 'blogging', name: 'Blogolás', emoji: '💻' },
          { id: 'journalism', name: 'Újságírás', emoji: '📰' },
        ],
      },
      {
        id: 'languages',
        name: 'Nyelvtanulás',
        emoji: '🌍',
        profile: { ...PROFILES.learning, canBeOnline: true },
        activities: [
          { id: 'english', name: 'Angol nyelvgyakorlás', emoji: '🇬🇧' },
          { id: 'german', name: 'Német nyelvgyakorlás', emoji: '🇩🇪' },
          { id: 'spanish', name: 'Spanyol nyelvgyakorlás', emoji: '🇪🇸' },
          { id: 'japanese', name: 'Japán nyelvgyakorlás', emoji: '🇯🇵' },
          { id: 'language-exchange', name: 'Nyelvcsere (tandem)', emoji: '🗣️' },
          { id: 'sign-language', name: 'Jelnyelv', emoji: '🤟' },
        ],
      },
      {
        id: 'self-development',
        name: 'Önfejlesztés',
        emoji: '🧠',
        profile: PROFILES.learning,
        activities: [
          { id: 'self-improvement', name: 'Önfejlesztés', emoji: '🧠' },
          { id: 'public-speaking', name: 'Nyilvános beszéd', emoji: '🎙️' },
          { id: 'debate', name: 'Vita & Érvtechnika', emoji: '⚖️' },
          { id: 'philosophy', name: 'Filozófia kör', emoji: '🏛️' },
          { id: 'financial-literacy', name: 'Pénzügyi tudatosság', emoji: '💰' },
        ],
      },
    ],
  },

  // ══════════════ 13. ÁLLATOK ══════════════
  {
    id: 'animals',
    name: 'Állatok',
    emoji: '🐾',
    description: 'Házi kedvencek, állatvédelem és állatos programok',
    subcategories: [
      {
        id: 'pets',
        name: 'Házi kedvencek',
        emoji: '🐕',
        profile: PROFILES.animals,
        activities: [
          { id: 'dog-walking', name: 'Kutyasétáltatás', emoji: '🐕', keywords: ['kutya'] },
          { id: 'dog-training', name: 'Kutyakiképzés', emoji: '🐕‍🦺' },
          { id: 'dog-sport', name: 'Kutyasport (agility)', emoji: '🐶' },
          { id: 'cat-cafe', name: 'Macskakávézó', emoji: '🐱' },
          { id: 'aquaristics', name: 'Akvarisztika', emoji: '🐠', profile: { locationTypes: ['indoor'] } },
          { id: 'terrarium', name: 'Terrarisztika', emoji: '🦎', profile: { locationTypes: ['indoor'] } },
        ],
      },
      {
        id: 'animal-welfare',
        name: 'Állatvédelem',
        emoji: '🐾',
        profile: { ...PROFILES.animals, groupSize: { min: 3, max: 30, typical: 10 } },
        activities: [
          { id: 'shelter-volunteering', name: 'Menhelyi önkéntesség', emoji: '🐾' },
          { id: 'wildlife-rescue', name: 'Vadállatmentés', emoji: '🦔' },
        ],
      },
    ],
  },

  // ══════════════ 14. UTAZÁS & FELFEDEZÉS ══════════════
  {
    id: 'travel',
    name: 'Utazás & Felfedezés',
    emoji: '✈️',
    description: 'Utazás, felfedezés és kulturális kalandok',
    subcategories: [
      {
        id: 'travel-styles',
        name: 'Utazási stílusok',
        emoji: '🌍',
        profile: {
          ...PROFILES.social,
          hasDistance: true,
          suggestedDurationMin: 480,
          groupSize: { min: 2, max: 20, typical: 6 },
        },
        activities: [
          { id: 'backpacking', name: 'Hátizsákos utazás', emoji: '🎒' },
          { id: 'road-trip', name: 'Roadtrip', emoji: '🚗' },
          { id: 'cultural-tour', name: 'Kulturális túra', emoji: '🏛️' },
          { id: 'city-walk', name: 'Városfelfedezés / Séta', emoji: '🚶' },
          { id: 'van-life', name: 'Van life', emoji: '🚐' },
          { id: 'camping', name: 'Kempingezés', emoji: '⛺' },
        ],
      },
    ],
  },

  // ══════════════ 15. DIVAT & SZÉPSÉG ══════════════
  {
    id: 'fashion',
    name: 'Divat & Szépség',
    emoji: '👗',
    description: 'Stílus, szépségápolás és divatvilág',
    subcategories: [
      {
        id: 'beauty',
        name: 'Szépség',
        emoji: '💄',
        profile: { ...PROFILES.creativeWorkshop, groupSize: { min: 2, max: 12, typical: 6 } },
        activities: [
          { id: 'makeup', name: 'Sminkelés', emoji: '💄' },
          { id: 'nail-art', name: 'Körömdíszítés', emoji: '💅' },
          { id: 'skincare', name: 'Bőrápolás', emoji: '🧴' },
          { id: 'hairstyling', name: 'Frizurakészítés', emoji: '💇' },
        ],
      },
      {
        id: 'fashion-style',
        name: 'Divat & Stílus',
        emoji: '👗',
        profile: { ...PROFILES.creativeWorkshop, groupSize: { min: 2, max: 15, typical: 6 } },
        activities: [
          { id: 'styling', name: 'Öltözködés / Styling', emoji: '👗' },
          { id: 'thrifting', name: 'Vintage / Turkálás', emoji: '👚' },
          { id: 'fashion-design', name: 'Divattervezés', emoji: '✏️' },
          { id: 'cosplay', name: 'Cosplay', emoji: '🦸' },
        ],
      },
    ],
  },

  // ══════════════ 16. ÖNKÉNTESSÉG & KÖZÖSSÉG ══════════════
  {
    id: 'volunteering',
    name: 'Önkéntesség & Közösség',
    emoji: '🤝',
    description: 'Önkéntes munka, jótékonykodás és közösségépítés',
    subcategories: [
      {
        id: 'environmental',
        name: 'Környezetvédelem',
        emoji: '🌍',
        profile: PROFILES.volunteer,
        activities: [
          { id: 'cleanup', name: 'Szemétszedés / Takarítás', emoji: '🗑️' },
          { id: 'tree-planting', name: 'Faültetés', emoji: '🌳' },
          { id: 'beach-cleanup', name: 'Partszakasz takarítás', emoji: '🏖️' },
          { id: 'eco-workshop', name: 'Környezettudatos workshop', emoji: '♻️' },
        ],
      },
      {
        id: 'social-volunteering',
        name: 'Szociális',
        emoji: '💛',
        profile: PROFILES.volunteer,
        activities: [
          { id: 'elderly-care', name: 'Idősek látogatása', emoji: '👵' },
          { id: 'tutoring', name: 'Korrepetálás / Mentorálás', emoji: '📚' },
          { id: 'food-bank', name: 'Ételosztás', emoji: '🍲' },
          { id: 'charity-event', name: 'Jótékonysági rendezvény', emoji: '❤️' },
        ],
      },
      {
        id: 'community',
        name: 'Közösségépítés',
        emoji: '🏘️',
        profile: PROFILES.social,
        activities: [
          { id: 'meetup', name: 'Meetup / Networking', emoji: '🤝' },
          { id: 'coworking', name: 'Coworking day', emoji: '💼' },
          { id: 'cultural-event', name: 'Kulturális est', emoji: '🎭' },
          { id: 'open-mic', name: 'Open mic', emoji: '🎤' },
          { id: 'movie-night', name: 'Filmklub / Moziest', emoji: '🎬' },
          { id: 'market', name: 'Piac / Vásár látogatás', emoji: '🛍️' },
        ],
      },
    ],
  },

  // ══════════════ 17. SZÍNHÁZ & ELŐADÓMŰVÉSZET ══════════════
  {
    id: 'performing-arts',
    name: 'Színház & Előadóművészet',
    emoji: '🎭',
    description: 'Színjátszás, improvizáció és előadások',
    subcategories: [
      {
        id: 'theater',
        name: 'Színház',
        emoji: '🎭',
        profile: { ...PROFILES.social, hasSkillLevel: true, groupSize: { min: 3, max: 25, typical: 10 } },
        activities: [
          { id: 'acting', name: 'Színjátszás', emoji: '🎭' },
          { id: 'improv', name: 'Improvizáció', emoji: '🎭' },
          { id: 'stand-up', name: 'Stand-up comedy', emoji: '🎤' },
          { id: 'puppetry', name: 'Bábszínház', emoji: '🎪' },
          { id: 'theater-visit', name: 'Színházlátogatás', emoji: '🎭' },
        ],
      },
    ],
  },
];

// ─── Helper utilities ─────────────────────────────────────────────────────────

/** Get the resolved activity profile (merges activity overrides into subcategory default) */
export function getActivityProfile(categoryId: string, subcategoryId: string, activityId: string): ActivityProfile {
  const cat = HOBBY_CATALOG.find(c => c.id === categoryId);
  const sub = cat?.subcategories.find(s => s.id === subcategoryId);
  const act = sub?.activities.find(a => a.id === activityId);
  
  if (!sub) throw new Error(`Subcategory not found: ${categoryId}/${subcategoryId}`);
  
  return { ...sub.profile, ...(act?.profile || {}) } as ActivityProfile;
}

/** Flat list of all activities with their full path */
export interface FlatActivity {
  categoryId: string;
  categoryName: string;
  categoryEmoji: string;
  subcategoryId: string;
  subcategoryName: string;
  activityId: string;
  activityName: string;
  activityEmoji: string;
  profile: ActivityProfile;
  keywords: string[];
}

let _flatCache: FlatActivity[] | null = null;

export function getAllActivitiesFlat(): FlatActivity[] {
  if (_flatCache) return _flatCache;
  
  const result: FlatActivity[] = [];
  for (const cat of HOBBY_CATALOG) {
    for (const sub of cat.subcategories) {
      for (const act of sub.activities) {
        result.push({
          categoryId: cat.id,
          categoryName: cat.name,
          categoryEmoji: cat.emoji,
          subcategoryId: sub.id,
          subcategoryName: sub.name,
          activityId: act.id,
          activityName: act.name,
          activityEmoji: act.emoji || sub.emoji || cat.emoji,
          profile: { ...sub.profile, ...(act.profile || {}) } as ActivityProfile,
          keywords: [
            act.name.toLowerCase(),
            sub.name.toLowerCase(),
            cat.name.toLowerCase(),
            ...(act.keywords || []).map(k => k.toLowerCase()),
          ],
        });
      }
    }
  }
  
  _flatCache = result;
  return result;
}

/** Search activities by text query */
export function searchActivities(query: string): FlatActivity[] {
  const q = query.toLowerCase().trim();
  if (!q) return getAllActivitiesFlat();
  
  return getAllActivitiesFlat().filter(a =>
    a.keywords.some(k => k.includes(q)) ||
    a.activityName.toLowerCase().includes(q) ||
    a.subcategoryName.toLowerCase().includes(q) ||
    a.categoryName.toLowerCase().includes(q)
  );
}

/** Get all category names for simple dropdown (backward compatible) */
export function getCategoryOptions(): string[] {
  return HOBBY_CATALOG.map(c => c.name);
}

/** Get subcategories for a category */
export function getSubcategoriesFor(categoryId: string) {
  return HOBBY_CATALOG.find(c => c.id === categoryId)?.subcategories || [];
}

/** Stats */
export function getCatalogStats() {
  const flat = getAllActivitiesFlat();
  return {
    categories: HOBBY_CATALOG.length,
    subcategories: HOBBY_CATALOG.reduce((acc, c) => acc + c.subcategories.length, 0),
    activities: flat.length,
  };
}
