// src/lib/timeUtils.ts

/**
 * Formats a date string or Date object into a detailed relative time string,
 * showing up to two significant units (e.g., "1 day 5 hours", "3 hours 10 minutes").
 *
 * @param dateString The ISO date string or Date object to format.
 * @returns A user-friendly relative time string, or an empty string for invalid dates.
 */
export function formatRelativeTime(dateString: string | Date | null | undefined): string {
    if (!dateString) {
      return '';
    }
  
    try {
      const date = typeof dateString === 'string' ? new Date(dateString) : dateString;
      if (isNaN(date.getTime())) {
        console.warn("Invalid date provided to formatRelativeTime:", dateString);
        return '';
      }
  
      const now = new Date();
      const diffInSeconds = Math.round((date.getTime() - now.getTime()) / 1000);
  
      const isFuture = diffInSeconds > 0;
      const prefix = isFuture ? 'Ends in' : 'Ended';
      const suffix = isFuture ? '' : ' ago';
      const absSeconds = Math.abs(diffInSeconds);
  
      // Handle edge case: less than a minute
      if (absSeconds < 60) {
        return isFuture ? 'Ends in < 1 minute' : 'Ended just now';
      }
  
      const days = Math.floor(absSeconds / 86400);
      const remainingSecondsAfterDays = absSeconds % 86400;
      const hours = Math.floor(remainingSecondsAfterDays / 3600);
      const remainingSecondsAfterHours = remainingSecondsAfterDays % 3600;
      const minutes = Math.floor(remainingSecondsAfterHours / 60);
  
      const parts: string[] = [];
  
      if (days > 0) {
        parts.push(`${days} day${days > 1 ? 's' : ''}`);
      }
      if (hours > 0) {
        parts.push(`${hours} hour${hours > 1 ? 's' : ''}`);
      }
      // Show minutes only if it's one of the top two units OR if it's the only unit > 0
      if (minutes > 0 && parts.length < 2) {
        parts.push(`${minutes} minute${minutes > 1 ? 's' : ''}`);
      }
  
      // We only want the two most significant parts
      const relevantParts = parts.slice(0, 2);
  
      if (relevantParts.length === 0) {
           // Fallback if somehow no parts were generated (shouldn't happen with current logic)
           return isFuture ? 'Ends soon' : 'Ended recently';
      }
  
      return `${prefix} ${relevantParts.join(' ')}${suffix}`;
  
    } catch (error) {
      console.error("Error formatting relative time:", error);
      return '';
    }
  }
  
  // isPast function remains the same
  export function isPast(dateString: string | Date | null | undefined): boolean {
      if (!dateString) return false;
      try {
          const date = typeof dateString === 'string' ? new Date(dateString) : dateString;
          if (isNaN(date.getTime())) return false;
          return date.getTime() < Date.now();
      } catch {
          return false;
      }
  }