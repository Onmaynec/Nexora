"use strict";

const {
  BillingBase,
  BillingError,
  DEFAULT_ENTITLEMENT_DAYS,
  IMPULSE_CURRENCY,
  MONTHLY_PLUS_IMPULSES,
  PLUS_PRODUCT,
  requireId,
  requirePositiveInt,
  timingSafeEqualText,
} = require("./billing-common.cjs");
const accountLedgerMethods = require("./billing-account-ledger.cjs");
const subscriptionMethods = require("./billing-subscriptions.cjs");
const goalMethods = require("./billing-goals.cjs");

class BillingDatabase extends BillingBase {}
Object.assign(BillingDatabase.prototype, accountLedgerMethods, subscriptionMethods, goalMethods);

module.exports = {
  BillingDatabase,
  BillingError,
  DEFAULT_ENTITLEMENT_DAYS,
  IMPULSE_CURRENCY,
  MONTHLY_PLUS_IMPULSES,
  PLUS_PRODUCT,
  requireId,
  requirePositiveInt,
  timingSafeEqualText,
};
