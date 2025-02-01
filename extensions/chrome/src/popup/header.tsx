
export function Header() {
  return (
    <header className="flex items-center justify-between px-4 py-2 border-b bg-background">
      <a href="https://app.browseragent.dev" className="flex items-center gap-2">
        <img src="/icons/icon128.png" alt="Workflow Extension" className="h-8 w-8" />
        <span className="font-semibold text-xl text-foreground">BrowserAgent</span>
      </a>

      <span className="text-sm text-muted-foreground">Powered by <a href="https://browserai.dev" className="text-primary">BrowserAI</a></span>
    </header>
  )
}

