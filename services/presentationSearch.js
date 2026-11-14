const searchUtils = require('../public/search-utils');

function getGoogleCseId() {
  return String(process.env.GOOGLE_CSE_ID || '').trim();
}

module.exports = {
  ...searchUtils,
  getGoogleCseId,
};
