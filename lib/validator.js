const listOfFields = ['text', 'numeric', 'geo', 'tag'];

exports.validateSchema = function (schema) {
  Object.values(schema).forEach(function (item) {
    if (!listOfFields.includes(item.type)) {
      throw new Error('Data type is not valid');
    }
  });
};