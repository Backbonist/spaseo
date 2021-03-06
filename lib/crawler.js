var Browser = require('zombie'),
  _ = require('underscore'),
  async = require('async'),
  fs = require('fs'),
  Path = require('path'),
  browser = require('./browser'),
  createServer = require('./pushStateServer'),
  defaults = {
    port: 3000,
    host: 'localhost',
    verbose: false
  };

// Return an object of href: html
module.exports = function (path, options, cb){
  if(typeof options == 'function'){
    cb = options;
    options = {};
  }

  options = _.extend({}, defaults, options);


  options.host = options.host || defaults.host;
  var BASE_URL = 'http://' + options.host + ':' + options.port;

  // href: html object
  var cache = {};

  var htmlBeginRegexp = /^(.|\n)*?<head>/i;

  // Contains the HTML up to the <HEAD> included
  var htmlBegin = null;

  // A queue of `analysePage` jobs to be executed
  var queue = async.queue(analysePage, 10);

  var server = createServer(path, options);

  // When the queue is empty call the callback
  queue.drain = function(){
    server.close();
    cb(null, cache);
  };

  server.listen(options.port, options.host, function(e){
    if(e) return cb(e);
    fs.readFile(Path.join(path, 'index.html'), function(err, html){
      if(e) return cb(e);
      htmlBegin = html.toString().match(htmlBeginRegexp)[0];
      queue.push('/', function(e){
        if(e) return cb(e);
      });
    });
  });

  // analyse an url and fill in the queue if new urls are found.
  function analysePage(url, cb){
    browser(BASE_URL + url, options, function (e, browser, status, content) {
      if(e) return cb(e);
      cache[url] = content.replace(htmlBeginRegexp, htmlBegin);
      var hrefs = parseLinks(browser);

      var knownHref = _(cache).keys();

      var hrefsDiff = _(hrefs).difference(knownHref);

      hrefsDiff.forEach(function(href){
        cache[href] = null;
        queue.push(href, function(e){
          if(e) return cb(e);
        });
      });

      cb(null, hrefsDiff);
    });
  }

  // return external hrefs in the page
  function parseLinks(browser){
    var links = browser.queryAll('a');
    links = links.filter(function(link){ return !/jpg|jpeg|png|gif/.test(link.getAttribute('href')); });
    var hrefs = links.map(function(link){ return link.getAttribute('href'); });

    // filter external links
    hrefs = hrefs.filter(function(href){ return !/:/.test(href); });

    return hrefs;
  }
};
