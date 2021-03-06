'use strict';

var path = require('path');
var fs = require('fs');
var join = require('path').join;
var format = require('util').format;
var Package = require('father').SpmPackage;
var glob = require('glob');
var semver = require('semver');

var util = module.exports = {};

util.template = function(format, data) {
  if (!format) return '';
  return format.replace(/{{([a-z]*)}}/g, function(all, match) {
    return data[match] || '';
  });
};

util.isRelative = function(filepath) {
  return filepath.charAt(0) === '.';
};

util.define = function(id, str) {
  if (!str) {
    str = id;
    id = '';
  }
  id = id ? '\'' + id.replace(/\.js$/, '') + '\', ' : '';
  return format('define(%sfunction(require, exports, module){\n%s\n});\n',
    id, String(str));
};

/**
 * getPkg with lastmodified cache.
 */
var pkgCache = {};
util.getPackage = function(root) {
  var file = join(root, 'package.json');
  if (!fs.existsSync(file)) {
    return null;
  }
  var mtime = +new Date(fs.statSync(file).mtime);
  var data = pkgCache[root];
  if (!data || data.mtime !== mtime) {
    var pkg;
    try {
      pkg = new Package(root, {
        moduleDir: getModuleDir(root)
      });
    } catch(e) {
      console.log('pkg parse error: %s', e);
      return null;
    }

    data = pkgCache[root] = {
      mtime: mtime,
      pkg: pkg
    };
  }
  return data.pkg;
};

function getModuleDir(root) {
  return fs.existsSync(join(root, 'spm_modules')) ? 'spm_modules' : 'sea-modules';
}

util.isCSSFile = function(file) {
  return ['.css', '.less', '.styl', '.sass', '.scss']
    .indexOf(path.extname(file)) > -1;
};

util.getModifiedTime = function getModifiedTime(file) {
  var ftime = mtime(file.path);
  var ptime = mtime(join(file.base, 'package.json'));
  return Math.max(ftime, ptime);

  function mtime(filepath) {
    if (fs.existsSync(filepath)) {
      return new Date(fs.statSync(filepath).mtime);
    } else {
      return 0;
    }
  }
};

util.isModified = function(headers, modifiedTime) {
  if (!headers || !headers['if-modified-since']) {
    return true;
  }
  return modifiedTime > +new Date(+headers['if-modified-since']);
};

util.isStandalone = function(file) {
  if (path.extname(file.path) !== '.js') {
    return false;
  }

  var pkg = file.pkg;
  var buildArgs = (pkg.origin.spm && pkg.origin.spm.buildArgs) || '';
  if (['standalone', 'umd'].indexOf(buildArgs.include) === -1) {
    return false;
  }

  var entries = getEntries(pkg);
  return entries.indexOf(file.path) > -1;
};

util.matchNameVersion = function(pathname) {
  var m = pathname.match(/^\/(.+?)\/(.+?)\/(.*)/);
  if (m && m[0] && semver.valid(m[2])) {
    return {
      name: m[1],
      version: m[2],
      file: m[3]
    };
  }
};

function getEntries(pkg) {
  var entries = [];
  // main
  entries.push(join(pkg.dest, pkg.main));
  // outputs
  pkg.output.forEach(function(output) {
    var items = glob.sync(output, {cwd:pkg.dest});
    items.forEach(function(item) {
      entries.push(join(pkg.dest, item));
    });
  });
  // unique
  return entries.filter(function(item, index, arr) {
    return index === arr.indexOf(item);
  });
}
