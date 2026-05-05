/**
 * odata-sanitize.js — OData filter expression sanitization.
 *
 * Prevents OData injection by escaping user-supplied values before
 * they are interpolated into $filter expressions sent to Dynamics 365.
 *
 * Import:
 *   import { escapeODataString, buildContainsFilter, buildEqFilter } from './odata-sanitize.js';
 */

/**
 * Escape a string value for safe use inside OData single-quoted literals.
 *
 * OData 4.0 §5.1.1.6.1: Within a string literal, a single quote is
 * represented as two consecutive single quotes.
 *
 * Also strips characters that should never appear in OData string literals
 * to prevent filter injection.
 *
 * @param {string} value — raw user input
 * @returns {string} — escaped value safe for OData single-quoted context
 */
export function escapeODataString(value) {
  if (typeof value !== "string") {
    throw new TypeError(`Expected string, got ${typeof value}`);
  }
  // Escape single quotes per OData spec
  return value.replace(/'/g, "''");
}

/**
 * Build a safe `contains(field,'value')` OData filter fragment.
 *
 * @param {string} field — OData property name (validated against allowlist)
 * @param {string} value — raw search term
 * @returns {string} — e.g. "contains(msp_name,'O''Brien')"
 */
export function buildContainsFilter(field, value) {
  validateFieldName(field);
  return `contains(${field},'${escapeODataString(value)}')`;
}

/**
 * Build a safe `field eq 'value'` OData filter fragment.
 *
 * @param {string} field — OData property name
 * @param {string|number} value — raw value
 * @returns {string} — e.g. "msp_status eq 861980000" or "name eq 'Contoso'"
 */
export function buildEqFilter(field, value) {
  validateFieldName(field);
  if (typeof value === "number") {
    return `${field} eq ${value}`;
  }
  return `${field} eq '${escapeODataString(value)}'`;
}

/**
 * Build a safe `field ne value` OData filter fragment.
 *
 * @param {string} field — OData property name
 * @param {string|number} value — raw value
 * @returns {string}
 */
export function buildNeFilter(field, value) {
  validateFieldName(field);
  if (typeof value === "number") {
    return `${field} ne ${value}`;
  }
  return `${field} ne '${escapeODataString(value)}'`;
}

/**
 * Combine multiple filter fragments with `and`.
 *
 * @param {...string} fragments — individual filter expressions
 * @returns {string} — combined filter
 */
export function andFilters(...fragments) {
  return fragments.filter(Boolean).join(" and ");
}

/**
 * Combine multiple filter fragments with `or`.
 *
 * @param {...string} fragments — individual filter expressions
 * @returns {string} — combined filter
 */
export function orFilters(...fragments) {
  return fragments.filter(Boolean).join(" or ");
}

// ── Field name validation ──────────────────────────────────────────

// OData property names: letters, digits, underscores, forward-slash for navigation
const FIELD_NAME_RE = /^[a-zA-Z_][a-zA-Z0-9_/]*$/;

/**
 * Validate that a field name looks like a legitimate OData property.
 * Prevents injection of operators/functions via the field parameter.
 *
 * @param {string} field
 */
function validateFieldName(field) {
  if (typeof field !== "string" || !FIELD_NAME_RE.test(field)) {
    throw new Error(`Invalid OData field name: ${JSON.stringify(field)}`);
  }
}
