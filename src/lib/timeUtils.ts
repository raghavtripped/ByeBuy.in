// src/lib/timeUtils.ts

/**
 * Formats a date string or Date object into a relative time string.
 * e.g., "Ends in 5 hours", "Ended 2 days ago"
 *
 * @param dateString The ISO date string or Date object to format.
 * @returns A user-friendly relative time string, or an empty string for invalid dates.
 */
export function formatRelativeTime(dateString: string | Date | null | undefined): string {
    if (!dateString) {
      return ''; // Return empty if no date provided
    }
  
    try {
      const date = typeof dateString === 'string' ? new Date(dateString) : dateString;
  
      // Check if the date is valid
      if (isNaN(date.getTime())) {
        console.warn("Invalid date provided to formatRelativeTime:", dateString);
        return ''; // Return empty for invalid dates
      }
  
      const now = new Date();
      const diffInSeconds = Math.round((date.getTime() - now.getTime()) / 1000);
  
      const secondsAbs = Math.abs(diffInSeconds);
      const minutes = Math.floor(secondsAbs / 60);
      const hours = Math.floor(secondsAbs / 3600);
      const days = Math.floor(secondsAbs / 86400);
  
      if (diffInSeconds <= 0) {
        // Time has passed
        if (days > 1) return `Ended ${days} days ago`;
        if (days === 1) return `Ended 1 day ago`;
        if (hours > 1) return `Ended ${hours} hours ago`;
        if (hours === 1) return `Ended 1 hour ago`;
        if (minutes > 1) return `Ended ${minutes} minutes ago`;
        if (minutes === 1) return `Ended 1 minute ago`;
        return 'Ended just now';
      } else {
        // Time is in the future
        if (days > 1) return `Ends in ${days} days`;
        if (days === 1) return `Ends in 1 day`;
        if (hours > 1) return `Ends in ${hours} hours`;
        if (hours === 1) return `Ends in 1 hour`;
        if (minutes > 1) return `Ends in ${minutes} minutes`;
        if (minutes === 1) return `Ends in 1 minute`;
        return 'Ends in < 1 minute';
      }
    } catch (error) {
      console.error("Error formatting relative time:", error);
      return ''; // Return empty on unexpected errors
    }
  }
  
  /**
   * Checks if a given date string or Date object represents a time in the past.
   *
   * @param dateString The ISO date string or Date object to check.
   * @returns True if the date is in the past, false otherwise or if invalid.
   */
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