'use strict'

const Shared = require('@leveloneproject/central-services-shared')
const BaseError = Shared.BaseError
const Category = Shared.ErrorCategory

const KmsRequestNotFoundError = class extends BaseError {
  constructor (requestId) {
    super(Category.INTERNAL, `Request not found with id: ${requestId}`)
  }
}

module.exports = KmsRequestNotFoundError
