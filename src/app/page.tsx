import Link from "next/link";
import { MapPin, Route, CheckSquare, Compass } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function Home() {
  return (
    <div className="flex flex-col items-center">
      <section className="text-center py-16 sm:py-24 max-w-2xl mx-auto">
        <div className="flex justify-center mb-6">
          <div className="bg-emerald-100 rounded-2xl p-4">
            <MapPin className="h-10 w-10 text-emerald-600" />
          </div>
        </div>
        <h1 className="text-4xl sm:text-5xl font-bold text-gray-900 mb-4 leading-tight">
          Plan your perfect<br />campervan adventure
        </h1>
        <p className="text-lg text-gray-500 mb-8 leading-relaxed">
          Map out your route, add stops, and get everything ready for the road — for you, your crew, and your dogs.
        </p>
        <div className="flex justify-center">
          <Link href="/login">
            <Button size="lg" className="w-full sm:w-auto">Get started</Button>
          </Link>
        </div>
      </section>

      <section className="grid grid-cols-1 sm:grid-cols-3 gap-6 w-full max-w-3xl pb-16">
        {[
          { icon: Route, title: "Route planning", desc: "Plot your stops on an interactive map and see drive times between each one." },
          { icon: CheckSquare, title: "Smart checklists", desc: "Coming soon — auto-generated packing lists tailored to your trip and group." },
          { icon: Compass, title: "Stop research", desc: "Coming soon — AI that finds things to do at every stop along your route." },
        ].map(({ icon: Icon, title, desc }) => (
          <div key={title} className="bg-white rounded-xl border border-gray-200 p-6">
            <Icon className="h-6 w-6 text-emerald-600 mb-3" />
            <h3 className="font-semibold text-gray-900 mb-1">{title}</h3>
            <p className="text-sm text-gray-500">{desc}</p>
          </div>
        ))}
      </section>
    </div>
  );
}
