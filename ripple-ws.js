const dotenv = require('dotenv');
const dotenvParseVariables = require('dotenv-parse-variables');
const logger = require('./util/logger');

let env = dotenv.config({})
if (env.error) throw env.error;
env = dotenvParseVariables(env.parsed);

const RippleAPI = require('ripple-lib').RippleAPI;
const WebSocket = require('ws');
const wss = new WebSocket.Server({ port: process.env.RIPPLE_WS_SVR_PORT });

const _get = require('lodash.get')
const currency = 'XRP'
const maxFee = '0.15'
/*
  https://ripple.com/build/xrp-test-net/
*/

wss.on('connection', function connection(ws) {
  ws.on('message', function incoming(message) {
    logger.debug('received: %s', message);
    let incomingObj = JSON.parse(message);
    //logger.debug(api);
    const api = new RippleAPI({
      server: process.env.RIPPLE_API // Public rippled server hosted by Ripple, Inc.
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
  	
      if(incomingObj.type == 'generateAddress'){
        const account = api.generateAddress();
        //logger.debug(account);
        let generateAddressJson = {
          type: 'generateAddress',
          account: account,
          email: incomingObj.email
        }
        logger.debug(JSON.stringify(generateAddressJson));
        ws.send(JSON.stringify(generateAddressJson));
        api.disconnect();
      }

      if(incomingObj.type == 'balance'){
          //logger.debug(incomingObj.walletAddress);
          //logger.debug(incomingObj.email);
          
          api.getBalances(incomingObj.walletAddress).then(balances => {
              balances.map((currency) => {
                logger.debug('  ' + currency.value + ' ' + currency.currency)
                var returnBalance = {
                  currency: currency.currency,
                  value: currency.value,
                  type: 'balance',
                  email: incomingObj.email
                }
                ws.send(JSON.stringify(returnBalance));
                api.disconnect();
              })
          }, fail).catch((error)=>{
            console.log(">>> error >>> " + error);
            ws.send(JSON.stringify(error));
          })
      }

      if(incomingObj.type == 'transfer'){
        const instructions = {
            maxLedgerVersionOffset: 5,
            maxFee
        }
        console.log(currency);
        console.log(incomingObj);
        console.log(incomingObj.transfer.sourceAddress);
        console.log(incomingObj.transfer.destinationAddress);
        const payment = {
            source: {
              'address': incomingObj.transfer.sourceAddress,
              'maxAmount': {
                'value': incomingObj.transfer.amount.toString(),
                'currency': currency.toString().toUpperCase()
              }
            },
            destination: {
              'address': incomingObj.transfer.destinationAddress,
              'amount': {
                'value': incomingObj.transfer.amount.toString(),
                'currency': currency.toString().toUpperCase()
              }
            }
        }
        console.log(payment);
        api.preparePayment(incomingObj.transfer.sourceAddress, payment, instructions).then(prepared => {

          const { signedTransaction } = api.sign(prepared.txJSON, incomingObj.transfer.sourceSecret)
          logger.debug('Submitting payment...')
          api.submit(signedTransaction).then(() => {
            //waitForBalancesUpdate(sourceAddress, answers.destinationAddress, sourceBalance)
            logger.debug('Ok submitted ripple >> ' + signedTransaction);
            let transactionHash = {
              transaction_id: signedTransaction,
              datetime: new Date()
            }
            incomingObj.receipt = transactionHash;
            console.log(incomingObj);
            ws.send(JSON.stringify(incomingObj));
            api.disconnect();
          }, fail).catch((error)=>{
            console.log(error);
            // send back the client of the websocket
            ws.send(JSON.stringify(error));
          })

        });
      }
    }).catch(console.error);
  });
});

const fail = (message) => {
  logger.debug(message);
  throw new Error(message);
}
