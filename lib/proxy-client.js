/*!
 * ProxyClient provides the basis for generating similar API clients.
 */
var http = require('http');
var https = require('https');
var url = require('url');
var util = require('util');
var express = require('express');
var mi = require('mi');
var superagent = require('superagent');
var superagentThen = require('superagent-then');

/**
 * Creates a new instance of ProxyClient with the provided `options`. The
 * available options are:
 *
 *  - `rootUrl`: The URL to base all requests on. Must include the protocol
 *    (http/https). Defaults to 'http://localhost'.
 */
function ProxyClient(options) {
  if (!(this instanceof ProxyClient)) {
    return new ProxyClient(options);
  }

  options = options || {};

  this.rootUrl = this.rootUrl || options.rootUrl || 'http://localhost';

  this._authorization = null;
}
ProxyClient.extend = mi.extend;
ProxyClient.inherit = mi.inherit;

/**
 * Create a new instance of this Client type. See constructor for valid options.
 */
ProxyClient.createClient = function createClient(options) {
  var cls = this;
  return cls(options);
};

/**
 * Gets a child Client with the same settings as this Client beyond any
 * additional `options` specified.
 */
ProxyClient.prototype.getChild = function getChild(options) {
  var child = this.constructor.createClient(this);
  child._authorization = options.auth;
  return child;
};

/**
 * Gets a complete URL relative to the Client's `rootUrl`.
 */
ProxyClient.prototype.getUrl = function getUrl(path) {
  return this.rootUrl + path;
};

/**
 * Creates a Promise-ready Superagent Request. For most requests:
 *
 * 1. `request.send()` should be used to provide a body.
 * 1. `request.end()` should be used to complete the request, returning a
 *   Promise to capture the response or error.
 *
 * See [https://github.com/visionmedia/superagent]() for more information on
 * the methods available to Requests.
 *
 * NOTE: A successfully-made request may not have been responded to with a
 * successful (200-ish) status code. Please check the status code in an
 * application-specific way after receiving the Response.
 */
ProxyClient.prototype.request = function request(method, path) {
  var start = Date.now();
  var href = this.getUrl(path);

  return superagent(method, href)
    .set('Authorization', this._authorization)
    .use(superagentThen)
    .on('error', function (err) {
      console.error('Error in %s %s: %s', method, href, err);
    })
    .on('response', function (res) {
      var ms = Date.now() - start;

      console.log('%s %s %s %s ms', method, href, res.statusCode, ms.toFixed(3));
    });
};

/**
 * Make a GET request, returning a promise to be fulfilled with the Response
 * or rejected with an HTTP error. See `request` for more details.
 */
ProxyClient.prototype.get = function get(path) {
  return this.request('GET', path);
};

/**
 * Make a POST request, returning a promise to be fulfilled with the Response
 * or rejected with an HTTP error. See `request` for more details.
 */
ProxyClient.prototype.post = function post(path) {
  return this.request('POST', path);
};

/**
 * Make a PUT request, returning a promise to be fulfilled with the Response
 * or rejected with an HTTP error. See `request` for more details.
 */
ProxyClient.prototype.put = function put(path) {
  return this.request('PUT', path);
};

/**
 * Make a DELETE request, returning a promise to be fulfilled with the Response
 * or rejected with an HTTP error. See `request` for more details.
 */
ProxyClient.prototype.del = function del(path) {
  return this.request('DELETE', path);
};

/**
 * Generates a Express-compatible sub-application that proxies requests from
 * browser clients.
 */
ProxyClient.prototype.subapp = function subapp() {
  var self = this;
  var app = express();

  app.use(function (req, res, next) {
    var start = Date.now();
    var href = self.getUrl(req.url);
    var parsedUrl = url.parse(href);
    var outgoing = self._createCoreRequest({
      protocol: parsedUrl.protocol,
      method: req.method,
      hostname: parsedUrl.hostname,
      port: parsedUrl.port,
      path: parsedUrl.path,
      headers: util._extend(req.headers, {
        'Connection': 'Keep-Alive',
        'Host': parsedUrl.host,
        'Origin': parsedUrl.host
      })
    });

    outgoing.on('response', function (incoming) {
      var ms = Date.now() - start;

      console.log('%s %s %s %s ms', req.method, href, incoming.statusCode, ms.toFixed(3));

      res.status(incoming.statusCode);
      res.set(incoming.headers);
      incoming.pipe(res);
    });

    req.pipe(outgoing);
  });

  return app;
};

/**
 * Internal use only.
 *
 * Helper to create a core Request based on `options`. The only option not
 * used by Node core is `options.protocol`, which signals the core module to
 * use.
 */
ProxyClient.prototype._createCoreRequest = function _createCoreRequest(options) {
  if (options.protocol === 'http:') {
    return http.request(options);
  }

  if (options.protocol === 'https:') {
    return https.request(options);
  }

  throw new Error('Invalid protocol, ' + options.protocol + '. Check rootUrl.');
};

/*!
 * Export `ProxyClient`.
 */
module.exports = ProxyClient;