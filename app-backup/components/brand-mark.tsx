export default function BrandMark({
  compact = false,
}: {
  compact?: boolean;
}) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <span className="sc-brand-mark" aria-hidden="true">
        <svg
          viewBox="0 0 32 32"
          width="25"
          height="25"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <circle cx="9" cy="9" r="3" stroke="currentColor" strokeWidth="1.8" />
          <circle cx="23" cy="23" r="3" stroke="currentColor" strokeWidth="1.8" />
          <circle cx="23" cy="9" r="2" fill="currentColor" />
          <circle cx="9" cy="23" r="2" fill="currentColor" />
          <path
            d="M12 9h6a5 5 0 0 1 5 5v6M9 12v6a5 5 0 0 0 5 5h6"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
        </svg>
      </span>
      {!compact && (
        <span className="text-sm font-semibold tracking-[0.12em]">
          SMARTCARE
        </span>
      )}
    </span>
  );
}
