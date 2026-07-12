'use client';

// Renders a timestamp in the viewer's local timezone. `suppressHydrationWarning`
// covers the expected server(UTC)→client(local) text difference; the machine-
// readable ISO stays in `dateTime`.
export function Time({
  iso,
  mode = 'datetime',
}: {
  iso: string;
  mode?: 'date' | 'datetime';
}) {
  const d = new Date(iso);
  const text =
    mode === 'date'
      ? d.toLocaleDateString(undefined, {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
        })
      : d.toLocaleString(undefined, {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
          hour: 'numeric',
          minute: '2-digit',
        });

  return (
    <time dateTime={iso} suppressHydrationWarning>
      {text}
    </time>
  );
}
