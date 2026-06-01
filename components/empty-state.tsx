export function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="rounded-lg border border-dashed bg-white p-6 text-sm text-slate-600">
      <p className="font-medium text-slate-900">{title}</p>
      <p className="mt-1">{description}</p>
    </div>
  );
}
