import type { ComponentType, SVGProps } from 'react';

interface StatCardProps {
  label: string;
  value: string | number;
  hint?: string;
  icon?: ComponentType<SVGProps<SVGSVGElement>>;
  tone?: 'green' | 'red' | 'neutral' | 'gold';
  trend?: { value: string; positive?: boolean };
}

const TONES: Record<NonNullable<StatCardProps['tone']>, { icon: string; accent: string }> = {
  green: { icon: 'bg-nphi-gradient text-white', accent: 'text-nphi-700' },
  red: { icon: 'bg-accent-gradient text-white', accent: 'text-accent-700' },
  gold: {
    icon: 'bg-gradient-to-br from-amber-400 to-amber-600 text-white',
    accent: 'text-amber-700',
  },
  neutral: { icon: 'bg-nphi-100 text-nphi-800', accent: 'text-nphi-800' },
};

export default function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  tone = 'green',
  trend,
}: StatCardProps) {
  const palette = TONES[tone];
  return (
    <div className="card p-5">
      <div className="flex items-start justify-between">
        {Icon && (
          <div className={`h-11 w-11 rounded-2xl flex items-center justify-center ${palette.icon}`}>
            <Icon className="h-5 w-5" />
          </div>
        )}
        {trend && (
          <span
            className={`chip ${
              trend.positive
                ? 'bg-nphi-50 text-nphi-800'
                : 'bg-accent-50 text-accent-700'
            }`}
          >
            {trend.positive ? '↑' : '↓'} {trend.value}
          </span>
        )}
      </div>
      <div className="mt-4">
        <div className="text-xs uppercase tracking-wider text-gray-500 font-medium">
          {label}
        </div>
        <div className={`text-2xl font-semibold mt-1 ${palette.accent}`}>{value}</div>
        {hint && <div className="text-xs text-gray-500 mt-1">{hint}</div>}
      </div>
    </div>
  );
}
