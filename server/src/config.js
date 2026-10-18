// CLIENT_ORIGIN can hold several addresses separated by commas
const clientOrigins = (process.env.CLIENT_ORIGIN || '')
  .split(',')
  .map((s) => s.trim().replace(/\/$/, ''))
  .filter(Boolean);

module.exports = { clientOrigins };