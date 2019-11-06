# RedsLight

  Redslight is a light-weight redis search for Node.js. It can provide full-text searching that is much faster than the original Reds library (see Benchmarks).
  
   
## Upgrading

If you are upgrading from Reds, you'll need to make your `createSearch` asynchronous and re-index your data. Otherwise, your app-level logic and code should be compatible.

## Installation

      $ npm install redslight

## Example

The first thing you'll want to do is create a `Search` instance, which allows you to pass a `key`, used for namespacing within RediSearch so that you may have several searches in the same Redis database. You may specify your own [node_redis](https://github.com/NodeRedis/node_redis) instance with the `redslight.setClient` function.

```js
var schema = {
  name: {
    type: 'text'
  }
};
var options = {
  stopWords: ['oops'],
  output: 'beautify'
};
redslight.createSearch('pets', schema, options, function(err, search) {
  /* ... */
});
```

You can then add items to the index with the `Search#index` function.

```js
var schema = {
  name: {
    type: 'text'
  }
};
var options = {
  output: 'beautify'
};
var data = [];
data.push({ name: 'Tobi wants four dollars' });
data.push({ name: 'Tobi only wants $4' });
data.push({ name: 'Loki is really fat' });
data.push({ name: 'Loki, Jane, and Tobi are ferrets' });
data.push({ name: 'Manny is a cat' });
data.push({ name: 'Luna is a cat' });
data.push({ name: 'Mustachio is a cat' });

redslight.createSearch('pets', schema, {}, function(err, search) {
  data.forEach(function(item, index) { search.index(index, item); });
});
```

 To perform a query against the index simply invoke `Search#query()` with a string, and pass a callback, which receives an array of ids when present, or an empty array otherwise.

```js
search
  .query('Tobi dollars')
  .end(function(err, resp){
    if (err) throw err;
    console.log('Response', resp)
  });
  ```

 By default, queries are an intersection of the search words. The previous example would yield the following output since only one string contains both "Tobi" _and_ "dollars":

```
Search results for "Tobi dollars":
[
  { name: 'Tobi wants four dollars' }
]
```

 We can tweak the query to perform a union by passing either "union" or "or" to `Search#type()` in `redslight.search()` between `Search#query()` and `Search#end()`, indicating that _any_ of the constants computed may be present for the `id` to match.

```js
search
  .query('tobi dollars')
  .type('or')
  .end(function(err, resp){
    if (err) throw err;
    console.log('Response', resp)
  });
```

 The union search would yield the following since three strings contain either "Tobi" _or_ "dollars":

```
Search results for "tobi dollars":
```js
[
  { name: 'Tobi wants four dollars' },
  { name: 'Tobi only wants $4' },
  { name: 'Loki, Jane, and Tobi are ferrets' }
]
```

RediSearch has an advanced query syntax that can be used by using the 'direct' search type. See the [RediSearch documentation](http://redisearch.io/Query_Syntax/) for this syntax.

```js
search
  .query('(hello|hella) (world|werld)')
  .type('direct')
  .end(function(err, resp){
    if (err) throw err;
    console.log('Response', resp)
  });
```

Also included in the package is the RediSearch Suggestion API. This has no corollary in the Reds module. The Suggestion API is ideal for auto-complete type situations and is entirely separate from the Search API. 
```js
search
  .query('(hello|hella) (world|werld)')
  .type('direct')
  .end(function(err, resp){
    if (err) throw err;
    console.log('Response', resp)
  });
```

```js
var suggestions = redslight.suggestion('my-suggestion-list');

suggestions.add(
  'redis',                                            // add 'redis'
  2,                                                  // with a 'score' of 2, this affects the position in the results, higher = higher up in results
  function(err,sizeOfSuggestionList) { /* ... */ }    // callback
);
suggestions.add(
  'redisearch',                                       
  5,
  function(err,sizeOfSuggestionList) { /* ... */ } 
);
suggestions.add(
  'reds',                                       
  1,
  function(err,sizeOfSuggestionList) { /* ... */ } 
);

/* ... */

sugggestions.get(
  're',                                               // prefix - will find anything starting with "re"
  function(err, returnedSuggestions) {
    /* returnedSuggestions is set to [ "redisearch", "redis", "reds" ] */
  }
);

sugggestions.get(
  'redis',                                            // prefix - will find anything starting with "redis", so not "reds"
  function(err, returnedSuggestions) {
    /* returnedSuggestions is set to [ "redisearch", "redis" ] */
  }
)
```

There is also a `fuzzy` opt and `maxResults` that can either be set by chaining or by passing an object in the second argument in the constructor.


## API

```js
redslight.createSearch(key, options, fn) : Search
redslight.dropSearch(key, options, fn) : Search
redslight.setClient(inClient)
redslight.createClient()
redslight.confirmModule(cb)
redslight.words(str) : Array
redslight.suggestionList(key,opts) : Suggestion
Search#index(text, id[, fn])
Search#remove(id[, fn]);
Search#query(text, fn[, type]) : Query
Query#type(type)
Query#between(str)
Query#end(fn)
Suggestion#fuzzy(isFuzzy)
Suggestion#maxResults(maxResults)
Suggestion#add(str,score,fn)
Suggestion#get(prefix,fn)
Suggestion#del(str,fn)

```

 Examples:

```js
redslight.createSearch('pets', schema, {}, function(err, search) {
  search.index('dog', { name: 'Tobi' });
  search.remove('dog');
  search.query('Tobi').end(function (err, resp) {});
});
```


## Benchmarks

When compared to Reds, redslight is much faster at indexing and somewhat faster at query:

_Indexing - documents / second_

| Module         | Tiny | Small | Medium | Large |
|----------------|------|-------|--------|-------|
| Reds           | 122  | 75    | 10     |  0    |
| RediRediSearch | 1,256| 501   | 132    |  5    |

_Query - queries / second_

| Module         | 1 term | 2 terms / AND | 2 terms / OR | 3 terms / AND | 3 terms / OR | Long* / AND | Long* / OR | 
|----------------|--------|---------------|--------------|---------------|--------------|------------|----------|
| Reds           | 8,754  | 8,765         | 8,389        | 7,622         | 7,193        | 1,649      | 1,647 |
| redslight  | 10,955 | 12,945        | 10,054       | 12,769        | 8,389        | 6,456      | 12,311 |

The "Long" query string is taken from the Canadian Charter of Rights and Freedoms: "Everyone has the following fundamental freedoms: (a) freedom of conscience and religion;  (b) freedom of thought, belief, opinion and expression, including freedom of the press and other media of communication; (c) freedom of peaceful assembly; and (d) freedom of association." (Used because I just had it open in another tab...)

## Next steps

- More coverage of RediSearch features
- Tests
- Better examples


## License 

(The MIT License)

- Original work Copyright(c) 2011 TJ Holowaychuk <tj@vision-media.ca>
- Modified work Copyright(c) 2017 Kyle Davis
- Modified work Copyright(c) 2018 Thinh Nguyen <thesunofvn@gmail.com>
- Modified work Copyright(c) 2019 Vu Chau

Permission is hereby granted, free of charge, to any person obtaining
a copy of this software and associated documentation files (the
'Software'), to deal in the Software without restriction, including
without limitation the rights to use, copy, modify, merge, publish,
distribute, sublicense, and/or sell copies of the Software, and to
permit persons to whom the Software is furnished to do so, subject to
the following conditions:

The above copyright notice and this permission notice shall be
included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED 'AS IS', WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.
IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY
CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT,
TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE
SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
