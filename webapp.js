const dotenv = require('dotenv');
const dotenvParseVariables = require('dotenv-parse-variables');

let env = dotenv.config({})
if (env.error) throw env.error;
env = dotenvParseVariables(env.parsed);

var http = require('http'),
    path = require('path'),
    methods = require('methods'),
    express = require('express'),
    bodyParser = require('body-parser'),
    session = require('express-session'),
    errorhandler = require('errorhandler'),
    cors = require('cors');
var logger = require('./util/logger'); 
// Create global app object
var app = express();

app.use(cors());

// Normal express config defaults
app.use(require('morgan')('dev'));
app.use(bodyParser.urlencoded({ limit: '50mb', extended: true }));
app.use(bodyParser.json({limit: '50mb'}));

app.use(require('method-override')());
app.use(express.static(__dirname + '/wallet-mgmt-web/dist'));

app.use(session({ secret: process.env.WEB_SECRET, cookie: { maxAge: 60000 }, resave: false, saveUninitialized: false  }));

var isProduction = process.env.NODE_ENV === 'production';

if (!isProduction) {
  app.use(errorhandler());
}


/// catch 404 and forward to error handler
app.use(function(req, res, next) {
  var err = new Error('Not Found');
  err.status = 404;
  next(err);
});

/// error handlers

// development error handler
// will print stacktrace
if (!isProduction) {
  app.use(function(err, req, res, next) {
    //logger.debug(err.stack);

    res.status(err.status || 500);

    res.json({'errors': {
      message: err.message,
      error: err
    }});
  });
}

// production error handler
// no stacktraces leaked to user
app.use(function(err, req, res, next) {
  res.status(err.status || 500);
  res.json({'errors': {
    message: err.message,
    error: {}
  }});
});

// finally, let's start our server...
var server = app.listen( process.env.WEBAPP_PORT, function(){
  logger.info(' Listening on port ' + server.address().port);
});
