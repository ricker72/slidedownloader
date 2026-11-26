const searchUtils = require('../public/search-utils');
const { getRuntime } = require('../config');

function getGoogleCseId() {
  return getRuntime().googleCseId;
}

module.exports = {
  ...searchUtils,
  getGoogleCseId,
};
