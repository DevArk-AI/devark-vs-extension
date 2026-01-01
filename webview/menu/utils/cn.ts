/**
 * Class Name Utility
 *
 * Combines class names with support for conditional classes
 */

import clsx, { ClassValue } from 'clsx';

/**
 * Merge class names with clsx
 * Usage: cn('base-class', condition && 'conditional-class', 'another-class')
 */
export function cn(...inputs: ClassValue[]): string {
  return clsx(inputs);
}
