exports.toObject = function (id, data) {
  var obj = {
    id
  };

  for (var i = 0, length = data.length - 1; i < length; i += 2) {
    obj[data[i]] = data[i+1];
  };

  return obj;
};

exports.toList = function (data) {
  var list = []

  // Bypass count of results
  for (var i = 1, length = data.length - 1; i < length; i += 2) {
    list.push(exports.toObject(data[i], data[i+1]))
  }

  return list
}