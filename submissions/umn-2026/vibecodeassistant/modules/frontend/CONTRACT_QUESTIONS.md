# Contract questions for Team 6

1. Please confirm the final finding schema and provide the authoritative schema file path or OpenAPI/JSON Schema source for type generation.
2. Should finding review and fix-review PATCH endpoints return the updated finding, a generic success payload, or the entire scan aggregate?
3. Is there a dedicated endpoint for retrieving a single finding by ID, or should the frontend derive detail views exclusively from `GET /scans/{id}/findings`?
4. Should scan progress support server polling, streaming, or websocket events for “findings as they arrive,” and what is the expected response shape for partial updates?
5. Does the report endpoint return a downloadable file, raw JSON/Markdown text, or a signed URL to a generated artifact?
6. How should module status represent “skipped” versus “failed,” and are retries exposed through the backend contract?
7. What reviewer identity should the frontend send in review actions when auth is added later: username, email, user ID, or backend-derived session identity?
