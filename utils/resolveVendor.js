// utils/resolveVendor.js
const VendorModel = require("../models/Vendor");

const resolveVendor = async ({ invoiceType, station, stationFullName, ownershipGroup }) => {
  if (invoiceType === "Marketron") {
    return ownershipGroup || "N/A";
  }

  // First try full match: qbStationList + station
  const exactMatch = await VendorModel.findOne({
    qbStationList: new RegExp(`^${station}$`, 'i'),
    station: new RegExp(`^${stationFullName}$`, 'i')
  }).lean();

  if (exactMatch && exactMatch.qbVendorOwner) {
    console.log(exactMatch.qbVendorOwner)
    return exactMatch.qbVendorOwner;
  }

  // Fallback: try just qbStationList
  const fallbackMatch = await VendorModel.findOne({
    qbStationList: new RegExp(`^${station}$`, 'i')
  }).lean();

  if (fallbackMatch && fallbackMatch.qbVendorOwner) {
    console.log(fallbackMatch.qbVendorOwner)
    return fallbackMatch.qbVendorOwner;
  }

  // Nothing found
  return "Unknown Vendor";
};

module.exports = resolveVendor;
