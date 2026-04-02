/**
 * Simple validation middleware factory.
 * @param {Array<string>} requiredFields - List of fields that must be present in req.body
 */
const validate = (requiredFields) => (req, res, next) => {
  const missing = requiredFields.filter(f => !req.body[f]);
  if (missing.length > 0) {
    const err = new Error(`Missing required fields: ${missing.join(', ')}`);
    err.statusCode = 400;
    return next(err);
  }
  next();
};

module.exports = validate;
