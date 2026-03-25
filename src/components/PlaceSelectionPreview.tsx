import { Globe, MapPin, Phone, Tags } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { AddressSelection } from './AddressAutocomplete';

interface PlaceSelectionPreviewProps {
  selection: AddressSelection | null;
}

function categoryLabel(category: string) {
  const labels: Record<string, string> = {
    food_restaurant: 'Étterem',
    cafe: 'Kávézó',
    bar_nightlife: 'Bár / Esti hely',
    entertainment: 'Szórakozás',
    hobby_games: 'Hobbi / Játék',
    culture: 'Kultúra',
    sports: 'Sport',
    park_outdoor: 'Kültéri hely',
    shopping: 'Bolt',
    tourism: 'Látnivaló',
    generic_poi: 'Helyszín',
    unknown: 'Helyszín',
  };
  return labels[category] ?? category;
}

export function PlaceSelectionPreview({ selection }: PlaceSelectionPreviewProps) {
  if (!selection) return null;

  const details = selection.details;
  const categories = selection.categories?.slice(0, 3) ?? [];
  const addressLine = [selection.address, selection.city, selection.district].filter(Boolean).join(', ');

  return (
    <Card className="rounded-xl border-dashed bg-muted/20">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1 min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Kiválasztott helyszín</p>
            <p className="font-medium truncate">{selection.name || selection.displayName}</p>
            <p className="text-sm text-muted-foreground flex items-start gap-2">
              <MapPin className="h-4 w-4 mt-0.5 flex-shrink-0" />
              <span>{addressLine || selection.displayName}</span>
            </p>
          </div>
          {selection.source && (
            <Badge variant="secondary" className="rounded-lg capitalize">
              {selection.source === 'merged' ? 'Geoapify + TomTom' : selection.source}
            </Badge>
          )}
        </div>

        {categories.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {categories.map((category) => (
              <Badge key={category} variant="outline" className="rounded-lg text-xs">
                <Tags className="mr-1 h-3 w-3" />
                {categoryLabel(category)}
              </Badge>
            ))}
          </div>
        )}

        {(details?.website || details?.phone) && (
          <div className="grid gap-2 sm:grid-cols-2 text-sm text-muted-foreground">
            {details.website && (
              <a
                href={details.website.startsWith('http') ? details.website : `https://${details.website}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 hover:text-primary"
              >
                <Globe className="h-4 w-4" />
                <span className="truncate">{details.website}</span>
              </a>
            )}
            {details.phone && (
              <div className="inline-flex items-center gap-2">
                <Phone className="h-4 w-4" />
                <span>{details.phone}</span>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
