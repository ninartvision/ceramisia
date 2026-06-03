/**
 * Shared customer parsing / validation for checkout → Supabase → Sanity.
 */

function trim(v) {
  if (v == null) return "";
  return String(v).trim();
}

/** @typedef {{ customerName: string, customerSurname: string, phoneNumber: string, email: string, message: string }} CustomerFields */

/**
 * @param {Record<string, unknown>} body
 * @returns {CustomerFields}
 */
export function parseCustomerFromBody(body) {
  const b = body && typeof body === "object" ? body : {};
  return {
    customerName: trim(b.customerName ?? b.name ?? b.firstName),
    customerSurname: trim(
      b.customerSurname ?? b.surname ?? b.lastName ?? b.customer_last_name
    ),
    phoneNumber: trim(b.phoneNumber ?? b.phone ?? b.phone_number),
    email: trim(b.email),
    message: trim(b.message),
  };
}

/**
 * @param {CustomerFields} c
 * @param {{ lang?: 'ge' | 'en' }} [opts]
 */
export function validateCustomer(c, opts = {}) {
  const lang = opts.lang === "en" ? "en" : "ge";
  const errors = [];

  if (!c.customerName || c.customerName.length < 2) {
    errors.push("customerName");
  }
  if (!c.customerSurname || c.customerSurname.length < 2) {
    errors.push("customerSurname");
  }
  const phone = c.phoneNumber.replace(/\s+/g, "");
  if (!phone || phone.length < 9) {
    errors.push("phoneNumber");
  }
  const email = c.email;
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    errors.push("email");
  }

  const messages = {
    ge: {
      customerName: "შეიყვანეთ სახელი (მინ. 2 სიმბოლო)",
      customerSurname: "შეიყვანეთ გვარი (მინ. 2 სიმბოლო)",
      phoneNumber: "შეიყვანეთ სწორი ტელეფონის ნომერი",
      email: "შეიყვანეთ სწორი ელფოსტა",
    },
    en: {
      customerName: "Enter first name (min. 2 characters)",
      customerSurname: "Enter last name (min. 2 characters)",
      phoneNumber: "Enter a valid phone number",
      email: "Enter a valid email address",
    },
  };

  const details = errors.map((key) => messages[lang][key]).filter(Boolean);

  return {
    ok: errors.length === 0,
    errors,
    details,
    customer: {
      customerName: c.customerName,
      customerSurname: c.customerSurname,
      phoneNumber: c.phoneNumber,
      email: c.email,
      message: c.message || "",
    },
  };
}

function isValidEmail(email) {
  return typeof email === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

function normalizeCustomerValue(value) {
  return typeof value === "string" ? value.trim() : "";
}

export function buildSafeCustomerForSanity(customer) {
  const safe = {
    customerName:
      normalizeCustomerValue(customer.customerName).length >= 2
        ? normalizeCustomerValue(customer.customerName)
        : "Unknown",
    customerSurname:
      normalizeCustomerValue(customer.customerSurname).length >= 2
        ? normalizeCustomerValue(customer.customerSurname)
        : "Customer",
    phoneNumber: normalizeCustomerValue(customer.phoneNumber).replace(/\D/g, ""),
    email: normalizeCustomerValue(customer.email),
    message: normalizeCustomerValue(customer.message),
  };
  if (safe.phoneNumber.length < 9) {
    safe.phoneNumber = "000000000";
  }
  if (!isValidEmail(safe.email)) {
    safe.email = "unknown@example.com";
  }
  return safe;
}

/**
 * @param {Record<string, unknown>} body
 * @param {{ lang?: 'ge' | 'en' }} [opts]
 */
export function parseAndValidateCustomer(body, opts = {}) {
  return validateCustomer(parseCustomerFromBody(body), opts);
}

/** @param {string} fullName */
export function splitFullName(fullName) {
  const s = trim(fullName);
  if (!s) return { customerName: "", customerSurname: "" };
  const parts = s.split(/\s+/).filter(Boolean);
  if (parts.length === 1) {
    return { customerName: parts[0], customerSurname: "" };
  }
  return {
    customerName: parts[0],
    customerSurname: parts.slice(1).join(" "),
  };
}

/**
 * Prefer checkout form data; optionally enrich from bank buyer.
 * @param {CustomerFields} checkout
 * @param {{ full_name?: string, phone_number?: string, email?: string }} [bank]
 * @returns {CustomerFields}
 */
export function mergeCustomerWithBank(checkout, bank) {
  const base = { ...checkout };
  if (bank?.full_name) {
    const split = splitFullName(bank.full_name);
    if (!base.customerName && split.customerName) {
      base.customerName = split.customerName;
    }
    if (!base.customerSurname && split.customerSurname) {
      base.customerSurname = split.customerSurname;
    }
  }
  if (!base.phoneNumber && bank?.phone_number) {
    base.phoneNumber = trim(bank.phone_number);
  }
  if (!base.email && bank?.email) {
    base.email = trim(bank.email);
  }
  return base;
}

/** Display name for previews / Supabase customer_name column */
export function formatCustomerDisplayName(c) {
  return [c.customerName, c.customerSurname].filter(Boolean).join(" ").trim();
}

/**
 * Build Sanity `order` document fields (without _id / line items).
 * @param {CustomerFields} customer
 * @param {Record<string, unknown>} extra
 */
export function buildSanityOrderFields(customer, extra = {}) {
  return {
    _type: "order",
    customerName: customer.customerName,
    customerSurname: customer.customerSurname,
    phoneNumber: customer.phoneNumber,
    email: customer.email,
    message: customer.message || "",
    ...extra,
  };
}

/**
 * @param {CustomerFields} customer
 */
export function buildSupabaseCustomerRow(customer) {
  return {
    customer_name: formatCustomerDisplayName(customer),
    customer_surname: customer.customerSurname,
    customer_first_name: customer.customerName,
    phone_number: customer.phoneNumber,
    email: customer.email,
    message: customer.message || null,
  };
}
