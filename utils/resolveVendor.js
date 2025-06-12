// utils/resolveVendor.js
const VendorModel = require("../models/Vendor");

const resolveVendor = async ({ invoiceType, currentVendor, station, stationFullName, ownershipGroup }) => {
  if (invoiceType === "Marketron") {
    return `${ownershipGroup} - ${station} - ${stationFullName}`;
  }

  if (currentVendor === "N/A") {
    const match = await VendorModel.findOne({
      qbStationList: new RegExp(`^${station}$`, 'i'),
      station: new RegExp(`^${stationFullName}$`, 'i')
    }).lean();

    if (match) {
      return `${match.qbVendorOwner} - ${station} - ${stationFullName}`;
    }
  }

  return `${currentVendor} - ${station} - ${stationFullName}`;
};

module.exports = resolveVendor;
