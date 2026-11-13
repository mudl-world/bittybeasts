import Link from "next/link";
import Art from "@/components/Art";
import About from "@/components/shell/About";
import Cover from "@/components/shell/Cover";

// The title screen: the Lane at night, the logo, and two ways in.
export default function Home() {
  return (
    <>
      <Cover ratio={1622 / 913}>
        <Art slot="hero-bg" alt="Lantern Lane at night, under the Great Yarn" className="h-full w-full object-cover" />
      </Cover>
      {/* Dark backdrop over the Lane so the logo, tagline and buttons stay legible:
          a flat scrim plus a bottom-weighted gradient where the copy sits. */}
      <div className="pointer-events-none fixed inset-0 bg-night-950/45" />
      <div className="pointer-events-none fixed inset-0 bg-gradient-to-t from-night-950 via-night-950/60 to-night-950/30" />
      <main className="fixed inset-0 flex flex-col items-center justify-end gap-5 px-4 pb-[8dvh] text-center">
        <Art slot="logo" alt="Bitty Beasts" className="pointer-events-none w-[min(88vw,720px)] drop-shadow-[0_10px_40px_rgba(0,0,0,0.7)]" />
        <p className="title-3d title-3d-light max-w-2xl text-xl sm:text-3xl">
          A cat with a mind of its own. <span className="text-[#ffc93c]">Nine lives to spend.</span>
        </p>
        <div className="flex flex-wrap justify-center gap-3">
          <Link href="/room" className="btn btn-lantern px-8 py-3 text-xl">
            Meet your cat
          </Link>
          <Link href="/story" className="btn btn-ghost px-6 py-3 text-xl">
            Watch the story
          </Link>
        </div>
        <About />
      </main>
    </>
  );
}
