"use client";

import Link from "next/link";
import { useSession, signOut } from "next-auth/react";
import { MapPin, Menu, X } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";

export function Navbar() {
  const { data: session } = useSession();
  const [open, setOpen] = useState(false);

  return (
    <nav className="border-b border-gray-200 bg-white">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="flex h-16 items-center justify-between">
          <Link href="/" className="flex items-center gap-2 font-bold text-emerald-600 text-lg">
            <MapPin className="h-5 w-5" />
            WanderWise
          </Link>

          <div className="hidden sm:flex items-center gap-4">
            {session ? (
              <>
                <Link href="/trips" className="text-sm text-gray-600 hover:text-gray-900">My Trips</Link>
                <Link href="/profiles" className="text-sm text-gray-600 hover:text-gray-900">Group</Link>
                <Button variant="outline" size="sm" onClick={() => signOut({ callbackUrl: "/" })}>
                  Sign out
                </Button>
              </>
            ) : (
              <>
                <Link href="/login">
                  <Button variant="ghost" size="sm">Sign in</Button>
                </Link>
                <Link href="/register">
                  <Button size="sm">Get started</Button>
                </Link>
              </>
            )}
          </div>

          <button className="sm:hidden p-2" onClick={() => setOpen(!open)}>
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>

        {open && (
          <div className="sm:hidden border-t border-gray-100 py-2 flex flex-col">
            {session ? (
              <>
                <Link href="/trips" className="flex items-center text-sm text-gray-700 font-medium py-3 px-1 border-b border-gray-50" onClick={() => setOpen(false)}>My Trips</Link>
                <Link href="/profiles" className="flex items-center text-sm text-gray-700 font-medium py-3 px-1 border-b border-gray-50" onClick={() => setOpen(false)}>Group</Link>
                <button className="flex items-center text-sm text-left text-red-500 font-medium py-3 px-1" onClick={() => signOut({ callbackUrl: "/" })}>Sign out</button>
              </>
            ) : (
              <>
                <Link href="/login" className="flex items-center text-sm text-gray-700 font-medium py-3 px-1 border-b border-gray-50" onClick={() => setOpen(false)}>Sign in</Link>
                <Link href="/register" className="flex items-center text-sm text-emerald-600 font-medium py-3 px-1" onClick={() => setOpen(false)}>Get started</Link>
              </>
            )}
          </div>
        )}
      </div>
    </nav>
  );
}
