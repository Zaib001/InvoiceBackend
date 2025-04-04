const broadcastCalendar = [
    { month: "January", start: "2024-12-31", end: "2025-01-28" },
    { month: "February", start: "2025-01-29", end: "2025-02-25" },
    { month: "March", start: "2025-02-26", end: "2025-03-31" },
    { month: "April", start: "2025-04-01", end: "2025-04-28" },
    { month: "May", start: "2025-04-29", end: "2025-05-26" },
    { month: "June", start: "2025-05-27", end: "2025-06-30" },
    { month: "July", start: "2025-07-01", end: "2025-07-28" },
    { month: "August", start: "2025-07-29", end: "2025-08-25" },
    { month: "September", start: "2025-08-26", end: "2025-09-29" },
    { month: "October", start: "2025-09-30", end: "2025-10-27" },
    { month: "November", start: "2025-10-28", end: "2025-11-24" },
    { month: "December", start: "2025-11-25", end: "2025-12-29" }
  ];
  
  const getBroadcastInvoiceDate = (invoiceDate) => {
    if (!invoiceDate || isNaN(Date.parse(invoiceDate))) return "N/A";
  
    const dateObj = new Date(invoiceDate);
    for (const period of broadcastCalendar) {
      const start = new Date(period.start);
      const end = new Date(period.end);
      if (dateObj >= start && dateObj <= end) {
        return new Date(end).toISOString().split("T")[0];
      }
    }
  
    if (dateObj.getDate() > 25) {
      dateObj.setMonth(dateObj.getMonth() + 1);
    }
  
    return dateObj.toISOString().split("T")[0];
  };
  
  const parseInvoiceDate = (dateStr) => {
    if (!dateStr || dateStr.length !== 6) return "N/A";
    const year = "20" + dateStr.substring(0, 2);
    const month = dateStr.substring(2, 4) - 1;
    const day = dateStr.substring(4, 6);
    const invoiceDate = new Date(year, month, day).toISOString().split("T")[0];
    return getBroadcastInvoiceDate(invoiceDate);
  };
  
  module.exports = { getBroadcastInvoiceDate, parseInvoiceDate };
  