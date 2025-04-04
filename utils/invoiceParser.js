const fs = require("fs");
const path = require("path");
const { parseInvoiceDate } = require("./broadcastCalendar");

const detectInvoiceType = (data) => {
  return data.some(line => line.includes("MKT")) ? "Marketron" : "Radio Invoices";
};

const extractInvoiceData = (filePath) => {
  const data = fs.readFileSync(filePath, "utf-8").split("\n");
  const invoiceType = detectInvoiceType(data);

  let invoices = [];
  let invoice = null;

  let station = "N/A";
  let stationFullName = "N/A";
  let ownershipGroup = "N/A";
  let vendorField1 = "N/A";

  for (const line of data) {
    const fields = line.split(";").map(f => f.trim());
    const recordCode = fields[0];

    switch (recordCode) {
      case "22": {
        station = fields[1] || "N/A";
        stationFullName = fields[3] || "N/A";
        ownershipGroup = fields[5] || "N/A";
        break;
      }

      case "23": {
        if (invoiceType === "Radio Invoices") {
          vendorField1 = fields[1] || "N/A";
        }
        break;
      }

      case "31": {
        if (invoice && invoice.invoiceNumber && invoice.invoiceNumber !== "N/A") {
          invoices.push({ ...invoice });
        }

        const advertiser = fields[3] || "N/A";
        const invoiceNumber = fields[8] || "N/A";
        const invoiceDateRaw = fields[5] || "";
        const dueDateRaw = fields[21] || "";

        invoice = {
          advertiser,
          invoiceNumber,
          invoiceDate: parseInvoiceDate(invoiceDateRaw),
          estimateCode: fields[7] || "N/A",
          dueDate: parseInvoiceDate(dueDateRaw),
          billMemo: `${advertiser} - ${fields[7] || "N/A"}`,
          totalAmount: "N/A",
          terms: "N/A",
          invoiceSource: invoiceType,
          category: "5015 COS - Radio",
          ownershipGroup,
          vendor: invoiceType === "Marketron"
            ? `${ownershipGroup} - ${station} - ${stationFullName}`
            : `${vendorField1} - ${station} - ${stationFullName}`,
        };

        break;
      }

      case "33": {
        if (invoice) {
          invoice.terms = fields[1] || "N/A";
        }
        break;
      }

      case "34": {
        if (invoice) {
          invoice.totalAmount = fields[4] || "0.00";
        }
        break;
      }
    }
  }

  // Push the final invoice if valid
  if (invoice && invoice.invoiceNumber && invoice.invoiceNumber !== "N/A") {
    invoices.push(invoice);
  }

  return invoices;
};

module.exports = { extractInvoiceData };
