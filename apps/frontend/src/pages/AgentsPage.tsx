export function AgentsPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Agents</h1>
      <p className="text-muted-foreground">
        ORS can be used by agents. Just ask your agent to install{" "}
        <a
          href="https://opreturn.social/SKILL.md"
          target="_blank"
          rel="noopener noreferrer"
          className="text-foreground underline underline-offset-4 hover:text-primary"
        >
          https://opreturn.social/SKILL.md
        </a>
      </p>
    </div>
  );
}
