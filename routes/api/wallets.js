'use strict'
var mongoose = require('mongoose');
var router = require('express').Router();
var Wallet = mongoose.model('Wallet');
var bluebird = require("bluebird");
var _ = require('lodash');
var crypto = require('crypto');
var Escrow = mongoose.model('Escrow');
var Cryptocurrency = mongoose.model('Cryptocurrency');
var passport = require('passport');

const Util = require('../../util');
const evtEmitter = require('../../util/evtemitter');
const logger = require('../../util/logger');
var ethers = require('ethers');

var CardanoWallet = require('../../wallet/cardano');
var EthereumWallet = require('../../wallet/ethereum');
var MoneroWallet = require('../../wallet/monero');
var RippleWallet = require('../../wallet/ripple');
var StellarWallet = require('../../wallet/stellar');

var adaWallet = CardanoWallet.instance;
var ethWallet = EthereumWallet.instance;
var moneroWallet = MoneroWallet.instance;
var rippleWallet = RippleWallet.instance;
var stellarWallet = StellarWallet.instance;
const checkValidHost = require('./checkValidHost');
var isFirebaseAuth = require('../../util/firebase-auth');

const utils = new Util();
var moneroAccInfo = {
    name: '',
    balance: 0,
    accInfo: [],
    password: '',
    language: 'English',
    email: ''
}


router.get('/escrow', checkValidHost, passport.authenticate('bearer', { session: false }), function(req, res, next) {
    getListOfEscrow(req, res, next);
});

router.get('/admin/escrow', checkValidHost, isFirebaseAuth, function(req, res, next) {
    getListOfEscrow(req, res, next);
});

function getListOfEscrow(req, res, next){
    Escrow.find({},function (err, result) {
        if(err) res.status(500).json(err);
        return res.status(200).json(result);
    });
}

router.post('/escrow', checkValidHost, passport.authenticate('bearer', { session: false }), function(req, res, next) {
    addEscrow(req, res, next);
});

router.post('/admin/escrow', checkValidHost, isFirebaseAuth, function(req, res, next) {
    addEscrow(req, res, next);
});

function addEscrow(req, res, next){
    var escrowBody =  req.body;
    Cryptocurrency.find({type: escrowBody.type},function (err, result) {
        if(err) res.status(500).json(err);
        if(result == null){
            res.status(500).json({error: 'Please setup crypto currencies list'});
        }
    });

    Escrow.find({escrowWalletAddress: escrowBody.address, cryptoType: escrowBody.type},function (err, escrow) {
        if(err) res.status(500).json(err);
        if(escrow){
            let newEscrow =  new Escrow({
                escrowWalletAddress: escrowBody.address,
                cryptoType: escrowBody.type,
                feeRate: escrowBody.fee,
                status: escrowBody.status
            });
            newEscrow.save(function (err, newEscrow) {
                if (err) return res.status(500).json(err);
                return res.status(200).json(newEscrow);
            });
        }
    });
}

router.put('/escrow/:escrowId', checkValidHost, passport.authenticate('bearer', { session: false }), function(req, res, next) {
    updateEscrow(req, res, next);
});

router.put('/admin/escrow/:escrowId', checkValidHost, isFirebaseAuth, function(req, res, next) {
    updateEscrow(req, res, next);
});

function updateEscrow(req, res, next){
    var generatedAuthCode = randomValueHex(7);
    let escrowId = req.params.escrowId;
    let unauthorizedEscrowWalletAddress = req.body.unauthorizedEscrowWalletAddress;
    let unauthorizedFeeRate = req.body.unauthorizedFeeRate;
    let escrowStatus = req.body.escrowStatus;
    console.log("generatedAuthCode " + generatedAuthCode);
    Escrow.findByIdAndUpdate(escrowId, { $set: 
            {   unauthorizedEscrowWalletAddress: unauthorizedEscrowWalletAddress, 
                unauthorizedFeeRate: unauthorizedFeeRate,
                unauthorizedStatus: escrowStatus,
                authorizeCode: generatedAuthCode
            }}, { new: true }, 
        function (err, updatedCrypto) {
            if (err) return res.status(500).json(err);
            // send the auth code out to the wallet management team if update is made.
            return res.status(200).json(updatedCrypto);
        }
    );
}

router.put('/escrow/approve/:escrowId/:authCode', checkValidHost, passport.authenticate('bearer', { session: false }), function(req, res, next) {
    approveEscrow(req, res, next);
});

router.put('/admin/scrow/approve/:escrowId/:authCode', checkValidHost, isFirebaseAuth, function(req, res, next) {
    approveEscrow(req, res, next);
});

function approveEscrow(req, res, next){
    let escrowId = req.params.escrowId;
    let authCode = req.params.authCode;

    Escrow.findOne({_id: escrowId, authorizeCode: authCode},function (err, escrow) {
        if(err) res.status(500).json(err);
        let isAuthorizedFieldsUpd = false;
        console.log(escrow);
        if(escrow != null){
            console.log(escrow.unauthorizedEscrowWalletAddress);
            console.log(escrow.unauthorizedFeeRate);
            console.log(escrow.unauthorizedStatus);
            
            if(escrow.unauthorizedEscrowWalletAddress != null){
                console.log("escrow address changed!");
                escrow.escrowWalletAddress = escrow.unauthorizedEscrowWalletAddress;
                escrow.unauthorizedEscrowWalletAddress = null;
                isAuthorizedFieldsUpd = true;
            }
            
            if(escrow.unauthorizedFeeRate != null){
                console.log("escrow rate changed!");
                escrow.feeRate = escrow.unauthorizedFeeRate;
                escrow.unauthorizedEscrowWalletAddress = null;
                isAuthorizedFieldsUpd = true;
            }

            if(escrow.unauthorizedStatus != null){
                console.log("disable escrow!");
                escrow.status = escrow.unauthorizedStatus;
                escrow.unauthorizedStatus = null;
                isAuthorizedFieldsUpd = true;
            }

            if(isAuthorizedFieldsUpd){
                escrow.authorizeCode = null;
            }
            
            escrow.save(function (err, updatedCrypto) {
                if (err) return res.status(500).json(err);
                return res.status(200).json(updatedCrypto);
            });
        }else{
            return res.status(500).json({error:"No record to approve!"});
        }
    });
}

router.get('/cryptos', checkValidHost, passport.authenticate('bearer', { session: false }), function(req, res, next) {
    getAllCryptos(req, res, next);
});

router.get('/admin/cryptos', checkValidHost, isFirebaseAuth, function(req, res, next) {
    getAllCryptos(req, res, next);
});

function getAllCryptos(req, res, next){
    Cryptocurrency.find({},function (err, result) {
        if(err) res.status(500).json(err);
        return res.status(200).json(result);
    });
}

router.post('/cryptos', checkValidHost, passport.authenticate('bearer', { session: false }), function(req, res, next) {
    addCryptos(req, res, next);
});

router.post('/admin/cryptos', checkValidHost, isFirebaseAuth, function(req, res, next) {
    addCryptos(req, res, next);
});

function addCryptos(req, res, next){
    console.log(req.body);
    var cryptosBody = JSON.parse(JSON.stringify(req.body));
    let currencyCode = cryptosBody.code;
    let description = cryptosBody.desc;
    Cryptocurrency.findOne({'code': currencyCode },function (err, cryptos) {
        if(err) res.status(500).json(err);
        console.log(cryptos);
        if(cryptos == null){
            var newCryptocurrency = new Cryptocurrency({
                code: currencyCode,
                desc: description
            });
            newCryptocurrency.save(function (err, insertedCrypto) {
                if (err) return res.status(500).json(err);
                console.log(insertedCrypto);
                return res.status(200).json(insertedCrypto);
            });
        }else{
            res.status(500).json({error:'crypto currency already exist'});
        }
        
    });
}

router.put('/cryptos/:cryptoId', checkValidHost, passport.authenticate('bearer', { session: false }), function(req, res, next) {
    updateCryptos(req, res, next);
});

router.put('/admin/cryptos/:cryptoId', checkValidHost, isFirebaseAuth, function(req, res, next) {
    updateCryptos(req, res, next);
});

function updateCryptos(req, res, next){
    let updateCryptoBody = req.body;
    let cryptoId = req.params.cryptoId;
    let cryptoCode = updateCryptoBody.code;
    let description = updateCryptoBody.desc;
    
    Cryptocurrency.findByIdAndUpdate(cryptoId, { $set: {desc: description, code: cryptoCode}}, { new: false }, 
        function (err, updatedCrypto) {
            if (err) return res.status(500).json(err);
            return res.status(200).json(updatedCrypto);
        }
    );
}

router.get('/:email', checkValidHost, passport.authenticate('bearer', { session: false }), function(req, res, next) {
    getWalletByEmail(req, res, next);
});

router.get('/admin/:email', checkValidHost, isFirebaseAuth, function(req, res, next) {
    getWalletByEmail(req, res, next);
});

function getWalletByEmail(req, res, next){
    var emailAddy  = req.params.email;
    logger.debug(emailAddy);
    Wallet.findOne({ 'email': emailAddy },function (err, wallet) {
        if(err) res.status(500).json(err);
        return res.status(200).json(wallet);
    });
}

router.get('/balance/:walletid/:type', checkValidHost, passport.authenticate('bearer', { session: false }), function(req, res, next) {
    checkWalletBalance(req, res, next);
});

router.get('/admin/balance/:walletid/:type', checkValidHost, isFirebaseAuth, function(req, res, next) {
    checkWalletBalance(req, res, next);
});

function checkWalletBalance(req, res, next){
    var walletId  = req.params.walletid;
    var walletType  = req.params.type.toUpperCase();

    logger.debug(walletId);
    logger.debug(walletType);
    
    Wallet.findById(walletId, function(err, wallet){
        if(err) return res.status(500).json(err);
        //console.log(">>>" + wallet);
        if('ETH' === walletType){
            if(typeof(_.get(wallet, 'eth')) === 'undefined'){
                return res.status(500).json({error: 'eth wallet not initialize.'});
            }
            //console.log(wallet.eth.privateKey);
            ethWallet.balance(wallet.eth.privateKey).then(bal => {
                logger.debug("-> balance -> result - > " + bal);
                logger.debug("In ETH > " + ethers.utils.formatEther(bal, {}));
                logger.debug("Typeof In ETH > " + typeof (ethers.utils.formatEther(bal, {})));
                let ethNested = JSON.parse(JSON.stringify(wallet.eth));
                ethNested.amount = ethers.utils.formatEther(bal, {});
                ethNested.totalLockedAmount = 0;
                wallet.eth = ethNested;
                wallet.save (function (err, updatedWallet) {
                    if (err) return handleError(err);
                    return res.status(200).json(updatedWallet.eth);
                });
            }).catch(error => { console.error('caught', error); });     
        }else if('XMR' === walletType){
            console.log(typeof(_.get(wallet, 'monero')));
            if(typeof(_.get(wallet, 'monero')) === 'undefined'){
                return res.status(500).json({error: 'monero wallet not initialize.'});
            }
            moneroWallet.openWallet(wallet.monero.name, wallet.monero.password).then(function(result) {
                moneroWallet.balance(walletId).then(availBalance=>{
                    logger.debug("availBalance >>>> " + availBalance);
                    let moneroNested = JSON.parse(JSON.stringify(wallet.monero));
                    wallet.monero.balance = availBalance;
                    moneroNested.totalLockedAmount = 0;
                    wallet.monero = moneroNested;
                    wallet.save(function (err, updatedWallet) {
                        if (err) return handleError(err);
                        console.log("HELLO>>>>>>>HELLO>>>>>" + JSON.stringify(updatedWallet.monero.balance));
                        return res.status(200).json(updatedWallet.monero);

                    });
                });
            });
        }else if('XLM' === walletType){
            if(typeof(_.get(wallet, 'stellar')) === 'undefined'){
                return res.status(500).json({error: 'stellar wallet not initialize.'});
            }
            console.log(wallet.stellar);
            stellarWallet.balance(wallet.stellar.public_address, wallet.email);
            Wallet.findById(walletId, function(err, wallet){
                if (err) return handleError(err);
                return res.status(200).json(wallet.stellar);
            });
        }else if('ADA' === walletType){
            console.log(_.get(wallet, 'cardano'));
            if(typeof(_.get(wallet, 'cardano')) === 'undefined'){
                return res.status(500).json({error: 'cardano wallet not initialize.'});
            }
            console.log("-- wallet ada --");
            console.log(wallet.cardano);
            console.log(wallet.cardano.result.Right.cwId);
            console.log(wallet.email);
            console.log("-- before calling api wallet ada --");
            adaWallet.balance(wallet.cardano.result.Right.cwId,wallet.email);
            Wallet.findById(walletId, function(err, updatedWallet){
                if (err) return handleError(err);
                return res.status(200).json(updatedWallet.cardano);
            });
            
        }else if('XRP' === walletType){
            console.log(_.get(wallet, 'ripple'));
            if(typeof(_.get(wallet, 'ripple')) === 'undefined'){
                return res.status(500).json({error: 'ripple wallet not initialize.'});
            }
            console.log("wallet.ripple");
            rippleWallet.balance(wallet.ripple.account.address, wallet.email);
            Wallet.findById(walletId, function(err, updatedWallet){
                if (err) return handleError(err);
                return res.status(200).json(updatedWallet.ripple);
            });
        }else{
            res.status(500).json({error: 'unsupported crypto currency'});
        }
    })  
}

router.get('/generate/:email/:password/:language', checkValidHost, passport.authenticate('bearer', { session: false }), function(req, res, next) {
    generateWalletForUser(req, res, next);
});

router.get('/admin/generate/:email/:password/:language', checkValidHost, isFirebaseAuth, function(req, res, next) {
    generateWalletForUser(req, res, next);
});

function generateWalletForUser(req, res, next){
    var emailAddy = req.params.email;
    var walletGlobalPassword = req.params.password;
    var _language = req.params.language;
    
    Wallet.findOne({ 'email': emailAddy },function (err, wallet) {
        logger.debug(err);
        if (err) {
            logger.error(err);
            res.status(500).json({error: err});
        }
        console.log(wallet);
        if (wallet == null) {
            logger.debug("creating wallet ....");
            Wallet.create({ email: emailAddy, eth: {}, monero: {}, cardano: {}, ripple: {}, stellar: {} }, function (err, createdWallet) {
                //logger.debug(wallet);
                if (err) {
                    logger.error(err);
                }
                // saved!
                if(createdWallet != null){
                    adaWallet.createWallet(walletGlobalPassword, emailAddy);
                    
                    ethWallet.createWallet(walletGlobalPassword, emailAddy).then(result => {
                        //logger.debug("result" + result);
                        Wallet.findOne({ 'email': emailAddy },function (err, wallet) {
                            //logger.debug(wallet);
                            wallet.eth = result;
                            wallet.save(function (err, updatedWallet) {
                                if (err) return handleError(err);
                                //logger.debug(updatedWallet);
                            });
                        });
                    });

                    //logger.debug(Util);
                    var walletFileName = utils.makeid();
                    //logger.debug("emailAddy>>>" + emailAddy);
                    moneroAccInfo.name = walletFileName;
                    moneroAccInfo.password = walletGlobalPassword;
                    moneroAccInfo.language = _language;
                    moneroAccInfo.email = emailAddy;
                    
                    //logger.debug("moneroAccInfo>>>" + JSON.stringify(moneroAccInfo));
                    bluebird.reduce( [createWallet(moneroAccInfo), openWallet(moneroAccInfo), getAddress(moneroAccInfo), getViewKey(moneroAccInfo), getSpendKey(moneroAccInfo), getSeed(moneroAccInfo), updateWallet(moneroAccInfo)], function ( moneroAccInfo ) {
                        return moneroAccInfo;             
                    }, moneroAccInfo ).then( function ( result ) {
                        //logger.debug( "---> --> seq result "  + JSON.stringify(result ));
                    } );
                    
                    rippleWallet.generate(emailAddy);
                    stellarWallet.generate(emailAddy);
                }
                
                return res.status(200).json(createdWallet);
            })
        }else{
            return res.status(200).json(wallet);
        }
    });
}

function createWallet(moneroAccInfo){
    return moneroWallet.createWallet(moneroAccInfo);
}

// this is a serious bug for monero after creation we need to open the wallet.  
function openWallet(moneroAccInfo){
    return moneroWallet.openWallet(moneroAccInfo.name, moneroAccInfo.password);
}

function getAddress(moneroAccInfo){
    return moneroWallet.address();
}


function getViewKey(moneroAccInfo){
    return moneroWallet.queryKey('view_key');
}

function getSpendKey(moneroAccInfo){
    return moneroWallet.queryKey('spend_key');
}

function getSeed(moneroAccInfo){
    return moneroWallet.queryKey('mnemonic');
}

function updateWallet(moneroAccInfo){
    Wallet.findOne({ 'email': moneroAccInfo.email },function (err, wallet) {
        //logger.debug(wallet);
        wallet.monero = moneroAccInfo;
        wallet.save(function (err, updatedWallet) {
            if (err) return handleError(err);
            //logger.debug(updatedWallet);
        });
    });
}

async function processEvent(arg){
    let moneroAccInfo = {
        name: '',
        balance: 0,
        accInfo: [],
        password: '',
        language: 'English',
        email: ''
    }
    logger.debug("Wallet Event !");
    logger.debug(arg);
    var clone = Object.assign({}, arg); 
    moneroAccInfo.accInfo.push(clone);
    logger.debug("moneroAccInfo.accInfo.length>" + moneroAccInfo.accInfo.length);
    try{
        if(moneroAccInfo.accInfo.length == 5) {
            console.log("EMAIL >>>>" + moneroAccInfo.email);
            if(moneroAccInfo.email != ''){
                Wallet.findOne({ 'email': moneroAccInfo.email },function (err, wallet) {
                    if(moneroAccInfo != null  || wallet != null  || wallet.monero != null){
                        wallet.monero = moneroAccInfo;
                        wallet.save(function (err, updatedWallet) {
                            if (err) return handleError(err);
                            logger.debug(updatedWallet);
                        });
                    }
                });
            }
            
        }else{
            if(arg.walletId){
                let moneroBal = 0;
                logger.debug("WALLET ID > " + arg.walletId);
                logger.debug("WALLET ID > " + JSON.stringify(moneroAccInfo));
                if(typeof(moneroAccInfo.accInfo[1]) !== 'undefined'){
                    logger.debug("WALLET ID > " + moneroAccInfo.accInfo[1]);
                    if(typeof(moneroAccInfo.accInfo[1].result) !== 'undefined'){
                        logger.debug("WALLET ID > " + moneroAccInfo.accInfo[1].result);
                        if(typeof(moneroAccInfo.accInfo[1].result.balance) !== 'undefined'){
                            logger.debug("WALLET ID > " + JSON.stringify(moneroAccInfo.accInfo[1].result.balance));
                            moneroBal = parseInt(moneroAccInfo.accInfo[1].result.balance);
                        }
                    }
                }
                
                if(typeof(moneroAccInfo.accInfo[0]) !== 'undefined'){
                    if(typeof(moneroAccInfo.accInfo[0].result.balance) !== 'undefined'){
                        moneroBal = parseInt(moneroAccInfo.accInfo[0].result.balance);
                    }
                }
                
                console.log(moneroBal);
                Wallet.findByIdAndUpdate(arg.walletId, { $set: { 'monero.balance': moneroBal}}, { new: true }, function (err, updatedWallet) {
                    if (err) return console.log(err);
                    console.log("UPD WALLET >>>" + updatedWallet);
                  });
            }
        }
    }catch(error){
        console.log(error);
        throw new Error(error);
    }
}

async function receiveWalletEvent (arg){
    await processEvent(arg);
}

evtEmitter.on('walletEvt', function (arg) {
    receiveWalletEvent(arg);
});

function handleError(error){
    logger.error(error);
}

function web3StringToBytes32(text) {
    var result = ethers.utils.hexlify(ethers.utils.toUtf8Bytes(text));
    while (result.length < 66) { result += '0'; }
    if (result.length !== 66) { throw new Error("invalid web3 implicit bytes32"); }
    return result;
}

function randomValueHex (len) {
    return crypto.randomBytes(Math.ceil(len/2))
        .toString('hex') // convert to hexadecimal format
        .slice(0,len);   // return required number of characters
}

module.exports = router;
