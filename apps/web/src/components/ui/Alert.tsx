import { motion } from 'motion/react';
import type { ReactNode } from 'react';
import { Icon } from './Icon';

/** Tonal error container. Used for load/save failures at the top of a page. */
export function Alert({ children, className = 'mb-4' }: { children: ReactNode; className?: string }) {
  return (
    <motion.div
      role="alert"
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className={`flex items-start gap-2.5 rounded-2xl bg-danger-50 px-4 py-3 text-sm text-danger-700 ${className}`}
    >
      <Icon name="alert" className="mt-0.5 h-[18px] w-[18px]" />
      <span>{children}</span>
    </motion.div>
  );
}
