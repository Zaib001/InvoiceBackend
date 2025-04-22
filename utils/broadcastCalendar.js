
const broadcastCalendar = [
  { month: "January", start: "2024-12-29", end: "2025-01-25" },
  { month: "February", start: "2025-01-26", end: "2025-02-22" },
  { month: "March", start: "2025-02-23", end: "2025-03-29" },
  { month: "April", start: "2025-03-30", end: "2025-04-26" },
  { month: "May", start: "2025-04-27", end: "2025-05-31" },
  { month: "June", start: "2025-06-01", end: "2025-06-28" },
  { month: "July", start: "2025-06-29", end: "2025-07-26" },
  { month: "August", start: "2025-07-27", end: "2025-08-30" },
  { month: "September", start: "2025-08-31", end: "2025-09-27" },
  { month: "October", start: "2025-09-28", end: "2025-10-25" },
  { month: "November", start: "2025-10-26", end: "2025-11-29" },
  { month: "December", start: "2025-11-30", end: "2025-12-27" }
];
// ✅ Finds the broadcast end date from invoice date
const getBroadcastInvoiceDate = (invoiceDate) => {
  if (!invoiceDate || isNaN(Date.parse(invoiceDate))) return "N/A";

  const dateObj = new Date(invoiceDate);

  // Loop calendar ranges
  for (const period of broadcastCalendar) {
    const start = new Date(period.start);
    const end = new Date(period.end);
    if (dateObj >= start && dateObj <= end) {
      return end.toISOString().split("T")[0];
    }
  }

  // If not found, try bumping to next month and retry match
  if (dateObj.getDate() > 25) {
    const nextMonth = new Date(dateObj.setMonth(dateObj.getMonth() + 1));
    for (const period of broadcastCalendar) {
      const start = new Date(period.start);
      const end = new Date(period.end);
      if (nextMonth >= start && nextMonth <= end) {
        return end.toISOString().split("T")[0];
      }
    }
  }

  // Fallback to original date if no match
  return dateObj.toISOString().split("T")[0];
};

// ✅ Converts 6-digit YYMMDD to broadcast-mapped date
const parseInvoiceDate = (dateStr) => {
  if (!dateStr || dateStr.length !== 6) return "N/A";
  try {
    const year = "20" + dateStr.substring(0, 2);
    const month = parseInt(dateStr.substring(2, 4), 10) - 1;
    const day = parseInt(dateStr.substring(4, 6), 10);
    const rawDate = new Date(year, month, day).toISOString().split("T")[0];
    return getBroadcastInvoiceDate(rawDate);
  } catch {
    return "N/A";
  }
};

module.exports = { getBroadcastInvoiceDate, parseInvoiceDate };
