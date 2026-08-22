export const HOBBY_OPTIONS = [
  'Futás', 'Kerékpár', 'Túrázás', 'Jóga', 'Crossfit', 'Úszás', 'Tenisz', 'Kosárlabda', 'Foci',
  'Társasjátékok', 'Videójátékok', 'Sakk',
  'Festés', 'Rajzolás', 'Fotózás', 'Kézművesség', 'Kötés/Horgolás',
  'Gitár', 'Zongora', 'Éneklés', 'DJ',
  'Főzés', 'Sütés', 'Borkóstolás',
  'Programozás', 'AI/ML', '3D nyomtatás', 'Robotika',
  'Kutyasétáltatás', 'Önkéntesség', 'Nyelvtanulás', 'Olvasás', 'Írás', 'Tánc', 'Meditáció',
] as const;

export type HobbyOption = (typeof HOBBY_OPTIONS)[number];
