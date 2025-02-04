export function Header({ currentSection }: { currentSection: string }) {
  return (
    <header className="px-4 py-3">
      <h1 className="text-lg font-semibold">{currentSection}</h1>
    </header>
  );
}
