export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex flex-1 items-center justify-center px-6 py-16 pb-24 sm:py-20">
      <div className="w-full max-w-sm">
        <div
          aria-hidden="true"
          className="mx-auto mb-8 h-px w-10 bg-primary"
        />
        {children}
      </div>
    </main>
  );
}
