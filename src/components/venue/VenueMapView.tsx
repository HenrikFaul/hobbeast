import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { CachedVenue } from './types';

// Fix default marker icon
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

interface VenueMapViewProps {
  venues: CachedVenue[];
  bias?: { lat: number; lon: number };
  onSelectVenue: (venue: CachedVenue) => void;
}

export function VenueMapView({ venues, bias, onSelectVenue }: VenueMapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    if (mapRef.current) {
      mapRef.current.remove();
      mapRef.current = null;
    }

    const center = bias
      ? [bias.lat, bias.lon] as [number, number]
      : venues.length > 0
        ? [venues[0].lat, venues[0].lon] as [number, number]
        : [47.497, 19.040] as [number, number];

    const map = L.map(containerRef.current, {
      center,
      zoom: 13,
      zoomControl: true,
    });

    // Fix z-index stacking: ensure map tiles/controls don't escape the container
    containerRef.current.style.position = 'relative';
    containerRef.current.style.zIndex = '0';

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap',
      maxZoom: 19,
    }).addTo(map);

    const bounds = L.latLngBounds([]);

    venues.forEach((v) => {
      const marker = L.marker([v.lat, v.lon]).addTo(map);
      const distText = v.distanceKm != null
        ? `<br/><small>${v.distanceKm < 1 ? `${Math.round(v.distanceKm * 1000)} m` : `${v.distanceKm.toFixed(1)} km`}</small>`
        : '';
      marker.bindPopup(
        `<strong>${v.name}</strong>${distText}<br/><small>${v.address || ''}</small>`
      );
      marker.on('click', () => onSelectVenue(v));
      bounds.extend([v.lat, v.lon]);
    });

    if (bias) bounds.extend([bias.lat, bias.lon]);
    if (bounds.isValid()) map.fitBounds(bounds, { padding: [30, 30], maxZoom: 14 });

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [venues, bias, onSelectVenue]);

  return (
    <div
      ref={containerRef}
      className="w-full h-[280px] rounded-xl border overflow-hidden relative"
      style={{ isolation: 'isolate' }}
    />
  );
}
