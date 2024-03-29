const RippleAPI = require('ripple-lib').RippleAPI;
const logger = require('./util/logger');
const api = new RippleAPI({
  server: 'wss://s.altnet.rippletest.net:51233' // Public rippled server hosted by Ripple, Inc.
});

api.on('error', (errorCode, errorMessage) => {
  logger.debug(errorCode + ': ' + errorMessage);
});

api.on('connected', () => {
  logger.debug('connected');
});

api.on('disconnected', (code) => {
  // code - [close code](https://developer.mozilla.org/en-US/docs/Web/API/CloseEvent) sent by the server
  // will be 1000 if this was normal closure
  logger.debug('disconnected, code:', code);
});

api.connect().then(() => {
  /* insert code here */

  api.getBalances('rGHXrYhVUrPrK71PgChbCEqCDvR1FiCCB3').then(balances => {
              balances.map((currency) => {
              	logger.debug('  ' + currency.value + ' ' +currency.currency);
              })
    }, fail)
}).catch(console.error);


const fail = (message) => {
  logger.debug(message);
}
