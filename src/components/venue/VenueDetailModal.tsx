import { Button } from '@/components/ui/button';
import { MapPin, Star, Phone, Globe, Clock, X, ExternalLink } from 'lucide-react';
import { motion } from 'framer-motion';
import type { CachedVenue } from './types';

interface VenueDetailModalProps {
  venue: CachedVenue;
  onClose: () => void;
  onSelect: (venue: CachedVenue) => void;
}

export function VenueDetailModal({ venue, onClose, onSelect }: VenueDetailModalProps) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-foreground/20 backdrop-blur-sm p-4" onClick={onClose}>
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95 }}
        transition={{ duration: 0.2 }}
        className="w-full max-w-lg max-h-[80vh] overflow-y-auto rounded-2xl border bg-card p-6 shadow-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10">
              <MapPin className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h4 className="font-display font-bold text-lg leading-tight">{venue.name}</h4>
              <p className="text-sm text-muted-foreground">{venue.city}</p>
            </div>
          </div>
          <Button variant="ghost" size="icon" className="rounded-xl" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="space-y-4">
          {venue.address && (
            <div className="flex items-start gap-2">
              <MapPin className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
              <p className="text-sm">{venue.address}</p>
            </div>
          )}

          {venue.phone && (
            <div className="flex items-center gap-2">
              <Phone className="h-4 w-4 text-muted-foreground flex-shrink-0" />
              <a href={`tel:${venue.phone}`} className="text-sm text-primary hover:underline">{venue.phone}</a>
            </div>
          )}

          {venue.website && (
            <div className="flex items-center gap-2">
              <Globe className="h-4 w-4 text-muted-foreground flex-shrink-0" />
              <a href={venue.website} target="_blank" rel="noopener noreferrer" className="text-sm text-primary hover:underline flex items-center gap-1">
                Weboldal <ExternalLink className="h-3 w-3" />
              </a>
            </div>
          )}

          {venue.opening_hours_text && venue.opening_hours_text.length > 0 && (
            <div className="flex items-start gap-2">
              <Clock className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
              <div className="text-sm space-y-0.5">
                {venue.opening_hours_text.map((h, i) => (
                  <p key={i} className="text-muted-foreground">{h}</p>
                ))}
              </div>
            </div>
          )}

          {venue.rating != null && venue.rating > 0 && (
            <div className="flex items-center gap-2">
              <Star className="h-4 w-4 text-amber-500 flex-shrink-0" />
              <span className="text-sm font-medium">{venue.rating.toFixed(1)} / 5</span>
            </div>
          )}

          {venue.tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {venue.tags.slice(0, 6).map((tag, i) => (
                <span key={i} className="text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                  {tag}
                </span>
              ))}
            </div>
          )}

          <p className="text-[10px] text-muted-foreground/50 uppercase tracking-wider">
            Forrás: {venue.provider === 'tomtom' ? 'TomTom' : 'Geoapify'}
          </p>

          {venue.distanceKm != null && (
            <p className="text-xs text-muted-foreground">
              📍 {venue.distanceKm < 1 ? `${Math.round(venue.distanceKm * 1000)} m` : `${venue.distanceKm.toFixed(1)} km`} távolságra
            </p>
          )}

          <div className="flex gap-2 pt-2">
            <Button
              type="button"
              className="flex-1 rounded-xl h-10 font-semibold"
              onClick={() => { onSelect(venue); onClose(); }}
            >
              <MapPin className="h-4 w-4 mr-2" />
              Helyszínnek kiválasztom
            </Button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
