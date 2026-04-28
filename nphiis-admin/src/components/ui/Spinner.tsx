interface SpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  label?: string;
}

const SIZES: Record<NonNullable<SpinnerProps['size']>, string> = {
  sm: 'h-4 w-4 border-2',
  md: 'h-6 w-6 border-[3px]',
  lg: 'h-10 w-10 border-4',
};

export default function Spinner({ size = 'md', className = '', label }: SpinnerProps) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`} role="status" aria-live="polite">
      <span
        className={`${SIZES[size]} rounded-full border-nphi-200 border-t-nphi-700 animate-spin`}
        aria-hidden
      />
      {label && <span className="text-sm text-gray-600">{label}</span>}
    </span>
  );
}
