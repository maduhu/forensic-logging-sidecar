const RC = require('rc')('SIDE', require('../../config/default.json'))

module.exports = {
  PORT: RC.PORT,
  SERVICE: RC.SERVICE,
  KMS: RC.KMS,
  DATABASE_URI: RC.DATABASE_URI
}
