const mongoose = require('mongoose');
const router = require('express').Router();
const logger = require('../../util/logger');
var _ = require('lodash');
var Decimal = require('decimal.js');
var uuid = require('uuid4');

var Escrow = mongoose.model('Escrow');
var Wallet = mongoose.model('Wallet');
var Transactions = mongoose.model('Transactions');
var CardanoWallet = require('../../wallet/cardano');
var EthereumWallet = require('../../wallet/ethereum');
var MoneroWallet = require('../../wallet/monero');
var RippleWallet = require('../../wallet/ripple');
var StellarWallet = require('../../wallet/stellar');
const evtEmitter = require('../../util/evtemitter');

var adaWallet = CardanoWallet.instance;
var ethWallet = EthereumWallet.instance;
var moneroWallet = MoneroWallet.instance;
var rippleWallet = RippleWallet.instance;
var stellarWallet = StellarWallet.instance;

// need to move this crypto currency code to a js constant object.
const XMR = 'XMR';
const ETH = 'ETH';
const XLM = 'XLM';
const XRP = 'XRP';
const ADA = 'ADA';

router.get('/get-transaction/:type/:trxId/:email', function(req, res, next) {
    let email = req.params.email;
    let orderNo = req.params.orderNo;
    let type = req.params.type;
    console.log(`${email} - ${orderNo}`);
    Transactions.findOne({'email':email, 'orderNo': orderNo, 'type': type} ,function (err, trxn) {
        if(err) res.status(500).json(err);
        return res.status(200).json(trxn);
    });
});

router.get('/transaction-history/:email', function(req, res, next) {
    let email = req.params.email;
    console.log(`${email}`);
    Transactions.findOne({'email':email} ,function (err, result) {
        if(err) res.status(500).json(err);
        return res.status(200).json(result);
    });
});

router.post('/withdrawal', function(req, res, next) {
    console.log("direct withdrawal from user's wallet to external address");
    console.log(req.body);
    let escrowInfo = null;
    let emailWallet = null;
    try{
        let transferBody  = JSON.parse(JSON.stringify(req.body));
        console.log(JSON.stringify(transferBody));
        if(transferBody.beneficiaryEmail === transferBody.email){
            return res.status(500).json({error: 'transfers to your own wallet address is not allowed.'});
        }
        // do not store the pin it is just for verification
        let pin = transferBody.pin;
        // use the pin to verify the front end.
        let beneficiaryEmail = transferBody.beneficiaryEmail;
        // search the beneficiaryEmail for the fromAddress
        // get platform fee from the escrow
        getEscrowInformationByType(transferBody.cryptoCurrency)
            .then(function(result){
                console.log("escrow > "  +  result);
                escrowInfo = result;
                transferBody.transactionFee = escrowInfo.feeRate;
        });
        console.log("transferBody.email > " + transferBody.email);
        getWalletByEmail(transferBody.email).then(function(walletFromEmail){
            lookUpWalletAddress(transferBody.email, 
                                    transferBody.cryptoCurrency, 
                                    walletFromEmail)
                .then(function(fromAddressFromWallet){
                console.log(`fromAddressFromWallet ???? ${fromAddressFromWallet}`);
                var id = uuid();
                console.log(">>>> orderno generated >>>  " + id);
                transferBody.orderNo = id;
                getBeneficiaryWallet(transferBody.cryptoCurrency, transferBody.beneficiaryEmail).then(function(receipentWallet){
                    Transactions.findOne({'orderNo': transferBody.orderNo },function (err, trxn) {
                        if(err) {
                            console.log(err);
                            res.status(500).json(err);
                        }
                        console.log(trxn);
                        
                        if(trxn == null){
                            // status , fromAddressFromWallet , 
                            console.log("fromAddressFromWallet << >>>" + fromAddressFromWallet);
                            console.log("receipentWallet << >>>" + receipentWallet);
                            let beneficiaryWalletAddress = null;
                            console.log(typeof(transferBody.cryptoCurrency));
                            let type = transferBody.cryptoCurrency;
                            if(ETH === type){
                                beneficiaryWalletAddress = receipentWallet.eth.address;
                            }else if(XMR === type){
                                beneficiaryWalletAddress = receipentWallet.monero.accInfo[2].result.addresses[0].address;
                            }else if(XLM === type){
                                beneficiaryWalletAddress = receipentWallet.stellar.public_address;
                            }else if(XRP === type){
                                beneficiaryWalletAddress = receipentWallet.ripple.account.address;
                            }else if(ADA === type){
                                console.log(type);
                                beneficiaryWalletAddress = receipentWallet.cardano.accountInfo.caAddresses[0].cadId;
                            }
                            console.log(beneficiaryWalletAddress);
                            executeWithdrawal(0, fromAddressFromWallet, transferBody, 
                                escrowInfo, res, walletFromEmail, receipentWallet, beneficiaryWalletAddress);
                        }else{
                            console.log(`Order already exist. 
                                    ${transferBody.orderNo} - from ${fromAddressFromWallet}
                                    - to ${transferBody.toAddress} - type : ${transferBody.type}`);
                            res.status(500).json({errorCode: 10001, error: `Order already exist. 
                            ${transferBody.orderNo} - from ${fromAddressFromWallet}
                            - to ${transferBody.toAddress} - type : ${transferBody.type}`});
                        }
                    });
                }).catch(function(error){ 
                    console.log(error);
                    res.status(500).json(error); }); 
            }).catch(function(error){ 
                console.log(error);
                res.status(500).json(error); });
        }).catch(function(error){ 
            console.log(error);
            res.status(500).json(error); });
    }catch(error){
        console.log(error);
        res.status(500).json(error);
    }
});

/**
 * held by escrow.
 */
router.post('/held', function(req, res, next) {
    console.log(req.body);
    let escrowInfo = null;
    let emailWallet = null;
    try{
        let transferBody  = JSON.parse(JSON.stringify(req.body));
        console.log(JSON.stringify(transferBody));
        if(transferBody.beneficiaryEmail === transferBody.email){
            return res.status(500).json({error: 'transfers to your own wallet address is not allowed.'});
        }
        // do not store the pin it is just for verification
        let pin = transferBody.pin;
        // use the pin to verify the front end.
        let beneficiaryEmail = transferBody.beneficiaryEmail;
        // search the beneficiaryEmail for the fromAddress
        // get platform fee from the escrow
        getEscrowInformationByType(transferBody.cryptoCurrency)
            .then(function(result){
                console.log("escrow > "  +  result);
                escrowInfo = result;
                transferBody.transactionFee = escrowInfo.feeRate;
        });

        getWalletByEmail(transferBody.email).then(function(walletFromEmail){
            lookUpWalletAddress(transferBody.email, 
                                    transferBody.cryptoCurrency, 
                                    walletFromEmail)
                .then(function(fromAddressFromWallet){
                console.log(`fromAddressFromWallet ???? ${fromAddressFromWallet}`);
                getBeneficiaryEmail(transferBody.cryptoCurrency, transferBody.toAddress).then(function(receipentEmail){
                    Transactions.findOne({'orderNo': transferBody.orderNo },function (err, trxn) {
                        if(err) {
                            console.log(err);
                            res.status(500).json(err);
                        }
                        console.log(trxn);
                        if(trxn == null){
                            // status , fromAddressFromWallet , 
                            console.log("fromAddressFromWallet << >>>" + fromAddressFromWallet);
                            // status 0 means locked !
                            executeTransfertoEscrow(0, fromAddressFromWallet, transferBody, 
                                escrowInfo, res, walletFromEmail, receipentEmail);
                        }else{
                            console.log(`Order already exist. 
                                    ${transferBody.orderNo} - from ${fromAddressFromWallet}
                                    - to ${transferBody.toAddress} - type : ${transferBody.type}`);
                            res.status(500).json({errorCode: 10001, error: `Order already exist. 
                            ${transferBody.orderNo} - from ${fromAddressFromWallet}
                            - to ${transferBody.toAddress} - type : ${transferBody.type}`});
                        }
                    });
                }).catch(function(error){ 
                    console.log(error);
                    res.status(500).json(error); }); 
            }).catch(function(error){ 
                console.log(error);
                res.status(500).json(error); });
        }).catch(function(error){ 
            console.log(error);
            res.status(500).json(error); });
    }catch(error){
        console.log(error);
        res.status(500).json(error);
    }
});

router.post('/unlock-transfer/:orderNo', function(req, res, next) {
    let orderNo = req.params.orderNo;
    let escrowInfo = null;
    logger.debug(orderNo);
    Transactions.findOne({'orderNo':orderNo} ,function (err, trxn) {
        if(err) res.status(500).json(err);
        getEscrowInformationByType(transferBody.cryptoCurrency)
            .then(function(result){
                console.log("escrow > "  +  result);
                escrowInfo = result;
                var receiverResult = releaseTransactionToReceiver(trxn, escrowInfo, res);
                if(receiverResult){
                    trxn.status = 1;
                    trxn.save(function(err, updateTransaction){
                        console.log();
                        if (err) {
                            console.log(err);
                            return res.status(500).json(err);
                        }
                        return res.status(200).json(updateTransaction);
                    })
                }
        });
    });
});

async function releaseTransactionToReceiver(transaction, escrowInfo , res){
    let successRelease = false;
    
    console.log("[ SOURCE ADDRESS ] ==> " + escrowInfo.escrowWalletAddress);
    if(transaction.cryptoCurrency === ETH){
        console.log("transferBody.unit " + transaction.unit);
        x = new Decimal(transaction.unit);
        // multiple by 1000000 before sending to the API.
        y = x.times(1000000000000000000);
        console.log("" + escrowInfo.escrowWalletAddress);
        console.log(y.toNumber());
        console.log(escrowInfo.privateKey);
        ethWallet.transfer(transaction.toAddress, y.toNumber(), 
            escrowInfo.privateKey).then(transactionHash => {
            logger.debug("ETH transfer -> " + JSON.stringify(transactionHash));
            logger.debug("ETH transfer -> " + transactionHash.gasLimit.toNumber());
            transaction.final_receipt = transactionHash;
            updateTransactionForRelease(transaction,res);
        }).catch(error => { 
            console.error('caught', error);
            return res.status(500).json(error);
        });
    }else if(transaction.cryptoCurrency === XMR){
        console.log(walletFromEmail.monero.name);
        moneroWallet.openWallet(walletFromEmail.monero.name, 
            walletFromEmail.monero.password).then((result)=> {
            let amountToBeTransferForXMR =  new Decimal(transferBody.unit);
            console.log("escrowInfo.address" +  escrowInfo.escrowWalletAddress);
            var destination = {
                address: escrowInfo.escrowWalletAddress,
                amount: amountToBeTransferForXMR.toNumber(),
                orderNo: transferBody.orderNo
            }
            var arrDest = [];
            arrDest.push(destination);
            moneroWallet.transfer(arrDest).then(function(){
                logger.debug("transfer ....");
                moneroWallet.storeWallet().then(function(){
                    console.log('store wallet data spending on sender....');
                    updateTransaction(transaction,res);
                })
            }).catch((error)=>{
                logger.debug("xfer error "+ error);
                return res.status(500).json(error);
            });
        });
    
    }else if(transaction.cryptoCurrency === XLM){
        let amountToBeTransferForXLM =  new Decimal(transferBody.unit);
        stellarWallet.transfer(walletFromEmail.stellar.public_address,
            walletFromEmail.stellar.wallet_secret,
            escrowInfo.escrowWalletAddress,
            amountToBeTransferForXLM.toNumber(),
            transferBody.memo,
            transaction
        );
        return res.status(200).json(transaction);
    }else if(transaction.cryptoCurrency === XRP){
        let amountToBeTransferForXRP =  new Decimal(transferBody.unit);
        rippleWallet.transfer(walletFromEmail.ripple.account.address, 
            escrowInfo.escrowWalletAddress, 
            amountToBeTransferForXRP.toNumber(), 
            walletFromEmail.ripple.account.secret,
            transaction);
        return res.status(200).json(transaction);
    }else if(transaction.cryptoCurrency === ADA){
        let amountToBeTransferForAda =  new Decimal(transferBody.unit);
        // multiple by 1000000 before sending to the API.
        amountToBeTransferForAda.times(1000000);
        console.log(">> CAID >> " + walletFromEmail.cardano.accountInfo.caId)
        adaWallet.transfer(
                walletFromEmail.cardano.accountInfo.caId,
                escrowInfo.escrowWalletAddress, 
                amountToBeTransferForAda.toNumber(),
                transaction);
        return res.status(200).json(transaction);
    }
    return await successRelease;
}


function getEscrowInformationByType(cryptoType){
    return new Promise(function(resolve, reject){
        Escrow.findOne({cryptoType: cryptoType },function (err, escrowResult) {
            console.log("escrowResult >>>> " + escrowResult);
            if(err) reject(err);
            resolve(escrowResult);
    });})
}

function getWalletByEmail(email){
    return new Promise (function(resolve, reject){
        Wallet.findOne({'email': email },function (err, wallet) {
            if(err) reject(err);
            console.log(wallet);
            resolve(wallet);
        });
    });
}

function lookUpWalletAddress(email, type, wallet){
    console.log(`--> ${email} type : ${type} , wallet ${wallet}`);
    let walletAddress = null;
    if(wallet.email === email){
        return new Promise(function(resolve, reject){
            if(ETH === type){
                if(typeof(_.get(wallet, 'eth')) === 'undefined'){
                    reject({error: 'lookUpWalletAddress for eth is null.'});
                }
                walletAddress = wallet.eth.address;
            }else if(XMR === type){
                if(typeof(_.get(wallet, 'monero')) === 'undefined'){
                    reject({error: 'lookUpWalletAddress for xmr is null.'});
                }
                console.log("lookUpWalletAddress > " + JSON.stringify(wallet.monero.accInfo));
                walletAddress = wallet.monero.accInfo[1].result.addresses[0].address;
                console.log("lookUpWalletAddress walletAddress> " + walletAddress);
            }else if(XLM === type){
                if(typeof(_.get(wallet, 'stellar')) === 'undefined'){
                    reject({error: 'lookUpWalletAddress for xlm is null.'});
                }
                walletAddress = wallet.stellar.public_address;
            }else if(XRP === type){
                if(typeof(_.get(wallet, 'ripple')) === 'undefined'){
                    reject({error: 'lookUpWalletAddress for xrp is null.'});
                }
                walletAddress = wallet.ripple.account.address;
            }else if(ADA === type){
                if(typeof(_.get(wallet, 'cardano')) === 'undefined'){
                    reject({error: 'lookUpWalletAddress for ada is null.'});
                }
                walletAddress = wallet.cardano.accountInfo.caAddresses[0].cadId;
            }
            console.log(`type : ${type} from ${walletAddress}`);
            resolve(walletAddress);
        });
    }else{
        reject({error: 'Transfer Email is not the same as the stored wallet\'s email.'});
    }
}

function getBeneficiaryWallet(type, emailAddress){
    console.log(`type : ${type} , email ${emailAddress}`);
    let whereClause ={'email': emailAddress };
    console.log("where clause >" + whereClause);
    return new Promise(function(resolve, reject){
        Wallet.findOne(whereClause,function (err, wallet) {
            if(err) {
                console.log(err);
                return reject(err);
            }
            if(wallet == null){
                return reject(err);
            }
            resolve(wallet);
        });
    });
}

function getBeneficiaryEmail(type, address){
    console.log(`type : ${type} , address ${address}`);
    let whereClause ="";
    if(ETH === type){
        whereClause = {'eth.address': address };
    }else if(XMR === type){
        whereClause = {'monero.accInfo.2.result.addresses.0.address': address };
    }else if(XLM === type){
        whereClause = {'stellar.public_address': address };
    }else if(XRP === type){
        whereClause = {'ripple.account.address': address };
    }else if(ADA === type){
        whereClause = {'cardano.accountInfo.caAddresses.0.cadId': address };
    }
    console.log("where clause >" + whereClause);
    return new Promise(function(resolve, reject){
        Wallet.findOne(whereClause,function (err, wallet) {
            if(err) {
                console.log(err);
                return reject(err);
            }
            if(wallet == null){
                return reject(err);
            }
            console.log("Beneficiary email -> " + wallet.email);
            resolve(wallet.email);
        });
    });
}

function updateTransaction(newTransaction, res){
    newTransaction.save(function(err, newTransaction){
        console.log();
        if (err) {
            console.log(err);
            return res.status(500).json(err);
        }
        return res.status(200).json(newTransaction);
    });
}

function executeTransfertoEscrow(_status, fromAddressFromWallet, 
        transferBody, escrowInfo, res, walletFromEmail, receipentEmail){
    console.log("fromAddressFromWallet > " + fromAddressFromWallet);
    var newTransaction = new Transactions({ 
        orderNo: transferBody.orderNo,
        email: transferBody.email,
        fromAddress: fromAddressFromWallet,
        toAddress: transferBody.toAddress,
        unit: transferBody.unit,
        equivalentAmount: transferBody.equivalentAmount,
        transactCurrency: transferBody.transactCurrency,
        cryptoCurrency: transferBody.cryptoCurrency,
        platformFee: escrowInfo.feeRate,
        escrowId: escrowInfo.id,
        beneficiaryEmail: receipentEmail,
        status: _status,
        memo: transferBody.memo
    });

    // check unit is more than zero 
    validateAmount = new Decimal(transferBody.unit);
    console.log(validateAmount);
    console.log(validateAmount.s);
    console.log(validateAmount.s > 0);
    console.log(validateAmount.isPositive());
    if(validateAmount.isPositive()){
        console.log(validateAmount.toNumber());
        if(validateAmount.toNumber() == 0){
            return res.status(500).json({error: 'Amount/Unit transfer must not be zero'});
         }
    }else{
        if(validateAmount.s <= 0){
            return res.status(500).json({error: 'Amount/Unit transfer must be more than zero'});
         }
    }
    
    console.log("Calling wallet handlers....held by escrow");
    console.log("[ SOURCE ADDRESS ] ==> " + escrowInfo.escrowWalletAddress);
    if(transferBody.cryptoCurrency === ETH){
        console.log("transferBody.unit " + transferBody.unit);
        x = new Decimal(transferBody.unit);
        // multiple by 1000000 before sending to the API.
        y = x.times(1000000000000000000);
        console.log("" + escrowInfo.escrowWalletAddress);
        console.log(y.toNumber());
        console.log(walletFromEmail.eth.privateKey);
        ethWallet.transfer(escrowInfo.escrowWalletAddress, y.toNumber(), 
            walletFromEmail.eth.privateKey).then(transactionHash => {
            logger.debug("ETH transfer -> " + JSON.stringify(transactionHash));
            logger.debug("ETH transfer -> " + transactionHash.gasLimit.toNumber());
            newTransaction.receipt = transactionHash;
            updateTransaction(newTransaction,res);
        }).catch(error => { 
            console.error('caught', error);
            return res.status(500).json(error);
        });
    }else if(transferBody.cryptoCurrency === XMR){
        console.log(walletFromEmail.monero.name);
        moneroWallet.openWallet(walletFromEmail.monero.name, 
            walletFromEmail.monero.password).then((result)=> {
            let amountToBeTransferForXMR =  new Decimal(transferBody.unit);
            console.log("escrowInfo.address" +  escrowInfo.escrowWalletAddress);
            var destination = {
                address: escrowInfo.escrowWalletAddress,
                amount: amountToBeTransferForXMR.toNumber(),
                orderNo: transferBody.orderNo
            }
            var arrDest = [];
            arrDest.push(destination);
            moneroWallet.transfer(arrDest).then(function(){
                logger.debug("transfer ....");
                moneroWallet.storeWallet().then(function(){
                    console.log('store wallet data spending on sender....');
                    updateTransaction(newTransaction,res);
                })
            }).catch((error)=>{
                logger.debug("xfer error "+ error);
                return res.status(500).json(error);
            });
        });
    
    }else if(transferBody.cryptoCurrency === XLM){
        let amountToBeTransferForXLM =  new Decimal(transferBody.unit);
        stellarWallet.transfer(walletFromEmail.stellar.public_address,
            walletFromEmail.stellar.wallet_secret,
            escrowInfo.escrowWalletAddress,
            amountToBeTransferForXLM.toNumber(),
            transferBody.memo,
            newTransaction
        );
        return res.status(200).json(newTransaction);
    }else if(transferBody.cryptoCurrency === XRP){
        let amountToBeTransferForXRP =  new Decimal(transferBody.unit);
        rippleWallet.transfer(walletFromEmail.ripple.account.address, 
            escrowInfo.escrowWalletAddress, 
            amountToBeTransferForXRP.toNumber(), 
            walletFromEmail.ripple.account.secret,
            newTransaction);
        return res.status(200).json(newTransaction);
    }else if(transferBody.cryptoCurrency === ADA){
        let amountToBeTransferForAda =  new Decimal(transferBody.unit);
        // multiple by 1000000 before sending to the API.
        y2 = amountToBeTransferForAda.times(1000000);
        console.log(">> " + walletFromEmail.cardano.accountInfo.caId);
        console.log(y2)
        console.log(y2.toNumber());
        if(walletFromEmail.cardano.txnMessage.passphrase.length < 32){
            walletFromEmail.cardano.txnMessage.passphrase.padEnd(32, 'aB2@');
            console.log("after padding > " + walletFromEmail.cardano.txnMessage.passphrase);
        }
        if(walletFromEmail.cardano.txnMessage.passphrase.length != 32){
            return res.status(500).json({error: 'Wallet passphrase must be 32 characters'});
        }
        
        adaWallet.transfer(
                walletFromEmail.cardano.accountInfo.caId,
                escrowInfo.escrowWalletAddress, 
                y2.toNumber(),
                transferBody.email,
                walletFromEmail.cardano.txnMessage.passphrase,
                newTransaction);
        return res.status(200).json(newTransaction);
    }
}

function executeWithdrawal(_status, fromAddressFromWallet, 
    transferBody, escrowInfo, res, walletFromEmail, receipentWallet, beneficiaryWalletAddress){
    console.log("fromAddressFromWallet > " + fromAddressFromWallet);
    console.log("beneficiaryWalletAddress <> " + beneficiaryWalletAddress);
    transferBody.toAddress = beneficiaryWalletAddress;
    var newTransaction = new Transactions({ 
        orderNo: transferBody.orderNo,
        email: transferBody.email,
        fromAddress: fromAddressFromWallet,
        toAddress: beneficiaryWalletAddress,
        unit: transferBody.unit,
        equivalentAmount: transferBody.equivalentAmount,
        transactCurrency: transferBody.transactCurrency,
        cryptoCurrency: transferBody.cryptoCurrency,
        platformFee: escrowInfo.feeRate,
        escrowId: escrowInfo.id,
        beneficiaryEmail: receipentWallet.email,
        status: _status,
        memo: transferBody.memo
    });

    // check unit is more than zero 
    validateAmount = new Decimal(transferBody.unit);
    console.log(validateAmount);
    console.log(validateAmount.s);
    console.log(validateAmount.s > 0);
    console.log(validateAmount.isPositive());
    if(validateAmount.isPositive()){
        console.log(validateAmount.toNumber());
        if(validateAmount.toNumber() == 0){
            return res.status(500).json({error: 'Amount/Unit transfer must not be zero'});
        }
    }else{
        if(validateAmount.s <= 0){
            return res.status(500).json({error: 'Amount/Unit transfer must be more than zero'});
        }
    }

    console.log("Calling wallet handlers....direct withdrawal");
    if(transferBody.cryptoCurrency === ETH){
        console.log("transferBody.unit " + transferBody.unit);
        x = new Decimal(transferBody.unit);
        // multiple by 1000000 before sending to the API.
        y = x.times(1000000000000000000);
        console.log(y.toNumber());
        console.log(walletFromEmail.eth.privateKey);
        ethWallet.transfer(transferBody.toAddress, y.toNumber(), 
            walletFromEmail.eth.privateKey).then(transactionHash => {
            logger.debug("ETH transfer -> " + JSON.stringify(transactionHash));
            logger.debug("ETH transfer -> " + transactionHash.gasLimit.toNumber());
            newTransaction.receipt = transactionHash;
            updateTransaction(newTransaction,res);
        }).catch(error => { 
            console.error('caught', error);
            return res.status(500).json(error);
        });
    }else if(transferBody.cryptoCurrency === XMR){
        console.log(walletFromEmail.monero.name);
        moneroWallet.openWallet(walletFromEmail.monero.name, 
            walletFromEmail.monero.password).then((result)=> {
            let amountToBeTransferForXMR =  new Decimal(transferBody.unit);
            console.log("escrowInfo.address" +  escrowInfo.escrowWalletAddress);
            var destination = {
                address: transferBody.toAddress,
                amount: amountToBeTransferForXMR.toNumber(),
                orderNo: transferBody.orderNo
            }
            var arrDest = [];
            arrDest.push(destination);
            moneroWallet.transfer(arrDest).then(function(){
                logger.debug("transfer ....");
                moneroWallet.storeWallet().then(function(){
                    console.log('store wallet data spending on sender....');
                    updateTransaction(newTransaction,res);
                })
            }).catch((error)=>{
                logger.debug("xfer error "+ error);
                return res.status(500).json(error);
            });
        });

    }else if(transferBody.cryptoCurrency === XLM){
        let amountToBeTransferForXLM =  new Decimal(transferBody.unit);
        stellarWallet.transfer(walletFromEmail.stellar.public_address,
            walletFromEmail.stellar.wallet_secret,
            transferBody.toAddress,
            amountToBeTransferForXLM.toNumber(),
            transferBody.memo,
            newTransaction
        );
        return res.status(200).json(newTransaction);
    }else if(transferBody.cryptoCurrency === XRP){
        let amountToBeTransferForXRP =  new Decimal(transferBody.unit);
        rippleWallet.transfer(walletFromEmail.ripple.account.address, 
            transferBody.toAddress, 
            amountToBeTransferForXRP.toNumber(), 
            walletFromEmail.ripple.account.secret,
            newTransaction);
        return res.status(200).json(newTransaction);
    }else if(transferBody.cryptoCurrency === ADA){
        let amountToBeTransferForAda =  new Decimal(transferBody.unit);
        // multiple by 1000000 before sending to the API.
        y2 = amountToBeTransferForAda.times(1000000);
        console.log(">> " + walletFromEmail.cardano.accountInfo.caId);
        console.log(y2)
        console.log(y2.toNumber());
        if(walletFromEmail.cardano.txnMessage.passphrase.length < 32){
            walletFromEmail.cardano.txnMessage.passphrase.padEnd(32, 'aB2@');
            console.log("after padding > " + walletFromEmail.cardano.txnMessage.passphrase);
        }
        if(walletFromEmail.cardano.txnMessage.passphrase.length != 32){
            return res.status(500).json({error: 'Wallet passphrase must be 32 characters'});
        }
        
        adaWallet.transfer(
                walletFromEmail.cardano.accountInfo.caId,
                transferBody.toAddress, 
                y2.toNumber(),
                transferBody.email,
                walletFromEmail.cardano.txnMessage.passphrase,
                newTransaction);
        return res.status(200).json(newTransaction);
    }
}

evtEmitter.on('transferEvt', function (arg) {
    try{
        logger.debug("transferEvt Event !");
        logger.debug(arg);
        if(arg.orderNo != null){
            Transactions.findOne({orderNo: arg.orderNo}).then(function(foundTransaction){
                console.log("arg.orderNo" + arg.orderNo);
                console.log("foundTransaction > " + foundTransaction);
                //var copy = Object.assign({}, arg);
                foundTransaction.receipt = JSON.parse(JSON.stringify(arg));
                console.log("< receipt > " + foundTransaction.receipt);
                foundTransaction.save(function(err, updatedTrxn){
                    console.log();
                    if (err) {
                        console.log(err);
                    }
                    console.log("updatedTrxn > " + updatedTrxn);
                });
            });
        }
    }catch(error){
        console.log(error);
        throw new Error(error);
    }
});

evtEmitter.on('transferEvtError', function (arg) {
    console.log("error for transaction !");
    logger.debug(arg);
        if(arg.orderNo != null){
            Transactions.findOne({orderNo: arg.orderNo}).then(function(foundTransaction){
                console.log("arg.orderNo" + arg.orderNo);
                console.log("foundTransaction > " + foundTransaction);
                //var copy = Object.assign({}, arg);
                foundTransaction.error = JSON.stringify(arg);
                foundTransaction.status = -1;
                console.log("< ERROR > " + foundTransaction.error);
                foundTransaction.save(function(err, updatedTrxn){
                    console.log();
                    if (err) {
                        console.log(err);
                    }
                    console.log("updatedTrxn > " + updatedTrxn);
                });
            });
        }
});

module.exports = router;