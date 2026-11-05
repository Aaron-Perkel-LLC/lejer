// Instant shell for the Household section (/household, /household/settings, /household/email):
// the title block and a ruled panel, so these pages don't borrow the dashboard's skeleton.
export default function HouseholdLoading() {
  return (
    <main aria-busy="true">
      <div className="mb-6">
        <div className="skeleton mb-2 h-3 w-24" />
        <div className="skeleton h-7 w-40" />
      </div>
      <div className="panel divide-y divide-line-soft">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="flex items-center justify-between px-4 py-4">
            <div>
              <div className="skeleton mb-1.5 h-4 w-32" />
              <div className="skeleton h-3 w-48" />
            </div>
            <div className="skeleton h-5 w-16" />
          </div>
        ))}
      </div>
    </main>
  );
}
