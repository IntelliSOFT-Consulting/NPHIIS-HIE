import type { ReactNode } from 'react';
import {
  CheckCircle,
  AlertCircle,
  AlertTriangle,
  InfoCircle,
} from '@untitled-ui/icons-react';

type AlertVariant = 'success' | 'error' | 'warning' | 'info';

const STYLES: Record<AlertVariant, { box: string; icon: string }> = {
  success: {
    box: 'bg-emerald-50 border-emerald-200 text-emerald-800',
    icon: 'text-emerald-600',
  },
  error: {
    box: 'bg-accent-50 border-accent-200 text-accent-800',
    icon: 'text-accent-600',
  },
  warning: {
    box: 'bg-amber-50 border-amber-200 text-amber-900',
    icon: 'text-amber-600',
  },
  info: {
    box: 'bg-nphi-50 border-nphi-200 text-nphi-900',
    icon: 'text-nphi-600',
  },
};

const ICON: Record<AlertVariant, typeof CheckCircle> = {
  success: CheckCircle,
  error: AlertCircle,
  warning: AlertTriangle,
  info: InfoCircle,
};

export interface AlertProps {
  variant?: AlertVariant;
  title?: ReactNode;
  children?: ReactNode;
}

export function Alert({ variant = 'info', title, children }: AlertProps) {
  const Icon = ICON[variant];
  const s = STYLES[variant];
  return (
    <div className={`flex items-start gap-3 rounded-xl border p-3 text-sm ${s.box}`}>
      <Icon className={`h-5 w-5 mt-0.5 shrink-0 ${s.icon}`} />
      <div className="space-y-0.5">
        {title && <div className="font-medium">{title}</div>}
        {children && <div className="text-[13px] leading-relaxed">{children}</div>}
      </div>
    </div>
  );
}
