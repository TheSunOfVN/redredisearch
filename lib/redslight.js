/*!
 * RedsLight for RediSearch
 *
 * Forked from tj/reds
 * Original work Copyright(c) 2011 TJ Holowaychuk <tj@vision-media.ca>
 * Modified work Copyright(c) 2017 Kyle Davis
 * Modified work Copyright(c) 2018 Thinh Nguyen <thesunofvn@gmail.com>
 * Modified work Copyright(c) 2019 Vu Chau
 * MIT Licensed
 */

/**
 * Module dependencies.
 */

var redis = require('redis');
var validator = require('./validator')
var parser = require('./parser')

// Default function
function noop() {};

/**
 * Library version.
 */

exports.version = '0.1.5';

/**
 * Expose `Search`.
 */

exports.Search = Search;

/**
 * Expose `Query`.
 */

exports.Query = Query;

/**
 * Search types.
 */

var types = {
  intersect: 'and',
  union: 'or',
  and: 'and',
  or: 'or'
};

/**
 * Alternate way to set client
 * provide your own behaviour.
 *
 * @param {RedisClient} inClient
 * @return {RedisClient}
 * @api public
 */

exports.setClient = function (inClient) {
  return exports.client = inClient;
}

/**
 * Create a redis client, override to
 * provide your own behaviour.
 *
 * @return {RedisClient}
 * @api public
 */

exports.createClient = function (client) {
  return exports.client
    || (exports.client = redis.createClient(client));
};

/**
 * Confirm the existence of the RediSearch Redis module
 *
 * @api public
 */

exports.confirmModule = function (cb) {
  exports.client.send_command('FT.CREATE', [], function (err) {
    let strMsg = String(err);
    if (strMsg.indexOf('ERR wrong number of arguments') > 0) {
      cb(null);
    } else {
      cb(err);
    }
  });
}

/**
 * Return a new reds `Search` with the given `key`.
 * @param {String} key
 * @param {Object} opts
 * @return {Search}
 * @api public
 */

exports.createSearch = function (key, schema, opts = {}, cb) {
  const searchObj = function (err, info) {
    if (err) {
      cb(err);
    } else {
      cb(err, new Search(key, info, opts));
    }
  };

  // opts.payloadField = opts.payloadField ? opts.payloadField : 'payload';

  if (!key) throw new Error('createSearch() requires a redis key for namespacing');

  // Validate schema
  validator.validateSchema(schema)
  
  exports.client.send_command('FT.INFO',[key],function (err, info) {

    // if the index is not found, we need to make it.
    if (err && String(err).indexOf('Unknown Index name') > 0) {
      let args = [
        key
      ];

      // Overwrite STOP WORDS
      if (opts.stopWords && opts.stopWords.length >= 0) {
        args.push('STOPWORDS', opts.stopWords.length, ...opts.stopWords)
      }

      // Set TTL
      if (opts.ttl && opts.ttl > 0) {
        args.push('TEMPORARY', opts.ttl);
      }

      args.push('SCHEMA');
      Object.keys(schema).forEach(function (key) {
        args.push(key, schema[key].type);
      })
      
      exports.client.send_command(
        'FT.CREATE',
        args,
        function (err) {
          if (err) {
            cb(err);
          } else {
            exports.client.send_command('FT.INFO', [key], searchObj);
          }
        }
      );
    } else {
      searchObj(err, info);
    }
  });
};

/**
 * Drop a search index by index key
 * @param {String} key
 * @param {Object} opts
 * @return {Search}
 * @api public
 */

exports.dropSearch = function (key, opts = {}, cb) {

  if (!key) throw new Error('dropSearch() requires a redis key for namespacing');

  exports.client.send_command('FT.INFO',[key],function (err,info) {
    if (!err) { 
      let args = [
        key
      ];
      if (opts.keepDocs) {
        args.push('KEEPDOCS');
      }
      exports.client.send_command(
        'FT.DROP',
        args,
        cb
      );
    } else {
      if (String(err).indexOf('Unknown Index name') > 0) {
        cb(null, info)
      } else {
        cb(err, info)
      }
    }
  });
};

/**
 * Return the words in `str`. This is for compatability reasons (convert OR queries to pipes)
 *
 * @param {String} str
 * @return {Array}
 * @api private
 */

exports.words = function (str) {
  return String(str).match(/\w+/g);
};


/**
 * Initialize a new `Query` with the given `str`
 * and `search` instance.
 *
 * @param {String} str
 * @param {Search} search
 * @api public
 */

function Query(str, search) {
  this.str = str;
  this.type('and');
  this.search = search;
}

/**
 * Set `type` to 'union' or 'intersect', aliased as
 * 'or' and 'and'.
 *
 * @param {String} type
 * @return {Query} for chaining
 * @api public
 */

Query.prototype.type = function (type) {
  if (type === 'direct') {
    this._directQuery = true;
  } else {
    this._direct = false;
    this._type = types[type];
  }
  return this;
};

/**
 * Limit search to the specified range of elements.
 *
 * @param {String} start
 * @param {String} stop
 * @return {Query} for chaining
 * @api public
 */
Query.prototype.between = function (start, stop) {
  this._start = start;
  this._stop = stop;
  return this;
};

/**
 * Limit search to the specified range of elements.
 *
 * @param {String} offset
 * @param {String} limit
 * @return {Query} for chaining
 * @api public
 */
Query.prototype.paging = function (offset, limit) {
  this._offset = offset;
  this._limit = limit;
  return this;
};

/**
 * Order search.
 *
 * @param {String} sortBy
 * @param {String} sortType
 * @return {Query} for chaining
 * @api public
 */
Query.prototype.orderBy = function (sortBy, sortType = 'ASC') {
  this._sortBy = sortBy;
  this._sortType = sortType;
  return this;
};

/**
 * Perform the query and callback `fn(err, ids)`.
 *
 * @param {Function} fn
 * @return {Query} for chaining
 * @api public
 */
Query.prototype.end = function (fn) {
  var 
    key     = this.search.key,
    db      = this.search.client,
    opts    = this.search.opts,
    query   = this.str,
    direct  = this._directQuery,
    args    = [],
    joiner  = ' ',
    rediSearchQuery;

  if (direct) {
    rediSearchQuery = query;
  } else {
    rediSearchQuery = exports.words(query);
    if (this._type === 'or') {
      joiner = '|'
    }
    rediSearchQuery = rediSearchQuery.join(joiner);
  }
  args = [
    key,
    rediSearchQuery,
  ];
  if (opts.inFields && opts.inFields.length) {
    args.push('INFIELDS', opts.inFields.length, ...opts.inFields);
  }
  if (this._start !== undefined && this._start !== null) {
    args.push('LIMIT', this._start, this._stop);
  }
  // Check order
  if (this._sortBy) {
    args.push('SORTBY',this._sortBy, this._sortType);
  }
  // Check paginator
  if (this._limit >= 0) {
    args.push('LIMIT',this._offset, this._limit);
  }
  db.send_command(
    'FT.SEARCH',
    args,
    function (err, resp) {
      if (err) {
        fn(err);
      } else {
        fn(err, opts.output === 'beautify' ? parser.toList(resp) : resp);
      }
    }
  );

  return this;
};

/**
 * Initialize a new `Suggestion` with the given `key`.
 *
 * @param {String} key
 * @param {Object} opts
 * @api public
 */
var Suggestion = function (key, opts) {
  this.key = key;
  this.client = exports.createClient();
  this.opts = opts || {};
  if (this.opts.fuzzy) {
    this.fuzzy = opts.fuzzy;
  }
  if (this.opts.maxResults) {
    this.maxResults = opts.maxResults;
  }
  if (this.opts.incr) {
    this.incr = opts.incr;
  }
  if (this.opts.withPayloads) {
    this.withPayloads = true;
  }
}

/**
 * Create a new Suggestion object
 *
 * @param {String} key
 * @param {Object} opts
 * @api public
 */
exports.suggestionList = function (key,opts) {
  return new Suggestion(key,opts);
}

/**
 * Set `fuzzy` on suggestion get. Can also be set via opts in the constructor
 *
 * @param {Boolean} isFuzzy
 * @return {Suggestion} for chaining
 * @api public
 */

Suggestion.prototype.fuzzy = function (isFuzzy) {
  this.fuzzy = isFuzzy;
  return this;
};

/**
 * Set the max number of returned suggestions. Can also be set via opts in the constructor
 *
 * @param {Number} maxResults
 * @return {Suggestion} for chaining
 * @api public
 */

Suggestion.prototype.maxResults = function (maxResults) {
  this.maxResults = maxResults;
  return this;
};

Suggestion.prototype.add = function (str, score, payload, fn) {
  if ((typeof fn === 'undefined' || fn === null) && typeof payload === 'function') {
    if (typeof fn !== 'undefined') {
      fn = payload;
    } else {
      var fn = payload;
    }
    payload = null;
  };

  var key = this.key;
  var db = this.client;
  var args = [
    key,
    str,
    score,
  ];
  if (this.incr) {
    args.push('INCR');
  }
  if (payload !== null) {
    args.push('PAYLOAD', (typeof payload === 'object' ? JSON.stringify(payload) : payload.toString()));
  }
  db.send_command(
    'FT.SUGADD',
    args,
    fn || noop
  );
  return this;
}

Suggestion.prototype.get = function (prefix, fn) {
  var key = this.key;
  var db = this.client;
  var args = [
    key,
    prefix
  ];
  if (this.fuzzy) {
    args.push('FUZZY');
  }
  if (this.maxResults) {
    args.push('MAX',this.maxResults);
  }
  if (this.withPayloads) {
    args.push('WITHPAYLOADS');
  }

  db.send_command(
    'FT.SUGGET',
    args,
    fn
  );

  return this;
}

Suggestion.prototype.del = function (str, fn) {
  var key = this.key;
  var db = this.client;

  db.send_command(
    'FT.SUGDEL',
    [
      key,
      str
    ],
    fn
  );

  return this;
}

/**
 * Initialize a new `Search` with the given `key`.
 *
 * @param {String} key
 * @api public
 */

function Search(key, info, opts) {
  this.key = key;
  this.client = exports.createClient();
  this.opts = opts || {};
}

/**
 * Index the given `str` mapped to `id`.
 *
 * @param {String} str
 * @param {Number|String} id
 * @param {Function} fn
 * @api public
 */

Search.prototype.index = function (id, data, opts = {}, fn) {
  var key = this.key;
  var db = this.client;
  var args = [
    key,
    id,
    opts.priority || 1,   //default - this should be to be set in future versions
    'REPLACE',            //emulating Reds original behaviour
    'FIELDS',
  ]
  for (var key in data) {
    args.push(key, data[key]);
  }

  db.send_command(
    'FT.ADD',
    args,
    fn || noop
  );

  return this;
};

/**
 * Remove occurrences of `id` from the index.
 *
 * @param {Number|String} id
 * @api public
 */

Search.prototype.remove = function (id, fn) {
  fn = fn || noop;
  var key = this.key;
  var db = this.client;

  //this.removeIndex(db, id, key, fn);
  db.send_command(
    'FT.DEL',
    [
      key,
      id
    ],
    fn
  )

  db.send_command(
    'DEL',
    [
      id
    ],
    fn
  )
  
  return this;
};


/**
 * Get specific `id` from the index.
 *
 * @param {Number|String} id
 * @api public
 */

Search.prototype.get = function (id, fn) {
  fn = fn || noop;
  var key = this.key;
  var db = this.client;
  var opts = this.opts

  db.send_command(
    'FT.GET',
    [
      key,
      id
    ],
    function (err, resp) {
      if (err) {
        fn(err);
      } else {
        fn(err, opts.output === 'beautify' ? parser.toList(resp) : resp);
      }
    }
  )

  return this;
};


/**
 * Perform a search on the given `query` returning
 * a `Query` instance.
 *
 * @param {String} query
 * @param {Query}
 * @api public
 */

Search.prototype.query = function (query) {
  return new Query(query, this);
};
