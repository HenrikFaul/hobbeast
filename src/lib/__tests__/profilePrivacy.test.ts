import { describe, expect, it } from 'vitest';
import { buildPublicProfileDto, PUBLIC_PROFILE_FORBIDDEN_KEYS } from '@/lib/profilePrivacy';

describe('buildPublicProfileDto (privacy characterization)', () => {
  const fullRow = {
    user_id: 'user-123',
    display_name: 'Anna',
    avatar_url: 'https://example.com/a.png',
    date_of_birth: '1990-05-10',
    gender: 'female',
    gender_public: true,
    age_public: false,
    address: 'Fő utca 1, 1051 Budapest',
    city: 'Budapest',
    hobbies: ['Túrázás', 'Fotózás'],
    email: 'anna@example.com',
    phone: '+36 30 123 4567',
    location_lat: 47.4979,
    location_lon: 19.0402,
  };

  it('never leaks a private key into the public DTO', () => {
    const dto = buildPublicProfileDto(fullRow);
    for (const key of PUBLIC_PROFILE_FORBIDDEN_KEYS) {
      expect(dto).not.toHaveProperty(key);
    }
  });

  it('keeps only whitelisted public fields', () => {
    const dto = buildPublicProfileDto(fullRow);
    expect(Object.keys(dto).sort()).toEqual([
      'age_public',
      'avatar_url',
      'city',
      'city_area',
      'display_name',
      'gender_public',
      'hobbies',
      'user_id',
    ]);
  });

  it('maps whitelisted fields correctly', () => {
    const dto = buildPublicProfileDto(fullRow);
    expect(dto.user_id).toBe('user-123');
    expect(dto.display_name).toBe('Anna');
    expect(dto.avatar_url).toBe('https://example.com/a.png');
    expect(dto.city).toBe('Budapest');
    expect(dto.city_area).toBe('Budapest');
    expect(dto.hobbies).toEqual(['Túrázás', 'Fotózás']);
    expect(dto.gender_public).toBe(true);
    expect(dto.age_public).toBe(false);
  });

  it('is side-effect free (does not mutate the input row)', () => {
    const input = { ...fullRow };
    buildPublicProfileDto(input);
    expect(input).toEqual(fullRow);
    expect(input).toHaveProperty('email');
    expect(input).toHaveProperty('address');
  });

  it('handles a sparse row with defaults', () => {
    const dto = buildPublicProfileDto({ user_id: 'u1' });
    expect(dto).toMatchObject({
      user_id: 'u1',
      display_name: '',
      avatar_url: null,
      city: null,
      hobbies: [],
      gender_public: false,
      age_public: false,
      city_area: null,
    });
  });

  it('normalizes hobbies: trims strings and drops empties', () => {
    const dto = buildPublicProfileDto({ hobbies: [' Túrázás ', '', null] });
    expect(dto.hobbies).toEqual(['Túrázás']);
  });
});