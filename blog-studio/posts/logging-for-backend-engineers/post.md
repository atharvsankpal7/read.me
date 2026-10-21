---
title: Logging for Backend Engineers
subtitle: Ten practices for logging in a backend, from log levels and structured logs to sampling, retention and keeping sensitive data out.
date: 2025-03-03
tags:
  - Logging
  - Observability
  - Backend
---

## 1. Plan before implementing logging

- Define a clear strategy before adding logging to your application.
- Identify key performance indicators ([KPIs](https://en.wikipedia.org/wiki/Performance_indicator)) to track for monitoring and debugging.

## 2. Use different log levels

- **Info**: Normal operations (e.g., successful login).
- **Warning**: Potential issues (e.g., slow payment processing).
- **Error**: Serious problems (e.g., database failure).
- **Fatal**: Critical system failures (e.g., out of memory).
- Dynamically adjust verbosity levels when debugging to avoid excessive logging.

::figure levels The same ten events with different verbosity levels. Raise the level and only the serious events are stored. Lower it while you debug.

## 3. Structured logging

Instead of plain text logs, use [structured formats](https://www.honeycomb.io/blog/structured-logging-and-your-team) like **JSON** or **XML** for better searchability and filtering.

## 4. Add context to logs

Provide information about **who did what and when**.

Example:

```json
{
  "event": "update_test",
  "user_id": 11001,
  "test_id": 30023,
  "change": { "question_count": { "from": 120, "to": 90 } },
  "timestamp": "2025-03-04T10:20:00Z"
}
```

Another example for a file upload failure:

```json
{
  "event": "file_upload_failed",
  "user": "user456",
  "file": "report.pdf",
  "error": "File too large",
  "timestamp": "2025-03-04T10:20:00Z"
}
```

## 5. Log sampling

- Instead of logging **every** instance of non-critical activities (e.g., login attempts), use **sampling**.
- Example: Log only **every 2 out of 10** login attempts instead of logging all.

::figure sampling Ten login attempts reach the logger. Log all of them, or sample 2 out of 10.

## 6. Summarize logs instead of logging each step

Instead of logging every individual step, consolidate logs into meaningful summaries.

Example of inefficient logging:

```plaintext
User requested profile page
Fetched user details
Rendered profile page
```

Improved version:

```json
{
  "event": "profile_page_load",
  "user": "user789",
  "status": "success",
  "duration_ms": 120
}
```

If an error occurs while fetching user details, provide a **clear error log** with relevant details.

## 7. Use centralized logging

Instead of keeping separate logs for each microservice, use a **centralized logging system** for better correlation and monitoring.

## 8. Set retention policies

Define different retention periods for logs:

- **Error logs**: Retain for **1 month**.
- **Security logs**: Retain for **6 months**.
- Older logs should be **moved to cold storage** after the retention period.

## 9. Secure log transmission & storage

**Encrypt** logs when transmitting and storing them to prevent unauthorized access.

## 10. Avoid logging sensitive data

- Implement a **cleanup process** to prevent accidental logging of sensitive information.
- Ensure [personally identifiable information (PII)](https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html#data-to-exclude) or credentials are **masked or removed** from logs.
