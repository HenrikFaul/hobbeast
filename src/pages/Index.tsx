import { Link, useNavigate } from "react-router-dom";
import { ArrowRight, Compass, MapPin, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/layout/PageHeader";
import FeaturesSection from "@/components/FeaturesSection";
import ResearchSection from "@/components/ResearchSection";
import CTASection from "@/components/CTASection";
import heroImg from "@/assets/hero-community.jpg";

const quickRoutes = [
  {
    title: "Felfedezés",
    description: "Böngészd végig a hobbi- és tevékenységkatalógust, és találd meg mi érdekel igazán.",
    icon: Compass,
    to: "/explore",
  },
  {
    title: "Programok",
    description: "Nézd át a közelgő eseményeket, csatlakozz, vagy szervezz saját alkalmat.",
    icon: MapPin,
    to: "/events",
  },
  {
    title: "Közösség",
    description: "Alakíts személyes profilt, ments érdeklődési köröket és építs kapcsolódó közösséget.",
    icon: Users,
    to: "/profile",
  },
];

const heroStats = (
  <div className="grid w-full gap-3 sm:grid-cols-3 lg:w-auto">
    {[
      { label: "aktív közösség", value: "10K+" },
      { label: "program lehetőség", value: "500+" },
      { label: "hobbi és aktivitás", value: "80+" },
    ].map((item) => (
      <div key={item.label} className="metric-tile min-w-[140px]">
        <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
          {item.label}
        </div>
        <div className="mt-2 font-display text-2xl font-bold">{item.value}</div>
      </div>
    ))}
  </div>
);

const Index = () => {
  const navigate = useNavigate();

  return (
    <main className="min-h-screen pt-24 pb-16">
      <div className="container mx-auto px-4 page-stack">
        <section className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr] lg:items-stretch">
          <PageHeader
            eyebrow="Hobbeast redesign"
            title="Találd meg a közösségedet a hobbid által."
            subtitle="A Hobbeast összeköt hasonló érdeklődésű embereket, eseményeket és helyszíneket. Fedezz fel új tevékenységeket, csatlakozz programokhoz, és alakíts ki valódi közösségi élményeket."
            actions={
              <div className="flex flex-col gap-3 sm:flex-row">
                <Button
                  size="lg"
                  className="rounded-full border-0 gradient-primary px-6 text-primary-foreground shadow-glow"
                  onClick={() => navigate("/events")}
                >
                  Események böngészése
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
                <Button size="lg" variant="outline" className="rounded-full px-6" onClick={() => navigate("/explore")}>
                  Felfedezem a hobbikat
                </Button>
              </div>
            }
            stats={heroStats}
          />

          <Card className="overflow-hidden rounded-[2rem] border-border/70 bg-card/80 shadow-card">
            <CardContent className="p-0">
              <div className="relative h-full min-h-[320px]">
                <img src={heroImg} alt="Hobbeast közösségi élmény" className="h-full w-full object-cover" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/45 via-black/10 to-transparent" />
                <div className="absolute inset-x-0 bottom-0 p-6 sm:p-8">
                  <div className="surface-panel max-w-md bg-background/85 p-5">
                    <div className="hero-chip mb-3">minden ami élmény</div>
                    <h2 className="font-display text-2xl font-bold tracking-tight">
                      Programok, emberek és közös szenvedélyek egy helyen.
                    </h2>
                    <p className="mt-2 text-sm leading-7 text-muted-foreground">
                      A személyes érdeklődésből közösségi élmény lesz - online kereséstől a valódi találkozásig.
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </section>

        <section className="grid gap-4 lg:grid-cols-3">
          {quickRoutes.map((route) => (
            <Link key={route.title} to={route.to} className="group">
              <Card className="h-full rounded-[1.75rem] border-border/70 bg-card/80 hover-lift">
                <CardContent className="flex h-full flex-col gap-4 p-6">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                    <route.icon className="h-6 w-6" />
                  </div>
                  <div>
                    <h3 className="font-display text-xl font-semibold">{route.title}</h3>
                    <p className="mt-2 text-sm leading-7 text-muted-foreground">{route.description}</p>
                  </div>
                  <div className="mt-auto inline-flex items-center text-sm font-medium text-primary">
                    Tovább
                    <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" />
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </section>

        <section className="surface-panel overflow-hidden">
          <div className="soft-divider grid gap-0 lg:grid-cols-[0.92fr_1.08fr] lg:border-t-0">
            <div className="border-b border-border/60 p-6 lg:border-b-0 lg:border-r lg:p-8">
              <div className="hero-chip mb-3">miért működik</div>
              <h2 className="section-title">A Hobbeast nem csak listáz, hanem kontextust is ad.</h2>
              <p className="mt-4 text-sm leading-7 text-muted-foreground sm:text-base">
                A tevékenységek, a helyszínek, a távolság, a profil és a közösségi flow-k együtt segítenek abban,
                hogy a programkeresésből valódi részvétel legyen.
              </p>
              <div className="mt-6 grid gap-3 sm:grid-cols-2">
                {[
                  "érdeklődés-alapú ajánlás",
                  "események és helyszínek együtt",
                  "organizer és admin nézetek",
                  "mobil-first közösségi használat",
                ].map((item) => (
                  <div key={item} className="metric-tile text-sm font-medium text-foreground/85">
                    {item}
                  </div>
                ))}
              </div>
            </div>
            <div className="p-2 sm:p-3 lg:p-4">
              <FeaturesSection />
            </div>
          </div>
        </section>

        <section className="grid gap-6 xl:grid-cols-[1fr_0.95fr]">
          <div className="surface-panel p-2 sm:p-3">
            <ResearchSection />
          </div>
          <div className="surface-panel p-2 sm:p-3">
            <CTASection />
          </div>
        </section>
      </div>
    </main>
  );
};

export default Index;
