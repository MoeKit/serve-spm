'use strict';

var path = require('path');
var mime = require('mime');
var debug = require('debug')('serve-spm:express');

var parse = require('./parse');
var util = require('./util');
var transport = require('./transport');

module.exports = function(root, opts) {
  opts = opts || {};
  var log = opts.log || function() {};
  var ignore = Array.isArray(opts.ignore) ? opts.ignore : [];

  return function(req, res, next) {
    next = req.headers['servespmexit'] ? notFound : (next || notFound);

    if (Array.isArray(opts.paths)) {
      opts.paths.forEach(function(p) {
        req.url = req.url.replace(p[0], p[1]);
      });
    }

    debug('parse url %s', req.url);
    var pkg = util.getPackage(root);
    var rootPkg = pkg;
    var match;
    if (pkg && (match = util.matchNameVersion(req.url))) {
      pkg = pkg.getPackage(match.name + '@' + match.version);
    }
    if (!pkg) {
      debug('can not find local module of %s', req.url);
      return next();
    }

    var file = parse(req.url, {
      pkg: pkg,
      rootPkg: rootPkg,
      rules: opts.rules
    });

    if (!file) {
      return next();
    }

    // 304
    var modifiedTime = util.getModifiedTime(file);
    res.setHeader('Last-Modified', modifiedTime);
    if (!util.isModified(req.headers, modifiedTime)) {
      debug('file %s is not modified', file.path);
      res.writeHead(304);
      return res.end('');
    }

    log('>> ServeSPM %s < ./%s',
      file.url.pathname, path.relative(process.cwd(), file.path));

    // nowrap
    if (!file.wrap) {
      debug('return unwrapped file %s', file.path);
      return end(file.contents, res, path.extname(file.path));
    }

    var opt = {
      pkg: pkg,
      ignore: ignore
    };
    debug('return transported file %s', file.path);
    transport(file, opt, function(err, file) {
      var ext = path.extname(file.path);
      end(file.contents, res, ext);
    });

    function notFound() {
      res.writeHead(404);
      res.end('');
    }
  };
};

function end(data, res, extname) {
  if (['.tpl', '.json', '.handlebars'].indexOf(extname) > -1) {
    extname = '.js';
  }
  res.setHeader('Content-Type', mime.lookup(extname));
  res.writeHead(200);
  res.end(data);
}
