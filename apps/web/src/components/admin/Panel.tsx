export function Panel({
  title,
  icon,
  action,
  children,
}: {
  title: string;
  icon?: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-card border border-rule bg-paper-2 p-5 shadow-card">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-sm font-bold">
          {icon}
          {title}
        </h2>
        {action}
      </div>
      {children}
    </section>
  );
}
