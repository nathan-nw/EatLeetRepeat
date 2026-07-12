import { redirect } from 'next/navigation';
import { getProfile, requireUser } from '@/lib/auth';
import { AppHeader } from '@/components/app-header';

// Gate for every signed-in view: must be authenticated AND onboarded (has a
// LeetCode handle). Renders the shared header. Login/onboarding/auth live
// outside this group so they don't inherit the gate or the header.
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireUser();
  const profile = await getProfile();
  if (!profile) {
    redirect('/onboarding');
  }

  return (
    <>
      <AppHeader handle={profile.leetcode_username} />
      <div className="flex-1">{children}</div>
    </>
  );
}
