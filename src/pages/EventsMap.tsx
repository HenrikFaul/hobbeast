import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { LayoutGrid, MapPinned } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EventsMapView } from '@/components/events/EventsMapView';

/**
 * Map-first discovery: the counterpart of the card list. Kept on its own route
 * so the list view and its ranking logic stay untouched.
 */
const EventsMap = () => (
  <main className="min-h-screen pb-16 pt-24">
    <div className="container mx-auto px-4">
      <motion.header
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-6 flex flex-wrap items-end justify-between gap-3"
      >
        <div>
          <p className="text-[0.66rem] font-extrabold uppercase tracking-[0.15em] text-primary">
            Fedezd fel a térképen
          </p>
          <h1 className="mt-1 flex items-center gap-2 font-display text-2xl font-extrabold sm:text-3xl">
            <MapPinned className="h-7 w-7 text-primary" aria-hidden="true" />
            Hol vannak programok?
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Kicsinyítve megyénként, nagyítva városonként látod a programokat. Kattints egy buborékra,
            és megjelennek az ottani élmények.
          </p>
        </div>
        <Button asChild variant="outline" className="rounded-full">
          <Link to="/events">
            <LayoutGrid className="mr-1 h-4 w-4" aria-hidden="true" /> Listás nézet
          </Link>
        </Button>
      </motion.header>

      <EventsMapView />
    </div>
  </main>
);

export default EventsMap;
