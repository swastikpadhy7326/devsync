const formatIssues = (error) =>
  error.issues.map((i) => ({ field: i.path.join('.'), message: i.message }));

const validate = (schema) => (req, res, next) => {
  const result = schema.safeParse(req.body);
  if (!result.success) {
    return res.status(400).json({ message: 'Validation failed', errors: formatIssues(result.error) });
  }
  req.body = result.data;
  next();
};

// Express 5 makes req.query read-only, so the cleaned values go on req.validatedQuery
const validateQuery = (schema) => (req, res, next) => {
  const result = schema.safeParse(req.query);
  if (!result.success) {
    return res.status(400).json({ message: 'Validation failed', errors: formatIssues(result.error) });
  }
  req.validatedQuery = result.data;
  next();
};

module.exports = validate;
module.exports.validateQuery = validateQuery;