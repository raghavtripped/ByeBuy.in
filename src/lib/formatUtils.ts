// src/lib/formatUtils.ts

/**
 * Formats a number as Indian Rupees (INR) with commas and ₹ symbol.
 * Handles null/undefined/NaN values gracefully.
 *
 * @param amount The numeric amount to format.
 * @returns A formatted currency string (e.g., "₹1,500", "₹10,000.50") or "N/A".
 */
export function formatCurrency(amount: number | null | undefined): string {
    if (amount === null || amount === undefined || isNaN(amount)) {
        // Decide how to handle invalid input. 'N/A' is one option.
        // Alternatively, return '₹0' or an empty string depending on context.
        return 'N/A';
    }
    // Use 'en-IN' locale for Indian numbering system (commas) and INR currency symbol.
    return amount.toLocaleString('en-IN', {
        style: 'currency',
        currency: 'INR',
        minimumFractionDigits: 0, // No decimals unless necessary (e.g. 50 paise)
        maximumFractionDigits: 2,
    });
}

// Add other formatting functions here later if needed (e.g., date formatting)