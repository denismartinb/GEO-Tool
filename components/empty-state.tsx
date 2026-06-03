export function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="rounded-[12px] border border-dashed border-[#dde0e7] bg-[#fbfbfd] p-6 text-sm text-[var(--ink-3)]">
      <p className="font-semibold text-[var(--ink)]">{title}</p>
      <p className="mt-1 leading-6">{description}</p>
    </div>
  );
}
