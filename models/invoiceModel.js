const mongoose = require('mongoose');

const invoiceSchema = new mongoose.Schema({
  advertiser: { type: String, default: 'N/A' },
  invoiceNumber: { type: String, required: true, unique: true },
  station: { type: String, default: 'N/A' },
  stationFullName: { type: String, default: 'N/A' },
  invoiceDate: { type: String, default: 'N/A' },
  dueDate: { type: String, default: 'N/A' },
  estimateCode: { type: String, default: 'N/A' },
  billMemo: { type: String, default: 'N/A' },
  totalAmount: { type: String, default: '0.00' },
  terms: { type: String, default: 'N/A' },
  invoiceSource: { type: String, default: 'N/A' },
  category: { type: String, default: '5015 COS - Radio' },
  ownershipGroup: { type: String, default: 'N/A' },
  vendor: { type: String, default: 'N/A' },
  isProcessed: { type: Boolean, default: false }
}, {
  timestamps: true
});

module.exports = mongoose.model('Invoice', invoiceSchema);
