# Production chunk exceptions

## Order Detail workspace

- Route: `/admin/b/$slug/orders/$id`
- Current client chunk: approximately 578 KB minified / 154 KB gzip
- Temporary ceiling: 600 KB minified
- Reason: the route is the primary operational editor and retains existing payment, fulfillment, customer, item, permission, and printing workflows.
- Already extracted: courier workspace, invoice preview, send-invoice/template management, PDF generation, and receipt tooling.
- Guardrail: no other route chunk may use this exception, and the ceiling must not be increased without release approval.
- Follow-up: continue extracting product/customer creation dialogs and the optional activity workspace without changing workflow semantics.

This exception is performance debt, not approval to add more eager dependencies.
