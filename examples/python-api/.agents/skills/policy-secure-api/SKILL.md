---
name: policy-secure-api
description: Applies the organization's API security standard. Use whenever an exposed endpoint is created or modified, API code is reviewed, an OpenAPI spec is generated, or a spec.md that includes endpoints is written.
---

# Policy: API security
<!-- EXAMPLE. Replace with the real policy, written from its owner's source of truth.
     Policy owner: <name/team> · Source of truth: <link> · Version: 0.1
     Every change to this skill is approved by the policy owner in the PR. -->

When creating or changing an endpoint:
1. **Authentication**: every endpoint requires the gateway token; there are no anonymous routes outside `/health`.
2. **Input validation**: validate the body against the schema (OpenAPI/Pydantic/Zod/Bean Validation) and reject unknown fields.
3. **Auditing**: every endpoint that changes state emits an audit event with actor, action, entity and timestamp.
4. **Data classification**: fields marked as PII never appear in logs or error messages.
5. **Rate limiting**: public endpoints declare their limit.

In a spec.md: add these points to "Applied policies" and any conflict with the intent as a concern with owner = owner of this policy.
In code: verify the 5 points and mention in the summary how each one is met.

> This skill is an *advisory* control: it makes violations rare. Anything that must always hold also needs a deterministic check (hook, test or review pass in REVIEW.md).
