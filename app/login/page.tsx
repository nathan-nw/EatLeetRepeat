import { SignInForm } from '@/components/signin-form';

export default function LoginPage() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-semibold tracking-tight">Eat Leet Repeat</h1>
        <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
          Sign in to track your LeetCode activity over time.
        </p>
        <div className="mt-8">
          <SignInForm />
        </div>
      </div>
    </main>
  );
}
