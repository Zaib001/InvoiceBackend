// models/Vendor.js
const mongoose = require('mongoose');

const VendorSchema = new mongoose.Schema({
  qbStationList: { type: String, index: true },
  station: { type: String, index: true },
  qbVendorOwner: { type: String }
});

VendorSchema.index({ qbStationList: 1, station: 1 }); // Compound index

module.exports = mongoose.model('Vendor', VendorSchema);
