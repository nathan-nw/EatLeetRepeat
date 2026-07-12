'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const NAV = [
  { href: '/', label: 'Dashboard' },
  { href: '/repeats', label: 'Repeats' },
  { href: '/import', label: 'Import' },
  { href: '/settings', label: 'Settings' },
];

export function AppHeader({ handle }: { handle: string }) {
  const pathname = usePathname();

  return (
    <header className="border-b border-zinc-200 dark:border-zinc-800">
      <div className="mx-auto flex max-w-4xl items-center justify-between gap-4 px-6 py-3">
        <div className="flex items-center gap-6">
          <Link href="/" className="text-sm font-semibold tracking-tight">
            Eat Leet Repeat
          </Link>
          <nav className="flex items-center gap-4 text-sm">
            {NAV.map((item) => {
              const active =
                item.href === '/'
                  ? pathname === '/'
                  : pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={
                    active
                      ? 'font-medium text-zinc-900 dark:text-zinc-100'
                      : 'text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100'
                  }
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>
        <div className="flex items-center gap-3">
          <span className="hidden text-xs text-zinc-500 sm:inline dark:text-zinc-400">
            {handle}
          </span>
          <form action="/auth/signout" method="post">
            <button
              type="submit"
              className="rounded-lg border border-zinc-300 px-3 py-1 text-xs font-medium transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900"
            >
              Sign out
            </button>
          </form>
        </div>
      </div>
    </header>
  );
}
