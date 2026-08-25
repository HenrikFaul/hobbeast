import { useEffect } from "react";
import {
  AlertTriangle,
  ArrowUpRight,
  Building2,
  CheckCircle2,
  Cookie,
  FileCheck2,
  HeartHandshake,
  LockKeyhole,
  Mail,
  Scale,
  ShieldCheck,
  Sparkles,
  UserRoundCheck,
} from "lucide-react";

const legalNav = [
  ["impresszum", "Impresszum"],
  ["adatkezeles", "Adatkezelés"],
  ["sutik", "Sütik"],
  ["feltetelek", "Feltételek"],
  ["kozossegi-alapelvek", "Közösségi alapelvek"],
] as const;

const dataRows = [
  {
    purpose: "Fiók, profil és bejelentkezés",
    data: "azonosító, e-mail, megjelenített név, profilbeállítások",
    basis: "szerződés előkészítése és teljesítése; a választható mezőknél hozzájárulás",
    retention: "a fiók fennállásáig, majd a jóváhagyott törlési folyamat szerint",
  },
  {
    purpose: "Események, csatlakozás és közösségi funkciók",
    data: "érdeklődések, részvétel, Circle- és Hub-tagság, szervezői műveletek",
    basis: "a kért szolgáltatás teljesítése; biztonsági eseményeknél jogos érdek vagy jogi kötelezettség",
    retention: "az esemény vagy tagság életciklusa, illetve a kapcsolódó jóváhagyott megőrzési idő",
  },
  {
    purpose: "Biztonság, bejelentések és moderáció",
    data: "tiltások, bejelentések, ügyállapotok, auditnyom",
    basis: "jogos érdek a felhasználók és a szolgáltatás védelmében; szükség szerint jogi kötelezettség",
    retention: "ügytípustól függ; a végleges határidők jogi jóváhagyása még szükséges",
  },
  {
    purpose: "Termékminőség és alapvető analitika",
    data: "pszeudonimizált események; tiltott a pontos hely, e-mail, telefonszám és szabad szöveg",
    basis: "hozzájárulás, ahol az szükséges; egyébként dokumentált jogos érdek",
    retention: "mérnöki célérték: legfeljebb 395 nap, jogi jóváhagyásig nem tekinthető véglegesnek",
  },
  {
    purpose: "Opcionális értesítések",
    data: "értesítési választás, csendes idő, kézbesítési állapot",
    basis: "hozzájárulás, amely bármikor visszavonható",
    retention: "a visszavonásig vagy a fiók törléséig, a kézbesítési naplókra külön szabállyal",
  },
] as const;

const rights = [
  "tájékoztatást és hozzáférést kérhetsz a rólad kezelt adatokhoz",
  "kérheted a pontatlan adatok helyesbítését",
  "a feltételek fennállásakor kérheted az adatok törlését vagy korlátozását",
  "tiltakozhatsz a jogos érdeken alapuló adatkezelés ellen",
  "a hozzájárulásodat a jövőre nézve bármikor visszavonhatod",
  "az alkalmazható esetekben kérheted az adathordozhatóságot",
  "panaszt tehetsz a Nemzeti Adatvédelmi és Információszabadság Hatóságnál",
] as const;

const principles = [
  ["Ember az első", "A másik ember nem profilkártya: figyelemmel, tisztelettel és valós határokkal kapcsolódunk."],
  ["A beleegyezés folyamatos", "A nem, a később és a most inkább mást szeretnék teljes mondatok. A határokat minden helyzetben tiszteletben tartjuk."],
  ["Nincs helye zaklatásnak", "Gyűlölet, fenyegetés, megszégyenítés, manipuláció vagy nem kívánt szexuális közeledés nem fér bele."],
  ["Biztonság közösen", "Gyanús vagy veszélyes helyzetet jelents; sürgős veszélyben az alkalmazás helyett a helyi segélyhívót keresd."],
] as const;

const Legal = () => {
  useEffect(() => {
    if (!window.location.hash) return;
    const target = document.getElementById(window.location.hash.slice(1));
    target?.scrollIntoView({ block: "start" });
  }, []);

  return (
  <main className="min-h-screen bg-[#fffaf1] pb-20 pt-24 text-[#183124]">
    <section className="container mx-auto px-4">
      <div className="relative overflow-hidden rounded-[2.5rem] bg-[#251b43] px-6 py-12 text-white shadow-[0_30px_80px_rgba(37,27,67,0.2)] sm:px-10 sm:py-16 lg:px-16">
        <div aria-hidden="true" className="absolute -right-20 -top-28 h-80 w-80 rounded-full border-[56px] border-[#c9b7ff]/15" />
        <div aria-hidden="true" className="absolute -bottom-32 left-[38%] h-72 w-72 rounded-full bg-[#ff8f72]/20 blur-3xl" />
        <div className="relative max-w-4xl">
          <p className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-4 py-2 text-xs font-extrabold uppercase tracking-[0.16em] text-[#dfff62]">
            <Scale size={14} aria-hidden="true" /> Expericentre · jogi központ
          </p>
          <h1 className="mt-6 max-w-4xl font-display font-extrabold" style={{ fontSize: "clamp(3rem, 6vw, 5rem)", lineHeight: 0.94, letterSpacing: "-0.06em" }}>
            Tiszta szabályok. <span className="text-[#ff8f72]">Emberi nyelven.</span>
          </h1>
          <p className="mt-6 max-w-2xl text-base font-medium leading-relaxed text-white/72 sm:text-lg">
            Itt egy helyen találod, hogyan működik a Hobbeast, milyen adatokat kezel a szolgáltatás, és milyen közösséget építünk az Expericentre keretében.
          </p>
          <div className="mt-8 flex flex-wrap gap-3 text-xs font-bold text-white/75">
            <span className="rounded-full border border-white/15 bg-white/10 px-4 py-2">Verzió: 0.1 jogi tervezet</span>
            <span className="rounded-full border border-white/15 bg-white/10 px-4 py-2">Frissítve: 2026. augusztus 25.</span>
          </div>
        </div>
      </div>

      <div className="relative z-10 mx-auto -mt-5 max-w-5xl rounded-3xl border border-amber-300/60 bg-amber-50 p-5 shadow-lg sm:p-6">
        <div className="flex gap-4">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-amber-200 text-amber-900"><AlertTriangle size={21} aria-hidden="true" /></span>
          <div>
            <h2 className="font-display text-lg font-extrabold text-amber-950">Jogi felülvizsgálatra váró tervezet</h2>
            <p className="mt-1 text-sm leading-relaxed text-amber-950/75">
              Ez az oldal nem végleges, ügyvéd által jóváhagyott tájékoztató. A repóban nincs igazolt jogi üzemeltetői név, székhely, nyilvántartási szám, adószám, végleges adatmegőrzési szabály vagy teljes adatfeldolgozói jegyzék. Ezek közzététel előtt tulajdonosi és jogi jóváhagyást igényelnek.
            </p>
          </div>
        </div>
      </div>

      <nav aria-label="Jogi oldal tartalomjegyzéke" className="mx-auto mt-8 flex max-w-6xl flex-wrap gap-2 rounded-3xl border border-[#183124]/10 bg-white/75 p-3 shadow-sm backdrop-blur">
        {legalNav.map(([id, label]) => (
          <a key={id} href={`#${id}`} className="rounded-full px-4 py-2.5 text-sm font-bold transition-colors hover:bg-[#183124] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ff8f72]">
            {label}
          </a>
        ))}
      </nav>
    </section>

    <div className="container mx-auto mt-10 grid gap-7 px-4 lg:grid-cols-[minmax(0,1fr)_18rem] lg:items-start">
      <div className="space-y-7">
        <section id="impresszum" className="scroll-mt-28 rounded-[2rem] border border-[#183124]/10 bg-white p-6 shadow-sm sm:p-9">
          <div className="flex items-center gap-3"><Building2 className="text-[#e86f55]" aria-hidden="true" /><h2 className="font-display text-3xl font-extrabold tracking-[-0.04em]">Impresszum</h2></div>
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <div className="rounded-2xl bg-[#f5f1e8] p-5"><p className="text-xs font-bold uppercase tracking-[0.14em] text-[#657167]">Szolgáltatás</p><p className="mt-2 font-display text-xl font-extrabold">Hobbeast</p><p className="mt-1 text-sm text-[#5d695f]">Expericentre termék- és projektmárka</p></div>
            <div className="rounded-2xl bg-[#eaf5ec] p-5"><p className="text-xs font-bold uppercase tracking-[0.14em] text-[#657167]">Kapcsolat</p><a className="mt-2 inline-flex items-center gap-2 font-display text-lg font-extrabold underline decoration-[#ff8f72] decoration-2 underline-offset-4" href="mailto:hello@henrislabs.hu"><Mail size={17} aria-hidden="true" />hello@henrislabs.hu</a></div>
          </div>
          <div className="mt-5 rounded-2xl border border-dashed border-[#183124]/25 p-5">
            <p className="font-bold">Közzététel előtt még hitelesítendő üzemeltetői adatok</p>
            <ul className="mt-3 grid gap-2 text-sm text-[#5d695f] sm:grid-cols-2">
              {["teljes jogi név és jogi forma", "székhely vagy lakcím", "cég- vagy egyéb nyilvántartási szám", "adószám", "tárhelyszolgáltató adatai", "felelős kapcsolattartó és – ha van – DPO"].map((item) => <li key={item} className="flex gap-2"><span aria-hidden="true">○</span>{item}</li>)}
            </ul>
          </div>
        </section>

        <section id="adatkezeles" className="scroll-mt-28 rounded-[2rem] border border-[#183124]/10 bg-white p-6 shadow-sm sm:p-9">
          <div className="flex items-center gap-3"><ShieldCheck className="text-[#5b4bb7]" aria-hidden="true" /><h2 className="font-display text-3xl font-extrabold tracking-[-0.04em]">Adatkezelési tájékoztató</h2></div>
          <p className="mt-5 leading-relaxed text-[#5d695f]">Az adatkezelés célhoz kötött: csak olyan adatot kérünk, amely a fiókhoz, a közösségi részvételhez, a biztonsághoz vagy egy kifejezetten választott értesítéshez szükséges. Pontos címet az onboarding nem kér, az érzékenyebb első-esemény preferenciák alapértelmezetten privátak.</p>

          <div className="mt-7 overflow-hidden rounded-2xl border border-[#183124]/10">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] border-collapse text-left text-sm">
                <thead className="bg-[#183124] text-white"><tr>{["Cél", "Adatkör", "Tervezett jogalap", "Megőrzés"].map((heading) => <th key={heading} className="px-4 py-4 font-bold">{heading}</th>)}</tr></thead>
                <tbody>{dataRows.map((row, index) => <tr key={row.purpose} className={index % 2 ? "bg-[#fbf8f1]" : "bg-white"}><th className="px-4 py-4 align-top font-bold">{row.purpose}</th><td className="px-4 py-4 align-top text-[#5d695f]">{row.data}</td><td className="px-4 py-4 align-top text-[#5d695f]">{row.basis}</td><td className="px-4 py-4 align-top text-[#5d695f]">{row.retention}</td></tr>)}</tbody>
              </table>
            </div>
          </div>

          <div className="mt-7 grid gap-5 md:grid-cols-2">
            <div className="rounded-2xl bg-[#f2eeff] p-5"><h3 className="flex items-center gap-2 font-display text-xl font-extrabold"><LockKeyhole size={18} aria-hidden="true" />Kik férhetnek hozzá?</h3><p className="mt-3 text-sm leading-relaxed text-[#514764]">A választott láthatóságtól függően más tagok, eseményszervezők és jogosultsággal rendelkező biztonsági vagy adminisztrációs munkatársak. A műszaki adatkezelő rendszer jelenleg Supabase-alapú; a végleges adatfeldolgozói, adattovábbítási és országlistát jogilag jóvá kell hagyni.</p></div>
            <div className="rounded-2xl bg-[#eaf5ec] p-5"><h3 className="flex items-center gap-2 font-display text-xl font-extrabold"><UserRoundCheck size={18} aria-hidden="true" />A te jogaid</h3><ul className="mt-3 space-y-2 text-sm leading-relaxed text-[#4c5f50]">{rights.map((right) => <li key={right} className="flex gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[#278450]" aria-hidden="true" />{right}</li>)}</ul></div>
          </div>

          <div className="mt-6 rounded-2xl border border-[#ff8f72]/35 bg-[#fff1ec] p-5">
            <h3 className="font-display text-xl font-extrabold">Hogyan gyakorolhatod a jogaidat?</h3>
            <p className="mt-2 text-sm leading-relaxed text-[#604d47]">Írj a <a className="font-bold underline" href="mailto:hello@henrislabs.hu?subject=Adatvédelmi%20kérelem">hello@henrislabs.hu</a> címre „Adatvédelmi kérelem” tárggyal. A személyazonosság védelméhez arányos azonosítást kérhetünk. Panasszal a <a className="font-bold underline" href="https://www.naih.hu/" target="_blank" rel="noreferrer">NAIH-hoz<span className="sr-only"> (új lapon nyílik)</span></a> is fordulhatsz.</p>
          </div>
        </section>

        <section id="sutik" className="scroll-mt-28 rounded-[2rem] border border-[#183124]/10 bg-white p-6 shadow-sm sm:p-9">
          <div className="flex items-center gap-3"><Cookie className="text-[#e09b18]" aria-hidden="true" /><h2 className="font-display text-3xl font-extrabold tracking-[-0.04em]">Sütik és helyi tárolás</h2></div>
          <div className="mt-6 grid gap-4 sm:grid-cols-3">
            {[
              ["Szükséges", "Munkamenet, biztonság, hitelesítés és a választott felületi állapot. Ezek nélkül az alapfunkciók nem működnek."],
              ["Analitika", "Csak a megfelelő beállítás és jogalap mellett; a jelenlegi termékeseményekből a közvetlen azonosítók tiltottak."],
              ["Marketing", "Alapértelmezetten kikapcsolva. Csak külön, visszavonható hozzájárulással kapcsolható be."],
            ].map(([title, copy]) => <article key={title} className="rounded-2xl border border-[#183124]/10 p-5"><h3 className="font-display text-lg font-extrabold">{title}</h3><p className="mt-2 text-sm leading-relaxed text-[#5d695f]">{copy}</p></article>)}
          </div>
          <p className="mt-5 text-sm leading-relaxed text-[#5d695f]">A hozzájárulási beállításokat a profil adatvédelmi paneljén módosíthatod. A szükséges tárolást nem lehet kikapcsolni, ha az a kért szolgáltatás biztonságos működéséhez kell.</p>
        </section>

        <section id="feltetelek" className="scroll-mt-28 rounded-[2rem] border border-[#183124]/10 bg-white p-6 shadow-sm sm:p-9">
          <div className="flex items-center gap-3"><FileCheck2 className="text-[#278450]" aria-hidden="true" /><h2 className="font-display text-3xl font-extrabold tracking-[-0.04em]">Felhasználási feltételek · tervezet</h2></div>
          <div className="mt-6 space-y-5 text-sm leading-relaxed text-[#536057]">
            <p><strong className="text-[#183124]">A szolgáltatás szerepe.</strong> A Hobbeast programok, közösségek és emberek felfedezését segíti. Nem garantál barátságot, részvételt, helyszíni biztonságot vagy egy harmadik fél eseményének teljesítését.</p>
            <p><strong className="text-[#183124]">Fiók és felelősség.</strong> Valós, jogszerűen használható adatokat adj meg, őrizd a belépési adataidat, és ne használd más személy fiókját. Az életkori szabály és a kiskorúakra vonatkozó végleges politika jogi jóváhagyás alatt áll.</p>
            <p><strong className="text-[#183124]">Tartalom és szervezés.</strong> Csak olyan tartalmat tölts fel, amelyhez jogod van. A szervező felel az esemény adatainak pontosságáért, a szükséges engedélyekért, a helyszínért és a résztvevők korrekt tájékoztatásáért.</p>
            <p><strong className="text-[#183124]">Moderáció.</strong> A biztonsági alapelveket sértő tartalom vagy hozzáférés korlátozható, eltávolítható és felülvizsgálható. A végleges szankció-, fellebbezési és megőrzési szabályzat közzététel előtt jogi jóváhagyást igényel.</p>
            <p><strong className="text-[#183124]">Külső események és linkek.</strong> Külső forrásból származó programoknál a forrásoldal feltételei és aktuális adatai az irányadók; indulás előtt mindig ellenőrizd a helyszínt, időpontot és jegyfeltételeket.</p>
          </div>
        </section>

        <section id="kozossegi-alapelvek" className="scroll-mt-28 overflow-hidden rounded-[2rem] bg-[#183124] p-6 text-white shadow-sm sm:p-9">
          <div className="flex items-center gap-3"><HeartHandshake className="text-[#dfff62]" aria-hidden="true" /><h2 className="font-display text-3xl font-extrabold tracking-[-0.04em]">Közösségi alapelvek</h2></div>
          <p className="mt-5 max-w-3xl leading-relaxed text-white/70">A cél nem egyforma embereket gyűjteni, hanem biztonságos teret adni annak, hogy különböző emberek találjanak közös élményt.</p>
          <div className="mt-7 grid gap-4 sm:grid-cols-2">{principles.map(([title, copy], index) => <article key={title} className="rounded-3xl border border-white/10 bg-white/5 p-5"><span className="text-xl" aria-hidden="true">{["✦", "☮", "♥", "↗"][index]}</span><h3 className="mt-3 font-display text-xl font-extrabold">{title}</h3><p className="mt-2 text-sm leading-relaxed text-white/65">{copy}</p></article>)}</div>
        </section>
      </div>

      <aside className="space-y-4 lg:sticky lg:top-24">
        <div className="rounded-[2rem] bg-[#dfff62] p-6 shadow-sm">
          <Sparkles size={22} aria-hidden="true" />
          <h2 className="mt-4 font-display text-2xl font-extrabold tracking-[-0.04em]">Kérdésed van?</h2>
          <p className="mt-2 text-sm leading-relaxed text-[#39442f]">Írj emberi nyelven. Nem kell jogi kifejezéseket használnod.</p>
          <a href="mailto:hello@henrislabs.hu" className="mt-5 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full bg-[#183124] px-4 text-sm font-extrabold text-white transition-transform hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ff8f72]"><Mail size={16} aria-hidden="true" />Írj nekünk</a>
        </div>
        <div className="rounded-[2rem] border border-[#183124]/10 bg-white p-6">
          <h2 className="font-display text-lg font-extrabold">Hivatalos háttér</h2>
          <div className="mt-4 space-y-3 text-sm font-bold">
            <a href="https://eur-lex.europa.eu/legal-content/HU/TXT/?uri=CELEX:32016R0679" target="_blank" rel="noreferrer" className="flex items-center justify-between gap-3 hover:text-[#e86f55]">GDPR · EUR-Lex <ArrowUpRight size={15} aria-hidden="true" /></a>
            <a href="https://njt.hu/jogszabaly/2001-108-00-00" target="_blank" rel="noreferrer" className="flex items-center justify-between gap-3 hover:text-[#e86f55]">2001. évi CVIII. törvény <ArrowUpRight size={15} aria-hidden="true" /></a>
            <a href="https://www.naih.hu/" target="_blank" rel="noreferrer" className="flex items-center justify-between gap-3 hover:text-[#e86f55]">NAIH <ArrowUpRight size={15} aria-hidden="true" /></a>
          </div>
        </div>
      </aside>
    </div>
  </main>
  );
};

export default Legal;
