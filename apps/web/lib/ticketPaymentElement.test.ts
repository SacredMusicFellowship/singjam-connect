import { describe, it, expect } from "vitest";
import { BILLING_COUNTRY, TICKET_PAYMENT_ELEMENT_OPTIONS } from "./ticketPaymentElement";

describe("ticket Payment Element options", () => {
  it("hides country but keeps ZIP", () => {
    expect(TICKET_PAYMENT_ELEMENT_OPTIONS.fields.billingDetails.address).toEqual({
      country: "never",
      postalCode: "auto",
    });
  });

  it("sends US as the billing country, since the form doesn't ask", () => {
    expect(BILLING_COUNTRY).toBe("US");
  });
});
