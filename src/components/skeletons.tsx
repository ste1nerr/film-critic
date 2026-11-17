/** Shaped like the library (hero, toolbar, poster grid), so the page doesn't jump when titles land. */
export function LibrarySkeleton() {
  return (
    <div className="mx-auto w-full min-w-0 max-w-7xl px-4 py-6" aria-busy="true" aria-label="Loading">
      <div className="skeleton mb-6 h-48 rounded-2xl sm:h-64" />
      <div className="mb-5 flex flex-wrap gap-2">
        <div className="skeleton h-10 w-full rounded-xl sm:w-64" />
        <div className="skeleton h-10 flex-1 rounded-xl" />
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
        {Array.from({ length: 12 }, (_, i) => (
          <div key={i}>
            <div className="skeleton aspect-[2/3] rounded-xl" />
            <div className="skeleton mt-2 h-4 w-3/4 rounded" />
            <div className="skeleton mt-1.5 h-3 w-1/3 rounded" />
          </div>
        ))}
      </div>
    </div>
  );
}
